import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import ExpressBrute from 'express-brute';
import { logger } from '../utils/logger';
import { createErrorResponse } from '@fastbreak/shared';

/**
 * Comprehensive DDoS protection and abuse prevention middleware
 */

// Memory store for brute force protection (use Redis in production)
const store = new ExpressBrute.MemoryStore();

// Brute force protection for authentication endpoints
export const bruteForceProtection = new ExpressBrute(store, {
  freeRetries: 5,
  minWait: 5 * 60 * 1000, // 5 minutes
  maxWait: 60 * 60 * 1000, // 1 hour
  lifetime: 24 * 60 * 60, // 24 hours
  
  handleStoreError: (error) => {
    logger.error('Brute force store error', { error });
    throw error;
  },
  
  failCallback: (req: Request, res: Response, next: NextFunction, nextValidRequestDate: Date) => {
    logger.warn('Brute force attack detected', {
      ip: req.ip,
      path: req.path,
      nextValidRequestDate,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many failed attempts. Please try again later.',
      retryAfter: Math.ceil((nextValidRequestDate.getTime() - Date.now()) / 1000),
      timestamp: new Date().toISOString()
    });
  }
});

// Progressive delay for repeated requests
export const progressiveDelayMiddleware = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Allow 50 requests per windowMs without delay
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  
  skip: (req: Request) => {
    // Skip delay for health checks and static assets
    return req.path === '/health' || req.path.startsWith('/static');
  },
  
  onLimitReached: (req: Request, res: Response, options) => {
    logger.warn('Progressive delay limit reached', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
  }
});

// Strict rate limiting for API endpoints
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  
  message: {
    error: 'Too many requests from this IP address',
    retryAfter: 900
  },
  
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. Please slow down your requests.',
      retryAfter: 900,
      timestamp: new Date().toISOString()
    });
  },
  
  skip: (req: Request) => {
    return req.path === '/health';
  }
});

// Very strict rate limiting for sensitive endpoints
export const sensitiveEndpointRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Only 10 requests per hour for sensitive endpoints
  
  message: {
    error: 'Too many requests to sensitive endpoint',
    retryAfter: 3600
  },
  
  standardHeaders: true,
  legacyHeaders: false,
  
  handler: (req: Request, res: Response) => {
    logger.error('Sensitive endpoint rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many requests to sensitive endpoint. Please try again later.',
      retryAfter: 3600,
      timestamp: new Date().toISOString()
    });
  }
});

// Request size limiting middleware
export const requestSizeLimitMiddleware = (maxSize: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSize) {
      logger.warn('Request size limit exceeded', {
        ip: req.ip,
        path: req.path,
        contentLength,
        maxSize,
        userAgent: req.get('User-Agent')
      });
      
      return res.status(413).json(createErrorResponse(
        `Request too large. Maximum size: ${maxSize / (1024 * 1024)}MB`
      ));
    }
    
    next();
  };
};

// Connection limiting middleware
const activeConnections = new Map<string, number>();

export const connectionLimitMiddleware = (maxConnections: number = 100) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip;
    const currentConnections = activeConnections.get(clientIP) || 0;
    
    if (currentConnections >= maxConnections) {
      logger.warn('Connection limit exceeded', {
        ip: clientIP,
        currentConnections,
        maxConnections,
        path: req.path
      });
      
      return res.status(429).json(createErrorResponse(
        'Too many concurrent connections from this IP'
      ));
    }
    
    // Increment connection count
    activeConnections.set(clientIP, currentConnections + 1);
    
    // Decrement on response finish
    res.on('finish', () => {
      const connections = activeConnections.get(clientIP) || 1;
      if (connections <= 1) {
        activeConnections.delete(clientIP);
      } else {
        activeConnections.set(clientIP, connections - 1);
      }
    });
    
    next();
  };
};

// Suspicious activity detection middleware
export const suspiciousActivityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(\b(OR|AND)\b.*?[=<>])/gi,
    /(--|\/\*|\*\/|;)/g,
    
    // XSS patterns
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    
    // Path traversal patterns
    /\.\.\//g,
    /\.\.\\/g,
    
    // Command injection patterns
    /[;&|`$(){}[\]]/g
  ];
  
  const requestData = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query,
    params: req.params,
    headers: {
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer')
    }
  });
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
  
  if (isSuspicious) {
    logger.error('Suspicious activity detected - potential attack', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      timestamp: new Date().toISOString(),
      requestData: requestData.substring(0, 1000) // Limit log size
    });
    
    // Block the request
    return res.status(403).json(createErrorResponse(
      'Suspicious activity detected. Request blocked for security reasons.'
    ));
  }
  
  next();
};

// IP whitelist/blacklist middleware
const blacklistedIPs = new Set<string>();
const whitelistedIPs = new Set<string>([
  '127.0.0.1',
  '::1'
]);

export const ipFilterMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip;
  
  // Check blacklist
  if (blacklistedIPs.has(clientIP)) {
    logger.warn('Blocked request from blacklisted IP', {
      ip: clientIP,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json(createErrorResponse('Access denied'));
  }
  
  // Skip other checks for whitelisted IPs
  if (whitelistedIPs.has(clientIP)) {
    return next();
  }
  
  next();
};

// Functions to manage IP lists
export const addToBlacklist = (ip: string) => {
  blacklistedIPs.add(ip);
  logger.info('IP added to blacklist', { ip });
};

export const removeFromBlacklist = (ip: string) => {
  blacklistedIPs.delete(ip);
  logger.info('IP removed from blacklist', { ip });
};

export const addToWhitelist = (ip: string) => {
  whitelistedIPs.add(ip);
  logger.info('IP added to whitelist', { ip });
};

export const removeFromWhitelist = (ip: string) => {
  whitelistedIPs.delete(ip);
  logger.info('IP removed from whitelist', { ip });
};