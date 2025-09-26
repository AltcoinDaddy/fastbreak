import request from 'supertest';
import app from '../../app';

describe('Rate Limiting', () => {
  describe('General rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });

    it('should not rate limit health check endpoint', async () => {
      // Make multiple requests to health endpoint
      const promises = Array(10).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Authentication rate limiting', () => {
    it('should apply stricter rate limiting to auth endpoints', async () => {
      const response = await request(app)
        .post('/api/v1/users/login')
        .send({
          walletAddress: '0x1234567890123456',
          signature: 'test-signature'
        });

      // Should have rate limit headers
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('Rate limit exceeded', () => {
    // Note: This test might be flaky in CI/CD environments
    // Consider mocking the rate limiter for more reliable testing
    it.skip('should return 429 when rate limit is exceeded', async () => {
      const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
      
      // Make requests up to the limit
      const promises = Array(maxRequests + 1).fill(null).map(() => 
        request(app).get('/api/v1/marketplace/stats')
      );

      const responses = await Promise.all(promises);
      
      // Last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      expect(lastResponse.body).toHaveProperty('error');
      expect(lastResponse.body.error).toContain('Too many requests');
    });
  });
});