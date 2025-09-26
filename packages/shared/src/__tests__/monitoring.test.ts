import { ErrorMonitor, HealthChecker, MetricsCollector } from '../monitoring';
import { FastBreakAppError, createError, ErrorCodes } from '../errors';
import { FastBreakLogger } from '../logger';
import type { AlertConfig } from '@fastbreak/types';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as unknown as FastBreakLogger;

describe('ErrorMonitor', () => {
  let errorMonitor: ErrorMonitor;
  let alertConfig: AlertConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    alertConfig = {
      enabled: true,
      channels: ['dashboard'],
      threshold: {
        errorRate: 5,
        criticalErrors: 1
      },
      cooldown: 5 // 5 minutes
    };
    
    errorMonitor = new ErrorMonitor(alertConfig, mockLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should record errors and track counts', () => {
    const error = createError(ErrorCodes.NETWORK_TIMEOUT, { service: 'test-service' });
    
    errorMonitor.recordError(error, {
      service: 'test-service',
      operation: 'test-operation'
    });
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error recorded by monitor',
      expect.objectContaining({
        error,
        metadata: expect.objectContaining({
          currentCount: 1,
          service: 'test-service',
          operation: 'test-operation'
        })
      })
    );
  });

  it('should send alert for critical errors', () => {
    const criticalError = createError(
      ErrorCodes.INTERNAL_SERVER_ERROR,
      { service: 'test-service' },
      { severity: 'critical' }
    );
    
    errorMonitor.recordError(criticalError);
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Sending error alert',
      expect.objectContaining({
        metadata: expect.objectContaining({
          alertData: expect.objectContaining({
            reason: 'Critical error detected'
          })
        })
      })
    );
  });

  it('should send alert when error rate threshold is exceeded', () => {
    const error = createError(ErrorCodes.NETWORK_TIMEOUT, { service: 'test-service' });
    
    // Record errors up to threshold
    for (let i = 0; i < 5; i++) {
      errorMonitor.recordError(error, {
        service: 'test-service',
        operation: 'test-operation'
      });
    }
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Sending error alert',
      expect.objectContaining({
        metadata: expect.objectContaining({
          alertData: expect.objectContaining({
            reason: 'Error rate threshold exceeded: 5 errors in the last minute'
          })
        })
      })
    );
  });

  it('should respect cooldown period', () => {
    const error = createError(ErrorCodes.NETWORK_TIMEOUT, { service: 'test-service' });
    
    // First alert
    for (let i = 0; i < 5; i++) {
      errorMonitor.recordError(error, {
        service: 'test-service',
        operation: 'test-operation'
      });
    }
    
    // Clear mock calls
    jest.clearAllMocks();
    
    // Second batch within cooldown period
    for (let i = 0; i < 5; i++) {
      errorMonitor.recordError(error, {
        service: 'test-service',
        operation: 'test-operation'
      });
    }
    
    // Should not send another alert
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Sending error alert',
      expect.anything()
    );
  });

  it('should reset error counts periodically', () => {
    const error = createError(ErrorCodes.NETWORK_TIMEOUT, { service: 'test-service' });
    
    errorMonitor.recordError(error);
    
    // Fast-forward 1 minute to trigger reset
    jest.advanceTimersByTime(60000);
    
    const stats = errorMonitor.getErrorStats();
    expect(Object.keys(stats)).toHaveLength(0);
  });

  it('should provide error statistics', () => {
    const error1 = createError(ErrorCodes.NETWORK_TIMEOUT, { service: 'service-1' });
    const error2 = createError(ErrorCodes.DATABASE_CONNECTION_FAILED, { service: 'service-2' });
    
    errorMonitor.recordError(error1, { service: 'service-1', operation: 'op-1' });
    errorMonitor.recordError(error1, { service: 'service-1', operation: 'op-1' });
    errorMonitor.recordError(error2, { service: 'service-2', operation: 'op-2' });
    
    const stats = errorMonitor.getErrorStats();
    
    expect(stats['service-1:op-1:NETWORK_TIMEOUT']).toBe(2);
    expect(stats['service-2:op-2:DATABASE_CONNECTION_FAILED']).toBe(1);
  });
});

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    jest.clearAllMocks();
    healthChecker = new HealthChecker(mockLogger);
  });

  it('should register health checks', () => {
    const mockCheck = jest.fn().mockResolvedValue({
      name: 'test-dependency',
      status: 'healthy' as const
    });
    
    healthChecker.registerHealthCheck('test-dependency', mockCheck);
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Health check registered',
      expect.objectContaining({
        metadata: { dependency: 'test-dependency' }
      })
    );
  });

  it('should perform health checks and return overall status', async () => {
    const healthyCheck = jest.fn().mockResolvedValue({
      name: 'healthy-service',
      status: 'healthy' as const,
      responseTime: 100
    });
    
    const degradedCheck = jest.fn().mockResolvedValue({
      name: 'degraded-service',
      status: 'degraded' as const,
      responseTime: 500
    });
    
    healthChecker.registerHealthCheck('healthy-service', healthyCheck);
    healthChecker.registerHealthCheck('degraded-service', degradedCheck);
    
    const result = await healthChecker.checkHealth('test-service');
    
    expect(result.service).toBe('test-service');
    expect(result.status).toBe('degraded'); // Overall status based on dependencies
    expect(result.dependencies).toHaveLength(2);
    expect(result.responseTime).toBeGreaterThan(0);
    
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Health check completed',
      expect.objectContaining({
        metadata: expect.objectContaining({
          service: 'test-service',
          status: 'degraded',
          dependencyCount: 2
        })
      })
    );
  });

  it('should handle health check failures', async () => {
    const failingCheck = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    
    healthChecker.registerHealthCheck('failing-service', failingCheck);
    
    const result = await healthChecker.checkHealth('test-service');
    
    expect(result.status).toBe('unhealthy');
    expect(result.dependencies[0]).toEqual({
      name: 'failing-service',
      status: 'unhealthy',
      error: 'Service unavailable'
    });
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Health check failed',
      expect.objectContaining({
        metadata: expect.objectContaining({
          dependency: 'failing-service',
          service: 'test-service'
        })
      })
    );
  });

  it('should create simple health checks', async () => {
    const mockCheckFn = jest.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 1)); // Small delay to ensure responseTime > 0
      return true;
    });
    const simpleCheck = HealthChecker.createSimpleCheck('simple-service', mockCheckFn, 1000);
    
    const result = await simpleCheck();
    
    expect(result.name).toBe('simple-service');
    expect(result.status).toBe('healthy');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(mockCheckFn).toHaveBeenCalledTimes(1);
  });

  it('should handle timeouts in simple health checks', async () => {
    const slowCheckFn = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(true), 2000))
    );
    const simpleCheck = HealthChecker.createSimpleCheck('slow-service', slowCheckFn, 500);
    
    const result = await simpleCheck();
    
    expect(result.name).toBe('slow-service');
    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('Health check timeout');
  });
});

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    metricsCollector = new MetricsCollector(mockLogger);
  });

  it('should record metrics', () => {
    metricsCollector.recordMetric('response_time', 150);
    metricsCollector.recordMetric('response_time', 200);
    metricsCollector.recordMetric('response_time', 100);
    
    const stats = metricsCollector.getMetricStats('response_time');
    
    expect(stats).toEqual({
      count: 3,
      min: 100,
      max: 200,
      avg: 150,
      p95: 200,
      p99: 200
    });
  });

  it('should record metrics with tags', () => {
    metricsCollector.recordMetric('response_time', 150, { service: 'api-gateway', endpoint: '/users' });
    metricsCollector.recordMetric('response_time', 200, { service: 'api-gateway', endpoint: '/users' });
    
    const stats = metricsCollector.getMetricStats('response_time', { service: 'api-gateway', endpoint: '/users' });
    
    expect(stats).toEqual({
      count: 2,
      min: 150,
      max: 200,
      avg: 175,
      p95: 200,
      p99: 200
    });
  });

  it('should return null for non-existent metrics', () => {
    const stats = metricsCollector.getMetricStats('non_existent_metric');
    
    expect(stats).toBeNull();
  });

  it('should limit metric history to prevent memory issues', () => {
    // Record more than 1000 values
    for (let i = 0; i < 1500; i++) {
      metricsCollector.recordMetric('test_metric', i);
    }
    
    const stats = metricsCollector.getMetricStats('test_metric');
    
    // Should only keep last 1000 values
    expect(stats?.count).toBe(1000);
    expect(stats?.min).toBe(500); // First 500 values should be dropped
  });

  it('should clear all metrics', () => {
    metricsCollector.recordMetric('metric1', 100);
    metricsCollector.recordMetric('metric2', 200);
    
    metricsCollector.clearMetrics();
    
    expect(metricsCollector.getMetricStats('metric1')).toBeNull();
    expect(metricsCollector.getMetricStats('metric2')).toBeNull();
    
    expect(mockLogger.debug).toHaveBeenCalledWith('Metrics cleared');
  });
});