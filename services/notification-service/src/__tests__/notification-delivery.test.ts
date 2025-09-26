import { Pool } from 'pg';
import { NotificationService } from '../services/notification-service';
import { EmailService } from '../services/email-service';
import { PushService } from '../services/push-service';
import { DatabaseService } from '../services/database-service';
import { NotificationQueue } from '../services/notification-queue';

// Mock all external dependencies
jest.mock('../services/email-service');
jest.mock('../services/push-service');
jest.mock('../services/database-service');
jest.mock('../services/notification-queue');
jest.mock('pg');

describe('Notification Delivery Integration Tests', () => {
  let notificationService: NotificationService;
  let mockDb: jest.Mocked<Pool>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockPushService: jest.Mocked<PushService>;
  let mockNotificationQueue: jest.Mocked<NotificationQueue>;

  beforeEach(() => {
    // Create mock database pool
    mockDb = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
    } as any;

    // Create notification service instance
    notificationService = new NotificationService(mockDb);

    // Get mocked service instances
    mockDatabaseService = (notificationService as any).databaseService;
    mockEmailService = (notificationService as any).emailService;
    mockPushService = (notificationService as any).pushService;
    mockNotificationQueue = (notificationService as any).notificationQueue;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Notification Delivery', () => {
    it('should successfully deliver a purchase notification through all channels', async () => {
      // Mock notification creation
      const mockNotification = {
        id: 'purchase-notification-id',
        userId: 'test-user-id',
        type: 'trade' as const,
        title: '🏀 New Moment Acquired: LeBron James',
        message: 'Successfully purchased LeBron James Dunk #1234 for $150.00',
        priority: 'medium' as const,
        read: false,
        createdAt: new Date()
      };

      const mockUserPreferences = {
        email: 'test@example.com',
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      };

      // Set up mocks
      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue(mockUserPreferences);
      mockNotificationQueue.addNotification.mockResolvedValue();

      // Test purchase notification
      const momentDetails = {
        playerName: 'LeBron James',
        momentType: 'Dunk',
        price: 150.00,
        serialNumber: 1234
      };

      const result = await notificationService.sendPurchaseNotification(
        'test-user-id',
        momentDetails,
        'Strong performance metrics indicate undervaluation',
        'rookie_risers'
      );

      // Verify notification was created and queued
      expect(result).toBe('purchase-notification-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: 'trade',
          title: '🏀 New Moment Acquired: LeBron James',
          priority: 'medium'
        })
      );
      expect(mockNotificationQueue.addNotification).toHaveBeenCalled();
    });

    it('should handle notification delivery with retry mechanism', async () => {
      const mockNotificationWithRetry = {
        id: 'retry-notification-id',
        userId: 'test-user-id',
        type: 'system' as const,
        title: 'System Error',
        message: 'Test error message',
        priority: 'high' as const,
        read: false,
        createdAt: new Date(),
        retryCount: 0,
        deliveryStatus: {
          database: 'sent' as const,
          email: 'failed' as const,
          push: 'pending' as const
        },
        channels: ['database', 'email', 'push'] as const
      };

      const mockUserPreferences = {
        email: 'test@example.com',
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      };

      // Mock services
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue(mockUserPreferences);
      mockDatabaseService.logDelivery.mockResolvedValue();
      mockEmailService.sendEmail.mockRejectedValueOnce(new Error('SMTP error'));
      mockPushService.sendPushNotification.mockResolvedValue();
      mockNotificationQueue.retryNotification.mockResolvedValue();

      // Test notification processing with retry
      await notificationService.processNotificationDelivery(mockNotificationWithRetry);

      // Verify retry was scheduled for failed email delivery
      expect(mockNotificationQueue.retryNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          retryCount: 0,
          deliveryStatus: expect.objectContaining({
            email: 'failed'
          })
        }),
        expect.any(Number)
      );

      // Verify delivery attempts were logged
      expect(mockDatabaseService.logDelivery).toHaveBeenCalledWith(
        'retry-notification-id',
        'email',
        'failed',
        'SMTP error'
      );
    });

    it('should prioritize high-priority notifications correctly', async () => {
      const highPriorityNotification = {
        id: 'high-priority-id',
        userId: 'test-user-id',
        type: 'opportunity' as const,
        title: '🔥 RARE MOMENT ALERT',
        message: 'Rare moment acquired below market value',
        priority: 'high' as const,
        read: false,
        createdAt: new Date()
      };

      const lowPriorityNotification = {
        id: 'low-priority-id',
        userId: 'test-user-id',
        type: 'system' as const,
        title: 'System Update',
        message: 'System maintenance scheduled',
        priority: 'low' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification
        .mockResolvedValueOnce(highPriorityNotification)
        .mockResolvedValueOnce(lowPriorityNotification);
      
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      
      mockNotificationQueue.addNotification.mockResolvedValue();

      // Send both notifications
      await Promise.all([
        notificationService.sendNotification({
          userId: 'test-user-id',
          type: 'opportunity',
          title: '🔥 RARE MOMENT ALERT',
          message: 'Rare moment acquired below market value',
          priority: 'high'
        }),
        notificationService.sendNotification({
          userId: 'test-user-id',
          type: 'system',
          title: 'System Update',
          message: 'System maintenance scheduled',
          priority: 'low'
        })
      ]);

      // Verify both notifications were queued
      expect(mockNotificationQueue.addNotification).toHaveBeenCalledTimes(2);
      
      // Verify high priority notification was processed
      const highPriorityCall = mockNotificationQueue.addNotification.mock.calls.find(
        call => call[0].priority === 'high'
      );
      expect(highPriorityCall).toBeDefined();
    });

    it('should handle budget warning notifications with appropriate urgency', async () => {
      const budgetWarningNotification = {
        id: 'budget-warning-id',
        userId: 'test-user-id',
        type: 'budget' as const,
        title: '⚠️ Budget Alert: 95% Used',
        message: 'You have reached 95% of your daily spending limit',
        priority: 'high' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(budgetWarningNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        email: 'test@example.com',
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      mockNotificationQueue.addNotification.mockResolvedValue();

      const budgetInfo = {
        currentSpending: 950.00,
        dailyLimit: 1000.00,
        remainingBudget: 50.00,
        percentageUsed: 95.0
      };

      const result = await notificationService.sendBudgetWarningNotification(
        'test-user-id',
        budgetInfo
      );

      expect(result).toBe('budget-warning-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'budget',
          priority: 'high', // 95% usage should trigger high priority
          metadata: budgetInfo
        })
      );
    });

    it('should handle notification history retrieval with pagination', async () => {
      const mockHistory = {
        notifications: [
          {
            id: 'notification-1',
            userId: 'test-user-id',
            type: 'trade' as const,
            title: 'Trade Notification 1',
            message: 'Test message 1',
            priority: 'medium' as const,
            read: false,
            createdAt: new Date('2024-01-01T10:00:00Z')
          },
          {
            id: 'notification-2',
            userId: 'test-user-id',
            type: 'budget' as const,
            title: 'Budget Alert',
            message: 'Budget warning message',
            priority: 'high' as const,
            read: true,
            createdAt: new Date('2024-01-01T09:00:00Z')
          }
        ],
        total: 25
      };

      mockDatabaseService.getNotificationHistory.mockResolvedValue(mockHistory);

      const result = await notificationService.getNotificationHistory('test-user-id', 10, 0);

      expect(result).toEqual(mockHistory);
      expect(mockDatabaseService.getNotificationHistory).toHaveBeenCalledWith('test-user-id', 10, 0);
    });

    it('should handle notification read status management', async () => {
      mockDatabaseService.markAsRead.mockResolvedValue();
      mockDatabaseService.markAllAsRead.mockResolvedValue();
      mockDatabaseService.getUnreadCount.mockResolvedValue(3);

      // Test marking single notification as read
      await notificationService.markAsRead('notification-id', 'user-id');
      expect(mockDatabaseService.markAsRead).toHaveBeenCalledWith('notification-id', 'user-id');

      // Test marking all notifications as read
      await notificationService.markAllAsRead('user-id');
      expect(mockDatabaseService.markAllAsRead).toHaveBeenCalledWith('user-id');

      // Test getting unread count
      const unreadCount = await notificationService.getUnreadCount('user-id');
      expect(unreadCount).toBe(3);
      expect(mockDatabaseService.getUnreadCount).toHaveBeenCalledWith('user-id');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      mockDatabaseService.createNotification.mockRejectedValue(new Error('Database connection failed'));

      const request = {
        userId: 'test-user-id',
        type: 'trade' as const,
        title: 'Test Notification',
        message: 'Test message',
        priority: 'medium' as const
      };

      await expect(notificationService.sendNotification(request)).rejects.toThrow('Failed to send notification');
    });

    it('should handle email service failures with proper error logging', async () => {
      const mockNotificationWithRetry = {
        id: 'email-fail-notification-id',
        userId: 'test-user-id',
        type: 'trade' as const,
        title: 'Test Notification',
        message: 'Test message',
        priority: 'medium' as const,
        read: false,
        createdAt: new Date(),
        retryCount: 0,
        deliveryStatus: {
          database: 'sent' as const,
          email: 'pending' as const
        },
        channels: ['database', 'email'] as const
      };

      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        email: 'test@example.com',
        pushEnabled: false,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });

      mockEmailService.sendEmail.mockRejectedValue(new Error('SMTP authentication failed'));
      mockDatabaseService.logDelivery.mockResolvedValue();
      mockNotificationQueue.retryNotification.mockResolvedValue();

      await notificationService.processNotificationDelivery(mockNotificationWithRetry);

      expect(mockDatabaseService.logDelivery).toHaveBeenCalledWith(
        'email-fail-notification-id',
        'email',
        'failed',
        'SMTP authentication failed'
      );
    });

    it('should stop retrying after maximum attempts', async () => {
      const mockNotificationWithMaxRetries = {
        id: 'max-retry-notification-id',
        userId: 'test-user-id',
        type: 'system' as const,
        title: 'System Error',
        message: 'Persistent error',
        priority: 'high' as const,
        read: false,
        createdAt: new Date(),
        retryCount: 3, // At max retries
        deliveryStatus: {
          database: 'sent' as const,
          email: 'failed' as const
        },
        channels: ['database', 'email'] as const
      };

      // Mock max retries environment variable
      process.env.MAX_RETRY_ATTEMPTS = '3';

      await notificationService.processNotificationDelivery(mockNotificationWithMaxRetries);

      // Should not schedule another retry
      expect(mockNotificationQueue.retryNotification).not.toHaveBeenCalled();
    });
  });
});