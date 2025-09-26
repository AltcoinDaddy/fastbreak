import { Request, Response, NextFunction } from 'express';
import { monitoringMiddleware, monitoringService, getMetricsHandler } from '../../middleware/monitoring';

describe('Monitoring Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let originalEnd: any;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/api/v1/users/profile',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'User-Agent') return 'test-agent';
        return undefined;
      }),
    };

    originalEnd = jest.fn();
    mockRes = {
      statusCode: 200,
      setHeader: jest.fn(),
      end: originalEnd,
    };

    mockNext = jest.fn();
  });

  describe('monitoringMiddleware', () => {
    it('should add request ID to request and response', () => {
      monitoringMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).requestId).toBeDefined();
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should capture metrics when response ends', () => {
      monitoringMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Simulate response ending
      mockRes.end!('response data');

      expect(originalEnd).toHaveBeenCalledWith('response data');
    });

    it('should track response time', (done) => {
      monitoringMiddleware(mockReq as Request, mockRes as Response, mockNext);

      setTimeout(() => {
        mockRes.end!();
        
        // Check that a metric was recorded
        const metrics = monitoringService.getMetrics(1);
        expect(metrics).toHaveLength(1);
        expect(metrics[0].responseTime).toBeGreaterThan(0);
        done();
      }, 10);
    });

    it('should capture request details in metrics', () => {
      (mockReq as any).user = { id: 'user123' };
      
      monitoringMiddleware(mockReq as Request, mockRes as Response, mockNext);
      mockRes.end!();

      const metrics = monitoringService.getMetrics(1);
      expect(metrics[0]).toMatchObject({
        method: 'GET',
        path: '/api/v1/users/profile',
        statusCode: 200,
        userAgent: 'test-agent',
        ip: '127.0.0.1',
        userId: 'user123',
      });
    });
  });

  describe('MonitoringService', () => {
    beforeEach(() => {
      // Clear metrics before each test
      (monitoringService as any).metrics = [];
    });

    it('should store metrics with limit', () => {
      // Add more metrics than the limit
      for (let i = 0; i < 1100; i++) {
        (monitoringService as any).addMetric({
          requestId: `req_${i}`,
          method: 'GET',
          path: '/test',
          statusCode: 200,
          responseTime: 100,
          ip: '127.0.0.1',
          timestamp: new Date(),
        });
      }

      const metrics = monitoringService.getMetrics();
      expect(metrics.length).toBeLessThanOrEqual(1000);
    });

    it('should calculate average response time', () => {
      const now = new Date();
      
      // Add test metrics
      [(monitoringService as any).addMetric({
        requestId: 'req_1',
        method: 'GET',
        path: '/test',
        statusCode: 200,
        responseTime: 100,
        ip: '127.0.0.1',
        timestamp: now,
      }),
      (monitoringService as any).addMetric({
        requestId: 'req_2',
        method: 'GET',
        path: '/test',
        statusCode: 200,
        responseTime: 200,
        ip: '127.0.0.1',
        timestamp: now,
      })];

      const avgResponseTime = monitoringService.getAverageResponseTime();
      expect(avgResponseTime).toBe(150);
    });

    it('should calculate error rate', () => {
      const now = new Date();
      
      // Add test metrics with some errors
      [(monitoringService as any).addMetric({
        requestId: 'req_1',
        method: 'GET',
        path: '/test',
        statusCode: 200,
        responseTime: 100,
        ip: '127.0.0.1',
        timestamp: now,
      }),
      (monitoringService as any).addMetric({
        requestId: 'req_2',
        method: 'GET',
        path: '/test',
        statusCode: 500,
        responseTime: 100,
        ip: '127.0.0.1',
        timestamp: now,
      })];

      const errorRate = monitoringService.getErrorRate();
      expect(errorRate).toBe(50); // 50% error rate
    });

    it('should calculate requests per minute', () => {
      const now = new Date();
      
      // Add 10 metrics
      for (let i = 0; i < 10; i++) {
        (monitoringService as any).addMetric({
          requestId: `req_${i}`,
          method: 'GET',
          path: '/test',
          statusCode: 200,
          responseTime: 100,
          ip: '127.0.0.1',
          timestamp: now,
        });
      }

      const rpm = monitoringService.getRequestsPerMinute(60000); // 1 minute
      expect(rpm).toBe(10);
    });

    it('should get top endpoints', () => {
      const now = new Date();
      
      // Add metrics for different endpoints
      [(monitoringService as any).addMetric({
        requestId: 'req_1',
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        responseTime: 100,
        ip: '127.0.0.1',
        timestamp: now,
      }),
      (monitoringService as any).addMetric({
        requestId: 'req_2',
        method: 'GET',
        path: '/api/users',
        statusCode: 200,
        responseTime: 200,
        ip: '127.0.0.1',
        timestamp: now,
      }),
      (monitoringService as any).addMetric({
        requestId: 'req_3',
        method: 'POST',
        path: '/api/trades',
        statusCode: 201,
        responseTime: 300,
        ip: '127.0.0.1',
        timestamp: now,
      })];

      const topEndpoints = monitoringService.getTopEndpoints();
      
      expect(topEndpoints).toHaveLength(2);
      expect(topEndpoints[0]).toMatchObject({
        path: 'GET /api/users',
        count: 2,
        avgResponseTime: 150,
      });
      expect(topEndpoints[1]).toMatchObject({
        path: 'POST /api/trades',
        count: 1,
        avgResponseTime: 300,
      });
    });
  });

  describe('getMetricsHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
      mockReq = {
        query: {},
      };
      mockRes = {
        json: jest.fn(),
      };
    });

    it('should return metrics summary', () => {
      getMetricsHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          summary: expect.objectContaining({
            averageResponseTime: expect.any(Number),
            errorRate: expect.any(Number),
            requestsPerMinute: expect.any(Number),
          }),
          topEndpoints: expect.any(Array),
          recentRequests: expect.any(Array),
          timestamp: expect.any(String),
        }),
        timestamp: expect.any(String),
      });
    });

    it('should respect query parameters', () => {
      mockReq.query = { limit: '50', timeframe: '600000' };
      
      getMetricsHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recentRequests: expect.any(Array),
          }),
        })
      );
    });
  });
});