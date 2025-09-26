import { Router, Request, Response } from 'express';
import { Logger } from 'winston';
import Joi from 'joi';
import { MarketplaceService } from '../services/marketplace-service';
import { createSuccessResponse, createErrorResponse } from '@fastbreak/shared';

export interface MarketplaceRouterDeps {
  marketplaceService: MarketplaceService;
  logger: Logger;
}

// Validation schemas
const addPriceAlertSchema = Joi.object({
  userId: Joi.string().required(),
  momentId: Joi.string().optional(),
  playerId: Joi.string().optional(),
  alertType: Joi.string().valid('price_drop', 'price_increase', 'volume_spike', 'new_listing', 'arbitrage').required(),
  threshold: Joi.number().positive().required(),
  isActive: Joi.boolean().default(true),
  metadata: Joi.object().optional(),
}).or('momentId', 'playerId');

const scanRequestSchema = Joi.object({
  type: Joi.string().valid('arbitrage', 'undervalued', 'overvalued', 'trending').required(),
  filters: Joi.object({
    minPrice: Joi.number().positive().optional(),
    maxPrice: Joi.number().positive().optional(),
    playerId: Joi.string().optional(),
    momentType: Joi.string().optional(),
    marketplaceId: Joi.string().optional(),
    minProfitPercentage: Joi.number().positive().optional(),
    maxRiskScore: Joi.number().min(0).max(100).optional(),
  }).optional(),
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('createdAt', 'price', 'profitPercentage', 'confidence').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export function createMarketplaceRouter(deps: MarketplaceRouterDeps): Router {
  const router = Router();
  const { marketplaceService, logger } = deps;

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

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    try {
      const stats = marketplaceService.getServiceStats();
      const marketplaceStatuses = marketplaceService.getMarketplaceStatuses();
      
      const isHealthy = marketplaceStatuses.some(status => status.isOnline);
      
      res.json(createSuccessResponse({
        status: isHealthy ? 'healthy' : 'degraded',
        stats,
        marketplaces: marketplaceStatuses.map(status => ({
          id: status.marketplaceId,
          online: status.isOnline,
          responseTime: status.responseTime,
          errorRate: status.errorRate,
        })),
      }));
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json(createErrorResponse('Health check failed'));
    }
  });

  // Get marketplace statuses
  router.get('/marketplaces/status', (req: Request, res: Response) => {
    try {
      const statuses = marketplaceService.getMarketplaceStatuses();
      res.json(createSuccessResponse({ marketplaces: statuses }));
    } catch (error) {
      logger.error('Error getting marketplace statuses:', error);
      res.status(500).json(createErrorResponse('Failed to get marketplace statuses'));
    }
  });

  // Get arbitrage opportunities
  router.get('/arbitrage/opportunities', validateQuery(paginationSchema), (req: Request, res: Response) => {
    try {
      const { page, limit, sortBy, sortOrder } = req.query as any;
      let opportunities = marketplaceService.getActiveArbitrageOpportunities();

      // Sort opportunities
      opportunities.sort((a, b) => {
        let aValue: any, bValue: any;
        
        switch (sortBy) {
          case 'profitPercentage':
            aValue = a.profitPercentage;
            bValue = b.profitPercentage;
            break;
          case 'confidence':
            aValue = a.confidence;
            bValue = b.confidence;
            break;
          case 'createdAt':
          default:
            aValue = a.detectedAt.getTime();
            bValue = b.detectedAt.getTime();
            break;
        }

        if (sortOrder === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });

      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedOpportunities = opportunities.slice(startIndex, endIndex);

      res.json(createSuccessResponse({
        opportunities: paginatedOpportunities,
        pagination: {
          page,
          limit,
          total: opportunities.length,
          totalPages: Math.ceil(opportunities.length / limit),
          hasNext: endIndex < opportunities.length,
          hasPrev: page > 1,
        },
      }));
    } catch (error) {
      logger.error('Error getting arbitrage opportunities:', error);
      res.status(500).json(createErrorResponse('Failed to get arbitrage opportunities'));
    }
  });

  // Get specific arbitrage opportunity
  router.get('/arbitrage/opportunities/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const opportunities = marketplaceService.getActiveArbitrageOpportunities();
      const opportunity = opportunities.find(opp => opp.id === id);

      if (!opportunity) {
        return res.status(404).json(createErrorResponse('Arbitrage opportunity not found'));
      }

      res.json(createSuccessResponse({ opportunity }));
    } catch (error) {
      logger.error('Error getting arbitrage opportunity:', error);
      res.status(500).json(createErrorResponse('Failed to get arbitrage opportunity'));
    }
  });

  // Add price alert
  router.post('/alerts/price', validate(addPriceAlertSchema), async (req: Request, res: Response) => {
    try {
      const alertData = req.body;
      const alertId = await marketplaceService.addPriceAlert(alertData);

      res.status(201).json(createSuccessResponse({
        alertId,
        message: 'Price alert created successfully',
      }));
    } catch (error) {
      logger.error('Error adding price alert:', error);
      res.status(500).json(createErrorResponse('Failed to add price alert'));
    }
  });

  // Remove price alert
  router.delete('/alerts/price/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const removed = await marketplaceService.removePriceAlert(id);

      if (!removed) {
        return res.status(404).json(createErrorResponse('Price alert not found'));
      }

      res.json(createSuccessResponse({ message: 'Price alert removed successfully' }));
    } catch (error) {
      logger.error('Error removing price alert:', error);
      res.status(500).json(createErrorResponse('Failed to remove price alert'));
    }
  });

  // Get active alerts
  router.get('/alerts', (req: Request, res: Response) => {
    try {
      const alerts = marketplaceService.getActiveAlerts();
      res.json(createSuccessResponse({ alerts }));
    } catch (error) {
      logger.error('Error getting alerts:', error);
      res.status(500).json(createErrorResponse('Failed to get alerts'));
    }
  });

  // Acknowledge alert
  router.post('/alerts/:id/acknowledge', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { acknowledgedBy } = req.body;

      if (!acknowledgedBy) {
        return res.status(400).json(createErrorResponse('acknowledgedBy is required'));
      }

      const acknowledged = marketplaceService.acknowledgeAlert(id, acknowledgedBy);

      if (!acknowledged) {
        return res.status(404).json(createErrorResponse('Alert not found'));
      }

      res.json(createSuccessResponse({ message: 'Alert acknowledged successfully' }));
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      res.status(500).json(createErrorResponse('Failed to acknowledge alert'));
    }
  });

  // Perform marketplace scan
  router.post('/scan', validate(scanRequestSchema), async (req: Request, res: Response) => {
    try {
      const { type, filters = {} } = req.body;
      const scanResult = await marketplaceService.performScan(type, filters);

      res.json(createSuccessResponse({
        scan: scanResult,
      }));
    } catch (error) {
      logger.error('Error performing scan:', error);
      res.status(500).json(createErrorResponse(`Failed to perform ${req.body.type} scan`));
    }
  });

  // Get service statistics
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const stats = marketplaceService.getServiceStats();
      res.json(createSuccessResponse({ stats }));
    } catch (error) {
      logger.error('Error getting service stats:', error);
      res.status(500).json(createErrorResponse('Failed to get service statistics'));
    }
  });

  // Get moment price data
  router.get('/moments/:id/price', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // This would typically get price data from the price monitor
      // For now, we'll return a placeholder response
      res.json(createSuccessResponse({
        momentId: id,
        message: 'Price data endpoint - implementation depends on specific marketplace APIs',
      }));
    } catch (error) {
      logger.error('Error getting moment price data:', error);
      res.status(500).json(createErrorResponse('Failed to get moment price data'));
    }
  });

  // Get marketplace listings
  router.get('/listings', async (req: Request, res: Response) => {
    try {
      const {
        marketplaceId,
        playerId,
        momentType,
        minPrice,
        maxPrice,
        limit = 50,
        offset = 0,
      } = req.query;

      // This would get listings from marketplace clients
      // For now, we'll return a placeholder response
      res.json(createSuccessResponse({
        listings: [],
        filters: {
          marketplaceId,
          playerId,
          momentType,
          minPrice,
          maxPrice,
        },
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: 0,
        },
        message: 'Listings endpoint - implementation depends on specific marketplace APIs',
      }));
    } catch (error) {
      logger.error('Error getting marketplace listings:', error);
      res.status(500).json(createErrorResponse('Failed to get marketplace listings'));
    }
  });

  // Get recent sales
  router.get('/sales', async (req: Request, res: Response) => {
    try {
      const {
        marketplaceId,
        playerId,
        momentType,
        hours = 24,
        limit = 50,
      } = req.query;

      // This would get sales from marketplace clients
      // For now, we'll return a placeholder response
      res.json(createSuccessResponse({
        sales: [],
        filters: {
          marketplaceId,
          playerId,
          momentType,
          hours: Number(hours),
        },
        limit: Number(limit),
        message: 'Sales endpoint - implementation depends on specific marketplace APIs',
      }));
    } catch (error) {
      logger.error('Error getting recent sales:', error);
      res.status(500).json(createErrorResponse('Failed to get recent sales'));
    }
  });

  // WebSocket endpoint info
  router.get('/websocket/info', (req: Request, res: Response) => {
    try {
      res.json(createSuccessResponse({
        websocket: {
          url: process.env.WEBSOCKET_URL || 'ws://localhost:8002/ws',
          channels: [
            'price_changes',
            'new_listings',
            'sales',
            'arbitrage_opportunities',
            'alerts',
          ],
          authentication: 'Bearer token required',
        },
        message: 'Connect to WebSocket for real-time updates',
      }));
    } catch (error) {
      logger.error('Error getting WebSocket info:', error);
      res.status(500).json(createErrorResponse('Failed to get WebSocket info'));
    }
  });

  // Error handling middleware
  router.use((error: Error, req: Request, res: Response, next: any) => {
    logger.error('Marketplace router error:', error);
    res.status(500).json(createErrorResponse('Internal server error'));
  });

  return router;
}