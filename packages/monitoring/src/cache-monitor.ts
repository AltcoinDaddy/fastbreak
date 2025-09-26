import Redis from 'ioredis';
import { cacheHitRate } from './metrics';
import { createLogger } from './logger';

const logger = createLogger({ serviceName: 'cache-monitor' });

export interface CacheMonitorOptions {
  serviceName: string;
  redis: Redis;
  enableLogging?: boolean;
}

export class CacheMonitor {
  private serviceName: string;
  private redis: Redis;
  private enableLogging: boolean;

  constructor(options: CacheMonitorOptions) {
    this.serviceName = options.serviceName;
    this.redis = options.redis;
    this.enableLogging = options.enableLogging ?? true;
  }

  async get(key: string): Promise<string | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.get(key);
      const duration = Date.now() - startTime;
      
      const hitResult = result ? 'hit' : 'miss';
      cacheHitRate.labels('get', hitResult, this.serviceName).inc();

      if (this.enableLogging) {
        logger.debug('Cache get operation', {
          key,
          result: hitResult,
          duration_ms: duration
        });
      }

      return result;
    } catch (error) {
      cacheHitRate.labels('get', 'error', this.serviceName).inc();
      logger.error('Cache get error', { key, error: (error as Error).message });
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
      
      const duration = Date.now() - startTime;
      cacheHitRate.labels('set', 'success', this.serviceName).inc();

      if (this.enableLogging) {
        logger.debug('Cache set operation', {
          key,
          ttl,
          duration_ms: duration
        });
      }
    } catch (error) {
      cacheHitRate.labels('set', 'error', this.serviceName).inc();
      logger.error('Cache set error', { key, error: (error as Error).message });
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    const startTime = Date.now();
    
    try {
      const result = await this.redis.del(key);
      const duration = Date.now() - startTime;
      
      cacheHitRate.labels('delete', 'success', this.serviceName).inc();

      if (this.enableLogging) {
        logger.debug('Cache delete operation', {
          key,
          deleted_count: result,
          duration_ms: duration
        });
      }

      return result;
    } catch (error) {
      cacheHitRate.labels('delete', 'error', this.serviceName).inc();
      logger.error('Cache delete error', { key, error: (error as Error).message });
      throw error;
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    const startTime = Date.now();
    
    try {
      const results = await this.redis.mget(...keys);
      const duration = Date.now() - startTime;
      
      const hits = results.filter(r => r !== null).length;
      const misses = results.length - hits;
      
      cacheHitRate.labels('mget', 'hit', this.serviceName).inc(hits);
      cacheHitRate.labels('mget', 'miss', this.serviceName).inc(misses);

      if (this.enableLogging) {
        logger.debug('Cache mget operation', {
          keys_count: keys.length,
          hits,
          misses,
          duration_ms: duration
        });
      }

      return results;
    } catch (error) {
      cacheHitRate.labels('mget', 'error', this.serviceName).inc();
      logger.error('Cache mget error', { keys_count: keys.length, error: (error as Error).message });
      throw error;
    }
  }

  async getStats() {
    try {
      const info = await this.redis.info('memory');
      const stats = this.parseRedisInfo(info);
      
      return {
        used_memory: stats.used_memory,
        used_memory_human: stats.used_memory_human,
        used_memory_peak: stats.used_memory_peak,
        used_memory_peak_human: stats.used_memory_peak_human,
        keyspace_hits: stats.keyspace_hits,
        keyspace_misses: stats.keyspace_misses,
        hit_rate: stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses) || 0
      };
    } catch (error) {
      logger.error('Failed to get Redis stats', { error: (error as Error).message });
      return null;
    }
  }

  private parseRedisInfo(info: string): Record<string, any> {
    const stats: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        const numValue = parseInt(value, 10);
        stats[key] = isNaN(numValue) ? value : numValue;
      }
    }
    
    return stats;
  }
}