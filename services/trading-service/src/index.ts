import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import winston from 'winston';
import { DatabaseManager } from '@fastbreak/database';
import { FlowService } from './services/flow-service';
import { TradingService, TradingServiceConfig } from './services/trading-service';
import { PortfolioService } from './services/portfolio-service';
import { createTradingRouter } from './routes/trading';

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

class TradingServiceApp {
  private app: express.Application;
  private db!: DatabaseManager;
  private flowService!: FlowService;
  private tradingService!: TradingService;
  private portfolioService!: PortfolioService;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.TRADING_SERVICE_PORT || '8003');
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

  private initializeFlowService(): void {
    const flowConfig = {
      network: process.env.FLOW_NETWORK || 'testnet',
      accessNodeAPI: process.env.FLOW_ACCESS_NODE_API || 'https://rest-testnet.onflow.org',
      privateKey: process.env.FLOW_PRIVATE_KEY!,
      accountAddress: process.env.FLOW_ACCOUNT_ADDRESS!,
      contracts: {
        FastBreakController: process.env.FASTBREAK_CONTROLLER_ADDRESS!,
        SafetyControls: process.env.SAFETY_CONTROLS_ADDRESS!,
        TradeAnalytics: process.env.TRADE_ANALYTICS_ADDRESS!,
        TopShot: process.env.TOP_SHOT_CONTRACT_ADDRESS!,
      },
    };

    this.flowService = new FlowService(flowConfig, logger);
  }

  private initializeTradingService(): void {
    const tradingConfig: TradingServiceConfig = {
      maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || '10'),
      tradeTimeoutMs: parseInt(process.env.TRADE_TIMEOUT_MS || '300000'), // 5 minutes
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000'),
      slippageTolerance: parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05'), // 5%
      gasLimit: parseInt(process.env.GAS_LIMIT || '9999'),
      enableDryRun: process.env.ENABLE_DRY_RUN === 'true',
      topShotAPI: {
        baseUrl: process.env.TOP_SHOT_API_URL || 'https://api.nbatopshot.com',
        apiKey: process.env.TOP_SHOT_API_KEY,
        rateLimitPerSecond: parseInt(process.env.TOP_SHOT_RATE_LIMIT || '10'),
      },
      marketplaceConfig: {
        marketplaceFee: parseFloat(process.env.MARKETPLACE_FEE || '0.05'), // 5%
        minBidIncrement: parseFloat(process.env.MIN_BID_INCREMENT || '1.0'),
        maxBidDuration: parseInt(process.env.MAX_BID_DURATION || '86400'), // 24 hours
      },
    };

    this.tradingService = new TradingService(
      tradingConfig,
      this.flowService,
      this.db,
      logger
    );

    this.portfolioService = new PortfolioService(
      this.flowService,
      this.db,
      logger
    );
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'trading-service',
        timestamp: new Date().toISOString(),
        flow: {
          network: process.env.FLOW_NETWORK,
          connected: this.flowService.isConnected(),
        },
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'FastBreak Trading Service',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          trades: '/api/trades',
          portfolio: '/api/portfolio',
          orders: '/api/orders',
          moments: '/api/moments',
          health: '/health',
        },
      });
    });

    // API routes
    const tradingRouter = createTradingRouter({
      tradingService: this.tradingService,
      portfolioService: this.portfolioService,
      flowService: this.flowService,
      logger,
    });
    
    this.app.use('/api', tradingRouter);

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
    // Trading service events
    this.tradingService.on('tradeExecuted', (trade) => {
      logger.info('Trade executed', {
        tradeId: trade.id,
        userId: trade.userId,
        momentId: trade.momentId,
        action: trade.action,
        price: trade.price,
      });
    });

    this.tradingService.on('tradeFailed', (trade, error) => {
      logger.error('Trade failed', {
        tradeId: trade.id,
        userId: trade.userId,
        error: error.message,
      });
    });

    this.tradingService.on('orderPlaced', (order) => {
      logger.info('Order placed', {
        orderId: order.id,
        userId: order.userId,
        type: order.type,
        momentId: order.momentId,
      });
    });

    this.tradingService.on('orderFilled', (order) => {
      logger.info('Order filled', {
        orderId: order.id,
        userId: order.userId,
        fillPrice: order.fillPrice,
      });
    });

    // Portfolio service events
    this.portfolioService.on('portfolioUpdated', (userId, portfolio) => {
      logger.debug('Portfolio updated', {
        userId,
        totalValue: portfolio.totalValue,
        momentCount: portfolio.moments.length,
      });
    });

    // Flow service events
    this.flowService.on('transactionSealed', (transactionId, result) => {
      logger.info('Flow transaction sealed', {
        transactionId,
        status: result.status,
        events: result.events.length,
      });
    });

    this.flowService.on('transactionFailed', (transactionId, error) => {
      logger.error('Flow transaction failed', {
        transactionId,
        error: error.message,
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Flow service
      this.initializeFlowService();
      await this.flowService.initialize();
      logger.info('Flow service initialized');

      // Initialize trading service
      this.initializeTradingService();
      await this.tradingService.initialize();
      logger.info('Trading service initialized');

      // Initialize portfolio service
      await this.portfolioService.initialize();
      logger.info('Portfolio service initialized');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup event listeners
      this.setupEventListeners();
      logger.info('Event listeners configured');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`Trading service running on port ${this.port}`);
        logger.info(`Flow network: ${process.env.FLOW_NETWORK}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start trading service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down trading service...');

      // Stop trading service
      if (this.tradingService) {
        await this.tradingService.shutdown();
      }

      // Stop portfolio service
      if (this.portfolioService) {
        await this.portfolioService.shutdown();
      }

      // Stop Flow service
      if (this.flowService) {
        await this.flowService.shutdown();
      }

      // Close database connection
      if (this.db) {
        await this.db.close();
      }

      logger.info('Trading service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new TradingServiceApp();

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