import Bull from 'bull';
import Redis from 'ioredis';
import { NotificationWithRetry } from '../types/notification';

export class NotificationQueue {
  private queue: Bull.Queue;
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    this.queue = new Bull('notification-queue', {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'localhost',
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    this.setupQueueEvents();
  }

  /**
   * Add notification to the processing queue
   */
  async addNotification(notification: NotificationWithRetry): Promise<void> {
    try {
      const jobOptions: Bull.JobOptions = {
        priority: this.getPriority(notification.priority),
        delay: 0, // Process immediately
        attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
        backoff: {
          type: 'exponential',
          delay: parseInt(process.env.RETRY_DELAY_MS || '5000'),
        },
      };

      await this.queue.add('process-notification', notification, jobOptions);
      console.log(`Added notification ${notification.id} to queue`);
    } catch (error) {
      console.error('Failed to add notification to queue:', error);
      throw new Error('Failed to queue notification for processing');
    }
  }

  /**
   * Retry a failed notification with exponential backoff
   */
  async retryNotification(notification: NotificationWithRetry, delayMs: number): Promise<void> {
    try {
      const retryNotification = {
        ...notification,
        retryCount: notification.retryCount + 1,
        lastAttempt: new Date(),
      };

      const jobOptions: Bull.JobOptions = {
        priority: this.getPriority(notification.priority),
        delay: delayMs,
        attempts: 1, // Single attempt for retry (we handle retry logic ourselves)
      };

      await this.queue.add('process-notification', retryNotification, jobOptions);
      console.log(`Scheduled retry for notification ${notification.id} in ${delayMs}ms (attempt ${retryNotification.retryCount})`);
    } catch (error) {
      console.error('Failed to schedule notification retry:', error);
      throw new Error('Failed to schedule notification retry');
    }
  }

  /**
   * Add bulk notifications to queue (for batch processing)
   */
  async addBulkNotifications(notifications: NotificationWithRetry[]): Promise<void> {
    try {
      const jobs = notifications.map(notification => ({
        name: 'process-notification',
        data: notification,
        opts: {
          priority: this.getPriority(notification.priority),
          attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
          backoff: {
            type: 'exponential',
            delay: parseInt(process.env.RETRY_DELAY_MS || '5000'),
          },
        },
      }));

      await this.queue.addBulk(jobs);
      console.log(`Added ${notifications.length} notifications to queue`);
    } catch (error) {
      console.error('Failed to add bulk notifications to queue:', error);
      throw new Error('Failed to queue bulk notifications');
    }
  }

  /**
   * Schedule a notification for future delivery
   */
  async scheduleNotification(
    notification: NotificationWithRetry,
    deliveryTime: Date
  ): Promise<void> {
    try {
      const delay = deliveryTime.getTime() - Date.now();
      
      if (delay <= 0) {
        // If scheduled time is in the past, process immediately
        await this.addNotification(notification);
        return;
      }

      const jobOptions: Bull.JobOptions = {
        priority: this.getPriority(notification.priority),
        delay,
        attempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
        backoff: {
          type: 'exponential',
          delay: parseInt(process.env.RETRY_DELAY_MS || '5000'),
        },
      };

      await this.queue.add('process-notification', notification, jobOptions);
      console.log(`Scheduled notification ${notification.id} for delivery at ${deliveryTime.toISOString()}`);
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      throw new Error('Failed to schedule notification');
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(),
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      throw new Error('Failed to retrieve queue statistics');
    }
  }

  /**
   * Pause the queue (stop processing new jobs)
   */
  async pauseQueue(): Promise<void> {
    try {
      await this.queue.pause();
      console.log('Notification queue paused');
    } catch (error) {
      console.error('Failed to pause queue:', error);
      throw new Error('Failed to pause notification queue');
    }
  }

  /**
   * Resume the queue
   */
  async resumeQueue(): Promise<void> {
    try {
      await this.queue.resume();
      console.log('Notification queue resumed');
    } catch (error) {
      console.error('Failed to resume queue:', error);
      throw new Error('Failed to resume notification queue');
    }
  }

  /**
   * Clear all jobs from the queue
   */
  async clearQueue(): Promise<void> {
    try {
      await this.queue.empty();
      console.log('Notification queue cleared');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw new Error('Failed to clear notification queue');
    }
  }

  /**
   * Get failed jobs for manual inspection
   */
  async getFailedJobs(limit: number = 50): Promise<Bull.Job[]> {
    try {
      return await this.queue.getFailed(0, limit - 1);
    } catch (error) {
      console.error('Failed to get failed jobs:', error);
      throw new Error('Failed to retrieve failed jobs');
    }
  }

  /**
   * Retry all failed jobs
   */
  async retryFailedJobs(): Promise<void> {
    try {
      const failedJobs = await this.queue.getFailed();
      
      for (const job of failedJobs) {
        await job.retry();
      }
      
      console.log(`Retried ${failedJobs.length} failed jobs`);
    } catch (error) {
      console.error('Failed to retry failed jobs:', error);
      throw new Error('Failed to retry failed jobs');
    }
  }

  /**
   * Set up queue event listeners
   */
  private setupQueueEvents(): void {
    this.queue.on('completed', (job: Bull.Job) => {
      console.log(`Notification job ${job.id} completed successfully`);
    });

    this.queue.on('failed', (job: Bull.Job, err: Error) => {
      console.error(`Notification job ${job.id} failed:`, err.message);
      
      // Log additional details for debugging
      if (job.data) {
        console.error(`Failed notification details:`, {
          notificationId: job.data.id,
          userId: job.data.userId,
          type: job.data.type,
          retryCount: job.data.retryCount,
        });
      }
    });

    this.queue.on('stalled', (job: Bull.Job) => {
      console.warn(`Notification job ${job.id} stalled and will be retried`);
    });

    this.queue.on('progress', (job: Bull.Job, progress: number) => {
      console.log(`Notification job ${job.id} progress: ${progress}%`);
    });

    this.queue.on('error', (error: Error) => {
      console.error('Queue error:', error);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down notification queue...');
      await this.queue.close();
      await this.redis.disconnect();
    });

    process.on('SIGINT', async () => {
      console.log('Shutting down notification queue...');
      await this.queue.close();
      await this.redis.disconnect();
    });
  }

  /**
   * Get priority value for Bull queue (higher number = higher priority)
   */
  private getPriority(priority: string): number {
    switch (priority) {
      case 'high':
        return 10;
      case 'medium':
        return 5;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }

  /**
   * Health check for the queue system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      redis: boolean;
      queue: boolean;
      stats?: any;
    };
  }> {
    try {
      // Test Redis connection
      const redisHealthy = await this.testRedisConnection();
      
      // Test queue operations
      const queueHealthy = await this.testQueueOperations();
      
      // Get queue stats if healthy
      let stats;
      if (queueHealthy) {
        stats = await this.getQueueStats();
      }

      const isHealthy = redisHealthy && queueHealthy;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        details: {
          redis: redisHealthy,
          queue: queueHealthy,
          stats,
        },
      };
    } catch (error) {
      console.error('Queue health check failed:', error);
      return {
        status: 'unhealthy',
        details: {
          redis: false,
          queue: false,
        },
      };
    }
  }

  private async testRedisConnection(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Redis connection test failed:', error);
      return false;
    }
  }

  private async testQueueOperations(): Promise<boolean> {
    try {
      // Try to get queue stats as a basic operation test
      await this.queue.getWaiting();
      return true;
    } catch (error) {
      console.error('Queue operations test failed:', error);
      return false;
    }
  }

  /**
   * Get the Bull queue instance (for advanced operations)
   */
  getQueue(): Bull.Queue {
    return this.queue;
  }
}