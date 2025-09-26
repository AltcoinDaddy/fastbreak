import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Pool } from 'pg';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { NotificationService } from './services/notification-service';
import { PushService } from './services/push-service';
import { createNotificationRoutes } from './routes/notifications';
import { NotificationWorker } from './worker';

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3007;

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later'
    });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbResult = await db.query('SELECT NOW()');
    
    // Check queue health
    const queueHealth = await notificationWorker.getStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      version: process.env.npm_package_version || '1.0.0',
      database: {
        status: 'connected',
        timestamp: dbResult.rows[0].now
      },
      queue: queueHealth.queue,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      error: error.message
    });
  }
});

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize services
const notificationService = new NotificationService(db);
const pushService = new PushService(db);
let notificationWorker: NotificationWorker;

// API routes
app.use('/api/notifications', createNotificationRoutes(notificationService, pushService));

// Admin routes (protected by service authentication)
app.get('/admin/stats', async (req, res) => {
  try {
    // Simple API key authentication for admin endpoints
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const stats = await notificationWorker.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Failed to get admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

// Queue management endpoints
app.post('/admin/queue/pause', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const queue = notificationWorker['notificationQueue'];
    await queue.pauseQueue();
    
    res.json({
      success: true,
      message: 'Queue paused successfully'
    });
  } catch (error) {
    console.error('Failed to pause queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause queue'
    });
  }
});

app.post('/admin/queue/resume', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const queue = notificationWorker['notificationQueue'];
    await queue.resumeQueue();
    
    res.json({
      success: true,
      message: 'Queue resumed successfully'
    });
  } catch (error) {
    console.error('Failed to resume queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume queue'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('Database connection established');

    // Initialize and start notification worker
    notificationWorker = new NotificationWorker(db);
    await notificationWorker.start();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`Notification service running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      server.close(async () => {
        try {
          if (notificationWorker) {
            await notificationWorker.stop();
          }
          await db.end();
          console.log('Server shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;