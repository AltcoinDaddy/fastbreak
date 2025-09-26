import Redis from 'ioredis';
import { CacheMonitor } from '@fastbreak/monitoring';

export interface CacheConfig {
  defaultTTL: number;
  keyPrefix: string;
  enableCompression?: boolean;
  maxRetries?: number;
}

export interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheStrategy {
  private redis: Redis;
  private monitor: CacheMonitor;
  private config: CacheConfig;

  constructor(redis: Redis, config: CacheConfig, serviceName: string) {
    this.redis = redis;
    this.config = config;
    this.monitor = new CacheMonitor({ serviceName, redis });
  }

  // Write-through cache pattern
  async writeThrough<T>(
    key: string, 
    data: T, 
    writeFunction: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      // Write to database first
      const result = await writeFunction();
      
      // Then cache the result
      await this.set(key, result, ttl);
      
      return result;
    } catch (error) {
      throw error;
    }
  }

  // Write-behind cache pattern (async write)
  async writeBehind<T>(
    key: string, 
    data: T, 
    writeFunction: () => Promise<void>,
    ttl?: number
  ): Promise<void> {
    try {
      // Cache immediately
      await this.set(key, data, ttl);
      
      // Write to database asynchronously
      setImmediate(async () => {
        try {
          await writeFunction();
        } catch (error) {
          // Log error but don't fail the cache operation
          console.error('Write-behind operation failed:', error);
        }
      });
    } catch (error) {
      throw error;
    }
  }

  // Cache-aside pattern
  async cacheAside<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, fetch from source
    const data = await fetchFunction();
    
    // Store in cache for next time
    await this.set(key, data, ttl);
    
    return data;
  }

  // Multi-level cache with L1 (memory) and L2 (Redis)
  private memoryCache = new Map<string, CacheItem<any>>();
  private readonly MAX_MEMORY_ITEMS = 1000;

  async multiLevelGet<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    
    // Check L1 cache (memory) first
    const memoryItem = this.memoryCache.get(fullKey);
    if (memoryItem && !this.isExpired(memoryItem)) {
      return memoryItem.data;
    }

    // Check L2 cache (Redis)
    const redisData = await this.monitor.get(fullKey);
    if (redisData) {
      const parsed = JSON.parse(redisData);
      
      // Store in L1 cache
      this.setMemoryCache(fullKey, parsed, this.config.defaultTTL);
      
      return parsed;
    }

    return null;
  }

  async multiLevelSet<T>(key: string, data: T, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    const cacheTTL = ttl || this.config.defaultTTL;
    
    // Store in both L1 and L2
    this.setMemoryCache(fullKey, data, cacheTTL);
    await this.monitor.set(fullKey, JSON.stringify(data), cacheTTL);
  }

  // Batch operations for efficiency
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const fullKeys = keys.map(key => this.getFullKey(key));
    const results = await this.monitor.mget(fullKeys);
    
    return results.map(result => result ? JSON.parse(result) : null);
  }

  async mset<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const item of items) {
      const fullKey = this.getFullKey(item.key);
      const ttl = item.ttl || this.config.defaultTTL;
      const serialized = JSON.stringify(item.data);
      
      pipeline.setex(fullKey, ttl, serialized);
    }
    
    await pipeline.exec();
  }

  // Cache warming strategies
  async warmCache<T>(
    keys: string[],
    fetchFunction: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const batchSize = 10;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await fetchFunction(key);
            await this.set(key, data, ttl);
          } catch (error) {
            console.error(`Failed to warm cache for key ${key}:`, error);
          }
        })
      );
    }
  }

  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(this.getFullKey(pattern));
    
    if (keys.length === 0) {
      return 0;
    }
    
    return await this.redis.del(...keys);
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;
    
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      const keys = await this.redis.smembers(tagKey);
      
      if (keys.length > 0) {
        totalDeleted += await this.redis.del(...keys);
        await this.redis.del(tagKey);
      }
    }
    
    return totalDeleted;
  }

  async setWithTags<T>(key: string, data: T, tags: string[], ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    // Set the data
    await this.set(key, data, ttl);
    
    // Add to tag sets
    const pipeline = this.redis.pipeline();
    for (const tag of tags) {
      pipeline.sadd(`tag:${tag}`, fullKey);
      pipeline.expire(`tag:${tag}`, (ttl || this.config.defaultTTL) + 3600); // Tag expires 1 hour after data
    }
    await pipeline.exec();
  }

  // Basic cache operations
  async get<T>(key: string): Promise<T | null> {
    const result = await this.monitor.get(this.getFullKey(key));
    return result ? JSON.parse(result) : null;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const cacheTTL = ttl || this.config.defaultTTL;
    await this.monitor.set(this.getFullKey(key), JSON.stringify(data), cacheTTL);
  }

  async del(key: string): Promise<number> {
    // Clear from memory cache
    this.memoryCache.delete(this.getFullKey(key));
    
    // Clear from Redis
    return await this.monitor.del(this.getFullKey(key));
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(this.getFullKey(key));
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(this.getFullKey(key));
  }

  // Utility methods
  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}:${key}`;
  }

  private setMemoryCache<T>(key: string, data: T, ttl: number): void {
    // Implement LRU eviction if memory cache is full
    if (this.memoryCache.size >= this.MAX_MEMORY_ITEMS) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl * 1000 // Convert to milliseconds
    });
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl;
  }

  async getStats() {
    const redisStats = await this.monitor.getStats();
    
    return {
      redis: redisStats,
      memory: {
        size: this.memoryCache.size,
        maxSize: this.MAX_MEMORY_ITEMS
      }
    };
  }
}