import { Router, Request, Response } from 'express';
import { Logger } from 'winston';
import Joi from 'joi';
import { StrategyService } from '../services/strategy-service';
import { createSuccessResponse, createErrorResponse } from '@fastbreak/shared';
import { StrategyValidator } from '../validators/strategy-validator';

export interface StrategyRouterDeps {
  strategyService: StrategyService;
  logger: Logger;
}

// Validation schemas
const createStrategySchema = Joi.object({
  templateId: Joi.string().required(),
  name: Joi.string().min(3).max(100).required(),
  description: Joi.string().max(500).optional(),
  parameters: Joi.object().required(),
  isActive: Joi.boolean().default(true),
  priority: Joi.number().integer().min(1).max(10).default(5),
  budgetAllocation: Joi.object({
    percentage: Joi.number().min(0.01).max(1.0).required(),
    maxAmount: Joi.number().positive().max(100000).required(),
    dailyLimit: Joi.number().positive().max(10000).required(),
  }).required(),
  riskControls: Joi.object({
    maxDailyLoss: Joi.number().positive().max(10000).required(),
    maxPositionSize: Joi.number().positive().max(5000).required(),
    maxConcurrentTrades: Joi.number().integer().min(1).max(50).required(),
    stopLossPercentage: Joi.number().min(0.01).max(0.5).required(),
    takeProfitPercentage: Joi.number().min(0.05).max(1.0).required(),
    cooldownPeriod: Joi.number().integer().min(0).max(3600).required(),
    blacklistedPlayers: Joi.array().items(Joi.string()).default([]),
    blacklistedMoments: Joi.array().items(Joi.string()).default([]),
    maxPricePerMoment: Joi.number().positive().max(10000).required(),
    requireManualApproval: Joi.boolean().default(false),
    emergencyStop: Joi.object({
      enabled: Joi.boolean().required(),
      triggerConditions: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('loss_threshold', 'consecutive_losses', 'market_volatility', 'external_signal').required(),
          threshold: Joi.number().positive().required(),
          timeframe: Joi.number().integer().positive().optional(),
          isActive: Joi.boolean().required(),
        })
      ).default([]),
    }).required(),
  }).required(),
  schedule: Joi.object({
    enabled: Joi.boolean().required(),
    timezone: Joi.string().default('UTC'),
    activeHours: Joi.object({
      start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    }).required(),
    activeDays: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).max(7).required(),
    pauseDuringGames: Joi.boolean().default(false),
    pauseBeforeGames: Joi.number().integer().min(0).max(180).default(0),
    pauseAfterGames: Joi.number().integer().min(0).max(180).default(0),
  }).optional(),
  notifications: Joi.object({
    enabled: Joi.boolean().required(),
    channels: Joi.array().items(
      Joi.string().valid('email', 'push', 'sms', 'webhook')
    ).min(1).required(),
    events: Joi.array().items(
      Joi.string().valid(
        'trade_executed', 
        'opportunity_found', 
        'risk_threshold_reached', 
        'strategy_paused', 
        'performance_milestone', 
        'error_occurred'
      )
    ).min(1).required(),
    frequency: Joi.string().valid('immediate', 'batched', 'daily_summary').default('immediate'),
    quietHours: Joi.object({
      start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    }).optional(),
  }).required(),
});

const updateStrategySchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(500).optional(),
  parameters: Joi.object().optional(),
  isActive: Joi.boolean().optional(),
  priority: Joi.number().integer().min(1).max(10).optional(),
  budgetAllocation: Joi.object({
    percentage: Joi.number().min(0.01).max(1.0).optional(),
    maxAmount: Joi.number().positive().max(100000).optional(),
    dailyLimit: Joi.number().positive().max(10000).optional(),
  }).optional(),
  riskControls: Joi.object().optional(),
  schedule: Joi.object().optional(),
  notifications: Joi.object().optional(),
}).min(1);

const backtestSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
});

const searchTemplatesSchema = Joi.object({
  query: Joi.string().optional(),
  type: Joi.string().optional(),
  difficulty: Joi.string().valid('beginner', 'intermediate', 'advanced').optional(),
  riskLevel: Joi.string().valid('low', 'medium', 'high').optional(),
  category: Joi.string().valid('performance_based', 'market_based', 'time_based', 'hybrid').optional(),
});

