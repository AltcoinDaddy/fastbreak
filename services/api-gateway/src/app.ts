import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

import { logger } from './utils/logger';
import { setupRoutes } from './routes';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { monitoringMiddleware } from './middleware/monitoring';

// Import new comprehensive error handling system
import {
  correlationIdMiddleware,
  requestLoggingMiddleware,
  userContextMiddleware,
  errorHandlingMiddleware,
  securityHeadersMiddleware,
  notFoundMiddleware,
  createLogger,
  ErrorMonitor,
  HealthChecker
} from '@fastbreak/shared';

// Load environment variables
dotenv.config();

const app = express();

// Initialize comprehensive error handling system
const fastBreakLogger = createLogger('api-gateway', {
  level: process.env.LOG_LEVEL || 'info',
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  filename: 'logs/api-gateway.log'
});

const errorMonitor = new ErrorMonitor({
  enabled: process.env.NODE_ENV === 'production',
  channels: ['dashboard', 'webhook'],
  threshold: {
    errorRate: 10, // 10 errors per minute
    criticalErrors: 1
  },
  cooldown: 5 // 5 minutes between similar alerts
}, fastBreakLogger);

const healthChecker = new HealthChecker(fastBreakLogger);

// Core middleware setup
app.use(correlationIdMiddleware());
app.use(securityHeadersMiddleware());
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// User context and request logging
app.use(userContextMiddleware());
app.use(requestLoggingMiddleware(fastBreakLogger));

// Legacy logging middleware (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim())
    }
  }));
}

// Rate limiting
app.use(rateLimitMiddleware);

// Request monitoring
app.use(monitoringMiddleware);

// Health check endpoint (before other routes)
app.get('/health', async (req, res, next) => {
  try {
    const health = await healthChecker.checkHealth('api-gateway');
    res.json(health);
  } catch (error) {
    next(error);
  }
});

// Setup API routes
setupRoutes(app);

// 404 handler for unknown routes
app.use(notFoundMiddleware());

// Comprehensive error handling middleware (must be last)
app.use(errorHandlingMiddleware(fastBreakLogger, errorMonitor));

export default app;// Exp
ort instances for use in other modules
export { fastBreakLogger, errorMonitor, healthChecker };