import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { createErrorResponse } from '@fastbreak/shared';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    walletAddress: string;
    iat?: number;
    exp?: number;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Authentication failed: No token provided', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(401).json(createErrorResponse('Access token required'));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET not configured');
    return res.status(500).json(createErrorResponse('Server configuration error'));
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      logger.warn('Authentication failed: Invalid token', {
        ip: req.ip,
        path: req.path,
        error: err.message,
        userAgent: req.get('User-Agent'),
      });
      
      return res.status(403).json(createErrorResponse('Invalid or expired token'));
    }

    req.user = decoded as AuthenticatedRequest['user'];
    
    logger.debug('User authenticated successfully', {
      userId: req.user?.userId,
      walletAddress: req.user?.walletAddress,
      path: req.path,
    });
    
    next();
  });
};

export const optionalAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // Continue without authentication
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET not configured');
    return next(); // Continue without authentication rather than failing
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (!err && decoded) {
      req.user = decoded as AuthenticatedRequest['user'];
      logger.debug('Optional authentication successful', {
        userId: req.user?.userId,
        path: req.path,
      });
    }
    next(); // Continue regardless of token validity
  });
};