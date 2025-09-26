import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from './metrics';

export interface MonitoringOptions {
  serviceName: string;
  excludePaths?: string[];
}

export function createMonitoringMiddleware(options: MonitoringOptions) {
  const { serviceName, excludePaths = ['/health', '/metrics'] } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip monitoring for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();
    const route = req.route?.path || req.path;

    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any) {
      const duration = (Date.now() - startTime) / 1000;
      const statusCode = res.statusCode.toString();

      // Record metrics
      httpRequestDuration
        .labels(req.method, route, statusCode, serviceName)
        .observe(duration);

      httpRequestTotal
        .labels(req.method, route, statusCode, serviceName)
        .inc();

      // Call original end method
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

export function createMetricsEndpoint() {
  return async (req: Request, res: Response) => {
    try {
      const { register } = await import('./metrics');
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      res.status(500).end('Error collecting metrics');
    }
  };
}