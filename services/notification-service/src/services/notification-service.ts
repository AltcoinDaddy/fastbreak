import { Pool } from 'pg';
import { Notification } from '@fastbreak/types';
import { NotificationRequest, NotificationWithRetry, DeliveryChannel } from '../types/notification';
import { EmailService } from './email-service';
import { PushService } from './push-service';
import { DatabaseService } from './database-service';
import { NotificationQueue } from './notification-queue';

export class NotificationService {
  private emailService: EmailService;
  private pushService: PushService;
  private databaseService: DatabaseService;
  private notificationQueue: NotificationQueue;

  constructor(private db: Pool) {
    this.emailService = new EmailService();
    this.pushService = new PushService();
    this.databaseService = new DatabaseService(db);
    this.notificationQueue = new NotificationQueue();
  }

  /**
   * Send a notification through multiple channels
   */
  async sendNotification(request: NotificationRequest): Promise<string> {
    try {
      // Create notification record in database
      const notification = await this.databaseService.createNotification(request);
      
      // Determine delivery channels based on user preferences and notification type
      const channels = await this.determineDeliveryChannels(request.userId, request.type, request.channels);
      
      // Queue notification for delivery
      await this.notificationQueue.addNotification({
        ...notification,
        retryCount: 0,
        deliveryStatus: this.initializeDeliveryStatus(channels),
        channels
      });

      return notification.id;
    } catch (error) {
      console.error('Failed to send notification:', error);
      throw new Error('Failed to send notification');
    }
  }

  /**
   * Send purchase notification with moment details and AI reasoning
   */
  async sendPurchaseNotification(
    userId: string,
    momentDetails: {
      playerName: string;
      momentType: string;
      price: number;
      serialNumber: number;
    },
    reasoning: string,
    strategyUsed: string
  ): Promise<string> {
    const title = `🏀 New Moment Acquired: ${momentDetails.playerName}`;
    const message = `Successfully purchased ${momentDetails.playerName} ${momentDetails.momentType} #${momentDetails.serialNumber} for $${momentDetails.price.toFixed(2)}.\n\nAI Reasoning: ${reasoning}\n\nStrategy: ${strategyUsed}`;

    return this.sendNotification({
      userId,
      type: 'trade',
      title,
      message,
      priority: 'medium',
      metadata: {
        momentDetails,
        reasoning,
        strategyUsed
      }
    });
  }

  /**
   * Send priority notification for rare moment acquisitions
   */
  async sendRareMomentNotification(
    userId: string,
    momentDetails: {
      playerName: string;
      momentType: string;
      price: number;
      serialNumber: number;
      scarcityRank: number;
      marketValue: number;
    }
  ): Promise<string> {
    const savingsAmount = momentDetails.marketValue - momentDetails.price;
    const savingsPercent = ((savingsAmount / momentDetails.marketValue) * 100).toFixed(1);
    
    const title = `🔥 RARE MOMENT ALERT: ${momentDetails.playerName}`;
    const message = `Exceptional opportunity! Acquired ${momentDetails.playerName} ${momentDetails.momentType} #${momentDetails.serialNumber} (Scarcity Rank: ${momentDetails.scarcityRank}) for $${momentDetails.price.toFixed(2)}.\n\nMarket Value: $${momentDetails.marketValue.toFixed(2)}\nYou saved: $${savingsAmount.toFixed(2)} (${savingsPercent}%)`;

    return this.sendNotification({
      userId,
      type: 'opportunity',
      title,
      message,
      priority: 'high',
      channels: ['database', 'email', 'push'], // Force all channels for rare moments
      metadata: {
        momentDetails,
        savingsAmount,
        savingsPercent
      }
    });
  }

  /**
   * Send warning notification for budget limit approaches
   */
  async sendBudgetWarningNotification(
    userId: string,
    budgetInfo: {
      currentSpending: number;
      dailyLimit: number;
      remainingBudget: number;
      percentageUsed: number;
    }
  ): Promise<string> {
    const title = `⚠️ Budget Alert: ${budgetInfo.percentageUsed.toFixed(0)}% Used`;
    const message = `You've spent $${budgetInfo.currentSpending.toFixed(2)} of your $${budgetInfo.dailyLimit.toFixed(2)} daily limit (${budgetInfo.percentageUsed.toFixed(1)}%).\n\nRemaining budget: $${budgetInfo.remainingBudget.toFixed(2)}`;

    return this.sendNotification({
      userId,
      type: 'budget',
      title,
      message,
      priority: budgetInfo.percentageUsed >= 90 ? 'high' : 'medium',
      metadata: budgetInfo
    });
  }

