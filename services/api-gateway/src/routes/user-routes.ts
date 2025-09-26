import { Router, Request, Response } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, optionalAuth, AuthenticatedRequest } from '../middleware/auth';
import { authRateLimitMiddleware } from '../middleware/rate-limit';
import { asyncHandler } from '../middleware/error-handler';
import { createSuccessResponse, createErrorResponse } from '@fastbreak/shared';
import { logger } from '../utils/logger';

const router = Router();

// User registration (public)
router.post('/register', authRateLimitMiddleware, asyncHandler(async (req: Request, res: Response) => {
  logger.info('User registration attempt', {
    walletAddress: req.body.walletAddress,
    ip: req.ip,
  });

  const response = await serviceProxy.post('user-service', '/users/register', req.body);
  res.status(201).json(response);
}));

// User login (public)
router.post('/login', authRateLimitMiddleware, asyncHandler(async (req: Request, res: Response) => {
  logger.info('User login attempt', {
    walletAddress: req.body.walletAddress,
    ip: req.ip,
  });

  const response = await serviceProxy.post('user-service', '/users/login', req.body);
  res.json(response);
}));

// Get user profile (authenticated)
router.get('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.get('user-service', `/users/${req.user!.id}`);
  res.json(response);
}));

// Update user profile (authenticated)
router.put('/profile', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.put('user-service', `/users/${req.user!.id}`, req.body);
  res.json(response);
}));

// Get user settings (authenticated)
router.get('/settings', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.get('user-service', `/users/${req.user!.id}/settings`);
  res.json(response);
}));

// Update user settings (authenticated)
router.put('/settings', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.put('user-service', `/users/${req.user!.id}/settings`, req.body);
  res.json(response);
}));

// Get user budget limits (authenticated)
router.get('/budget', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.get('user-service', `/users/${req.user!.id}/budget`);
  res.json(response);
}));

// Update user budget limits (authenticated)
router.put('/budget', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  logger.info('Budget limits update', {
    userId: req.user!.id,
    limits: req.body,
  });

  const response = await serviceProxy.put('user-service', `/users/${req.user!.id}/budget`, req.body);
  res.json(response);
}));

// Get notification preferences (authenticated)
router.get('/notifications/preferences', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.get('user-service', `/users/${req.user!.id}/notifications`);
  res.json(response);
}));

// Update notification preferences (authenticated)
router.put('/notifications/preferences', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.put('user-service', `/users/${req.user!.id}/notifications`, req.body);
  res.json(response);
}));

// Refresh token (authenticated)
router.post('/refresh', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const response = await serviceProxy.post('user-service', '/users/refresh', {
    userId: req.user!.id,
  });
  res.json(response);
}));

// Logout (authenticated)
router.post('/logout', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  logger.info('User logout', {
    userId: req.user!.id,
  });

  const response = await serviceProxy.post('user-service', '/users/logout', {
    userId: req.user!.id,
  });
  res.json(response);
}));

export { router as userRoutes };