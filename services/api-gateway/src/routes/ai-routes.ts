import { Router, Response } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();

// Analyze moment value (authenticated)
router.post('/analyze/moment', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logger.info('AI moment analysis requested', {
    userId: req.user!.id,
    momentId: req.body.momentId,
  });

  const response = await serviceProxy.post('ai-scouting', '/analyze/moment', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Batch analyze moments (authenticated)
router.post('/analyze/batch', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logger.info('AI batch analysis requested', {
    userId: req.user!.id,
    momentCount: req.body.moments?.length || 0,
  });

  const response = await serviceProxy.post('ai-scouting', '/analyze/batch', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Get AI recommendations (authenticated)
router.get('/recommendations', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, strategy } = req.query;
  
  const response = await serviceProxy.get('ai-scouting', '/recommendations', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      strategy,
    },
  });
  
  res.json(response);
}));

// Get AI analysis history (authenticated)
router.get('/analysis/history', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, momentId } = req.query;
  
  const response = await serviceProxy.get('ai-scouting', '/analysis/history', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      momentId,
    },
  });
  
  res.json(response);
}));

// Get specific analysis details (authenticated)
router.get('/analysis/:analysisId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { analysisId } = req.params;
  
  const response = await serviceProxy.get('ai-scouting', `/analysis/${analysisId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get AI model performance metrics (authenticated)
router.get('/performance', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '30d' } = req.query;
  
  const response = await serviceProxy.get('ai-scouting', '/performance', {
    params: {
      userId: req.user!.id,
      timeframe,
    },
  });
  
  res.json(response);
}));

// Get player performance insights (authenticated)
router.get('/insights/player/:playerId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { playerId } = req.params;
  
  const response = await serviceProxy.get('ai-scouting', `/insights/player/${playerId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get market trends analysis (authenticated)
router.get('/trends', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '7d', category } = req.query;
  
  const response = await serviceProxy.get('ai-scouting', '/trends', {
    params: {
      userId: req.user!.id,
      timeframe,
      category,
    },
  });
  
  res.json(response);
}));

export { router as aiRoutes };