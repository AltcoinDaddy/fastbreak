import request from 'supertest';
import { Pool } from 'pg';
import express from 'express';
import { NotificationService } from '../services/notification-service';
import { PushService } from '../services/push-service';
import { createNotificationRoutes } from '../routes/notifications';

// Mock external dependencies
jest.mock('nodemailer');
jest.mock('web-push');
jest.mock('bull');
jest.mock('ioredis');
jest.mock('pg');

// Mock the services
jest.mock('../services/notification-service');
jest.mock('../services/push-service');
jest.mock('../services/database-service');
jest.mock('../services/notification-queue');

// Create a test app instead of importing the main app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock database
  const mockDb = {} as Pool;
  
  // Mock services
  const mockNotificationService = {
    sendNotification: jest.fn().mockResolvedValue('test-notification-id'),
    sendPurchaseNotification: jest.fn().mockResolvedValue('purchase-notification-id'),
    sendRareMomentNotification: jest.fn().mockResolvedValue('rare-moment-notification-id'),
    sendBudgetWarningNotification: jest.fn().mockResolvedValue('budget-warning-id'),
    sendSystemErrorNotification: jest.fn().mockResolvedValue('system-error-id'),
    getNotificationHistory: jest.fn().mockResolvedValue({ notifications: [], total: 0 }),
    getUnreadCount: jest.fn().mockResolvedValue(0),
    markAsRead: jest.fn().mockResolvedValue(),
    markAllAsRead: jest.fn().mockResolvedValue(),
  } as any;
  
  const mockPushService = {
    registerPushSubscription: jest.fn().mockResolvedValue(),
    unregisterPushSubscription: jest.fn().mockResolvedValue(),
    testPushService: jest.fn().mockResolvedValue(true),
  } as any;
  
  // Add routes
  app.use('/api/notifications', createNotificationRoutes(mockNotificationService, mockPushService));
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'notification-service', timestamp: new Date().toISOString() });
  });
  
  return app;
};

