import { Pool } from 'pg';
import { Notification, NotificationSettings } from '@fastbreak/types';
import { NotificationRequest, NotificationHistory } from '../types/notification';

export class DatabaseService {
  constructor(private db: Pool) {}

  /**
   * Create a new notification record in the database
   */
  async createNotification(request: NotificationRequest): Promise<Notification> {
    const query = `
      INSERT INTO notifications (user_id, type, title, message, priority, read, created_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW())
      RETURNING id, user_id, type, title, message, priority, read, created_at
    `;

    const values = [
      request.userId,
      request.type,
      request.title,
      request.message,
      request.priority
    ];

    try {
      const result = await this.db.query(query, values);
      const row = result.rows[0];

      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        priority: row.priority,
        read: row.read,
        createdAt: row.created_at
      };
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw new Error('Failed to create notification in database');
    }
  }

  /**
   * Get notification history for a user with pagination
   */
  async getNotificationHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ notifications: Notification[]; total: number }> {
    const countQuery = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
    const dataQuery = `
      SELECT id, user_id, type, title, message, priority, read, created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    try {
      const [countResult, dataResult] = await Promise.all([
        this.db.query(countQuery, [userId]),
        this.db.query(dataQuery, [userId, limit, offset])
      ]);

      const total = parseInt(countResult.rows[0].count);
      const notifications = dataResult.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        priority: row.priority,
        read: row.read,
        createdAt: row.created_at
      }));

      return { notifications, total };
    } catch (error) {
      console.error('Failed to get notification history:', error);
      throw new Error('Failed to retrieve notification history');
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const query = `
      UPDATE notifications
      SET read = true
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [notificationId, userId]);
      
      if (result.rowCount === 0) {
        throw new Error('Notification not found or access denied');
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const query = `
      UPDATE notifications
      SET read = true
      WHERE user_id = $1 AND read = false
    `;

    try {
      await this.db.query(query, [userId]);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const query = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false';

    try {
      const result = await this.db.query(query, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Failed to get unread count:', error);
      throw new Error('Failed to get unread notification count');
    }
  }

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(userId: string): Promise<NotificationSettings> {
    const query = `
      SELECT email, push_enabled, trade_notifications, budget_alerts, system_alerts
      FROM notification_preferences
      WHERE user_id = $1
    `;

    try {
      const result = await this.db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        // Return default preferences if none exist
        return {
          pushEnabled: true,
          tradeNotifications: true,
          budgetAlerts: true,
          systemAlerts: true
        };
      }

      const row = result.rows[0];
      return {
        email: row.email,
        pushEnabled: row.push_enabled,
        tradeNotifications: row.trade_notifications,
        budgetAlerts: row.budget_alerts,
        systemAlerts: row.system_alerts
      };
    } catch (error) {
      console.error('Failed to get user notification preferences:', error);
      throw new Error('Failed to retrieve user notification preferences');
    }
  }

  /**
   * Log notification delivery attempt
   */
  async logDelivery(
    notificationId: string,
    channel: string,
    status: 'sent' | 'failed',
    error?: string
  ): Promise<void> {
    // Create delivery history table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS notification_delivery_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        channel VARCHAR(20) NOT NULL,
        status VARCHAR(10) NOT NULL CHECK (status IN ('sent', 'failed')),
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    const insertQuery = `
      INSERT INTO notification_delivery_history (notification_id, channel, status, error_message)
      VALUES ($1, $2, $3, $4)
    `;

    try {
      await this.db.query(createTableQuery);
      await this.db.query(insertQuery, [notificationId, channel, status, error || null]);
    } catch (error) {
      console.error('Failed to log delivery:', error);
      // Don't throw here as this is just logging
    }
  }

  /**
   * Clean up old notifications based on retention policy
   */
  async cleanupOldNotifications(): Promise<void> {
    const retentionDays = parseInt(process.env.NOTIFICATION_HISTORY_DAYS || '30');
    const query = `
      DELETE FROM notifications
      WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
    `;

    try {
      const result = await this.db.query(query);
      console.log(`Cleaned up ${result.rowCount} old notifications`);
    } catch (error) {
      console.error('Failed to cleanup old notifications:', error);
    }
  }

  /**
   * Get notification delivery statistics
   */
  async getDeliveryStats(userId?: string): Promise<any> {
    let query = `
      SELECT 
        n.type,
        n.priority,
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN ndh.status = 'sent' THEN 1 END) as successful_deliveries,
        COUNT(CASE WHEN ndh.status = 'failed' THEN 1 END) as failed_deliveries,
        ndh.channel
      FROM notifications n
      LEFT JOIN notification_delivery_history ndh ON n.id = ndh.notification_id
    `;

    const params: any[] = [];
    
    if (userId) {
      query += ' WHERE n.user_id = $1';
      params.push(userId);
    }

    query += ' GROUP BY n.type, n.priority, ndh.channel ORDER BY n.type, n.priority';

    try {
      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to get delivery stats:', error);
      throw new Error('Failed to retrieve delivery statistics');
    }
  }
}