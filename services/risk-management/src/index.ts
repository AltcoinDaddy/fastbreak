import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import Redis from 'redis';
import winston from 'winston';
import { DatabaseManager } from '@fastbreak/database';
import { BudgetManager, BudgetManagerConfig } from './services/budget-manager';
import { createRiskRouter } from './routes/risk';

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

class RiskManagementApp {
  private app: express.Application;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private budgetManager: BudgetManager;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.RISK_MANAGEMENT_PORT || '8006');
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

  private initializeBudgetManager(): void {
    const config: BudgetManagerConfig = {
      defaultDailyLimit: parseFloat(process.env.DEFAULT_DAILY_LIMIT || '1000'),
      defaultWeeklyLimit: parseFloat(process.env.DEFAULT_WEEKLY_LIMIT || '5000'),
      defaultMonthlyLimit: parseFloat(process.env.DEFAULT_MONTHLY_LIMIT || '20000'),
      defaultMaxPricePerMoment: parseFloat(process.env.DEFAULT_MAX_PRICE_PER_MOMENT || '500'),
      defaultReservePercentage: parseFloat(process.env.DEFAULT_RESERVE_PERCENTAGE || '0.2'),
      warningThresholds: {
        daily: parseFloat(process.env.DAILY_WARNING_THRESHOLD || '0.8'),
        weekly: parseFloat(process.env.WEEKLY_WARNING_THRESHOLD || '0.8'),
        monthly: parseFloat(process.env.MONTHLY_WARNING_THRESHOLD || '0.8'),
      },
      autoResetEnabled: process.env.AUTO_RESET_ENABLED !== 'false',
      complianceCheckEnabled: process.env.COMPLIANCE_CHECK_ENABLED !== 'false',
      suspiciousActivityConfig: {
        maxTransactionsPerHour: parseInt(process.env.MAX_TRANSACTIONS_PER_HOUR || '20'),
        maxTransactionsPerDay: parseInt(process.env.MAX_TRANSACTIONS_PER_DAY || '100'),
        unusualAmountThreshold: parseFloat(process.env.UNUSUAL_AMOUNT_THRESHOLD || '5.0'),
        rapidFireThreshold: parseInt(process.env.RAPID_FIRE_THRESHOLD || '10'),
        geolocationCheckEnabled: process.env.GEOLOCATION_CHECK_ENABLED !== 'false',
        deviceFingerprintingEnabled: process.env.DEVICE_FINGERPRINTING_ENABLED !== 'false',
        behaviorAnalysisEnabled: process.env.BEHAVIOR_ANALYSIS_ENABLED !== 'false',
      },
    };

    this.budgetManager = new BudgetManager(
      config,
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
        service: 'risk-management',
        timestamp: new Date().toISOString(),
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'FastBreak Risk Management Service',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          budget: '/api/budget',
          spending: '/api/spending',
          alerts: '/api/alerts',
          emergency: '/api/emergency',
          health: '/health',
        },
      });
    });

    // API routes
    const riskRouter = createRiskRouter({
      budgetManager: this.budgetManager,
      logger,
    });
    
    this.app.use('/api', riskRouter);

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
    // Budget manager events
    this.budgetManager.on('budgetLimitsUpdated', (updated, previous) => {
      logger.info('Budget limits updated', {
        userId: updated.userId,
        changes: this.getBudgetChanges(updated, previous),
      });
    });

    this.budgetManager.on('spendingRecorded', (spending, request) => {
      logger.debug('Spending recorded', {
        userId: spending.userId,
        amount: request.amount,
        dailyTotal: spending.dailySpent,
      });
    });

    this.budgetManager.on('emergencyStopTriggered', (emergencyStop) => {
      logger.error('Emergency stop triggered', {
        userId: emergencyStop.userId,
        reason: emergencyStop.reason,
      });
    });

    this.budgetManager.on('criticalAlert', (alert) => {
      logger.error('Critical risk alert', {
        userId: alert.userId,
        type: alert.type,
        message: alert.message,
      });
    });

    this.budgetManager.on('dailySpendingReset', (userId, spending) => {
      logger.info('Daily spending reset', { userId });
    });

    this.budgetManager.on('weeklySpendingReset', (userId, spending) => {
      logger.info('Weekly spending reset', { userId });
    });

    this.budgetManager.on('monthlySpendingReset', (userId, spending) => {
      logger.info('Monthly spending reset', { userId });
    });
  }

  private getBudgetChanges(updated: any, previous: any): string[] {
    const changes: string[] = [];
    
    if (updated.dailySpendingCap !== previous.dailySpendingCap) {
      changes.push(`dailySpendingCap: ${previous.dailySpendingCap} -> ${updated.dailySpendingCap}`);
    }
    
    if (updated.maxPricePerMoment !== previous.maxPricePerMoment) {
      changes.push(`maxPricePerMoment: ${previous.maxPricePerMoment} -> ${updated.maxPricePerMoment}`);
    }
    
    if (updated.totalBudgetLimit !== previous.totalBudgetLimit) {
      changes.push(`totalBudgetLimit: ${previous.totalBudgetLimit} -> ${updated.totalBudgetLimit}`);
    }
    
    return changes;
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize budget manager
      this.initializeBudgetManager();
      await this.budgetManager.initialize();
      logger.info('Budget manager initialized');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup event listeners
      this.setupEventListeners();
      logger.info('Event listeners configured');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`Risk management service running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start risk management service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down risk management service...');

      // Stop budget manager
      if (this.budgetManager) {
        await this.budgetManager.shutdown();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Close database connection
      if (this.db) {
        await this.db.close();
      }

      logger.info('Risk management service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new RiskManagementApp();

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