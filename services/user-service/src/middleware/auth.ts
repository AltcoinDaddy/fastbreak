import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../auth/auth-service';
import { User } from '@fastbreak/types';
import { createErrorResponse } from '@fastbreak/shared';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  public authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        res.status(401).json(createErrorResponse('Authorization header required'));
        return;
      }

      const token = this.extractToken(authHeader);
      if (!token) {
        res.status(401).json(createErrorResponse('Invalid authorization format'));
        return;
      }

      const user = await this.authService.verifyToken(token);
      req.user = user;
      
      next();
    } catch (error) {
      res.status(401).json(createErrorResponse(`Authentication failed: ${error}`));
    }
  };

  public optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader) {
        const token = this.extractToken(authHeader);
        if (token) {
          try {
            const user = await this.authService.verifyToken(token);
            req.user = user;
          } catch (error) {
            // Ignore authentication errors for optional auth
            console.warn('Optional authentication failed:', error);
          }
        }
      }
      
      next();
    } catch (error) {
      // Continue without authentication for optional auth
      next();
    }
  };

  public requireWalletConnection = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(createErrorResponse('Wallet connection required'));
      return;
    }

    if (!req.user.walletAddress) {
      res.status(400).json(createErrorResponse('Wallet address not found'));
      return;
    }

    next();
  };

  public requireActiveStrategies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json(createErrorResponse('Authentication required'));
      return;
    }

    const activeStrategies = req.user.strategies.filter(s => s.isActive);
    if (activeStrategies.length === 0) {
      res.status(400).json(createErrorResponse('At least one active strategy required'));
      return;
    }

    next();
  };

  private extractToken(authHeader: string): string | null {
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}

// Rate limiting middleware
import { RateLimiterMemory } from 'rate-limiter-flexible';

export class RateLimitMiddleware {
  private authLimiter: RateLimiterMemory;
  private apiLimiter: RateLimiterMemory;

  constructor() {
    // Auth endpoints: 5 attempts per 15 minutes
    this.authLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => req.ip,
      points: 5,
      duration: 900, // 15 minutes
    });

    // API endpoints: 100 requests per minute
    this.apiLimiter = new RateLimiterMemory({
      keyGenerator: (req: Request) => req.user?.id || req.ip,
      points: 100,
      duration: 60, // 1 minute
    });
  }

  public authRateLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authLimiter.consume(req.ip);
      next();
    } catch (rejRes) {
      const remainingPoints = rejRes.remainingPoints || 0;
      const msBeforeNext = rejRes.msBeforeNext || 0;
      
      res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
      res.status(429).json(createErrorResponse('Too many authentication attempts'));
    }
  };

  public apiRateLimit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.user?.id || req.ip;
      await this.apiLimiter.consume(key);
      next();
    } catch (rejRes) {
      const remainingPoints = rejRes.remainingPoints || 0;
      const msBeforeNext = rejRes.msBeforeNext || 0;
      
      res.set('Retry-After', Math.round(msBeforeNext / 1000).toString());
      res.status(429).json(createErrorResponse('Rate limit exceeded'));
    }
  };
}