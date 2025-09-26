import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import Redis from 'redis';
import winston from 'winston';
import { DatabaseManager } from '@fastbreak/database';
import { StrategyService, StrategyServiceConfig } from './services/strategy-service';
import { createStrategyRouter } from './routes/strategy';

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

class StrategyServiceApp {
  private app: express.Application;
  private db!: DatabaseManager;
  private redisClient!: Redis.RedisClientType;
  private strategyService!: StrategyService;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.STRATEGY_SERVICE_PORT || '8005');
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

  private initializeStrategyService(): void {
    const serviceConfig: StrategyServiceConfig = {
      maxStrategiesPerUser: parseInt(process.env.MAX_STRATEGIES_PER_USER || '10'),
      defaultRiskControls: {
        maxDailyLoss: parseFloat(process.env.DEFAULT_MAX_DAILY_LOSS || '500'),
        maxPositionSize: parseFloat(process.env.DEFAULT_MAX_POSITION_SIZE || '200'),
        maxConcurrentTrades: parseInt(process.env.DEFAULT_MAX_CONCURRENT_TRADES || '5'),
        stopLossPercentage: parseFloat(process.env.DEFAULT_STOP_LOSS || '0.1'),
        takeProfitPercentage: parseFloat(process.env.DEFAULT_TAKE_PROFIT || '0.2'),
        cooldownPeriod: parseInt(process.env.DEFAULT_COOLDOWN_PERIOD || '300'),
        blacklistedPlayers: [],
        blacklistedMoments: [],
        maxPricePerMoment: parseFloat(process.env.DEFAULT_MAX_PRICE_PER_MOMENT || '1000'),
        requireManualApproval: process.env.DEFAULT_REQUIRE_MANUAL_APPROVAL === 'true',
        emergencyStop: {
          enabled: true,
          triggerConditions: [
            {
              type: 'loss_threshold',
              threshold: 0.15, // 15% loss
              isActive: true,
            },
          ],
        },
      },
      performanceUpdateInterval: parseInt(process.env.PERFORMANCE_UPDATE_INTERVAL || '300000'), // 5 minutes
      backtestHistoryDays: parseInt(process.env.BACKTEST_HISTORY_DAYS || '365'),
      recommendationCooldown: parseInt(process.env.RECOMMENDATION_COOLDOWN || '86400000'), // 24 hours
    };

    this.strategyService = new StrategyService(
      serviceConfig,
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
        service: 'strategy-service',
        timestamp: new Date().toISOString(),
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'FastBreak Strategy Service',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          templates: '/api/templates',
          strategies: '/api/strategies',
          recommendations: '/api/recommendations',
          validate: '/api/validate',
          health: '/health',
        },
      });
    });

    // API routes
    const strategyRouter = createStrategyRouter({
      strategyService: this.strategyService,
      logger,
    });
    
    this.app.use('/api', strategyRouter);

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
    // Strategy service events
    this.strategyService.on('strategyCreated', (strategy) => {
      logger.info('Strategy created', {
        strategyId: strategy.id,
        userId: strategy.userId,
        templateId: strategy.templateId,
      });
    });

    this.strategyService.on('strategyUpdated', (strategy, previousStrategy) => {
      logger.info('Strategy updated', {
        strategyId: strategy.id,
        userId: strategy.userId,
      });
    });

    this.strategyService.on('strategyDeleted', (strategy) => {
      logger.info('Strategy deleted', {
        strategyId: strategy.id,
        userId: strategy.userId,
      });
    });

    this.strategyService.on('strategyToggled', (strategy, isActive) => {
      logger.info('Strategy toggled', {
        strategyId: strategy.id,
        userId: strategy.userId,
        isActive,
      });
    });

    this.strategyService.on('performanceUpdated', (strategyId, execution) => {
      logger.debug('Strategy performance updated', {
        strategyId,
        executionId: execution.id,
        profit: execution.result?.profit,
      });
    });

    this.strategyService.on('backtestCompleted', (backtest) => {
      logger.info('Backtest completed', {
        backtestId: backtest.id,
        strategyId: backtest.strategyId,
        userId: backtest.userId,
        totalReturn: backtest.results.totalReturn,
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize strategy service
      this.initializeStrategyService();
      await this.strategyService.initialize();
      logger.info('Strategy service initialized');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup event listeners
      this.setupEventListeners();
      logger.info('Event listeners configured');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`Strategy service running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start strategy service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down strategy service...');

      // Stop strategy service
      if (this.strategyService) {
        await this.strategyService.shutdown();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Close database connection
      if (this.db) {
        await this.db.close();
      }

      logger.info('Strategy service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new StrategyServiceApp();

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