import request from 'supertest';
import app from '../../app';
import { serviceProxy } from '../../utils/service-proxy';
import { healthCheckService } from '../../services/health-check';

// Mock dependencies
jest.mock('../../utils/service-proxy');
jest.mock('../../services/health-check');

const mockServiceProxy = serviceProxy as jest.Mocked<typeof serviceProxy>;
const mockHealthCheckService = healthCheckService as jest.Mocked<typeof healthCheckService>;

describe('API Gateway Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Discovery and Routing', () => {
    it('should route to all configured services', async () => {
      const services = [
        { route: '/api/v1/users/profile', service: 'user-service' },
        { route: '/api/v1/ai/recommendations', service: 'ai-scouting' },
        { route: '/api/v1/marketplace/opportunities', service: 'marketplace-monitor' },
        { route: '/api/v1/trades/history', service: 'trading-service' },
        { route: '/api/v1/notifications', service: 'notification-service' },
        { route: '/api/v1/strategies', service: 'strategy-service' },
        { route: '/api/v1/portfolio', service: 'trading-service' },
      ];

      mockServiceProxy.get.mockResolvedValue({ success: true, data: {} });

      for (const { route, service } of services) {
        await request(app)
          .get(route)
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(mockServiceProxy.get).toHaveBeenCalledWith(
          service,
          expect.any(String),
          expect.any(Object)
        );
      }
    });

    it('should handle service unavailability gracefully', async () => {
      const serviceError = new Error('Service unavailable');
      (serviceError as any).code = 'ECONNREFUSED';
      
      mockServiceProxy.get.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Service unavailable');
    });
  });

  describe('Request/Response Processing', () => {
    it('should forward request headers correctly', async () => {
      mockServiceProxy.get.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .set('X-Custom-Header', 'test-value')
        .expect(200);

      expect(mockServiceProxy.get).toHaveBeenCalledWith(
        'user-service',
        expect.any(String),
        expect.objectContaining({
          params: expect.any(Object)
        })
      );
    });

    it('should handle request body transformation', async () => {
      mockServiceProxy.post.mockResolvedValue({ success: true, data: {} });

      const requestBody = {
        momentId: 'moment123',
        action: 'buy',
        price: 100
      };

      await request(app)
        .post('/api/v1/trades/execute')
        .set('Authorization', 'Bearer valid-token')
        .send(requestBody)
        .expect(200);

      expect(mockServiceProxy.post).toHaveBeenCalledWith(
        'risk-management',
        '/validate-trade',
        expect.objectContaining(requestBody)
      );
    });

    it('should handle query parameters correctly', async () => {
      mockServiceProxy.get.mockResolvedValue({ success: true, data: [] });

      await request(app)
        .get('/api/v1/trades/history?limit=10&offset=20&status=completed')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockServiceProxy.get).toHaveBeenCalledWith(
        'trading-service',
        '/trades/history',
        expect.objectContaining({
          params: expect.objectContaining({
            limit: '10',
            offset: '20',
            status: 'completed'
          })
        })
      );
    });
  });

  describe('Health Check Integration', () => {
    it('should provide basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should provide detailed system health', async () => {
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: [
          { name: 'user-service', status: 'healthy' as const, lastCheck: new Date() },
          { name: 'ai-scouting', status: 'healthy' as const, lastCheck: new Date() }
        ],
        timestamp: new Date(),
        uptime: 3600
      };

      mockHealthCheckService.getSystemHealth.mockReturnValue(mockSystemHealth);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('services');
    });

    it('should check individual service health', async () => {
      const mockServiceHealth = {
        name: 'user-service',
        status: 'healthy' as const,
        responseTime: 150,
        lastCheck: new Date()
      };

      mockHealthCheckService.checkServiceHealth.mockResolvedValue(mockServiceHealth);

      const response = await request(app)
        .get('/api/health/user-service')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('name', 'user-service');
      expect(response.body.data).toHaveProperty('status', 'healthy');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial service failures', async () => {
      // Mock one service failing and another succeeding
      mockServiceProxy.get
        .mockRejectedValueOnce(new Error('Service A failed'))
        .mockResolvedValueOnce({ success: true, data: {} });

      // First request should fail
      await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      // Second request should succeed
      await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });

    it('should handle timeout scenarios', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      
      mockServiceProxy.get.mockRejectedValue(timeoutError);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENETUNREACH';
      
      mockServiceProxy.get.mockRejectedValue(networkError);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should provide system metrics', async () => {
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: [],
        timestamp: new Date(),
        uptime: 3600
      };

      mockHealthCheckService.getSystemHealth.mockReturnValue(mockSystemHealth);

      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('memory');
      expect(response.body.data).toHaveProperty('cpu');
      expect(response.body.data).toHaveProperty('uptime');
    });

    it('should track response times', async () => {
      mockServiceProxy.get.mockResolvedValue({ success: true, data: {} });

      const start = Date.now();
      
      await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      const responseTime = Date.now() - start;
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });
  });

  describe('API Versioning', () => {
    it('should handle versioned API routes', async () => {
      mockServiceProxy.get.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Verify the route was processed correctly
      expect(mockServiceProxy.get).toHaveBeenCalled();
    });

    it('should reject invalid API versions', async () => {
      const response = await request(app)
        .get('/api/v2/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('Request Validation', () => {
    it('should validate request content types', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .set('Content-Type', 'text/plain')
        .send('invalid content')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle large request bodies', async () => {
      const largeBody = {
        data: 'x'.repeat(1024 * 1024) // 1MB of data
      };

      mockServiceProxy.post.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .post('/api/v1/users/register')
        .send(largeBody)
        .expect(201);
    });

    it('should reject oversized request bodies', async () => {
      const oversizedBody = {
        data: 'x'.repeat(11 * 1024 * 1024) // 11MB of data (over 10MB limit)
      };

      const response = await request(app)
        .post('/api/v1/users/register')
        .send(oversizedBody)
        .expect(413);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});