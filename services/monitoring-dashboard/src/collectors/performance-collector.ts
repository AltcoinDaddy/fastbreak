import { Pool } from 'pg';
import Redis from 'ioredis';
import { createLogger, register } from '@fastbreak/monitoring';
import * as cron from 'node-cron';

const logger = createLogger({ serviceName: 'performance-collector' });

export interface PerformanceMetrics {
  timestamp: number;
  requestsPerSecond: number;
  avgResponseTime: number;
  errorRate: number;
  activeUsers: number;
  dbConnections: number;
  cacheHitRate: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
}

export interface SystemInfo {
  version: string;
  uptime: number;
  nodeVersion: string;
  platform: string;
  architecture: string;
}

export class PerformanceCollector {
  private dbPool: Pool;
  private redis: Redis;
  private metricsHistory: PerformanceMetrics[] = [];
  private collectInterval: NodeJS.Timeout | null = null;
  private readonly MAX_HISTORY_SIZE = 1000;

  constructor(dbPool: Pool, redis: Redis) {
    this.dbPool = dbPool;
    this.redis = redis;
  }

  async start() {
    logger.info('Starting performance collector');

    // Collect metrics every 30 seconds
    this.collectInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.storeMetrics(metrics);
      } catch (error) {
        logger.error('Error collecting metrics', { error: (error as Error).message });
      }
    }, 30000);

    // Schedule hourly aggregation
    cron.schedule('0 * * * *', async () => {
      await this.aggregateHourlyMetrics();
    });

    // Schedule daily cleanup
    cron.schedule('0 2 * * *', async () => {
      await this.cleanupOldMetrics();
    });

    // Initial collection
    const initialMetrics = await this.collectMetrics();
    this.storeMetrics(initialMetrics);
  }

  async stop() {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }
    logger.info('Performance collector stopped');
  }

  async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = Date.now();

    // Collect Prometheus metrics
    const prometheusMetrics = await this.getPrometheusMetrics();
    
    // Collect system metrics
    const systemMetrics = await this.getSystemMetrics();
    
    // Collect database metrics
    const dbMetrics = await this.getDatabaseMetrics();
    
    // Collect cache metrics
    const cacheMetrics = await this.getCacheMetrics();

    return {
      timestamp,
      requestsPerSecond: prometheusMetrics.requestsPerSecond,
      avgResponseTime: prometheusMetrics.avgResponseTime,
      errorRate: prometheusMetrics.errorRate,
      activeUsers: prometheusMetrics.activeUsers,
      dbConnections: dbMetrics.activeConnections,
      cacheHitRate: cacheMetrics.hitRate,
      memoryUsage: systemMetrics.memoryUsage,
      cpuUsage: systemMetrics.cpuUsage,
      diskUsage: systemMetrics.diskUsage
    };
  }

  private async getPrometheusMetrics(): Promise<any> {
    try {
      const metrics = await register.getMetricsAsJSON();
      
      // Extract relevant metrics from Prometheus data
      const httpRequests = metrics.find(m => m.name === 'http_requests_total');
      const httpDuration = metrics.find(m => m.name === 'http_request_duration_seconds');
      const activeUsers = metrics.find(m => m.name === 'active_users_current');

      // Calculate requests per second (simplified)
      const requestsPerSecond = this.calculateRequestsPerSecond(httpRequests);
      
      // Calculate average response time
      const avgResponseTime = this.calculateAvgResponseTime(httpDuration);
      
      // Calculate error rate
      const errorRate = this.calculateErrorRate(httpRequests);

      return {
        requestsPerSecond,
        avgResponseTime,
        errorRate,
        activeUsers: this.getMetricValue(activeUsers) || 0
      };
    } catch (error) {
      logger.error('Error collecting Prometheus metrics', { error: (error as Error).message });
      return {
        requestsPerSecond: 0,
        avgResponseTime: 0,
        errorRate: 0,
        activeUsers: 0
      };
    }
  }

  private async getSystemMetrics(): Promise<any> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memoryUsage: memoryUsage.heapUsed / memoryUsage.heapTotal,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      diskUsage: 0 // Would need additional library for disk usage
    };
  }

  private async getDatabaseMetrics(): Promise<any> {
    try {
      const client = await this.dbPool.connect();
      
      try {
        const result = await client.query(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
          FROM pg_stat_activity
          WHERE datname = current_database()
        `);

        return {
          totalConnections: parseInt(result.rows[0].total_connections),
          activeConnections: parseInt(result.rows[0].active_connections),
          idleConnections: parseInt(result.rows[0].idle_connections)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error collecting database metrics', { error: (error as Error).message });
      return {
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0
      };
    }
  }

  private async getCacheMetrics(): Promise<any> {
    try {
      const info = await this.redis.info('stats');
      const stats = this.parseRedisInfo(info);
      
      const hits = stats.keyspace_hits || 0;
      const misses = stats.keyspace_misses || 0;
      const hitRate = hits + misses > 0 ? hits / (hits + misses) : 0;

      return {
        hitRate,
        hits,
        misses,
        connectedClients: stats.connected_clients || 0
      };
    } catch (error) {
      logger.error('Error collecting cache metrics', { error: (error as Error).message });
      return {
        hitRate: 0,
        hits: 0,
        misses: 0,
        connectedClients: 0
      };
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

  private calculateRequestsPerSecond(httpRequests: any): number {
    if (!httpRequests || !httpRequests.values) return 0;
    
    // Simplified calculation - would need time-based calculation for accuracy
    const totalRequests = httpRequests.values.reduce((sum: number, metric: any) => {
      return sum + (metric.value || 0);
    }, 0);
    
    return totalRequests / 60; // Rough approximation
  }

  private calculateAvgResponseTime(httpDuration: any): number {
    if (!httpDuration || !httpDuration.values) return 0;
    
    // Extract histogram data and calculate average
    let totalTime = 0;
    let totalCount = 0;
    
    for (const metric of httpDuration.values) {
      if (metric.metricName?.includes('_sum')) {
        totalTime += metric.value || 0;
      } else if (metric.metricName?.includes('_count')) {
        totalCount += metric.value || 0;
      }
    }
    
    return totalCount > 0 ? (totalTime / totalCount) * 1000 : 0; // Convert to ms
  }

  private calculateErrorRate(httpRequests: any): number {
    if (!httpRequests || !httpRequests.values) return 0;
    
    let totalRequests = 0;
    let errorRequests = 0;
    
    for (const metric of httpRequests.values) {
      const statusCode = metric.labels?.status_code;
      const value = metric.value || 0;
      
      totalRequests += value;
      
      if (statusCode && parseInt(statusCode) >= 400) {
        errorRequests += value;
      }
    }
    
    return totalRequests > 0 ? errorRequests / totalRequests : 0;
  }

  private getMetricValue(metric: any): number {
    if (!metric || !metric.values || metric.values.length === 0) return 0;
    return metric.values[0].value || 0;
  }

  private storeMetrics(metrics: PerformanceMetrics) {
    // Store in memory for real-time access
    this.metricsHistory.push(metrics);
    
    // Keep only recent history
    if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
      this.metricsHistory.shift();
    }

    // Store in Redis for persistence
    this.redis.zadd(
      'performance_metrics',
      metrics.timestamp,
      JSON.stringify(metrics)
    ).catch(error => {
      logger.error('Error storing metrics in Redis', { error: error.message });
    });
  }

  async getCurrentMetrics(): Promise<PerformanceMetrics | null> {
    if (this.metricsHistory.length === 0) {
      return null;
    }
    
    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  async getMetricsHistory(hours: number = 24): Promise<PerformanceMetrics[]> {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    
    try {
      const results = await this.redis.zrangebyscore(
        'performance_metrics',
        cutoffTime,
        '+inf'
      );
      
      return results.map(result => JSON.parse(result));
    } catch (error) {
      logger.error('Error retrieving metrics history', { error: (error as Error).message });
      return this.metricsHistory.filter(m => m.timestamp >= cutoffTime);
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return {
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    };
  }

  private async aggregateHourlyMetrics() {
    try {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const metrics = await this.getMetricsHistory(1);
      
      if (metrics.length === 0) return;

      const aggregated = {
        timestamp: Date.now(),
        avgRequestsPerSecond: this.average(metrics.map(m => m.requestsPerSecond)),
        avgResponseTime: this.average(metrics.map(m => m.avgResponseTime)),
        avgErrorRate: this.average(metrics.map(m => m.errorRate)),
        maxActiveUsers: Math.max(...metrics.map(m => m.activeUsers)),
        avgDbConnections: this.average(metrics.map(m => m.dbConnections)),
        avgCacheHitRate: this.average(metrics.map(m => m.cacheHitRate)),
        avgMemoryUsage: this.average(metrics.map(m => m.memoryUsage)),
        avgCpuUsage: this.average(metrics.map(m => m.cpuUsage))
      };

      await this.redis.zadd(
        'hourly_metrics',
        aggregated.timestamp,
        JSON.stringify(aggregated)
      );

      logger.info('Hourly metrics aggregated', { timestamp: aggregated.timestamp });
    } catch (error) {
      logger.error('Error aggregating hourly metrics', { error: (error as Error).message });
    }
  }

  private async cleanupOldMetrics() {
    try {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      // Clean up raw metrics older than 7 days
      await this.redis.zremrangebyscore('performance_metrics', '-inf', sevenDaysAgo);
      
      // Clean up hourly metrics older than 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      await this.redis.zremrangebyscore('hourly_metrics', '-inf', thirtyDaysAgo);
      
      logger.info('Old metrics cleaned up');
    } catch (error) {
      logger.error('Error cleaning up old metrics', { error: (error as Error).message });
    }
  }

  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }
}