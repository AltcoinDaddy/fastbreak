import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult, ValidationChain } from 'express-validator';
import { logger } from '../utils/logger';
import { createErrorResponse } from '@fastbreak/shared';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

/**
 * Enhanced input validation and sanitization middleware
 * Provides comprehensive protection against injection attacks and malformed data
 */

// Custom sanitization functions
export const sanitizeInput = (value: string): string => {
  if (typeof value !== 'string') return value;
  
  // Remove HTML tags and scripts
  let sanitized = DOMPurify.sanitize(value, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [] 
  });
  
  // Additional sanitization
  sanitized = validator.escape(sanitized);
  sanitized = sanitized.trim();
  
  return sanitized;
};

export const sanitizeNumeric = (value: any): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }
  return null;
};

export const sanitizeBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
};

// Validation chains for common data types
export const walletAddressValidation = (): ValidationChain => 
  body('walletAddress')
    .isLength({ min: 16, max: 18 })
    .matches(/^0x[a-fA-F0-9]{16}$/)
    .withMessage('Invalid Flow wallet address format');

export const momentIdValidation = (): ValidationChain =>
  param('momentId')
    .isNumeric()
    .isInt({ min: 1 })
    .withMessage('Moment ID must be a positive integer');

export const priceValidation = (field: string = 'price'): ValidationChain =>
  body(field)
    .isFloat({ min: 0.01, max: 1000000 })
    .withMessage(`${field} must be between 0.01 and 1,000,000`);

export const strategyTypeValidation = (): ValidationChain =>
  body('type')
    .isIn(['rookie_risers', 'post_game_spikes', 'arbitrage_mode'])
    .withMessage('Invalid strategy type');

export const budgetLimitValidation = (): ValidationChain =>
  body('dailySpendingCap')
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Daily spending cap must be between $1 and $100,000');

// Comprehensive request sanitization middleware
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    logger.error('Request sanitization failed', { error, path: req.path });
    res.status(400).json(createErrorResponse('Invalid request format'));
  }
};

const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitizeInput(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }
  
  return obj;
};

// Validation result handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined
    }));
    
    logger.warn('Input validation failed', {
      path: req.path,
      method: req.method,
      errors: errorDetails,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorDetails,
      timestamp: new Date().toISOString()
    });
  }
  
  next();
};

// SQL injection prevention for database queries
export const preventSQLInjection = (input: string): string => {
  if (typeof input !== 'string') return input;
  
  // Remove common SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|;|'|"|`)/g,
    /(\bOR\b|\bAND\b).*?[=<>]/gi
  ];
  
  let cleaned = input;
  sqlPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  return cleaned.trim();
};

// XSS prevention for user-generated content
export const preventXSS = (input: string): string => {
  if (typeof input !== 'string') return input;
  
  // Use DOMPurify for comprehensive XSS protection
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
};

// File upload validation
export const validateFileUpload = (allowedTypes: string[], maxSize: number = 5 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) return next();
    
    // Check file type
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json(createErrorResponse(
        `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
      ));
    }
    
    // Check file size
    if (req.file.size > maxSize) {
      return res.status(400).json(createErrorResponse(
        `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`
      ));
    }
    
    next();
  };
};

// Rate limiting for specific endpoints
export const createEndpointRateLimit = (windowMs: number, max: number, message: string) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn(`Endpoint rate limit exceeded`, {
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    }
  });
};