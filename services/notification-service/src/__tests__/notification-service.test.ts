import { Pool } from 'pg';
import { NotificationService } from '../services/notification-service';
import { EmailService } from '../services/email-service';
import { PushService } from '../services/push-service';
import { DatabaseService } from '../services/database-service';
import { NotificationQueue } from '../services/notification-queue';

// Mock dependencies
jest.mock('../services/email-service');
jest.mock('../services/push-service');
jest.mock('../services/database-service');
jest.mock('../services/notification-queue');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockDb: jest.Mocked<Pool>;
  let mockEmailService: jest.Mocked<EmailService>;
  let mockPushService: jest.Mocked<PushService>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
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
    mockEmailService = (notificationService as any).emailService;
    mockPushService = (notificationService as any).pushService;
    mockDatabaseService = (notificationService as any).databaseService;
    mockNotificationQueue = (notificationService as any).notificationQueue;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendNotification', () => {
    it('should create notification and queue for delivery', async () => {
      const mockNotification = {
        id: 'test-notification-id',
        userId: 'test-user-id',
        type: 'trade' as const,
        title: 'Test Notification',
        message: 'Test message',
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

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue(mockUserPreferences);
      mockNotificationQueue.addNotification.mockResolvedValue();

      const request = {
        userId: 'test-user-id',
        type: 'trade' as const,
        title: 'Test Notification',
        message: 'Test message',
        priority: 'medium' as const
      };

      const result = await notificationService.sendNotification(request);

      expect(result).toBe('test-notification-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(request);
      expect(mockNotificationQueue.addNotification).toHaveBeenCalled();
    });

    it('should handle notification creation failure', async () => {
      mockDatabaseService.createNotification.mockRejectedValue(new Error('Database error'));

      const request = {
        userId: 'test-user-id',
        type: 'trade' as const,
        title: 'Test Notification',
        message: 'Test message',
        priority: 'medium' as const
      };

      await expect(notificationService.sendNotification(request)).rejects.toThrow('Failed to send notification');
    });
  });

  describe('sendPurchaseNotification', () => {
    it('should send purchase notification with correct format', async () => {
      const mockNotification = {
        id: 'purchase-notification-id',
        userId: 'test-user-id',
        type: 'trade' as const,
        title: '🏀 New Moment Acquired: LeBron James',
        message: expect.stringContaining('Successfully purchased LeBron James'),
        priority: 'medium' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      mockNotificationQueue.addNotification.mockResolvedValue();

      const momentDetails = {
        playerName: 'LeBron James',
        momentType: 'Dunk',
        price: 150.00,
        serialNumber: 1234
      };

      const result = await notificationService.sendPurchaseNotification(
        'test-user-id',
        momentDetails,
        'Player showing strong performance metrics',
        'rookie_risers'
      );

      expect(result).toBe('purchase-notification-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: 'trade',
          title: '🏀 New Moment Acquired: LeBron James',
          priority: 'medium',
          metadata: expect.objectContaining({
            momentDetails,
            reasoning: 'Player showing strong performance metrics',
            strategyUsed: 'rookie_risers'
          })
        })
      );
    });
  });

  describe('sendRareMomentNotification', () => {
    it('should send rare moment notification with high priority', async () => {
      const mockNotification = {
        id: 'rare-moment-notification-id',
        userId: 'test-user-id',
        type: 'opportunity' as const,
        title: '🔥 RARE MOMENT ALERT: Stephen Curry',
        message: expect.stringContaining('Exceptional opportunity!'),
        priority: 'high' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      mockNotificationQueue.addNotification.mockResolvedValue();

      const momentDetails = {
        playerName: 'Stephen Curry',
        momentType: '3-Pointer',
        price: 200.00,
        serialNumber: 567,
        scarcityRank: 15,
        marketValue: 350.00
      };

      const result = await notificationService.sendRareMomentNotification(
        'test-user-id',
        momentDetails
      );

      expect(result).toBe('rare-moment-notification-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: 'opportunity',
          title: '🔥 RARE MOMENT ALERT: Stephen Curry',
          priority: 'high',
          channels: ['database', 'email', 'push'], // Force all channels for rare moments
          metadata: expect.objectContaining({
            momentDetails,
            savingsAmount: 150.00,
            savingsPercent: '42.9'
          })
        })
      );
    });
  });

  describe('sendBudgetWarningNotification', () => {
    it('should send budget warning with appropriate priority', async () => {
      const mockNotification = {
        id: 'budget-warning-id',
        userId: 'test-user-id',
        type: 'budget' as const,
        title: '⚠️ Budget Alert: 85% Used',
        message: expect.stringContaining('You\'ve spent $850.00 of your $1000.00 daily limit'),
        priority: 'medium' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      mockNotificationQueue.addNotification.mockResolvedValue();

      const budgetInfo = {
        currentSpending: 850.00,
        dailyLimit: 1000.00,
        remainingBudget: 150.00,
        percentageUsed: 85.0
      };

      const result = await notificationService.sendBudgetWarningNotification(
        'test-user-id',
        budgetInfo
      );

      expect(result).toBe('budget-warning-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: 'budget',
          priority: 'medium', // 85% should be medium priority
          metadata: budgetInfo
        })
      );
    });

    it('should send high priority warning when budget usage is >= 90%', async () => {
      const mockNotification = {
        id: 'budget-warning-high-id',
        userId: 'test-user-id',
        type: 'budget' as const,
        title: '⚠️ Budget Alert: 95% Used',
        message: expect.stringContaining('You\'ve spent $950.00 of your $1000.00 daily limit'),
        priority: 'high' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
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

      expect(result).toBe('budget-warning-high-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high' // 95% should be high priority
        })
      );
    });
  });

  describe('sendSystemErrorNotification', () => {
    it('should send system error notification with troubleshooting steps', async () => {
      const mockNotification = {
        id: 'system-error-id',
        userId: 'test-user-id',
        type: 'system' as const,
        title: '🚨 System Alert: API Connection Error',
        message: expect.stringContaining('An error occurred in marketplace-monitor'),
        priority: 'high' as const,
        read: false,
        createdAt: new Date()
      };

      mockDatabaseService.createNotification.mockResolvedValue(mockNotification);
      mockDatabaseService.getUserNotificationPreferences.mockResolvedValue({
        pushEnabled: true,
        tradeNotifications: true,
        budgetAlerts: true,
        systemAlerts: true
      });
      mockNotificationQueue.addNotification.mockResolvedValue();

      const error = {
        type: 'API Connection Error',
        message: 'Failed to connect to NBA Stats API',
        service: 'marketplace-monitor',
        timestamp: new Date(),
        troubleshootingSteps: [
          'Check your internet connection',
          'Verify API credentials',
          'Contact support if issue persists'
        ]
      };

      const result = await notificationService.sendSystemErrorNotification(
        'test-user-id',
        error
      );

      expect(result).toBe('system-error-id');
      expect(mockDatabaseService.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          type: 'system',
          title: '🚨 System Alert: API Connection Error',
          priority: 'high',
          metadata: error
        })
      );
    });
  });

  describe('getNotificationHistory', () => {
    it('should retrieve notification history with pagination', async () => {
      const mockHistory = {
        notifications: [
          {
            id: 'notification-1',
            userId: 'test-user-id',
            type: 'trade' as const,
            title: 'Test Notification 1',
            message: 'Test message 1',
            priority: 'medium' as const,
            read: false,
            createdAt: new Date()
          }
        ],
        total: 1
      };

      mockDatabaseService.getNotificationHistory.mockResolvedValue(mockHistory);

      const result = await notificationService.getNotificationHistory('test-user-id', 50, 0);

      expect(result).toEqual(mockHistory);
      expect(mockDatabaseService.getNotificationHistory).toHaveBeenCalledWith('test-user-id', 50, 0);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      mockDatabaseService.markAsRead.mockResolvedValue();

      await notificationService.markAsRead('notification-id', 'user-id');

      expect(mockDatabaseService.markAsRead).toHaveBeenCalledWith('notification-id', 'user-id');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread notification count', async () => {
      mockDatabaseService.getUnreadCount.mockResolvedValue(5);

      const result = await notificationService.getUnreadCount('test-user-id');

      expect(result).toBe(5);
      expect(mockDatabaseService.getUnreadCount).toHaveBeenCalledWith('test-user-id');
    });
  });
});