  /**
   * Send alert notification for system errors
   */
  async sendSystemErrorNotification(
    userId: string,
    error: {
      type: string;
      message: string;
      service: string;
      timestamp: Date;
      troubleshootingSteps?: string[];
    }
  ): Promise<string> {
    const title = `🚨 System Alert: ${error.type}`;
    let message = `An error occurred in ${error.service}:\n\n${error.message}`;
    
    if (error.troubleshootingSteps && error.troubleshootingSteps.length > 0) {
      message += `\n\nTroubleshooting steps:\n${error.troubleshootingSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
    }

    return this.sendNotification({
      userId,
      type: 'system',
      title,
      message,
      priority: 'high',
      metadata: error
    });
  }

  /**
   * Get notification history for a user
   */
  async getNotificationHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ notifications: Notification[]; total: number }> {
    return this.databaseService.getNotificationHistory(userId, limit, offset);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.databaseService.markAsRead(notificationId, userId);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.databaseService.markAllAsRead(userId);
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.databaseService.getUnreadCount(userId);
  }

  /**
   * Process notification delivery (called by queue worker)
   */
  async processNotificationDelivery(notification: NotificationWithRetry): Promise<void> {
    const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS || '3');
    
    if (notification.retryCount >= maxRetries) {
      console.error(`Max retries exceeded for notification ${notification.id}`);
      return;
    }

    try {
      // Get user preferences
      const userPreferences = await this.databaseService.getUserNotificationPreferences(notification.userId);
      
      // Deliver through each channel
      for (const channel of notification.channels) {
        if (notification.deliveryStatus[channel] === 'sent') {
          continue; // Skip already sent channels
        }

        try {
          await this.deliverThroughChannel(notification, channel, userPreferences);
          notification.deliveryStatus[channel] = 'sent';
          
          // Log successful delivery
          await this.databaseService.logDelivery(notification.id, channel, 'sent');
        } catch (error) {
          console.error(`Failed to deliver notification ${notification.id} through ${channel}:`, error);
          notification.deliveryStatus[channel] = 'failed';
          
          // Log failed delivery
          await this.databaseService.logDelivery(notification.id, channel, 'failed', error.message);
        }
      }

      // Check if any channels failed and need retry
      const hasFailures = Object.values(notification.deliveryStatus).some(status => status === 'failed');
      
      if (hasFailures && notification.retryCount < maxRetries) {
        // Schedule retry
        const retryDelay = parseInt(process.env.RETRY_DELAY_MS || '5000') * Math.pow(2, notification.retryCount);
        await this.notificationQueue.retryNotification(notification, retryDelay);
      }
    } catch (error) {
      console.error(`Failed to process notification ${notification.id}:`, error);
      
      // Schedule retry if under max attempts
      if (notification.retryCount < maxRetries) {
        const retryDelay = parseInt(process.env.RETRY_DELAY_MS || '5000') * Math.pow(2, notification.retryCount);
        await this.notificationQueue.retryNotification(notification, retryDelay);
      }
    }
  }

  private async determineDeliveryChannels(
    userId: string,
    notificationType: string,
    requestedChannels?: DeliveryChannel[]
  ): Promise<DeliveryChannel[]> {
    if (requestedChannels) {
      return requestedChannels;
    }

    const userPreferences = await this.databaseService.getUserNotificationPreferences(userId);
    const channels: DeliveryChannel[] = ['database']; // Always store in database

    // Add email if enabled and configured
    if (userPreferences.email && this.shouldSendEmail(notificationType, userPreferences)) {
      channels.push('email');
    }

    // Add push if enabled
    if (userPreferences.pushEnabled && this.shouldSendPush(notificationType, userPreferences)) {
      channels.push('push');
    }

    return channels;
  }

  private shouldSendEmail(notificationType: string, preferences: any): boolean {
    switch (notificationType) {
      case 'trade':
        return preferences.tradeNotifications;
      case 'budget':
        return preferences.budgetAlerts;
      case 'system':
        return preferences.systemAlerts;
      case 'opportunity':
        return true; // Always send email for opportunities
      default:
        return false;
    }
  }

  private shouldSendPush(notificationType: string, preferences: any): boolean {
    switch (notificationType) {
      case 'trade':
        return preferences.tradeNotifications;
      case 'budget':
        return preferences.budgetAlerts;
      case 'system':
        return preferences.systemAlerts;
      case 'opportunity':
        return true; // Always send push for opportunities
      default:
        return false;
    }
  }

  private initializeDeliveryStatus(channels: DeliveryChannel[]) {
    const status: any = {};
    channels.forEach(channel => {
      status[channel] = 'pending';
    });
    return status;
  }

  private async deliverThroughChannel(
    notification: NotificationWithRetry,
    channel: DeliveryChannel,
    userPreferences: any
  ): Promise<void> {
    switch (channel) {
      case 'database':
        // Already stored, mark as sent
        break;
      case 'email':
        if (userPreferences.email) {
          await this.emailService.sendEmail(userPreferences.email, notification);
        }
        break;
      case 'push':
        await this.pushService.sendPushNotification(notification.userId, notification);
        break;
      default:
        throw new Error(`Unsupported delivery channel: ${channel}`);
    }
  }
}