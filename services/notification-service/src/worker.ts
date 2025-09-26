import { Pool } from 'pg';
import Bull from 'bull';
import { NotificationService } from './services/notification-service';
import { NotificationQueue } from './services/notification-queue';
import { NotificationWithRetry } from './types/notification';

/**
 * Queue worker for processing notifications
 */
export class NotificationWorker {
  private notificationService: NotificationService;
  private notificationQueue: NotificationQueue;
  private queue: Bull.Queue;

  constructor(db: Pool) {
    this.notificationService = new NotificationService(db);
    this.notificationQueue = new NotificationQueue();
    this.queue = this.notificationQueue.getQueue();
    
    this.setupWorker();
  }

  /**
   * Set up the queue worker to process notification jobs
   */
  private setupWorker(): void {
    // Process notification jobs
    this.queue.process('process-notification', this.processNotificationJob.bind(this));

    // Set up error handling
    this.queue.on('error', (error) => {
      console.error('Queue error:', error);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err);
    });

    this.queue.on('completed', (job) => {
      console.log(`Job ${job.id} completed successfully`);
    });

    console.log('Notification worker started and listening for jobs');
  }

  /**
   * Process a single notification job
   */
  private async processNotificationJob(job: Bull.Job<NotificationWithRetry>): Promise<void> {
    const notification = job.data;
    
    try {
      console.log(`Processing notification ${notification.id} (attempt ${notification.retryCount + 1})`);
      
      // Update job progress
      await job.progress(10);
      
      // Process the notification through the service
      await this.notificationService.processNotificationDelivery(notification);
      
      // Update job progress to completion
      await job.progress(100);
      
      console.log(`Successfully processed notification ${notification.id}`);
    } catch (error) {
      console.error(`Failed to process notification ${notification.id}:`, error);
      
      // The error will be handled by Bull's retry mechanism
      throw error;
    }
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    console.log('Starting notification worker...');
    
    // Perform health checks
    const healthCheck = await this.notificationQueue.healthCheck();
    
    if (healthCheck.status === 'unhealthy') {
      console.error('Queue health check failed:', healthCheck.details);
      throw new Error('Cannot start worker - queue is unhealthy');
    }
    
    console.log('Notification worker is healthy and ready to process jobs');
    console.log('Queue stats:', healthCheck.details.stats);
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    console.log('Stopping notification worker...');
    
    try {
      await this.queue.close();
      console.log('Notification worker stopped successfully');
    } catch (error) {
      console.error('Error stopping notification worker:', error);
      throw error;
    }
  }

  /**
   * Get worker statistics
   */
  async getStats(): Promise<any> {
    try {
      const queueStats = await this.notificationQueue.getQueueStats();
      const failedJobs = await this.notificationQueue.getFailedJobs(10);
      
      return {
        queue: queueStats,
        recentFailures: failedJobs.map(job => ({
          id: job.id,
          data: job.data,
          failedReason: job.failedReason,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn
        }))
      };
    } catch (error) {
      console.error('Failed to get worker stats:', error);
      throw error;
    }
  }
}

// If this file is run directly, start the worker
if (require.main === module) {
  const startWorker = async () => {
    try {
      // Load environment variables
      require('dotenv').config();
      
      // Create database connection
      const db = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test database connection
      await db.query('SELECT NOW()');
      console.log('Database connection established');

      // Create and start worker
      const worker = new NotificationWorker(db);
      await worker.start();

      // Handle graceful shutdown
      const shutdown = async (signal: string) => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        
        try {
          await worker.stop();
          await db.end();
          console.log('Shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      // Keep the process running
      console.log('Worker is running. Press Ctrl+C to stop.');
      
    } catch (error) {
      console.error('Failed to start notification worker:', error);
      process.exit(1);
    }
  };

  startWorker();
}