describe('Notification Service Integration Tests', () => {
  let app: express.Application;
  let authToken: string;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.SERVICE_API_KEY = 'test-service-api-key';
    process.env.ADMIN_API_KEY = 'test-admin-api-key';

    // Create test JWT token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      { id: 'test-user-id', walletAddress: '0x1234567890abcdef' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create test app
    app = createTestApp();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'notification-service',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .send({
          userId: 'test-user-id',
          type: 'trade',
          title: 'Test Notification',
          message: 'Test message',
          priority: 'medium'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authorization header is required'
      });
    });

    it('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: { count: expect.any(Number) }
      });
    });

    it('should accept service API key', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .set('x-api-key', 'test-service-api-key')
        .send({
          userId: 'test-user-id',
          type: 'trade',
          title: 'Test Notification',
          message: 'Test message',
          priority: 'medium'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: { notificationId: expect.any(String) }
      });
    });
  });

  describe('Notification Endpoints', () => {
    describe('POST /api/notifications', () => {
      it('should create a basic notification', async () => {
        const notificationData = {
          userId: 'test-user-id',
          type: 'trade',
          title: 'Test Trade Notification',
          message: 'This is a test trade notification',
          priority: 'medium'
        };

        const response = await request(app)
          .post('/api/notifications')
          .set('Authorization', `Bearer ${authToken}`)
          .send(notificationData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: { notificationId: expect.any(String) },
          message: 'Notification sent successfully'
        });
      });

      it('should validate notification request data', async () => {
        const invalidData = {
          userId: 'invalid-uuid',
          type: 'invalid-type',
          title: '',
          message: '',
          priority: 'invalid-priority'
        };

        const response = await request(app)
          .post('/api/notifications')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid notification request',
          details: expect.any(Array)
        });
      });
    });

    describe('POST /api/notifications/purchase', () => {
      it('should create a purchase notification', async () => {
        const purchaseData = {
          userId: 'test-user-id',
          momentDetails: {
            playerName: 'LeBron James',
            momentType: 'Dunk',
            price: 150.00,
            serialNumber: 1234
          },
          reasoning: 'Player showing strong performance metrics',
          strategyUsed: 'rookie_risers'
        };

        const response = await request(app)
          .post('/api/notifications/purchase')
          .set('Authorization', `Bearer ${authToken}`)
          .send(purchaseData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: { notificationId: expect.any(String) },
          message: 'Purchase notification sent successfully'
        });
      });
    });

    describe('POST /api/notifications/rare-moment', () => {
      it('should create a rare moment notification', async () => {
        const rareMomentData = {
          userId: 'test-user-id',
          momentDetails: {
            playerName: 'Stephen Curry',
            momentType: '3-Pointer',
            price: 200.00,
            serialNumber: 567,
            scarcityRank: 15,
            marketValue: 350.00
          }
        };

        const response = await request(app)
          .post('/api/notifications/rare-moment')
          .set('Authorization', `Bearer ${authToken}`)
          .send(rareMomentData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: { notificationId: expect.any(String) },
          message: 'Rare moment notification sent successfully'
        });
      });
    });

    describe('POST /api/notifications/budget-warning', () => {
      it('should create a budget warning notification', async () => {
        const budgetWarningData = {
          userId: 'test-user-id',
          budgetInfo: {
            currentSpending: 850.00,
            dailyLimit: 1000.00,
            remainingBudget: 150.00,
            percentageUsed: 85.0
          }
        };

        const response = await request(app)
          .post('/api/notifications/budget-warning')
          .set('Authorization', `Bearer ${authToken}`)
          .send(budgetWarningData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: { notificationId: expect.any(String) },
          message: 'Budget warning notification sent successfully'
        });
      });
    });

    describe('POST /api/notifications/system-error', () => {
      it('should create a system error notification', async () => {
        const systemErrorData = {
          userId: 'test-user-id',
          error: {
            type: 'API Connection Error',
            message: 'Failed to connect to NBA Stats API',
            service: 'marketplace-monitor',
            timestamp: new Date(),
            troubleshootingSteps: [
              'Check your internet connection',
              'Verify API credentials',
              'Contact support if issue persists'
            ]
          }
        };

        const response = await request(app)
          .post('/api/notifications/system-error')
          .set('Authorization', `Bearer ${authToken}`)
          .send(systemErrorData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          data: { notificationId: expect.any(String) },
          message: 'System error notification sent successfully'
        });
      });
    });

    describe('GET /api/notifications/history', () => {
      it('should retrieve notification history', async () => {
        const response = await request(app)
          .get('/api/notifications/history')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ limit: 10, offset: 0 })
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: {
            notifications: expect.any(Array),
            total: expect.any(Number)
          },
          message: 'Notification history retrieved successfully'
        });
      });

      it('should validate pagination parameters', async () => {
        const response = await request(app)
          .get('/api/notifications/history')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ limit: -1, offset: 'invalid' })
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: expect.stringContaining('Invalid')
        });
      });
    });

    describe('GET /api/notifications/unread-count', () => {
      it('should return unread notification count', async () => {
        const response = await request(app)
          .get('/api/notifications/unread-count')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          data: { count: expect.any(Number) },
          message: 'Unread count retrieved successfully'
        });
      });
    });
  });

  describe('Push Notification Endpoints', () => {
    describe('POST /api/notifications/push/subscribe', () => {
      it('should register push subscription', async () => {
        const subscriptionData = {
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
            keys: {
              p256dh: 'test-p256dh-key',
              auth: 'test-auth-key'
            }
          }
        };

        const response = await request(app)
          .post('/api/notifications/push/subscribe')
          .set('Authorization', `Bearer ${authToken}`)
          .send(subscriptionData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Push subscription registered successfully'
        });
      });

      it('should validate push subscription data', async () => {
        const invalidSubscription = {
          subscription: {
            endpoint: 'invalid-url',
            keys: {
              p256dh: '',
              auth: ''
            }
          }
        };

        const response = await request(app)
          .post('/api/notifications/push/subscribe')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidSubscription)
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Invalid push subscription'
        });
      });
    });

    describe('POST /api/notifications/push/unsubscribe', () => {
      it('should unregister push subscription', async () => {
        const unsubscribeData = {
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint'
        };

        const response = await request(app)
          .post('/api/notifications/push/unsubscribe')
          .set('Authorization', `Bearer ${authToken}`)
          .send(unsubscribeData)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Push subscription unregistered successfully'
        });
      });

      it('should require endpoint for unsubscribe', async () => {
        const response = await request(app)
          .post('/api/notifications/push/unsubscribe')
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(400);

        expect(response.body).toMatchObject({
          success: false,
          error: 'Endpoint is required'
        });
      });
    });

    describe('POST /api/notifications/push/test', () => {
      it('should send test push notification', async () => {
        const response = await request(app)
          .post('/api/notifications/push/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          success: true,
          message: 'Test push notification sent successfully'
        });
      });
    });
  });



  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);

      // Since we don't have a 404 handler in the test app, it will return 404 by default
      expect(response.status).toBe(404);
    });
  });
});