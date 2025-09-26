import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, optionalAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();

// Get marketplace opportunities (authenticated)
router.get('/opportunities', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, type, minProfit } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', '/opportunities', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      type,
      minProfit,
    },
  });
  
  res.json(response);
}));

// Get moment price history (public with optional auth)
router.get('/moments/:momentId/price-history', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { momentId } = req.params;
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', `/moments/${momentId}/price-history`, {
    params: {
      timeframe,
      userId: req.user?.id,
    },
  });
  
  res.json(response);
}));

// Get current market data for moment (public with optional auth)
router.get('/moments/:momentId/market-data', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { momentId } = req.params;
  
  const response = await serviceProxy.get('marketplace-monitor', `/moments/${momentId}/market-data`, {
    params: {
      userId: req.user?.id,
    },
  });
  
  res.json(response);
}));

// Get arbitrage opportunities (authenticated)
router.get('/arbitrage', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 10, minProfitMargin = 5 } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', '/arbitrage', {
    params: {
      userId: req.user!.id,
      limit,
      minProfitMargin,
    },
  });
  
  res.json(response);
}));

// Get market statistics (public with optional auth)
router.get('/stats', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '24h' } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', '/stats', {
    params: {
      timeframe,
      userId: req.user?.id,
    },
  });
  
  res.json(response);
}));

// Get trending moments (public with optional auth)
router.get('/trending', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, category, timeframe = '24h' } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', '/trending', {
    params: {
      limit,
      category,
      timeframe,
      userId: req.user?.id,
    },
  });
  
  res.json(response);
}));

// Search moments (public with optional auth)
router.get('/search', optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { 
    q, 
    limit = 20, 
    offset = 0, 
    minPrice, 
    maxPrice, 
    playerName, 
    team,
    momentType 
  } = req.query;
  
  const response = await serviceProxy.get('marketplace-monitor', '/search', {
    params: {
      q,
      limit,
      offset,
      minPrice,
      maxPrice,
      playerName,
      team,
      momentType,
      userId: req.user?.id,
    },
  });
  
  res.json(response);
}));

// Get price alerts for user (authenticated)
router.get('/alerts', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('marketplace-monitor', '/alerts', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Create price alert (authenticated)
router.post('/alerts', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logger.info('Price alert created', {
    userId: req.user!.id,
    momentId: req.body.momentId,
    targetPrice: req.body.targetPrice,
  });

  const response = await serviceProxy.post('marketplace-monitor', '/alerts', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.status(201).json(response);
}));

// Update price alert (authenticated)
router.put('/alerts/:alertId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { alertId } = req.params;
  
  const response = await serviceProxy.put('marketplace-monitor', `/alerts/${alertId}`, {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Delete price alert (authenticated)
router.delete('/alerts/:alertId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { alertId } = req.params;
  
  const response = await serviceProxy.delete('marketplace-monitor', `/alerts/${alertId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

export { router as marketplaceRoutes };