import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        walletAddress: string;
      };
    }
  }
}

/**
 * Middleware to authenticate user using JWT token
 */
export function authenticateUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Authorization header is required'
      });
      return;
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'JWT token is required'
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
      return;
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    if (!decoded.id || !decoded.walletAddress) {
      res.status(401).json({
        success: false,
        error: 'Invalid token payload'
      });
      return;
    }

    // Add user information to request object
    req.user = {
      id: decoded.id,
      walletAddress: decoded.walletAddress
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        error: 'Invalid JWT token'
      });
      return;
    }
    
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'JWT token has expired'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Middleware to authenticate service-to-service requests
 */
export function authenticateService(req: Request, res: Response, next: NextFunction): void {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key is required for service requests'
      });
      return;
    }

    const validApiKey = process.env.SERVICE_API_KEY;
    if (!validApiKey) {
      console.error('SERVICE_API_KEY environment variable is not set');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
      return;
    }

    if (apiKey !== validApiKey) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Service authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Service authentication failed'
    });
  }
}

/**
 * Middleware that allows either user or service authentication
 */
export function authenticateUserOrService(req: Request, res: Response, next: NextFunction): void {
  const hasAuthHeader = req.headers.authorization;
  const hasApiKey = req.headers['x-api-key'];

  if (hasAuthHeader) {
    // Try user authentication
    authenticateUser(req, res, next);
  } else if (hasApiKey) {
    // Try service authentication
    authenticateService(req, res, next);
  } else {
    res.status(401).json({
      success: false,
      error: 'Either JWT token or API key is required'
    });
  }
}

/**
 * Middleware to check if user owns the resource (based on userId parameter)
 */
export function authorizeResourceOwner(req: Request, res: Response, next: NextFunction): void {
  try {
    const resourceUserId = req.params.userId || req.body.userId;
    const authenticatedUserId = req.user?.id;

    if (!authenticatedUserId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    if (!resourceUserId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
      return;
    }

    if (resourceUserId !== authenticatedUserId) {
      res.status(403).json({
        success: false,
        error: 'Access denied: You can only access your own resources'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({
      success: false,
      error: 'Authorization failed'
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no auth provided
 */
export function optionalAuthentication(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No authentication provided, continue without user info
      next();
      return;
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      // Configuration error, but don't fail the request
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      if (decoded.id && decoded.walletAddress) {
        req.user = {
          id: decoded.id,
          walletAddress: decoded.walletAddress
        };
      }
    } catch (jwtError) {
      // Invalid token, but don't fail the request
      console.warn('Optional authentication failed:', jwtError.message);
    }

    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    // Don't fail the request for optional authentication
    next();
  }
}