import { AlertConfig, AlertChannel, HealthCheck, DependencyHealth, FastBreakError } from '@fastbreak/types';
import { FastBreakLogger } from './logger';
import { FastBreakAppError } from './errors';

/**
 * Error monitoring and alerting system
 */
export class ErrorMonitor {
  private errorCounts = new Map<string, number>();
  private lastAlertTime = new Map<string, number>();
  private logger: FastBreakLogger;

  constructor(
    private readonly config: AlertConfig,
    logger?: FastBreakLogger
  ) {
    this.logger = logger || new FastBreakLogger('error-monitor');
    
    // Reset error counts periodically
    setInterval(() => {
      this.resetErrorCounts();
    }, 60000); // Reset every minute
  }

  /**
   * Record an error and check if alerting is needed
   */
  recordError(error: FastBreakError | Error, context?: {
    service?: string;
    operation?: string;
    userId?: string;
  }): void {
    const errorKey = this.getErrorKey(error, context);
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Log the error
    this.logger.error('Error recorded by monitor', {
      error: error as FastBreakAppError,
      metadata: {
        errorKey,
        currentCount: currentCount + 1,
        ...context
      }
    });

    // Check if we need to send an alert
    this.checkAlertThresholds(error, errorKey, currentCount + 1, context);
  }

  /**
   * Check if error thresholds are exceeded and send alerts
   */
  private checkAlertThresholds(
    error: FastBreakError | Error,
    errorKey: string,
    count: number,
    context?: {
      service?: string;
      operation?: string;
      userId?: string;
    }
  ): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(errorKey) || 0;
    const cooldownPeriod = this.config.cooldown * 60 * 1000; // Convert minutes to milliseconds

    // Check if we're still in cooldown period
    if (now - lastAlert < cooldownPeriod) {
      return;
    }

    let shouldAlert = false;
    let alertReason = '';

    // Check for critical errors (immediate alert)
    if (error instanceof FastBreakAppError && error.severity === 'critical') {
      shouldAlert = true;
      alertReason = 'Critical error detected';
    }
    // Check error rate threshold
    else if (count >= this.config.threshold.errorRate) {
      shouldAlert = true;
      alertReason = `Error rate threshold exceeded: ${count} errors in the last minute`;
    }

    if (shouldAlert) {
      this.sendAlert(error, alertReason, context);
      this.lastAlertTime.set(errorKey, now);
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(
    error: FastBreakError | Error,
    reason: string,
    context?: {
      service?: string;
      operation?: string;
      userId?: string;
    }
  ): Promise<void> {
    const alertData = {
      timestamp: new Date(),
      reason,
      error: error instanceof FastBreakAppError ? error.toJSON() : {
        message: error.message,
        stack: error.stack
      },
      context
    };

    this.logger.error('Sending error alert', {
      metadata: { alertData, channels: this.config.channels }
    });

    // Send alerts through each configured channel
    for (const channel of this.config.channels) {
      try {
        await this.sendAlertToChannel(channel, alertData);
      } catch (alertError) {
        this.logger.error('Failed to send alert', {
          error: alertError as FastBreakAppError,
          metadata: { channel, originalAlert: alertData }
        });
      }
    }
  }

  /**
   * Send alert to specific channel
   */
  private async sendAlertToChannel(channel: AlertChannel, alertData: any): Promise<void> {
    switch (channel) {
      case 'email':
        await this.sendEmailAlert(alertData);
        break;
      case 'slack':
        await this.sendSlackAlert(alertData);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alertData);
        break;
      case 'dashboard':
        await this.sendDashboardAlert(alertData);
        break;
      default:
        this.logger.warn('Unknown alert channel', { metadata: { channel } });
    }
  }

  private async sendEmailAlert(alertData: any): Promise<void> {
    // Implementation would integrate with email service
    this.logger.info('Email alert sent', { metadata: alertData });
  }

  private async sendSlackAlert(alertData: any): Promise<void> {
    // Implementation would integrate with Slack API
    this.logger.info('Slack alert sent', { metadata: alertData });
  }

  private async sendWebhookAlert(alertData: any): Promise<void> {
    // Implementation would send HTTP POST to webhook URL
    this.logger.info('Webhook alert sent', { metadata: alertData });
  }

  private async sendDashboardAlert(alertData: any): Promise<void> {
    // Implementation would update dashboard notifications
    this.logger.info('Dashboard alert sent', { metadata: alertData });
  }

