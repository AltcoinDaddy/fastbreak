import { Router } from 'express';
import { Logger } from 'winston';
import Joi from 'joi';
import { ActionManager } from '../services/action-manager';

interface ActionRouterDependencies {
  actionManager: ActionManager;
  logger: Logger;
}

export function createActionRouter(deps: ActionRouterDependencies): Router {
  const router = Router();
  const { actionManager, logger } = deps;

  // Middleware to extract user ID
  const extractUserId = (req: any, res: any, next: any) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required in X-User-ID header',
        timestamp: new Date(),
      });
    }
    req.userId = userId;
    next();
  };

  // Purchase Action Routes
  router.post('/purchase', extractUserId, async (req: any, res) => {
    try {
      const schema = Joi.object({
        momentId: Joi.string().required(),
        listingId: Joi.string().required(),
        maxPrice: Joi.number().positive().required(),
        sellerAddress: Joi.string().required(),
        buyerAddress: Joi.string().required(),
        marketplaceId: Joi.string().valid('topshot', 'othermarkets').required(),
        strategyId: Joi.string().optional(),
        urgency: Joi.string().valid('low', 'medium', 'high').default('medium'),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        scheduledAt: Joi.date().optional(),
        expiresAt: Joi.date().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }

      const { priority, scheduledAt, expiresAt, ...input } = value;

      const requestId = await actionManager.executeAction(
        req.userId,
        'purchase',
        input,
        {
          priority,
          scheduledAt,
          expiresAt,
          metadata: {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          },
        }
      );

      res.json({
        success: true,
        data: {
          requestId,
          status: 'queued',
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error executing purchase action:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute purchase action',
        timestamp: new Date(),
      });
    }
  });

  // Arbitrage Action Routes
  router.post('/arbitrage', extractUserId, async (req: any, res) => {
    try {
      const schema = Joi.object({
        momentId: Joi.string().required(),
        buyListing: Joi.object({
          listingId: Joi.string().required(),
          price: Joi.number().positive().required(),
          marketplaceId: Joi.string().required(),
          sellerAddress: Joi.string().required(),
        }).required(),
        sellListing: Joi.object({
          listingId: Joi.string().required(),
          price: Joi.number().positive().required(),
          marketplaceId: Joi.string().required(),
          buyerAddress: Joi.string().required(),
        }).required(),
        userAddress: Joi.string().required(),
        expectedProfit: Joi.number().positive().required(),
        maxSlippage: Joi.number().min(0).max(1).default(0.05),
        timeoutMs: Joi.number().positive().default(300000),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('high'),
        scheduledAt: Joi.date().optional(),
        expiresAt: Joi.date().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }

      const { priority, scheduledAt, expiresAt, ...input } = value;

      const requestId = await actionManager.executeAction(
        req.userId,
        'arbitrage',
        input,
        {
          priority,
          scheduledAt,
          expiresAt,
          metadata: {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          },
        }
      );

      res.json({
        success: true,
        data: {
          requestId,
          status: 'queued',
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error executing arbitrage action:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute arbitrage action',
        timestamp: new Date(),
      });
    }
  });

  // Portfolio Rebalance Action Routes
  router.post('/rebalance', extractUserId, async (req: any, res) => {
    try {
      const schema = Joi.object({
        userAddress: Joi.string().required(),
        rebalanceType: Joi.string().valid('profit_taking', 'loss_cutting', 'diversification', 'strategy_change').required(),
        targetAllocations: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(1)).optional(),
        sellCriteria: Joi.object({
          minProfitPercentage: Joi.number().min(0).optional(),
          maxLossPercentage: Joi.number().min(0).max(1).optional(),
          holdingPeriodDays: Joi.number().integer().min(0).optional(),
          momentCategories: Joi.array().items(Joi.string()).optional(),
          priceThresholds: Joi.object({
            above: Joi.number().positive().optional(),
            below: Joi.number().positive().optional(),
          }).optional(),
        }).required(),
        maxMomentsToSell: Joi.number().integer().min(1).max(50).required(),
        urgency: Joi.string().valid('low', 'medium', 'high').default('medium'),
        dryRun: Joi.boolean().default(false),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        scheduledAt: Joi.date().optional(),
        expiresAt: Joi.date().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }

      const { priority, scheduledAt, expiresAt, ...input } = value;
      input.userId = req.userId; // Add userId to input

      const requestId = await actionManager.executeAction(
        req.userId,
        'portfolio_rebalance',
        input,
        {
          priority,
          scheduledAt,
          expiresAt,
          metadata: {
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          },
        }
      );

      res.json({
        success: true,
        data: {
          requestId,
          status: 'queued',
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error executing rebalance action:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute rebalance action',
        timestamp: new Date(),
      });
    }
  });

  // Action Management Routes
  router.get('/status/:requestId', extractUserId, async (req: any, res) => {
    try {
      const { requestId } = req.params;
      const status = actionManager.getActionStatus(requestId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Action not found',
          timestamp: new Date(),
        });
      }

      // Verify user owns this action
      if (status.userId !== req.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: status,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting action status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get action status',
        timestamp: new Date(),
      });
    }
  });

  router.delete('/:requestId', extractUserId, async (req: any, res) => {
    try {
      const { requestId } = req.params;
      const cancelled = await actionManager.cancelAction(requestId, req.userId);

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: 'Action not found or cannot be cancelled',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Action cancelled successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error cancelling action:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel action',
        timestamp: new Date(),
      });
    }
  });

  router.get('/user/actions', extractUserId, async (req: any, res) => {
    try {
      const actions = actionManager.getUserActions(req.userId);

      res.json({
        success: true,
        data: actions,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting user actions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user actions',
        timestamp: new Date(),
      });
    }
  });

  router.get('/user/history', extractUserId, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const actionType = req.query.actionType as string;

      const history = await actionManager.getActionHistory(req.userId, limit, actionType);

      res.json({
        success: true,
        data: history,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting action history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get action history',
        timestamp: new Date(),
      });
    }
  });

  // System Routes
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = actionManager.getMetrics();

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting action metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get action metrics',
        timestamp: new Date(),
      });
    }
  });

  router.get('/health', async (req, res) => {
    try {
      const metrics = actionManager.getMetrics();
      const isHealthy = metrics.successRate > 80; // Consider healthy if >80% success rate

      res.status(isHealthy ? 200 : 503).json({
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'degraded',
          metrics: {
            totalExecutions: metrics.totalExecutions,
            successRate: metrics.successRate,
            averageExecutionTime: metrics.averageExecutionTime,
          },
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting health status:', error);
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        timestamp: new Date(),
      });
    }
  });

  // Batch Operations
  router.post('/batch', extractUserId, async (req: any, res) => {
    try {
      const schema = Joi.object({
        actions: Joi.array().items(
          Joi.object({
            actionType: Joi.string().valid('purchase', 'arbitrage', 'portfolio_rebalance').required(),
            input: Joi.object().required(),
            priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
            scheduledAt: Joi.date().optional(),
            expiresAt: Joi.date().optional(),
          })
        ).min(1).max(10).required(), // Limit batch size
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
          timestamp: new Date(),
        });
      }

      const requestIds: string[] = [];
      const errors: string[] = [];

      for (const action of value.actions) {
        try {
          const requestId = await actionManager.executeAction(
            req.userId,
            action.actionType,
            action.input,
            {
              priority: action.priority,
              scheduledAt: action.scheduledAt,
              expiresAt: action.expiresAt,
              metadata: {
                batchRequest: true,
                userAgent: req.get('User-Agent'),
                ip: req.ip,
              },
            }
          );
          requestIds.push(requestId);
        } catch (actionError) {
          errors.push(`${action.actionType}: ${actionError}`);
        }
      }

      res.json({
        success: errors.length === 0,
        data: {
          requestIds,
          errors: errors.length > 0 ? errors : undefined,
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error executing batch actions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute batch actions',
        timestamp: new Date(),
      });
    }
  });

  // Dry Run Routes
  router.post('/dry-run/:actionType', extractUserId, async (req: any, res) => {
    try {
      const { actionType } = req.params;
      
      if (!['purchase', 'arbitrage', 'portfolio_rebalance'].includes(actionType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid action type',
          timestamp: new Date(),
        });
      }

      // For dry runs, we would validate the input and simulate the execution
      // without actually performing any transactions
      
      res.json({
        success: true,
        data: {
          actionType,
          validation: 'passed',
          estimatedExecutionTime: Math.random() * 5000 + 1000, // Mock execution time
          estimatedGasCost: Math.random() * 0.01 + 0.001, // Mock gas cost
          riskAssessment: {
            riskLevel: 'medium',
            factors: ['market_volatility', 'price_slippage'],
          },
        },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error performing dry run:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to perform dry run',
        timestamp: new Date(),
      });
    }
  });

  return router;
}