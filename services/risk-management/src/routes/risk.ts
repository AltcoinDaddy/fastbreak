import { Router } from 'express';
import { Logger } from 'winston';
import { BudgetManager, SpendingRequest } from '../services/budget-manager';
import { BudgetLimits } from '../types/risk';

interface RiskRouterDependencies {
  budgetManager: BudgetManager;
  logger: Logger;
}

export function createRiskRouter(deps: RiskRouterDependencies): Router {
  const router = Router();
  const { budgetManager, logger } = deps;

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

  // Budget Limits Routes
  router.get('/budget/limits', requireUserId, async (req: any, res) => {
    try {
      const limits = await budgetManager.getBudgetLimits(req.userId);
      
      if (!limits) {
        return res.status(404).json({
          success: false,
          error: 'Budget limits not found',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: limits,
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

  router.put('/budget/limits', requireUserId, async (req: any, res) => {
    try {
      const updates: Partial<BudgetLimits> = req.body;
      const { requireConfirmation = true } = req.query;
      
      // Validate required fields
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No budget limit updates provided',
          timestamp: new Date(),
        });
      }

      const updatedLimits = await budgetManager.setBudgetLimits(
        req.userId, 
        updates, 
        requireConfirmation === 'true'
      );

      res.json({
        success: true,
        data: updatedLimits,
        message: 'Budget limits updated successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error updating budget limits:', error);
      
      // Check if error is due to confirmation requirement
      if (error instanceof Error && error.message.includes('require user confirmation')) {
        return res.status(202).json({
          success: false,
          error: error.message,
          requiresConfirmation: true,
          timestamp: new Date(),
        });
      }

      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update budget limits',
        timestamp: new Date(),
      });
    }
  });

  router.post('/budget/limits/confirm', requireUserId, async (req: any, res) => {
    try {
      const { confirmed } = req.body;
      
      if (typeof confirmed !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'confirmed field must be a boolean',
          timestamp: new Date(),
        });
      }

      const result = await budgetManager.confirmBudgetLimitChanges(req.userId, confirmed);

      if (result) {
        res.json({
          success: true,
          data: result,
          message: 'Budget limit changes confirmed and applied',
          timestamp: new Date(),
        });
      } else {
        res.json({
          success: true,
          message: 'Budget limit changes rejected',
          timestamp: new Date(),
        });
      }

    } catch (error) {
      logger.error('Error confirming budget limit changes:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to confirm budget limit changes',
        timestamp: new Date(),
      });
    }
  });

  router.get('/budget/status', requireUserId, async (req: any, res) => {
    try {
      const status = await budgetManager.getBudgetStatus(req.userId);

      res.json({
        success: true,
        data: status,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting budget status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get budget status',
        timestamp: new Date(),
      });
    }
  });

  // Spending Routes
  router.post('/spending/approve', requireUserId, async (req: any, res) => {
    try {
      const spendingRequest: SpendingRequest = {
        userId: req.userId,
        ...req.body,
      };

      // Validate required fields
      const requiredFields = ['amount', 'momentId', 'strategyId', 'transactionType'];
      const missingFields = requiredFields.filter(field => !spendingRequest[field as keyof SpendingRequest]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          timestamp: new Date(),
        });
      }

      const approval = await budgetManager.approveSpending(spendingRequest);

      res.json({
        success: true,
        data: approval,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error approving spending:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve spending',
        timestamp: new Date(),
      });
    }
  });

  router.post('/spending/record', requireUserId, async (req: any, res) => {
    try {
      const spendingRequest: SpendingRequest = {
        userId: req.userId,
        ...req.body,
      };

      await budgetManager.recordSpending(spendingRequest);

      res.json({
        success: true,
        message: 'Spending recorded successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error recording spending:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record spending',
        timestamp: new Date(),
      });
    }
  });

  router.get('/spending/current', requireUserId, async (req: any, res) => {
    try {
      const spending = await budgetManager.getCurrentSpending(req.userId);

      res.json({
        success: true,
        data: spending,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting current spending:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get current spending',
        timestamp: new Date(),
      });
    }
  });

  // Emergency Stop Routes
  router.post('/emergency/trigger', requireUserId, async (req: any, res) => {
    try {
      const { reason, data } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'Reason is required for emergency stop',
          timestamp: new Date(),
        });
      }

      await budgetManager.triggerEmergencyStop(req.userId, reason, data || {});

      res.json({
        success: true,
        message: 'Emergency stop triggered successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error triggering emergency stop:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to trigger emergency stop',
        timestamp: new Date(),
      });
    }
  });

  router.post('/emergency/resolve/:emergencyStopId', requireUserId, async (req: any, res) => {
    try {
      const { emergencyStopId } = req.params;
      const { resolvedBy } = req.body;

      if (!resolvedBy) {
        return res.status(400).json({
          success: false,
          error: 'resolvedBy is required',
          timestamp: new Date(),
        });
      }

      await budgetManager.resolveEmergencyStop(req.userId, emergencyStopId, resolvedBy);

      res.json({
        success: true,
        message: 'Emergency stop resolved successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error resolving emergency stop:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve emergency stop',
        timestamp: new Date(),
      });
    }
  });

  // Budget Allocation Routes
  router.post('/budget/allocation', requireUserId, async (req: any, res) => {
    try {
      const { totalBudget, allocations } = req.body;

      if (!totalBudget || !allocations || !Array.isArray(allocations)) {
        return res.status(400).json({
          success: false,
          error: 'totalBudget and allocations array are required',
          timestamp: new Date(),
        });
      }

      const budgetAllocation = await budgetManager.createBudgetAllocation(
        req.userId,
        totalBudget,
        allocations
      );

      res.json({
        success: true,
        data: budgetAllocation,
        message: 'Budget allocation created successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error creating budget allocation:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create budget allocation',
        timestamp: new Date(),
      });
    }
  });

  // Statistics Routes
  router.get('/stats', async (req, res) => {
    try {
      const stats = budgetManager.getStats();

      res.json({
        success: true,
        data: stats,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting risk management stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
        timestamp: new Date(),
      });
    }
  });

  return router;
}