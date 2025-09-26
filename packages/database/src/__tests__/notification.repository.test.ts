import { NotificationRepository } from '../repositories/notification';
import { Notification } from '@fastbreak/types';

// Mock the database connection
const mockDb = {
  query: jest.fn(),
} as any;

describe('NotificationRepository', () => {
  let notificationRepo: NotificationRepository;

  beforeEach(() => {
    notificationRepo = new NotificationRepository(mockDb);
    jest.clearAllMocks();
  });

  describe('createNotification', () => {
    it('should create new notification', async () => {
      const mockNotification = {
        id: 'notification-1',
        user_id: 'user-1',
        type: 'trade',
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James Dunk moment',
        priority: 'medium',
        read: false,
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] });

      const notificationData: Omit<Notification, 'id' | 'createdAt'> = {
        userId: 'user-1',
        type: 'trade',
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James Dunk moment',
        priority: 'medium',
        read: false,
      };

      const result = await notificationRepo.createNotification(notificationData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [
          'user-1',
          'trade',
          'Trade Executed',
          'Successfully purchased LeBron James Dunk moment',
          'medium',
          false
        ]
      );
      expect(result.type).toBe('trade');
      expect(result.title).toBe('Trade Executed');
      expect(result.read).toBe(false);
    });
  });

  describe('getNotificationsByUser', () => {
    it('should return user notifications with counts', async () => {
      const mockNotifications = [{
        id: 'notification-1',
        user_id: 'user-1',
        type: 'trade',
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James Dunk moment',
        priority: 'medium',
        read: false,
        created_at: new Date(),
      }];

      const mockTotal = 5;
      const mockUnread = 3;

      mockDb.query
        .mockResolvedValueOnce({ rows: mockNotifications }) // Notifications query
        .mockResolvedValueOnce({ rows: [{ count: mockTotal }] }) // Total count
        .mockResolvedValueOnce({ rows: [{ count: mockUnread }] }); // Unread count

      jest.spyOn(notificationRepo as any, 'count')
        .mockResolvedValueOnce(mockTotal)
        .mockResolvedValueOnce(mockUnread);

      const result = await notificationRepo.getNotificationsByUser('user-1', 50, 0, false);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM notifications'),
        ['user-1', 50, 0]
      );
      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(5);
      expect(result.unreadCount).toBe(3);
      expect(result.notifications[0].type).toBe('trade');
    });

    it('should return only unread notifications when requested', async () => {
      const mockNotifications = [{
        id: 'notification-1',
        user_id: 'user-1',
        type: 'budget',
        title: 'Budget Alert',
        message: 'Daily spending limit approaching',
        priority: 'high',
        read: false,
        created_at: new Date(),
      }];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockNotifications })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] });

      jest.spyOn(notificationRepo as any, 'count')
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);

      const result = await notificationRepo.getNotificationsByUser('user-1', 50, 0, true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('read = false'),
        ['user-1', 50, 0]
      );
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].read).toBe(false);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const mockNotification = {
        id: 'notification-1',
        user_id: 'user-1',
        type: 'trade',
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James Dunk moment',
        priority: 'medium',
        read: true, // Now marked as read
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockNotification] });

      const result = await notificationRepo.markAsRead('notification-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        ['notification-1']
      );
      expect(result!.read).toBe(true);
    });

    it('should return null if notification not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await notificationRepo.markAsRead('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all user notifications as read', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 5 });

      const result = await notificationRepo.markAllAsRead('user-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET read = true'),
        ['user-1']
      );
      expect(result).toBe(5);
    });

    it('should return 0 if no unread notifications', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });

      const result = await notificationRepo.markAllAsRead('user-1');

      expect(result).toBe(0);
    });
  });

  describe('deleteOldNotifications', () => {
    it('should delete notifications older than specified days', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 10 });

      const result = await notificationRepo.deleteOldNotifications(30);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at < NOW() - INTERVAL'),
        [30]
      );
      expect(result).toBe(10);
    });

    it('should use default 30 days if not specified', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 5 });

      const result = await notificationRepo.deleteOldNotifications();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INTERVAL \'$1 days\''),
        [30]
      );
      expect(result).toBe(5);
    });
  });

  describe('getNotificationsByType', () => {
    it('should return notifications of specific type', async () => {
      const mockNotifications = [{
        id: 'notification-1',
        user_id: 'user-1',
        type: 'system',
        title: 'System Maintenance',
        message: 'Scheduled maintenance tonight',
        priority: 'low',
        read: false,
        created_at: new Date(),
      }];

      jest.spyOn(notificationRepo as any, 'findByCondition').mockResolvedValue(
        mockNotifications.map(n => notificationRepo['mapRowToEntity'](n))
      );

      const result = await notificationRepo.getNotificationsByType('user-1', 'system', 20);

      expect(notificationRepo['findByCondition']).toHaveBeenCalledWith(
        'user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT $3',
        ['user-1', 'system', 20]
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('system');
    });
  });

  describe('createBulkNotifications', () => {
    it('should create multiple notifications at once', async () => {
      const mockNotifications = [
        {
          id: 'notification-1',
          user_id: 'user-1',
          type: 'trade',
          title: 'Trade 1',
          message: 'Message 1',
          priority: 'medium',
          read: false,
          created_at: new Date(),
        },
        {
          id: 'notification-2',
          user_id: 'user-2',
          type: 'budget',
          title: 'Budget Alert',
          message: 'Budget message',
          priority: 'high',
          read: false,
          created_at: new Date(),
        }
      ];

      mockDb.query.mockResolvedValue({ rows: mockNotifications });

      const notificationsData: Omit<Notification, 'id' | 'createdAt'>[] = [
        {
          userId: 'user-1',
          type: 'trade',
          title: 'Trade 1',
          message: 'Message 1',
          priority: 'medium',
          read: false,
        },
        {
          userId: 'user-2',
          type: 'budget',
          title: 'Budget Alert',
          message: 'Budget message',
          priority: 'high',
          read: false,
        }
      ];

      const result = await notificationRepo.createBulkNotifications(notificationsData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)'),
        [
          'user-1', 'trade', 'Trade 1', 'Message 1', 'medium', false,
          'user-2', 'budget', 'Budget Alert', 'Budget message', 'high', false
        ]
      );
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('trade');
      expect(result[1].type).toBe('budget');
    });

    it('should return empty array if no notifications provided', async () => {
      const result = await notificationRepo.createBulkNotifications([]);

      expect(mockDb.query).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});