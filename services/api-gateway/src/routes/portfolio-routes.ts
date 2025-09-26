import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// Get portfolio overview (authenticated)
router.get('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('trading-service', '/portfolio', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get portfolio holdings (authenticated)
router.get('/holdings', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, sortBy = 'value', sortOrder = 'desc' } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/portfolio/holdings', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      sortBy,
      sortOrder,
    },
  });
  
  res.json(response);
}));

// Get portfolio performance (authenticated)
router.get('/performance', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/portfolio/performance', {
    params: {
      userId: req.user!.id,
      timeframe,
    },
  });
  
  res.json(response);
}));

// Get portfolio analytics (authenticated)
router.get('/analytics', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/portfolio/analytics', {
    params: {
      userId: req.user!.id,
      timeframe,
    },
  });
  
  res.json(response);
}));

// Get portfolio diversification (authenticated)
router.get('/diversification', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('trading-service', '/portfolio/diversification', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get portfolio value history (authenticated)
router.get('/value-history', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d', interval = 'daily' } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/portfolio/value-history', {
    params: {
      userId: req.user!.id,
      timeframe,
      interval,
    },
  });
  
  res.json(response);
}));

// Get portfolio risk metrics (authenticated)
router.get('/risk', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('risk-management', '/portfolio/risk', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Rebalance portfolio (authenticated)
router.post('/rebalance', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.post('trading-service', '/portfolio/rebalance', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get rebalancing suggestions (authenticated)
router.get('/rebalance/suggestions', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('trading-service', '/portfolio/rebalance/suggestions', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

export { router as portfolioRoutes };