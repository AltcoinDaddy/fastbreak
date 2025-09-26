import { Notification } from '@fastbreak/types';

export interface NotificationRequest {
  userId: string;
  type: 'trade' | 'budget' | 'system' | 'opportunity';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  channels?: DeliveryChannel[];
  metadata?: Record<string, any>;
}

export interface NotificationWithRetry extends Notification {
  retryCount: number;
  lastAttempt?: Date;
  deliveryStatus: DeliveryStatus;
  channels: DeliveryChannel[];
}

export type DeliveryChannel = 'database' | 'email' | 'push' | 'webhook';

export interface DeliveryStatus {
  database: 'pending' | 'sent' | 'failed';
  email?: 'pending' | 'sent' | 'failed';
  push?: 'pending' | 'sent' | 'failed';
  webhook?: 'pending' | 'sent' | 'failed';
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
}

export interface NotificationHistory {
  id: string;
  userId: string;
  notificationId: string;
  channel: DeliveryChannel;
  status: 'sent' | 'failed';
  error?: string;
  sentAt: Date;
}