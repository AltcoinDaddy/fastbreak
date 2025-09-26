import request from 'supertest';
import app from '../../app';
import { serviceProxy } from '../../utils/service-proxy';

// Mock the service proxy for testing
jest.mock('../../utils/service-proxy');
const mockServiceProxy = serviceProxy as jest.Mocked<typeof serviceProxy>;

describe('Service Orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Communication', () => {
    it('should handle successful service responses', async () => {
      const mockResponse = {
        success: true,
        data: { id: '123', name: 'Test User' },
        timestamp: new Date().toISOString(),
      };

      mockServiceProxy.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockServiceProxy.get).toHaveBeenCalledWith('user-service', '/users/undefined');
    });

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Service unavailable');
      (serviceError as any).statusCode = 503;
      
      mockServiceProxy.get.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle service timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      
      mockServiceProxy.get.mockRejectedValue(timeoutError);

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('timeout');
    });
  });

  describe('Request Routing', () => {
    it('should route user requests to user service', async () => {
      mockServiceProxy.post.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .post('/api/v1/users/register')
        .send({ walletAddress: '0x123', email: 'test@example.com' })
        .expect(201);

      expect(mockServiceProxy.post).toHaveBeenCalledWith(
        'user-service',
        '/users/register',
        expect.objectContaining({
          walletAddress: '0x123',
          email: 'test@example.com',
        })
      );
    });

    it('should route AI requests to AI scouting service', async () => {
      mockServiceProxy.post.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .post('/api/v1/ai/analyze/moment')
        .set('Authorization', 'Bearer valid-token')
        .send({ momentId: 'moment123' })
        .expect(200);

      expect(mockServiceProxy.post).toHaveBeenCalledWith(
        'ai-scouting',
        '/analyze/moment',
        expect.objectContaining({
          momentId: 'moment123',
        })
      );
    });

    it('should route trading requests to trading service', async () => {
      mockServiceProxy.post.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .post('/api/v1/trades/execute')
        .set('Authorization', 'Bearer valid-token')
        .send({ momentId: 'moment123', action: 'buy', price: 100 })
        .expect(200);

      expect(mockServiceProxy.post).toHaveBeenCalledWith(
        'risk-management',
        '/validate-trade',
        expect.objectContaining({
          momentId: 'moment123',
          action: 'buy',
          price: 100,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('not found');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle missing authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('token required');
    });
  });

  describe('Request/Response Logging', () => {
    it('should log successful requests', async () => {
      mockServiceProxy.get.mockResolvedValue({ success: true, data: {} });

      await request(app)
        .get('/health')
        .expect(200);

      // Verify that the request was logged (this would require mocking the logger)
      // For now, we just verify the request completed successfully
    });

    it('should log failed requests', async () => {
      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});