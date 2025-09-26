import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface RequestMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip: string;
  userId?: string;
  timestamp: Date;
}

class MonitoringService {
  private metrics: RequestMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 requests in memory

  addMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(limit: number = 100): RequestMetrics[] {
    return this.metrics.slice(-limit);
  }

  getAverageResponseTime(timeframe: number = 300000): number { // 5 minutes default
    const cutoff = new Date(Date.now() - timeframe);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const totalTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    return Math.round(totalTime / recentMetrics.length);
  }

  getErrorRate(timeframe: number = 300000): number { // 5 minutes default
    const cutoff = new Date(Date.now() - timeframe);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    return Math.round((errorCount / recentMetrics.length) * 100);
  }

  getRequestsPerMinute(timeframe: number = 300000): number { // 5 minutes default
    const cutoff = new Date(Date.now() - timeframe);
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff);
    
    const minutes = timeframe / 60000;
    return Math.round(recentMetrics.length / minutes);
  }

  getTopEndpoints(limit: number = 10): Array<{ path: string; count: number; avgResponseTime: number }> {
    const endpointStats = new Map<string, { count: number; totalTime: number }>();
    
    this.metrics.forEach(metric => {
      const key = `${metric.method} ${metric.path}`;
      const existing = endpointStats.get(key) || { count: 0, totalTime: 0 };
      endpointStats.set(key, {
        count: existing.count + 1,
        totalTime: existing.totalTime + metric.responseTime
      });
    });

    return Array.from(endpointStats.entries())
      .map(([path, stats]) => ({
        path,
        count: stats.count,
        avgResponseTime: Math.round(stats.totalTime / stats.count)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

export const monitoringService = new MonitoringService();

export const monitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to request object for logging
  (req as any).requestId = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Override res.end to capture metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const responseTime = Date.now() - startTime;
    
    const metric: RequestMetrics = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: (req as any).user?.id,
      timestamp: new Date(),
    };

    monitoringService.addMetric(metric);

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        path: req.path,
        responseTime,
        statusCode: res.statusCode,
        userId: (req as any).user?.id,
      });
    }

    // Log error responses
    if (res.statusCode >= 400) {
      logger.warn('Error response', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        userId: (req as any).user?.id,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    }

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

export const getMetricsHandler = (req: Request, res: Response) => {
  const { limit = 100, timeframe = 300000 } = req.query;
  
  const metrics = {
    summary: {
      averageResponseTime: monitoringService.getAverageResponseTime(Number(timeframe)),
      errorRate: monitoringService.getErrorRate(Number(timeframe)),
      requestsPerMinute: monitoringService.getRequestsPerMinute(Number(timeframe)),
    },
    topEndpoints: monitoringService.getTopEndpoints(10),
    recentRequests: monitoringService.getMetrics(Number(limit)),
    timestamp: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
};