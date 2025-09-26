import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import winston from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { AgentManager, AgentManagerConfig } from './services/agent-manager';
import { GameEventAgent } from './agents/game-event-agent';
import { PriceAlertAgent } from './agents/price-alert-agent';
import { ArbitrageAgent } from './agents/arbitrage-agent';
import { DailyScanAgent } from './agents/daily-scan-agent';
import { createAgentRouter } from './routes/agents';

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

class ForteAgentsApp {
  private app: express.Application;
  private db!: DatabaseManager;
  private redisClient!: Redis.RedisClientType;
  private agentManager!: AgentManager;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.FORTE_AGENTS_PORT || '8007');
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

  private initializeAgentManager(): void {
    const agentConfig: AgentManagerConfig = {
      maxConcurrentAgents: parseInt(process.env.MAX_CONCURRENT_AGENTS || '10'),
      agentCheckIntervalMs: parseInt(process.env.AGENT_CHECK_INTERVAL || '30000'), // 30 seconds
      failureRetryDelayMs: parseInt(process.env.FAILURE_RETRY_DELAY || '60000'), // 1 minute
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '300000'), // 5 minutes
      dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '30'),
      alertCooldownMs: parseInt(process.env.ALERT_COOLDOWN || '300000'), // 5 minutes
      externalServices: {
        nbaStatsAPI: {
          baseUrl: process.env.NBA_STATS_API_URL || 'https://stats.nba.com/stats',
          rateLimitPerSecond: parseInt(process.env.NBA_STATS_RATE_LIMIT || '5'),
        },
        topShotAPI: {
          baseUrl: process.env.TOP_SHOT_API_URL || 'https://api.nbatopshot.com',
          apiKey: process.env.TOP_SHOT_API_KEY,
          rateLimitPerSecond: parseInt(process.env.TOP_SHOT_RATE_LIMIT || '10'),
        },
        tradingService: {
          baseUrl: process.env.TRADING_SERVICE_URL || 'http://localhost:8003',
          apiKey: process.env.TRADING_SERVICE_API_KEY,
        },
        aiScoutingService: {
          baseUrl: process.env.AI_SCOUTING_URL || 'http://localhost:8001',
          apiKey: process.env.AI_SCOUTING_API_KEY,
        },
      },
    };

    this.agentManager = new AgentManager(
      agentConfig,
      this.db,
      this.redisClient,
      logger
    );
  }

  private async registerAgents(): Promise<void> {
    // Register Game Event Agent
    const gameEventAgent = new GameEventAgent(
      {
        checkIntervalMs: parseInt(process.env.GAME_EVENT_CHECK_INTERVAL || '60000'), // 1 minute
        lookAheadHours: parseInt(process.env.GAME_LOOKAHEAD_HOURS || '24'),
        performanceThresholds: {
          points: parseInt(process.env.POINTS_THRESHOLD || '30'),
          rebounds: parseInt(process.env.REBOUNDS_THRESHOLD || '10'),
          assists: parseInt(process.env.ASSISTS_THRESHOLD || '10'),
          blocks: parseInt(process.env.BLOCKS_THRESHOLD || '3'),
          steals: parseInt(process.env.STEALS_THRESHOLD || '3'),
        },
        momentCategories: ['rookie', 'veteran', 'legendary'],
        enableRealTimeUpdates: process.env.ENABLE_REALTIME_UPDATES !== 'false',
      },
      this.db,
      this.redisClient,
      logger
    );

    // Register Price Alert Agent
    const priceAlertAgent = new PriceAlertAgent(
      {
        checkIntervalMs: parseInt(process.env.PRICE_CHECK_INTERVAL || '30000'), // 30 seconds
        priceChangeThresholds: {
          significant: parseFloat(process.env.SIGNIFICANT_PRICE_CHANGE || '0.1'), // 10%
          major: parseFloat(process.env.MAJOR_PRICE_CHANGE || '0.2'), // 20%
          extreme: parseFloat(process.env.EXTREME_PRICE_CHANGE || '0.5'), // 50%
        },
        volumeThresholds: {
          low: parseInt(process.env.LOW_VOLUME_THRESHOLD || '10'),
          medium: parseInt(process.env.MEDIUM_VOLUME_THRESHOLD || '50'),
          high: parseInt(process.env.HIGH_VOLUME_THRESHOLD || '100'),
        },
        trackingCategories: ['all', 'user_portfolio', 'watchlist'],
        enableVolumeAlerts: process.env.ENABLE_VOLUME_ALERTS !== 'false',
      },
      this.db,
      this.redisClient,
      logger
    );

    // Register Arbitrage Agent
    const arbitrageAgent = new ArbitrageAgent(
      {
        checkIntervalMs: parseInt(process.env.ARBITRAGE_CHECK_INTERVAL || '15000'), // 15 seconds
        minProfitPercentage: parseFloat(process.env.MIN_ARBITRAGE_PROFIT || '0.05'), // 5%
        minProfitAmount: parseFloat(process.env.MIN_ARBITRAGE_AMOUNT || '10'),
        maxRiskScore: parseFloat(process.env.MAX_ARBITRAGE_RISK || '70'),
        marketplaces: ['topshot', 'othermarkets'],
        maxOpportunityAge: parseInt(process.env.MAX_OPPORTUNITY_AGE || '300000'), // 5 minutes
        enableAutoExecution: process.env.ENABLE_AUTO_ARBITRAGE === 'true',
      },
      this.db,
      this.redisClient,
      logger
    );

    // Register Daily Scan Agent
    const dailyScanAgent = new DailyScanAgent(
      {
        checkIntervalMs: parseInt(process.env.DAILY_SCAN_CHECK_INTERVAL || '86400000'), // 24 hours
        scanTime: process.env.DAILY_SCAN_TIME || '09:00', // 9 AM
        timezone: process.env.TIMEZONE || 'America/New_York',
        scanCategories: ['market_overview', 'portfolio_analysis', 'strategy_performance'],
        reportRecipients: process.env.DAILY_REPORT_RECIPIENTS?.split(',') || [],
        enableDetailedAnalysis: process.env.ENABLE_DETAILED_ANALYSIS !== 'false',
        includeRecommendations: process.env.INCLUDE_RECOMMENDATIONS !== 'false',
      },
      this.db,
      this.redisClient,
      logger
    );

    // Register all agents with the manager
    await this.agentManager.registerAgent(gameEventAgent);
    await this.agentManager.registerAgent(priceAlertAgent);
    await this.agentManager.registerAgent(arbitrageAgent);
    await this.agentManager.registerAgent(dailyScanAgent);

    logger.info('All agents registered successfully');
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'forte-agents',
        timestamp: new Date().toISOString(),
        agents: {
          registered: this.agentManager.getRegisteredAgentCount(),
          active: this.agentManager.getActiveAgentCount(),
          failed: this.agentManager.getFailedAgentCount(),
        },
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'FastBreak Forte Agents',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          agents: '/api/agents',
          triggers: '/api/triggers',
          alerts: '/api/alerts',
          reports: '/api/reports',
          health: '/health',
        },
      });
    });

    // API routes
    const agentRouter = createAgentRouter({
      agentManager: this.agentManager,
      logger,
    });

    this.app.use('/api', agentRouter);

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
    // Agent manager events
    this.agentManager.on('agentStarted', (agentId, agentName) => {
      logger.info('Agent started', { agentId, agentName });
    });

    this.agentManager.on('agentStopped', (agentId, agentName) => {
      logger.info('Agent stopped', { agentId, agentName });
    });

    this.agentManager.on('agentFailed', (agentId, agentName, error) => {
      logger.error('Agent failed', { agentId, agentName, error: error.message });
    });

    this.agentManager.on('agentTriggered', (agentId, agentName, triggerData) => {
      logger.info('Agent triggered', { agentId, agentName, triggerData });
    });

    this.agentManager.on('alertGenerated', (alert) => {
      logger.info('Alert generated', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        agentId: alert.agentId,
      });
    });

    this.agentManager.on('opportunityDetected', (opportunity) => {
      logger.info('Opportunity detected', {
        opportunityId: opportunity.id,
        type: opportunity.type,
        agentId: opportunity.agentId,
        estimatedProfit: opportunity.estimatedProfit,
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize agent manager
      this.initializeAgentManager();
      await this.agentManager.initialize();
      logger.info('Agent manager initialized');

      // Register agents
      await this.registerAgents();

      // Start all agents
      await this.agentManager.startAllAgents();
      logger.info('All agents started');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup event listeners
      this.setupEventListeners();
      logger.info('Event listeners configured');

      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`Forte Agents service running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start Forte Agents service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down Forte Agents service...');

      // Stop agent manager
      if (this.agentManager) {
        await this.agentManager.shutdown();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Close database connection
      if (this.db) {
        await this.db.close();
      }

      logger.info('Forte Agents service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new ForteAgentsApp();

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