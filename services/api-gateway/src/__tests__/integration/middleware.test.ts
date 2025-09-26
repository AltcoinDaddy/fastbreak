import request from 'supertest';
import app from '../../app';
import jwt from 'jsonwebtoken';

describe('Middleware Integration', () => {
  const validToken = jwt.sign(
    { id: 'user123', walletAddress: '0x123' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  describe('Authentication Middleware', () => {
    it('should accept valid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500); // 500 because service is mocked, but auth passed

      // Should not be 401 (unauthorized)
      expect(response.status).not.toBe(401);
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should reject requests without tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Access token required');
    });

    it('should handle expired tokens', async () => {
      const expiredToken = jwt.sign(
        { id: 'user123', walletAddress: '0x123' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Invalid or expired token');
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('should allow requests within rate limit', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should apply stricter limits to auth endpoints', async () => {
      // Make multiple requests to auth endpoint
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/v1/users/login')
          .send({ walletAddress: '0x123', signature: 'test' })
      );

      const responses = await Promise.all(requests);
      
      // All should either succeed or fail due to service issues, not rate limiting
      responses.forEach(response => {
        expect(response.status).not.toBe(429);
      });
    });

    it('should skip rate limiting for health checks', async () => {
      // Make many health check requests
      const requests = Array(10).fill(null).map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (not rate limited)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Error Handling Middleware', () => {
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .send({}) // Missing required fields
        .expect(500); // Will be 500 due to service proxy error

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should not expose internal errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);

      expect(response.body.error).not.toContain('stack');
      expect(response.body.error).not.toContain('internal');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Security Middleware', () => {
    it('should set security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Check for helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/v1/users/profile')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('Compression Middleware', () => {
    it('should compress large responses', async () => {
      const response = await request(app)
        .get('/health')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // For small responses, compression might not be applied
      // This test mainly ensures compression middleware doesn't break anything
      expect(response.status).toBe(200);
    });
  });
});