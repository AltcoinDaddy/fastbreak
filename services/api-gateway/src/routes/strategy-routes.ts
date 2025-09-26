import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();

// Get user strategies (authenticated)
router.get('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('strategy-service', '/strategies', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Create new strategy (authenticated)
router.post('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logger.info('Strategy creation requested', {
    userId: req.user!.id,
    strategyType: req.body.type,
  });

  const response = await serviceProxy.post('strategy-service', '/strategies', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.status(201).json(response);
}));

// Get specific strategy (authenticated)
router.get('/:strategyId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  
  const response = await serviceProxy.get('strategy-service', `/strategies/${strategyId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Update strategy (authenticated)
router.put('/:strategyId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  
  logger.info('Strategy update requested', {
    userId: req.user!.id,
    strategyId,
  });

  const response = await serviceProxy.put('strategy-service', `/strategies/${strategyId}`, {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Delete strategy (authenticated)
router.delete('/:strategyId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  
  logger.info('Strategy deletion requested', {
    userId: req.user!.id,
    strategyId,
  });

  const response = await serviceProxy.delete('strategy-service', `/strategies/${strategyId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Activate/deactivate strategy (authenticated)
router.post('/:strategyId/toggle', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  const { isActive } = req.body;
  
  logger.info('Strategy toggle requested', {
    userId: req.user!.id,
    strategyId,
    isActive,
  });

  const response = await serviceProxy.post('strategy-service', `/strategies/${strategyId}/toggle`, {
    userId: req.user!.id,
    isActive,
  });
  
  res.json(response);
}));

// Get strategy performance (authenticated)
router.get('/:strategyId/performance', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('strategy-service', `/strategies/${strategyId}/performance`, {
    params: {
      userId: req.user!.id,
      timeframe,
    },
  });
  
  res.json(response);
}));

// Test strategy with simulation (authenticated)
router.post('/:strategyId/simulate', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { strategyId } = req.params;
  
  const response = await serviceProxy.post('strategy-service', `/strategies/${strategyId}/simulate`, {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get strategy templates (authenticated)
router.get('/templates/list', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('strategy-service', '/strategies/templates');
  res.json(response);
}));

// Create strategy from template (authenticated)
router.post('/templates/:templateId/create', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { templateId } = req.params;
  
  logger.info('Strategy creation from template', {
    userId: req.user!.id,
    templateId,
  });

  const response = await serviceProxy.post('strategy-service', `/strategies/templates/${templateId}/create`, {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.status(201).json(response);
}));

export { router as strategyRoutes };