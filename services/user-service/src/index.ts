import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';
import { DatabaseManager } from '@fastbreak/database';
import { AuthService } from './auth/auth-service';
import { AuthRoutes } from './routes/auth';

// Load environment variables
config();

class UserServiceApp {
  private app: express.Application;
  private db: DatabaseManager;
  private authService: AuthService;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.USER_SERVICE_PORT || '8004');
    this.setupDatabase();
    this.setupMiddleware();
    this.setupServices();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupDatabase(): void {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    this.db = new DatabaseManager(databaseUrl);
  }

  private setupMiddleware(): void {
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

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupServices(): void {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const flowNetwork = process.env.FLOW_NETWORK || 'emulator';
    const accessNode = process.env.FLOW_EMULATOR_URL || 'http://localhost:8080';

    this.authService = new AuthService(this.db, jwtSecret, flowNetwork, accessNode);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'user-service',
        timestamp: new Date().toISOString(),
      });
    });

    // API routes
    const authRoutes = new AuthRoutes(this.authService);
    this.app.use('/api', authRoutes.getRouter());

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date(),
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', error);
      
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message,
        timestamp: new Date(),
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', this.shutdown.bind(this));
    process.on('SIGINT', this.shutdown.bind(this));
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.db.initialize();
      console.log('Database initialized successfully');

      // Start server
      this.app.listen(this.port, () => {
        console.log(`User service running on port ${this.port}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Flow Network: ${process.env.FLOW_NETWORK || 'emulator'}`);
      });
    } catch (error) {
      console.error('Failed to start user service:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    console.log('Shutting down user service...');
    
    try {
      await this.db.close();
      console.log('Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the service
const app = new UserServiceApp();
app.start().catch(console.error);