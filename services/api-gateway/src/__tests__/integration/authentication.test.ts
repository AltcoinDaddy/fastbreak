import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

describe('Authentication Middleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  
  const createTestToken = (payload: any) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  };

  const validUser = {
    id: 'test-user-id',
    walletAddress: '0x1234567890123456',
  };

  describe('Protected routes', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Access token required');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid or expired token');
    });

    it('should accept requests with valid token', async () => {
      const token = createTestToken(validUser);
      
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);

      // Should attempt to proxy to user service
      // In test environment, this will likely fail with service unavailable
      expect([200, 503, 500]).toContain(response.status);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(validUser, JWT_SECRET, { expiresIn: '-1h' });
      
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid or expired token');
    });
  });

  describe('Optional authentication routes', () => {
    it('should work without token for optional auth routes', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/stats')
        .expect('Content-Type', /json/);

      // Should attempt to proxy to marketplace service
      expect([200, 503, 500]).toContain(response.status);
    });

    it('should work with valid token for optional auth routes', async () => {
      const token = createTestToken(validUser);
      
      const response = await request(app)
        .get('/api/v1/marketplace/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);

      // Should attempt to proxy to marketplace service
      expect([200, 503, 500]).toContain(response.status);
    });

    it('should continue without auth for invalid token on optional auth routes', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/stats')
        .set('Authorization', 'Bearer invalid-token')
        .expect('Content-Type', /json/);

      // Should still attempt to proxy to marketplace service
      expect([200, 503, 500]).toContain(response.status);
    });
  });

  describe('Public routes', () => {
    it('should allow access to health endpoints without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
    });

    it('should allow access to system status without authentication', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});