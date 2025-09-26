import { Router } from 'express';
import { Logger } from 'winston';
import { TradingService } from '../services/trading-service';
import { PortfolioService } from '../services/portfolio-service';
import { FlowService } from '../services/flow-service';

interface TradingRouterDependencies {
  tradingService: TradingService;
  portfolioService: PortfolioService;
  flowService: FlowService;
  logger: Logger;
}

export function createTradingRouter(deps: TradingRouterDependencies): Router {
  const router = Router();
  const { tradingService, portfolioService, flowService, logger } = deps;

  // Middleware to extract user ID
  const requireUserId = (req: any, res: any, next: any) => {
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

  // Trading Routes
  router.post('/trades', requireUserId, async (req: any, res) => {
    try {
      const {
        momentId,
        action,
        targetPrice,
        maxPrice,
        minPrice,
        strategyId,
        reasoning,
        priority = 'medium',
        timeoutMs,
      } = req.body;

      // Validate required fields
      if (!momentId || !action || !targetPrice) {
        return res.status(400).json({
          success: false,
          error: 'momentId, action, and targetPrice are required',
          timestamp: new Date(),
        });
      }

      if (!['buy', 'sell', 'bid'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'action must be buy, sell, or bid',
          timestamp: new Date(),
        });
      }

      const tradeId = await tradingService.submitTrade({
        userId: req.userId,
        momentId,
        action,
        targetPrice: parseFloat(targetPrice),
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        strategyId,
        reasoning,
        priority,
        timeoutMs: timeoutMs ? parseInt(timeoutMs) : undefined,
      });

      res.json({
        success: true,
        data: { tradeId },
        message: 'Trade submitted successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error submitting trade:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit trade',
        timestamp: new Date(),
      });
    }
  });

  router.get('/trades/active', requireUserId, async (req: any, res) => {
    try {
      const activeTrades = await tradingService.getActiveTrades(req.userId);

      res.json({
        success: true,
        data: activeTrades,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting active trades:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active trades',
        timestamp: new Date(),
      });
    }
  });

  router.get('/trades/history', requireUserId, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const tradeHistory = await tradingService.getTradeHistory(req.userId, limit);

      res.json({
        success: true,
        data: tradeHistory,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting trade history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get trade history',
        timestamp: new Date(),
      });
    }
  });

  router.delete('/trades/:tradeId', requireUserId, async (req: any, res) => {
    try {
      const { tradeId } = req.params;
      const cancelled = await tradingService.cancelTrade(tradeId, req.userId);

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found or cannot be cancelled',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        message: 'Trade cancelled successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error cancelling trade:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel trade',
        timestamp: new Date(),
      });
    }
  });

  router.get('/trades/queue-status', async (req, res) => {
    try {
      const status = tradingService.getTradeQueueStatus();

      res.json({
        success: true,
        data: status,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting queue status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue status',
        timestamp: new Date(),
      });
    }
  });

  // Portfolio Routes
  router.get('/portfolio', requireUserId, async (req: any, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const portfolio = await portfolioService.getPortfolio(req.userId, forceRefresh);

      res.json({
        success: true,
        data: portfolio,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting portfolio:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get portfolio',
        timestamp: new Date(),
      });
    }
  });

  router.get('/portfolio/performance', requireUserId, async (req: any, res) => {
    try {
      const period = req.query.period as string || 'all';
      const performance = await portfolioService.getPortfolioPerformance(req.userId, period);

      res.json({
        success: true,
        data: performance,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting portfolio performance:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get portfolio performance',
        timestamp: new Date(),
      });
    }
  });

  router.get('/portfolio/summary', requireUserId, async (req: any, res) => {
    try {
      const summary = await portfolioService.getPortfolioSummary(req.userId);

      res.json({
        success: true,
        data: summary,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting portfolio summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get portfolio summary',
        timestamp: new Date(),
      });
    }
  });

  router.get('/portfolio/top-performers', requireUserId, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const topPerformers = await portfolioService.getTopPerformers(req.userId, limit);

      res.json({
        success: true,
        data: topPerformers,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting top performers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get top performers',
        timestamp: new Date(),
      });
    }
  });

  router.get('/portfolio/worst-performers', requireUserId, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const worstPerformers = await portfolioService.getWorstPerformers(req.userId, limit);

      res.json({
        success: true,
        data: worstPerformers,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting worst performers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get worst performers',
        timestamp: new Date(),
      });
    }
  });

  router.get('/portfolio/allocation', requireUserId, async (req: any, res) => {
    try {
      const allocation = await portfolioService.getPortfolioAllocation(req.userId);

      res.json({
        success: true,
        data: allocation,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting portfolio allocation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get portfolio allocation',
        timestamp: new Date(),
      });
    }
  });

  // Market Data Routes
  router.get('/market/:momentId', async (req, res) => {
    try {
      const { momentId } = req.params;
      const marketData = await tradingService.getMarketData(momentId);

      if (!marketData) {
        return res.status(404).json({
          success: false,
          error: 'Market data not found',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: marketData,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting market data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get market data',
        timestamp: new Date(),
      });
    }
  });

  router.get('/market/:momentId/orderbook', async (req, res) => {
    try {
      const { momentId } = req.params;
      const orderBook = await tradingService.getOrderBook(momentId);

      res.json({
        success: true,
        data: orderBook,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting order book:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get order book',
        timestamp: new Date(),
      });
    }
  });

  // Flow Integration Routes
  router.get('/flow/moments/:momentId', async (req, res) => {
    try {
      const { momentId } = req.params;
      const momentData = await flowService.getMomentData(momentId);

      if (!momentData) {
        return res.status(404).json({
          success: false,
          error: 'Moment not found',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: momentData,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting moment data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get moment data',
        timestamp: new Date(),
      });
    }
  });

  router.get('/flow/user/moments', requireUserId, async (req: any, res) => {
    try {
      const userMoments = await flowService.getUserMoments(req.userId);

      res.json({
        success: true,
        data: userMoments,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting user moments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user moments',
        timestamp: new Date(),
      });
    }
  });

  router.get('/flow/user/strategies', requireUserId, async (req: any, res) => {
    try {
      const strategies = await flowService.getUserStrategies(req.userId);

      res.json({
        success: true,
        data: strategies,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting user strategies:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user strategies',
        timestamp: new Date(),
      });
    }
  });

  router.get('/flow/user/budget-limits', requireUserId, async (req: any, res) => {
    try {
      const budgetLimits = await flowService.getUserBudgetLimits(req.userId);

      if (!budgetLimits) {
        return res.status(404).json({
          success: false,
          error: 'Budget limits not found',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: budgetLimits,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting budget limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get budget limits',
        timestamp: new Date(),
      });
    }
  });

  router.post('/flow/validate-spending', requireUserId, async (req: any, res) => {
    try {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid amount is required',
          timestamp: new Date(),
        });
      }

      const isValid = await flowService.validateSpending(req.userId, parseFloat(amount));

      res.json({
        success: true,
        data: { isValid },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error validating spending:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate spending',
        timestamp: new Date(),
      });
    }
  });

  router.get('/flow/user/can-trade', requireUserId, async (req: any, res) => {
    try {
      const canTrade = await flowService.canUserTrade(req.userId);

      res.json({
        success: true,
        data: { canTrade },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error checking if user can trade:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check trading status',
        timestamp: new Date(),
      });
    }
  });

  return router;
}