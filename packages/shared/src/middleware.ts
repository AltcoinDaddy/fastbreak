import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { FastBreakAppError, createError, ErrorCodes } from './errors';
import { FastBreakLogger, CorrelationContext } from './logger';
import { ErrorMonitor } from './monitoring';

/**
 * Extended Request interface with correlation ID and user context
 */
export interface FastBreakRequest extends Request {
  correlationId: string;
  userId?: string;
  startTime: number;
}

/**
 * Correlation ID middleware - adds unique ID to each request
 */
export function correlationIdMiddleware() {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    req.correlationId = correlationId;
    req.startTime = Date.now();
    
    // Set correlation ID in context
    CorrelationContext.set('default', correlationId);
    
    // Add correlation ID to response headers
    res.setHeader('x-correlation-id', correlationId);
    
    next();
  };
}

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware(logger: FastBreakLogger) {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    logger.info('Request started', {
      correlationId: req.correlationId,
      userId: req.userId,
      metadata: {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - req.startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level]('Request completed', {
        correlationId: req.correlationId,
        userId: req.userId,
        metadata: {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('content-length')
        }
      });
    });

    next();
  };
}

/**
 * User context middleware - extracts user ID from JWT token
 */
export function userContextMiddleware() {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // In a real implementation, you would verify and decode the JWT
        // For now, we'll extract from a mock payload
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        req.userId = payload.userId;
      }
    } catch (error) {
      // Invalid token format, but don't fail the request
      // The authentication middleware will handle this
    }
    
    next();
  };
}

/**
 * Error handling middleware - converts all errors to FastBreakAppError format
 */
export function errorHandlingMiddleware(
  logger: FastBreakLogger,
  errorMonitor?: ErrorMonitor
) {
  return (error: Error, req: FastBreakRequest, res: Response, next: NextFunction): void => {
    let fastBreakError: FastBreakAppError;

    if (error instanceof FastBreakAppError) {
      fastBreakError = error;
    } else {
      // Convert unknown errors to FastBreakAppError
      fastBreakError = createError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        {
          correlationId: req.correlationId,
          userId: req.userId,
          service: 'api-gateway',
          operation: `${req.method} ${req.path}`
        },
        {
          originalError: error,
          severity: 'high',
          metadata: {
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent']
          }
        }
      );
    }

    // Log the error
    logger.error('Request failed with error', {
      correlationId: req.correlationId,
      userId: req.userId,
      operation: `${req.method} ${req.path}`,
      error: fastBreakError,
      metadata: {
        method: req.method,
        url: req.url,
        statusCode: getStatusCodeFromError(fastBreakError)
      }
    });

    // Record error in monitoring system
    if (errorMonitor) {
      errorMonitor.recordError(fastBreakError, {
        service: 'api-gateway',
        operation: `${req.method} ${req.path}`,
        userId: req.userId
      });
    }

    // Send error response
    const statusCode = getStatusCodeFromError(fastBreakError);
    res.status(statusCode).json({
      success: false,
      error: {
        code: fastBreakError.code,
        message: fastBreakError.userMessage,
        correlationId: req.correlationId,
        troubleshootingGuide: fastBreakError.troubleshootingGuide
      },
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * Async error wrapper - catches async errors and passes to error middleware
 */
export function asyncErrorHandler(
  fn: (req: FastBreakRequest, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation middleware factory
 */
export function validateRequest(schema: {
  body?: any;
  query?: any;
  params?: any;
}) {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    try {
      // In a real implementation, you would use a validation library like Joi or Yup
      // For now, we'll do basic validation
      
      if (schema.body && !req.body) {
        throw createError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          {
            correlationId: req.correlationId,
            userId: req.userId,
            service: 'api-gateway',
            operation: `${req.method} ${req.path}`
          },
          {
            severity: 'low',
            metadata: { field: 'body' }
          }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware(options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: FastBreakRequest) => string;
}) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator ? options.keyGenerator(req) : (req.ip || 'unknown');
    const now = Date.now();
    const windowStart = now - options.windowMs;

    // Clean up old entries
    for (const [k, v] of requests.entries()) {
      if (v.resetTime < windowStart) {
        requests.delete(k);
      }
    }

    const requestData = requests.get(key) || { count: 0, resetTime: now + options.windowMs };
    
    if (requestData.resetTime < now) {
      // Reset window
      requestData.count = 0;
      requestData.resetTime = now + options.windowMs;
    }

    requestData.count++;
    requests.set(key, requestData);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - requestData.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(requestData.resetTime / 1000));

    if (requestData.count > options.maxRequests) {
      const error = createError(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        {
          correlationId: req.correlationId,
          userId: req.userId,
          service: 'api-gateway',
          operation: `${req.method} ${req.path}`
        },
        {
          severity: 'low',
          retryable: true,
          metadata: {
            limit: options.maxRequests,
            windowMs: options.windowMs,
            resetTime: requestData.resetTime
          }
        }
      );
      
      throw error;
    }

    next();
  };
}

/**
 * Health check middleware
 */
export function healthCheckMiddleware(healthChecker: any) {
  return async (req: FastBreakRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await healthChecker.checkHealth('api-gateway');
      res.json(health);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Security headers middleware
 */
export function securityHeadersMiddleware() {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  };
}

/**
 * Map FastBreakAppError to HTTP status code
 */
function getStatusCodeFromError(error: FastBreakAppError): number {
  switch (error.category) {
    case 'validation':
      return 400;
    case 'authentication':
      return 401;
    case 'authorization':
      return 403;
    case 'business_logic':
      return 422;
    case 'external_api':
      return 502;
    case 'network':
      return 503;
    default:
      return 500;
  }
}

/**
 * Not found middleware - handles 404 errors
 */
export function notFoundMiddleware() {
  return (req: FastBreakRequest, res: Response, next: NextFunction): void => {
    const error = createError(
      'ROUTE_NOT_FOUND',
      {
        correlationId: req.correlationId,
        userId: req.userId,
        service: 'api-gateway',
        operation: `${req.method} ${req.path}`
      },
      {
        severity: 'low',
        metadata: {
          method: req.method,
          url: req.url
        }
      }
    );
    
    next(error);
  };
}