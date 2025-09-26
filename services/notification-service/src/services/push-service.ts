import webpush from 'web-push';
import { Pool } from 'pg';
import { NotificationWithRetry, PushNotificationPayload } from '../types/notification';

export class PushService {
  private db: Pool;

  constructor(db?: Pool) {
    this.db = db;
    this.initializeWebPush();
  }

  private initializeWebPush(): void {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@fastbreak.app',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }
  }

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId: string, notification: NotificationWithRetry): Promise<void> {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      throw new Error('Push notification service not configured - VAPID keys missing');
    }

    try {
      // Get user's push subscriptions
      const subscriptions = await this.getUserPushSubscriptions(userId);
      
      if (subscriptions.length === 0) {
        throw new Error('No push subscriptions found for user');
      }

      const payload = this.createPushPayload(notification);
      const promises = subscriptions.map(subscription => 
        this.sendToSubscription(subscription, payload, notification.id)
      );

      // Send to all subscriptions, but don't fail if some fail
      const results = await Promise.allSettled(promises);
      
      // Log failed subscriptions for cleanup
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Failed to send push to subscription ${subscriptions[index].id}:`, result.reason);
          // Could implement subscription cleanup here
        }
      });

      // Consider it successful if at least one subscription worked
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      if (successCount === 0) {
        throw new Error('Failed to send push notification to any subscription');
      }

      console.log(`Push notification sent successfully to ${successCount}/${subscriptions.length} subscriptions`);
    } catch (error) {
      console.error(`Failed to send push notification to user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create push notification payload based on notification type
   */
  private createPushPayload(notification: NotificationWithRetry): PushNotificationPayload {
    const basePayload: PushNotificationPayload = {
      title: notification.title,
      body: this.truncateMessage(notification.message, 120),
      icon: '/icons/fastbreak-icon-192.png',
      badge: '/icons/fastbreak-badge-72.png',
      data: {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
        url: this.getNotificationUrl(notification),
        timestamp: notification.createdAt.toISOString()
      }
    };

    // Customize based on notification type
    switch (notification.type) {
      case 'trade':
        return {
          ...basePayload,
          icon: '/icons/trade-icon-192.png',
          data: {
            ...basePayload.data,
            action: 'view_trade',
            momentDetails: notification.metadata?.momentDetails
          }
        };

      case 'opportunity':
        return {
          ...basePayload,
          icon: '/icons/opportunity-icon-192.png',
          data: {
            ...basePayload.data,
            action: 'view_opportunity',
            urgent: true
          }
        };

      case 'budget':
        return {
          ...basePayload,
          icon: '/icons/budget-icon-192.png',
          data: {
            ...basePayload.data,
            action: 'view_budget',
            budgetInfo: notification.metadata
          }
        };

      case 'system':
        return {
          ...basePayload,
          icon: '/icons/alert-icon-192.png',
          data: {
            ...basePayload.data,
            action: 'view_system_status',
            errorType: notification.metadata?.type
          }
        };

      default:
        return basePayload;
    }
  }

  /**
   * Send push notification to a specific subscription
   */
  private async sendToSubscription(
    subscription: any,
    payload: PushNotificationPayload,
    notificationId: string
  ): Promise<void> {
    try {
      const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh_key,
          auth: subscription.auth_key
        }
      };

      const options = {
        TTL: 24 * 60 * 60, // 24 hours
        urgency: this.getUrgency(payload.data?.priority),
        topic: payload.data?.type
      };

      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        options
      );

      // Update subscription as active
      await this.updateSubscriptionActivity(subscription.id);
    } catch (error) {
      // Handle specific web push errors
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription is no longer valid, remove it
        await this.removeInvalidSubscription(subscription.id);
        throw new Error('Subscription no longer valid and was removed');
      }
      throw error;
    }
  }

  /**
   * Get user's push subscriptions from database
   */
  private async getUserPushSubscriptions(userId: string): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    // Create push subscriptions table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_key TEXT NOT NULL,
        user_agent TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, endpoint)
      )
    `;

    const selectQuery = `
      SELECT id, endpoint, p256dh_key, auth_key
      FROM push_subscriptions
      WHERE user_id = $1 AND is_active = true
    `;

    try {
      await this.db.query(createTableQuery);
      const result = await this.db.query(selectQuery, [userId]);
      return result.rows;
    } catch (error) {
      console.error('Failed to get user push subscriptions:', error);
      throw new Error('Failed to retrieve push subscriptions');
    }
  }

  /**
   * Register a new push subscription for a user
   */
  async registerPushSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    },
    userAgent?: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const query = `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, endpoint) 
      DO UPDATE SET 
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        is_active = true,
        last_used = NOW()
    `;

    try {
      await this.db.query(query, [
        userId,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        userAgent
      ]);
    } catch (error) {
      console.error('Failed to register push subscription:', error);
      throw new Error('Failed to register push subscription');
    }
  }

  /**
   * Unregister a push subscription
   */
  async unregisterPushSubscription(userId: string, endpoint: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const query = `
      UPDATE push_subscriptions
      SET is_active = false
      WHERE user_id = $1 AND endpoint = $2
    `;

    try {
      await this.db.query(query, [userId, endpoint]);
    } catch (error) {
      console.error('Failed to unregister push subscription:', error);
      throw new Error('Failed to unregister push subscription');
    }
  }

  /**
   * Update subscription activity timestamp
   */
  private async updateSubscriptionActivity(subscriptionId: string): Promise<void> {
    if (!this.db) return;

    const query = `
      UPDATE push_subscriptions
      SET last_used = NOW()
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [subscriptionId]);
    } catch (error) {
      console.error('Failed to update subscription activity:', error);
    }
  }

  /**
   * Remove invalid subscription
   */
  private async removeInvalidSubscription(subscriptionId: string): Promise<void> {
    if (!this.db) return;

    const query = `
      UPDATE push_subscriptions
      SET is_active = false
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [subscriptionId]);
      console.log(`Marked subscription ${subscriptionId} as inactive`);
    } catch (error) {
      console.error('Failed to remove invalid subscription:', error);
    }
  }

  /**
   * Get notification URL based on type
   */
  private getNotificationUrl(notification: NotificationWithRetry): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://app.fastbreak.com';
    
    switch (notification.type) {
      case 'trade':
        return `${baseUrl}/dashboard/trades`;
      case 'opportunity':
        return `${baseUrl}/dashboard/opportunities`;
      case 'budget':
        return `${baseUrl}/settings/budget`;
      case 'system':
        return `${baseUrl}/support`;
      default:
        return `${baseUrl}/dashboard`;
    }
  }

  /**
   * Get urgency level for web push
   */
  private getUrgency(priority?: string): 'very-low' | 'low' | 'normal' | 'high' {
    switch (priority) {
      case 'high':
        return 'high';
      case 'medium':
        return 'normal';
      case 'low':
        return 'low';
      default:
        return 'normal';
    }
  }

  /**
   * Truncate message for push notification body
   */
  private truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) {
      return message;
    }
    
    // Try to truncate at a word boundary
    const truncated = message.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  /**
   * Test push notification service
   */
  async testPushService(userId: string): Promise<boolean> {
    try {
      const testNotification: NotificationWithRetry = {
        id: 'test-' + Date.now(),
        userId,
        type: 'system',
        title: 'Test Notification',
        message: 'This is a test push notification from FastBreak.',
        priority: 'low',
        read: false,
        createdAt: new Date(),
        retryCount: 0,
        deliveryStatus: { push: 'pending' },
        channels: ['push']
      };

      await this.sendPushNotification(userId, testNotification);
      return true;
    } catch (error) {
      console.error('Push service test failed:', error);
      return false;
    }
  }

  /**
   * Clean up old inactive subscriptions
   */
  async cleanupInactiveSubscriptions(): Promise<void> {
    if (!this.db) return;

    const query = `
      DELETE FROM push_subscriptions
      WHERE is_active = false 
      AND last_used < NOW() - INTERVAL '30 days'
    `;

    try {
      const result = await this.db.query(query);
      console.log(`Cleaned up ${result.rowCount} inactive push subscriptions`);
    } catch (error) {
      console.error('Failed to cleanup inactive subscriptions:', error);
    }
  }
}