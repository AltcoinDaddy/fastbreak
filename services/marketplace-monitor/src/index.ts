import express from 'express';
import http from 'http';
import WebSocket from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from 'dotenv';
import Redis from 'redis';
import winston from 'winston';

import { MarketplaceService, MarketplaceServiceConfig } from './services/marketplace-service';
import { createMarketplaceRouter } from './routes/marketplace';
import { MarketplaceConfig } from './types/marketplace';

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

class MarketplaceMonitorApp {
  private app: express.Application;
  private server!: http.Server;
  private wss!: WebSocket.Server;
  private redisClient!: Redis.RedisClientType;
  private marketplaceService!: MarketplaceService;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.MARKETPLACE_MONITOR_PORT || '8002');
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
      allowedHeaders: ['Content-Type', 'Authorization'],
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
      });
      next();
    });
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

  private initializeMarketplaceService(): void {
    // Load marketplace configurations
    const marketplaceConfigs: MarketplaceConfig[] = [
      {
        id: 'topshot',
        name: 'NBA Top Shot',
        baseUrl: process.env.TOPSHOT_API_URL || 'https://api.nbatopshot.com',
        apiKey: process.env.TOP_SHOT_API_KEY,
        rateLimits: {
          requestsPerSecond: 10,
          requestsPerMinute: 600,
          requestsPerHour: 36000,
        },
        endpoints: {
          listings: '/marketplace/listings',
          sales: '/marketplace/sales',
          moments: '/moments',
          players: '/players',
        },
        websocket: {
          url: process.env.TOPSHOT_WS_URL || 'wss://api.nbatopshot.com/ws',
          channels: ['listings', 'sales', 'prices'],
        },
        isActive: true,
        priority: 1,
      },
      // Add more marketplace configurations as needed
    ];

    const serviceConfig: MarketplaceServiceConfig = {
      marketplaces: marketplaceConfigs,
      arbitrage: {
        minProfitPercentage: parseFloat(process.env.MIN_PROFIT_PERCENTAGE || '5'),
        minProfitAmount: parseFloat(process.env.MIN_PROFIT_AMOUNT || '10'),
        maxRiskScore: parseFloat(process.env.MAX_RISK_SCORE || '70'),
        scanIntervalMs: parseInt(process.env.ARBITRAGE_SCAN_INTERVAL || '30000'), // 30 seconds
        maxOpportunityAge: parseInt(process.env.MAX_OPPORTUNITY_AGE || '10'), // 10 minutes
        marketplaces: marketplaceConfigs.filter(c => c.isActive).map(c => c.id),
      },
      priceMonitor: {
        updateIntervalMs: parseInt(process.env.PRICE_UPDATE_INTERVAL || '60000'), // 1 minute
        priceHistoryDays: parseInt(process.env.PRICE_HISTORY_DAYS || '30'),
        volatilityThreshold: parseFloat(process.env.VOLATILITY_THRESHOLD || '0.2'),
        volumeSpikeThreshold: parseFloat(process.env.VOLUME_SPIKE_THRESHOLD || '3'),
        significantPriceChangeThreshold: parseFloat(process.env.PRICE_CHANGE_THRESHOLD || '10'),
      },
      healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000'), // 1 minute
      alertRetentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '7'),
    };

    this.marketplaceService = new MarketplaceService(
      serviceConfig,
      this.redisClient,
      logger
    );
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'marketplace-monitor',
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    const marketplaceRouter = createMarketplaceRouter({
      marketplaceService: this.marketplaceService,
      logger,
    });
    
    this.app.use('/api', marketplaceRouter);

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

  private setupWebSocket(): void {
    this.server = http.createServer(this.app);
    
    this.wss = new WebSocket.Server({ 
      server: this.server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      logger.info('WebSocket connection established', {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to FastBreak Marketplace Monitor',
        timestamp: new Date(),
      }));

      // Handle client messages
      ws.on('message', (message: WebSocket.Data) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
            timestamp: new Date(),
          }));
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });

    // Setup marketplace service event listeners for WebSocket broadcasting
    this.setupWebSocketEventListeners();
  }

  private handleWebSocketMessage(ws: WebSocket, data: any): void {
    switch (data.type) {
      case 'subscribe':
        // Handle channel subscription
        logger.info('WebSocket subscription request:', data);
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: data.channel,
          timestamp: new Date(),
        }));
        break;

      case 'unsubscribe':
        // Handle channel unsubscription
        logger.info('WebSocket unsubscription request:', data);
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          channel: data.channel,
          timestamp: new Date(),
        }));
        break;

      case 'ping':
        // Handle ping
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date(),
        }));
        break;

      default:
        logger.warn('Unknown WebSocket message type:', data.type);
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${data.type}`,
          timestamp: new Date(),
        }));
    }
  }

  private setupWebSocketEventListeners(): void {
    // Arbitrage opportunities
    this.marketplaceService.on('arbitrageOpportunity', (opportunity) => {
      this.broadcastToWebSocket({
        type: 'arbitrage_opportunity',
        data: opportunity,
        timestamp: new Date(),
      });
    });

    // Price changes
    this.marketplaceService.on('significantPriceChange', (priceChange) => {
      this.broadcastToWebSocket({
        type: 'price_change',
        data: priceChange,
        timestamp: new Date(),
      });
    });

    // Volume spikes
    this.marketplaceService.on('volumeSpike', (volumeSpike) => {
      this.broadcastToWebSocket({
        type: 'volume_spike',
        data: volumeSpike,
        timestamp: new Date(),
      });
    });

    // Alerts
    this.marketplaceService.on('alertCreated', (alert) => {
      this.broadcastToWebSocket({
        type: 'alert',
        data: alert,
        timestamp: new Date(),
      });
    });

    // Price alerts
    this.marketplaceService.on('priceAlertTriggered', (alert) => {
      this.broadcastToWebSocket({
        type: 'price_alert_triggered',
        data: alert,
        timestamp: new Date(),
      });
    });
  }

  private broadcastToWebSocket(message: any): void {
    const messageStr = JSON.stringify(message);
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize Redis
      await this.initializeRedis();
      logger.info('Redis initialized');

      // Initialize marketplace service
      this.initializeMarketplaceService();
      logger.info('Marketplace service initialized');

      // Setup routes
      this.setupRoutes();
      logger.info('Routes configured');

      // Setup WebSocket
      this.setupWebSocket();
      logger.info('WebSocket server configured');

      // Start marketplace service
      await this.marketplaceService.start();
      logger.info('Marketplace service started');

      // Start HTTP server
      this.server.listen(this.port, () => {
        logger.info(`Marketplace monitor service running on port ${this.port}`);
        logger.info(`WebSocket server available at ws://localhost:${this.port}/ws`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

    } catch (error) {
      logger.error('Failed to start marketplace monitor service:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Shutting down marketplace monitor service...');

      // Stop marketplace service
      if (this.marketplaceService) {
        await this.marketplaceService.stop();
      }

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close HTTP server
      if (this.server) {
        this.server.close();
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      logger.info('Marketplace monitor service shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new MarketplaceMonitorApp();

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