export function createStrategyRouter(deps: StrategyRouterDeps): Router {
  const router = Router();
  const { strategyService, logger } = deps;

  // Middleware for request validation
  const validate = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: any) => {
      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json(createErrorResponse(`Validation error: ${error.details[0].message}`));
      }
      req.body = value;
      next();
    };
  };

  const validateQuery = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: any) => {
      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json(createErrorResponse(`Query validation error: ${error.details[0].message}`));
      }
      req.query = value;
      next();
    };
  };

  // Middleware to extract user ID (would be set by auth middleware)
  const extractUserId = (req: Request, res: Response, next: any) => {
    // In a real implementation, this would come from JWT token
    const userId = req.headers['x-user-id'] as string || 'test-user-id';
    (req as any).userId = userId;
    next();
  };

  // Apply user ID extraction to all routes
  router.use(extractUserId);

  // Get available strategy templates
  router.get('/templates', validateQuery(searchTemplatesSchema), (req: Request, res: Response) => {
    try {
      const { query, type, difficulty, riskLevel, category } = req.query as any;
      
      const templates = strategyService.searchTemplates(query || '', {
        type,
        difficulty,
        riskLevel,
        category,
      });

      res.json(createSuccessResponse({
        templates,
        total: templates.length,
        filters: { query, type, difficulty, riskLevel, category },
      }));
    } catch (error) {
      logger.error('Error getting strategy templates:', error);
      res.status(500).json(createErrorResponse('Failed to get strategy templates'));
    }
  });

  // Get specific template
  router.get('/templates/:templateId', (req: Request, res: Response) => {
    try {
      const { templateId } = req.params;
      const template = strategyService.getTemplateById(templateId);

      if (!template) {
        return res.status(404).json(createErrorResponse('Template not found'));
      }

      res.json(createSuccessResponse({ template }));
    } catch (error) {
      logger.error('Error getting strategy template:', error);
      res.status(500).json(createErrorResponse('Failed to get strategy template'));
    }
  });

  // Create new strategy
  router.post('/strategies', validate(createStrategySchema), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const strategyData = req.body;

      const strategy = await strategyService.createStrategy(userId, strategyData);

      res.status(201).json(createSuccessResponse({
        strategy,
        message: 'Strategy created successfully',
      }));
    } catch (error) {
      logger.error('Error creating strategy:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Validation failed') || 
            error.message.includes('Maximum number') ||
            error.message.includes('Compatibility check failed')) {
          return res.status(400).json(createErrorResponse(error.message));
        }
      }
      
      res.status(500).json(createErrorResponse('Failed to create strategy'));
    }
  });

  // Get user's strategies
  router.get('/strategies', (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { active } = req.query;

      const strategiesPromise = active === 'true' 
        ? strategyService.getActiveStrategies(userId)
        : strategyService.getUserStrategies(userId);

      strategiesPromise.then(strategies => {
        res.json(createSuccessResponse({
          strategies,
          total: strategies.length,
          activeOnly: active === 'true',
        }));
      }).catch(error => {
        logger.error('Error getting user strategies:', error);
        res.status(500).json(createErrorResponse('Failed to get strategies'));
      });
    } catch (error) {
      logger.error('Error in get strategies route:', error);
      res.status(500).json(createErrorResponse('Failed to get strategies'));
    }
  });

  // Get specific strategy
  router.get('/strategies/:strategyId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;

      const strategy = await strategyService.getStrategy(userId, strategyId);

      if (!strategy) {
        return res.status(404).json(createErrorResponse('Strategy not found'));
      }

      res.json(createSuccessResponse({ strategy }));
    } catch (error) {
      logger.error('Error getting strategy:', error);
      res.status(500).json(createErrorResponse('Failed to get strategy'));
    }
  });

  // Update strategy
  router.put('/strategies/:strategyId', validate(updateStrategySchema), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;
      const updates = req.body;

      const strategy = await strategyService.updateStrategy(userId, strategyId, updates);

      res.json(createSuccessResponse({
        strategy,
        message: 'Strategy updated successfully',
      }));
    } catch (error) {
      logger.error('Error updating strategy:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json(createErrorResponse(error.message));
        }
        if (error.message.includes('validation failed') || 
            error.message.includes('Parameter validation failed')) {
          return res.status(400).json(createErrorResponse(error.message));
        }
      }
      
      res.status(500).json(createErrorResponse('Failed to update strategy'));
    }
  });

  // Delete strategy
  router.delete('/strategies/:strategyId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;

      const deleted = await strategyService.deleteStrategy(userId, strategyId);

      if (!deleted) {
        return res.status(404).json(createErrorResponse('Strategy not found'));
      }

      res.json(createSuccessResponse({
        message: 'Strategy deleted successfully',
      }));
    } catch (error) {
      logger.error('Error deleting strategy:', error);
      res.status(500).json(createErrorResponse('Failed to delete strategy'));
    }
  });

  // Toggle strategy active status
  router.post('/strategies/:strategyId/toggle', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json(createErrorResponse('isActive must be a boolean'));
      }

      const strategy = await strategyService.toggleStrategy(userId, strategyId, isActive);

      res.json(createSuccessResponse({
        strategy,
        message: `Strategy ${isActive ? 'activated' : 'deactivated'} successfully`,
      }));
    } catch (error) {
      logger.error('Error toggling strategy:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json(createErrorResponse(error.message));
      }
      
      res.status(500).json(createErrorResponse('Failed to toggle strategy'));
    }
  });

  // Get strategy performance
  router.get('/strategies/:strategyId/performance', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;

      // Verify user owns the strategy
      const strategy = await strategyService.getStrategy(userId, strategyId);
      if (!strategy) {
        return res.status(404).json(createErrorResponse('Strategy not found'));
      }

      const performance = await strategyService.getStrategyPerformance(strategyId);

      res.json(createSuccessResponse({
        performance: performance || strategy.performance,
        strategyId,
      }));
    } catch (error) {
      logger.error('Error getting strategy performance:', error);
      res.status(500).json(createErrorResponse('Failed to get strategy performance'));
    }
  });

  // Run strategy backtest
  router.post('/strategies/:strategyId/backtest', validate(backtestSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { strategyId } = req.params;
      const { startDate, endDate } = req.body;

      const backtest = await strategyService.runBacktest(userId, strategyId, {
        start: new Date(startDate),
        end: new Date(endDate),
      });

      res.json(createSuccessResponse({
        backtest,
        message: 'Backtest completed successfully',
      }));
    } catch (error) {
      logger.error('Error running backtest:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json(createErrorResponse(error.message));
      }
      
      res.status(500).json(createErrorResponse('Failed to run backtest'));
    }
  });

  // Get strategy recommendations
  router.get('/recommendations', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;

      const recommendations = await strategyService.generateRecommendations(userId);

      res.json(createSuccessResponse({
        recommendations,
        total: recommendations.length,
      }));
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      res.status(500).json(createErrorResponse('Failed to get recommendations'));
    }
  });

  // Validate strategy parameters
  router.post('/validate', (req: Request, res: Response) => {
    try {
      const { templateId, parameters } = req.body;

      if (!templateId || !parameters) {
        return res.status(400).json(createErrorResponse('templateId and parameters are required'));
      }

      const validation = StrategyValidator.validateStrategyParameters(parameters, templateId);

      res.json(createSuccessResponse({
        isValid: validation.isValid,
        errors: validation.errors,
      }));
    } catch (error) {
      logger.error('Error validating strategy parameters:', error);
      res.status(500).json(createErrorResponse('Failed to validate parameters'));
    }
  });

  // Get service statistics
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = strategyService.getServiceStats();
      res.json(createSuccessResponse({ stats }));
    } catch (error) {
      logger.error('Error getting service stats:', error);
      res.status(500).json(createErrorResponse('Failed to get service statistics'));
    }
  });

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    try {
      const stats = strategyService.getServiceStats();
      res.json(createSuccessResponse({
        status: 'healthy',
        service: 'strategy-service',
        stats,
        timestamp: new Date(),
      }));
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json(createErrorResponse('Health check failed'));
    }
  });

  // Error handling middleware
  router.use((error: Error, req: Request, res: Response, next: any) => {
    logger.error('Strategy router error:', error);
    res.status(500).json(createErrorResponse('Internal server error'));
  });

  return router;
}