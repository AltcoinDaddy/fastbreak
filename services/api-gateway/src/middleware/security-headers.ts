import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from '../utils/logger';

/**
 * Enhanced security headers middleware
 * Implements comprehensive security headers for protection against various attacks
 */

// Content Security Policy configuration
const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'", // Required for Flow FCL
      "https://fcl-discovery.onflow.org",
      "https://flow-wallet.blocto.app",
      "https://lilico.app",
      "https://accounts.meetdapper.com"
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for Tailwind CSS
      "https://fonts.googleapis.com"
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "https:",
      "https://assets.nbatopshot.com",
      "https://ipfs.io"
    ],
    connectSrc: [
      "'self'",
      "https://mainnet.onflow.org",
      "https://testnet.onflow.org",
      "https://access-mainnet-beta.onflow.org",
      "https://access-testnet.onflow.org",
      "https://fcl-discovery.onflow.org",
      "wss://localhost:*",
      "ws://localhost:*"
    ],
    frameSrc: [
      "'self'",
      "https://fcl-discovery.onflow.org",
      "https://flow-wallet.blocto.app",
      "https://lilico.app"
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    childSrc: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
  },
  reportOnly: process.env.NODE_ENV === 'development'
};

// Helmet configuration with enhanced security
export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: cspConfig,
  
  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // X-Frame-Options
  frameguard: {
    action: 'deny'
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-XSS-Protection
  xssFilter: true,
  
  // Referrer Policy
  referrerPolicy: {
    policy: ['strict-origin-when-cross-origin']
  },
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
  
  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: false
  },
  
  // Expect-CT
  expectCt: {
    maxAge: 86400, // 24 hours
    enforce: process.env.NODE_ENV === 'production'
  },
  
  // Feature Policy / Permissions Policy
  permissionsPolicy: {
    features: {
      camera: ['none'],
      microphone: ['none'],
      geolocation: ['none'],
      payment: ['self'],
      usb: ['none'],
      magnetometer: ['none'],
      gyroscope: ['none'],
      accelerometer: ['none']
    }
  }
});

// CORS configuration with enhanced security
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://fastbreak.app',
      'https://www.fastbreak.app',
      'https://app.fastbreak.io'
    ];
    
    // Add development origins in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
      );
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  credentials: true,
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Correlation-ID',
    'X-User-Agent',
    'X-Forwarded-For'
  ],
  
  exposedHeaders: [
    'X-Correlation-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  
  maxAge: 86400, // 24 hours
  
  optionsSuccessStatus: 200
};

// Additional security middleware
export const additionalSecurityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  // Add custom security headers
  res.setHeader('X-API-Version', '1.0');
  res.setHeader('X-Request-ID', req.headers['x-correlation-id'] || 'unknown');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (HTTPS only)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Content Type Options
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature Policy
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  
  next();
};

// Security audit logging middleware
export const securityAuditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const securityHeaders = {
    userAgent: req.get('User-Agent'),
    origin: req.get('Origin'),
    referer: req.get('Referer'),
    xForwardedFor: req.get('X-Forwarded-For'),
    xRealIp: req.get('X-Real-IP'),
    authorization: req.get('Authorization') ? 'present' : 'absent'
  };
  
  // Log suspicious patterns
  const suspiciousPatterns = [
    /script/i,
    /javascript/i,
    /vbscript/i,
    /onload/i,
    /onerror/i,
    /eval\(/i,
    /expression\(/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];
  
  const requestData = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query,
    params: req.params
  });
  
  const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
    pattern.test(requestData) || pattern.test(req.get('User-Agent') || '')
  );
  
  if (hasSuspiciousContent) {
    logger.warn('Suspicious request detected', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      headers: securityHeaders,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};