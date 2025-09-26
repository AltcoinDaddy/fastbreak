import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import winston from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { ActionManager, ActionManagerConfig } from './services/action-manager';
import { createActionRouter } from './routes/actions';

// Load environment variables
config();

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

class ForteActionsApp {
  private app: express.Application;
  private db!: DatabaseManager;
  private redisClient!: Redis.RedisClientType;
  private actionManager!: ActionManager;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.FORTE_ACTIONS_PORT || '8008');
    this.setupExpress();
  }

  private setupExpress(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID'],
    }));

    // Compression and parsing middleware
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.headers['x-user-id'],
      });
      next();
    });
  }

  private async initializeDatabase(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.db = new DatabaseManager(databaseUrl);
    await this.db.initialize();
    logger.info('Database initialized successfully');
  }

  private async initializeRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.redisClient = Redis.createClient({
      url: redisUrl,
    });

    this.redisClient.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    this.redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    await this.redisClient.connect();
  }

  private initializeActionManager(): void {
    const actionConfig: ActionManagerConfig = {
      maxConcurrentActions: parseInt(process.env.MAX_CONCURRENT_ACTIONS || '5'),
      actionTimeoutMs: parseInt(process.env.ACTION_TIMEOUT_MS || '300000'), // 5 minutes
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000'), // 5 seconds
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      metricsRetentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
      
      // Purchase Action Configuration
      purchaseAction: {
        maxRetries: parseInt(process.env.PURCHASE_MAX_RETRIES || '3'),
        timeoutMs: parseInt(process.env.PURCHASE_TIMEOUT_MS || '120000'), // 2 minutes
        gasLimit: parseInt(process.env.PURCHASE_GAS_LIMIT || '1000'),
        maxGasCost: parseFloat(process.env.PURCHASE_MAX_GAS_COST || '0.01'),
        enabled: process.env.PURCHASE_ACTION_ENABLED !== 'false',
        slippageTolerance: parseFloat(process.env.PURCHASE_SLIPPAGE_TOLERANCE || '0.05'), // 5%
        priceValidityWindow: parseInt(process.env.PURCHASE_PRICE_VALIDITY || '30000'), // 30 seconds
        marketplaceTimeouts: {
          topshot: parseInt(process.env.TOPSHOT_TIMEOUT || '60000'),
          othermarkets: parseInt(process.env.OTHER_MARKETS_TIMEOUT || '90000'),
        },
      },

      // Arbitrage Action Configuration
      arbitrageAction: {
        maxRetries: parseInt(process.env.ARBITRAGE_MAX_RETRIES || '2'),
        timeoutMs: parseInt(process.env.ARBITRAGE_TIMEOUT_MS || '180000'), // 3 minutes
        gasLimit: parseInt(process.env.ARBITRAGE_GAS_LIMIT || '2000'),
        maxGasCost: parseFloat(process.env.ARBITRAGE_MAX_GAS_COST || '0.02'),
        enabled: process.env.ARBITRAGE_ACTION_ENABLED !== 'false',
        minProfitThreshold: parseFloat(process.env.ARBITRAGE_MIN_PROFIT || '10'),
        maxExecutionTime: parseInt(process.env.ARBITRAGE_MAX_EXECUTION_TIME || '300000'), // 5 minutes
        crossMarketplaceEnabled: process.env.CROSS_MARKETPLACE_ENABLED === 'true',
        simultaneousExecutionEnabled: process.env.SIMULTANEOUS_EXECUTION_ENABLED === 'true',
      },

      // Portfolio Rebalance Action Configuration
      portfolioRebalanceAction: {
        maxRetries: parseInt(process.env.REBALANCE_MAX_RETRIES || '2'),
        timeoutMs: parseInt(process.env.REBALANCE_TIMEOUT_MS || '600000'), // 10 minutes
        gasLimit: parseInt(process.env.REBALANCE_GAS_LIMIT || '5000'),
        maxGasCost: parseFloat(process.env.REBALANCE_MAX_GAS_COST || '0.05'),
        enabled: process.env.REBALANCE_ACTION_ENABLED !== 'false',
        maxBatchSize: parseInt(process.env.REBALANCE_MAX_BATCH_SIZE || '20'),
        minProfitThreshold: parseFloat(process.env.REBALANCE_MIN_PROFIT || '5'),
        maxLossThreshold: parseFloat(process.env.REBALANCE_MAX_LOSS || '0.2'), // 20%
        marketImpactLimit: parseFloat(process.env.REBALANCE_MARKET_IMPACT_LIMIT || '0.1'), // 10%
        priceValidityWindow: parseInt(process.env.REBALANCE_PRICE_VALIDITY || '60000'), // 1 minute
      },
    };

    this.actionManager = new ActionManager(
      actionConfig,
      this.db,
      this.redisClient,
      logger
    );
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'forte-actions',
        timestamp: new Date().toISOString(),
        actions: {
          maxConcurrent: this.actionManager ? 5 : 0, // Would get from config
          active: 0, // Would get from action manager
        },
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'FastBreak Forte Actions',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          purchase: '/api/actions/purchase',
          arbitrage: '/api/actions/arbitrage',
          rebalance: '/api/actions/rebalance',
          status: '/api/actions/status/:requestId',
          metrics: '/api/actions/metrics',
          health: '/health',
        },
      });
    });

    // API routes
    const actionRouter = createActionRouter({
      actionManager: this.actionManager,
      logger,
    });

    this.app.use('/api/actions', actionRouter);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date(),
      });
    });

    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);

      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
        timestamp: new Date(),
      });
    });
  }

  private setupEventListeners(): void {
    // Action manager events
    this.actionManager.on('actionQueued', (requestId, actionType, userId) => {
      logger.info('Action queued', { requestId, actionType, userId });
    });

    this.actionManager.on('actionCompleted', (requestId, actionType, userId, result) => {
      logger.info('Action completed', { 
        requestId, 
        actionType, 
        userId,
        executionTime: result.executionTime,
        transactionId: result.transactionId,
      });
    });

    this.actionManager.on('actionFailed', (requestId, actionType, userId, result) => {
      logger.error('Action failed', { 
        requestId, 
        actionType, 
        userId,
        error: result.error,
        executionTime: result.executionTime,
      });
    });

    this.actionManager.on('actionCancelled', (requestId, userId) => {
      logger.info('Action cancelled', { requestId, userId });
    });

    this.actionManager.on('metricsCollected', (metrics) => {
      logger.debug('Metrics collected', {
        totalExecutions: metrics.totalExecutions,
        successRate: metrics.successRate,
        averageExecutionTime: metrics.averageExecutionTime,
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize action manager
      this.initializeActionManager();
      await this.actionManager.initialize();
      logger.info('Action manager initialized');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup event listeners
      this.setupEventListeners();
      logger.info('Event listeners configured');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`Forte Actions service running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start Forte Actions service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down Forte Actions service...');

      // Stop action manager
      if (this.actionManager) {
        await this.actionManager.shutdown();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Close database connection
      if (this.db) {
        await this.db.close();
      }

      logger.info('Forte Actions service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new ForteActionsApp();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
app.start().catch((error) => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});