  /**
   * Generate unique key for error tracking
   */
  private getErrorKey(error: FastBreakError | Error, context?: {
    service?: string;
    operation?: string;
  }): string {
    const service = context?.service || 'unknown';
    const operation = context?.operation || 'unknown';
    
    if (error instanceof FastBreakAppError) {
      return `${service}:${operation}:${error.code}`;
    }
    
    return `${service}:${operation}:${error.constructor.name}`;
  }

  /**
   * Reset error counts (called periodically)
   */
  private resetErrorCounts(): void {
    this.errorCounts.clear();
    this.logger.debug('Error counts reset');
  }

  /**
   * Get current error statistics
   */
  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }
}

/**
 * Health check system for monitoring service dependencies
 */
export class HealthChecker {
  private logger: FastBreakLogger;
  private healthChecks = new Map<string, () => Promise<DependencyHealth>>();

  constructor(logger?: FastBreakLogger) {
    this.logger = logger || new FastBreakLogger('health-checker');
  }

  /**
   * Register a health check for a dependency
   */
  registerHealthCheck(name: string, check: () => Promise<DependencyHealth>): void {
    this.healthChecks.set(name, check);
    this.logger.info('Health check registered', { metadata: { dependency: name } });
  }

  /**
   * Perform health check for all dependencies
   */
  async checkHealth(service: string): Promise<HealthCheck> {
    const startTime = Date.now();
    const dependencies: DependencyHealth[] = [];

    for (const [name, check] of this.healthChecks) {
      try {
        const dependencyHealth = await check();
        dependencies.push(dependencyHealth);
      } catch (error) {
        dependencies.push({
          name,
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        this.logger.error('Health check failed', {
          error: error as FastBreakAppError,
          metadata: { dependency: name, service }
        });
      }
    }

    const responseTime = Date.now() - startTime;
    const overallStatus = this.determineOverallStatus(dependencies);

    const healthCheck: HealthCheck = {
      service,
      status: overallStatus,
      timestamp: new Date(),
      responseTime,
      dependencies
    };

    this.logger.info('Health check completed', {
      metadata: {
        service,
        status: overallStatus,
        responseTime,
        dependencyCount: dependencies.length
      }
    });

    return healthCheck;
  }

  /**
   * Determine overall service health based on dependencies
   */
  private determineOverallStatus(dependencies: DependencyHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    const unhealthyCount = dependencies.filter(d => d.status === 'unhealthy').length;
    const degradedCount = dependencies.filter(d => d.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return unhealthyCount > dependencies.length / 2 ? 'unhealthy' : 'degraded';
    }

    if (degradedCount > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Create a simple dependency health check
   */
  static createSimpleCheck(
    name: string,
    checkFn: () => Promise<boolean>,
    timeout: number = 5000
  ): () => Promise<DependencyHealth> {
    return async (): Promise<DependencyHealth> => {
      const startTime = Date.now();
      
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), timeout);
        });
        
        const isHealthy = await Promise.race([checkFn(), timeoutPromise]);
        const responseTime = Date.now() - startTime;
        
        return {
          name,
          status: isHealthy ? 'healthy' : 'unhealthy',
          responseTime
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        return {
          name,
          status: 'unhealthy',
          responseTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    };
  }
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
  private metrics = new Map<string, number[]>();
  private logger: FastBreakLogger;

  constructor(logger?: FastBreakLogger) {
    this.logger = logger || new FastBreakLogger('metrics-collector');
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metricKey = this.getMetricKey(name, tags);
    const values = this.metrics.get(metricKey) || [];
    values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (values.length > 1000) {
      values.shift();
    }
    
    this.metrics.set(metricKey, values);
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string, tags?: Record<string, string>): {
    count: number;
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
  } | null {
    const metricKey = this.getMetricKey(name, tags);
    const values = this.metrics.get(metricKey);
    
    if (!values || values.length === 0) {
      return null;
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = sorted.reduce((sum, val) => sum + val, 0) / count;
    const p95 = sorted[Math.floor(count * 0.95)];
    const p99 = sorted[Math.floor(count * 0.99)];
    
    return { count, min, max, avg, p95, p99 };
  }

  private getMetricKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    
    return `${name}{${tagString}}`;
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.logger.debug('Metrics cleared');
  }
}