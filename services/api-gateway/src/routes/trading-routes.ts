import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();

// Execute manual trade (authenticated)
router.post('/execute', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logger.info('Manual trade execution requested', {
    userId: req.user!.id,
    momentId: req.body.momentId,
    action: req.body.action,
    price: req.body.price,
  });

  // First check with risk management service
  const riskCheck = await serviceProxy.post('risk-management', '/validate-trade', {
    ...req.body,
    userId: req.user!.id,
  });

  if (!riskCheck.approved) {
    return res.status(400).json({
      success: false,
      error: riskCheck.reason || 'Trade rejected by risk management',
      timestamp: new Date(),
    });
  }

  const response = await serviceProxy.post('trading-service', '/trades/execute', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get trade history (authenticated)
router.get('/history', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, status, action, startDate, endDate } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/trades/history', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      status,
      action,
      startDate,
      endDate,
    },
  });
  
  res.json(response);
}));

// Get specific trade details (authenticated)
router.get('/:tradeId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { tradeId } = req.params;
  
  const response = await serviceProxy.get('trading-service', `/trades/${tradeId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Cancel pending trade (authenticated)
router.post('/:tradeId/cancel', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { tradeId } = req.params;
  
  logger.info('Trade cancellation requested', {
    userId: req.user!.id,
    tradeId,
  });

  const response = await serviceProxy.post('trading-service', `/trades/${tradeId}/cancel`, {
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get pending trades (authenticated)
router.get('/status/pending', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('trading-service', '/trades/pending', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get trade performance metrics (authenticated)
router.get('/performance/metrics', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('trading-service', '/trades/performance', {
    params: {
      userId: req.user!.id,
      timeframe,
    },
  });
  
  res.json(response);
}));

// Get automated trading status (authenticated)
router.get('/automation/status', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('trading-service', '/automation/status', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Enable/disable automated trading (authenticated)
router.post('/automation/toggle', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { enabled } = req.body;
  
  logger.info('Automated trading toggle', {
    userId: req.user!.id,
    enabled,
  });

  const response = await serviceProxy.post('trading-service', '/automation/toggle', {
    userId: req.user!.id,
    enabled,
  });
  
  res.json(response);
}));

// Get trade simulation results (authenticated)
router.post('/simulate', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.post('trading-service', '/trades/simulate', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get transaction status on blockchain (authenticated)
router.get('/:tradeId/transaction', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { tradeId } = req.params;
  
  const response = await serviceProxy.get('trading-service', `/trades/${tradeId}/transaction`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

export { router as tradingRoutes };