import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, optionalAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// Get leaderboard rankings (public with optional auth)
router.get('/', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { 
    limit = 50, 
    offset = 0, 
    timeframe = '30d', 
    category = 'total_return' 
  } = req.query;
  
  const response = await serviceProxy.get('user-service', '/leaderboard', {
    params: {
      limit,
      offset,
      timeframe,
      category,
      userId: req.user?.id, // Optional for highlighting current user
    },
  });
  
  res.json(response);
}));

// Get user's leaderboard position (authenticated)
router.get('/my-position', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d', category = 'total_return' } = req.query;
  
  const response = await serviceProxy.get('user-service', '/leaderboard/position', {
    params: {
      userId: req.user!.id,
      timeframe,
      category,
    },
  });
  
  res.json(response);
}));

// Get leaderboard categories (public)
router.get('/categories', asyncHandler(async (req, res) => {
  const response = await serviceProxy.get('user-service', '/leaderboard/categories');
  res.json(response);
}));

// Opt in/out of leaderboard (authenticated)
router.post('/participation', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { participate } = req.body;
  
  const response = await serviceProxy.post('user-service', '/leaderboard/participation', {
    userId: req.user!.id,
    participate,
  });
  
  res.json(response);
}));

// Get leaderboard statistics (public)
router.get('/stats', asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('user-service', '/leaderboard/stats', {
    params: {
      timeframe,
    },
  });
  
  res.json(response);
}));

export { router as leaderboardRoutes };