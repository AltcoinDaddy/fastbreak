import { Router } from 'express';
import { Logger } from 'winston';
import { AgentManager } from '../services/agent-manager';

interface AgentRouterDependencies {
  agentManager: AgentManager;
  logger: Logger;
}

export function createAgentRouter(deps: AgentRouterDependencies): Router {
  const router = Router();
  const { agentManager, logger } = deps;

  // Middleware to extract user ID (optional for some endpoints)
  const extractUserId = (req: any, res: any, next: any) => {
    const userId = req.headers['x-user-id'] as string;
    req.userId = userId;
    next();
  };

  // Agent Management Routes
  router.get('/agents', async (req, res) => {
    try {
      const agents = agentManager.getAllAgentStatuses();

      res.json({
        success: true,
        data: agents,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting agents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agents',
        timestamp: new Date(),
      });
    }
  });

  router.get('/agents/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = agentManager.getAgentStatus(agentId);

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          timestamp: new Date(),
        });
      }

      res.json({
        success: true,
        data: agent,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting agent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agent',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/:agentId/start', async (req, res) => {
    try {
      const { agentId } = req.params;
      await agentManager.startAgent(agentId);

      res.json({
        success: true,
        message: 'Agent started successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error starting agent:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start agent',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/:agentId/stop', async (req, res) => {
    try {
      const { agentId } = req.params;
      await agentManager.stopAgent(agentId);

      res.json({
        success: true,
        message: 'Agent stopped successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error stopping agent:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop agent',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/:agentId/pause', async (req, res) => {
    try {
      const { agentId } = req.params;
      await agentManager.pauseAgent(agentId);

      res.json({
        success: true,
        message: 'Agent paused successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error pausing agent:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause agent',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/:agentId/resume', async (req, res) => {
    try {
      const { agentId } = req.params;
      await agentManager.resumeAgent(agentId);

      res.json({
        success: true,
        message: 'Agent resumed successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error resuming agent:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resume agent',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/start-all', async (req, res) => {
    try {
      await agentManager.startAllAgents();

      res.json({
        success: true,
        message: 'All agents started successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error starting all agents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start all agents',
        timestamp: new Date(),
      });
    }
  });

  router.post('/agents/stop-all', async (req, res) => {
    try {
      await agentManager.stopAllAgents();

      res.json({
        success: true,
        message: 'All agents stopped successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error stopping all agents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to stop all agents',
        timestamp: new Date(),
      });
    }
  });

  // Alert Management Routes
  router.get('/alerts', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const alerts = await agentManager.getRecentAlerts(limit);

      res.json({
        success: true,
        data: alerts,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting alerts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get alerts',
        timestamp: new Date(),
      });
    }
  });

  router.post('/alerts/:alertId/acknowledge', extractUserId, async (req: any, res) => {
    try {
      const { alertId } = req.params;
      const { userId } = req;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID required in X-User-ID header',
          timestamp: new Date(),
        });
      }

      // This would acknowledge the alert in the database
      // For now, just return success
      res.json({
        success: true,
        message: 'Alert acknowledged successfully',
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert',
        timestamp: new Date(),
      });
    }
  });

  // Opportunity Management Routes
  router.get('/opportunities', async (req, res) => {
    try {
      const opportunities = await agentManager.getActiveOpportunities();

      res.json({
        success: true,
        data: opportunities,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting opportunities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get opportunities',
        timestamp: new Date(),
      });
    }
  });

  router.post('/opportunities/:opportunityId/execute', extractUserId, async (req: any, res) => {
    try {
      const { opportunityId } = req.params;
      const { userId } = req;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID required in X-User-ID header',
          timestamp: new Date(),
        });
      }

      // This would execute the opportunity via the trading service
      // For now, just return success
      res.json({
        success: true,
        message: 'Opportunity execution initiated',
        data: { opportunityId, userId },
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error executing opportunity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute opportunity',
        timestamp: new Date(),
      });
    }
  });

  // System Metrics Routes
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = agentManager.getSystemMetrics();

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get metrics',
        timestamp: new Date(),
      });
    }
  });

  // Reports Routes
  router.get('/reports/daily', async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      
      // This would fetch the daily report from cache/database
      // For now, return a placeholder
      const report = {
        date,
        marketOverview: {
          totalVolume24h: 1500000,
          priceChange24h: 5.2,
          marketSentiment: 'bullish',
        },
        keyInsights: [
          'Strong market performance with 5.2% price increase',
          'High trading volume detected: $1.5M',
        ],
        recommendations: [
          'Consider increasing position sizes in high-confidence trades',
        ],
        riskAlerts: [],
      };

      res.json({
        success: true,
        data: report,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting daily report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get daily report',
        timestamp: new Date(),
      });
    }
  });

  router.get('/reports/weekly', async (req, res) => {
    try {
      const weekStart = req.query.weekStart as string;
      
      // This would generate a weekly summary report
      const report = {
        weekStart,
        summary: {
          totalAlerts: 45,
          totalOpportunities: 12,
          averageReturn: 8.5,
          topPerformingStrategy: 'RookieRisers',
        },
        trends: [
          'Increased arbitrage opportunities detected',
          'Post-game spike strategy showing strong performance',
        ],
      };

      res.json({
        success: true,
        data: report,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting weekly report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get weekly report',
        timestamp: new Date(),
      });
    }
  });

  // Configuration Routes
  router.get('/config', async (req, res) => {
    try {
      // Return agent configuration summary
      const config = {
        maxConcurrentAgents: 10,
        agentCheckInterval: 30000,
        enableHealthChecks: true,
        dataRetentionDays: 30,
        registeredAgents: agentManager.getRegisteredAgentCount(),
        activeAgents: agentManager.getActiveAgentCount(),
      };

      res.json({
        success: true,
        data: config,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get config',
        timestamp: new Date(),
      });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const updates = req.body;

      // This would update agent manager configuration
      // For now, just return success
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: updates,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error updating config:', error);
      res.status(400).json({
        success: false,
        error: 'Failed to update config',
        timestamp: new Date(),
      });
    }
  });

  // Health Check Routes
  router.get('/health/agents', async (req, res) => {
    try {
      const agents = agentManager.getAllAgentStatuses();
      const healthStatus = {
        totalAgents: agents.length,
        healthyAgents: agents.filter(a => a.status === 'running').length,
        failedAgents: agents.filter(a => a.status === 'failed').length,
        pausedAgents: agents.filter(a => a.status === 'paused').length,
        overallHealth: 'healthy', // This would be calculated based on agent statuses
      };

      res.json({
        success: true,
        data: healthStatus,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Error getting agent health:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get agent health',
        timestamp: new Date(),
      });
    }
  });

  // Debug Routes (development only)
  if (process.env.NODE_ENV === 'development') {
    router.post('/debug/trigger/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        
        // This would manually trigger an agent for testing
        logger.info('Manual agent trigger requested', { agentId });
        
        res.json({
          success: true,
          message: 'Agent trigger initiated',
          data: { agentId },
          timestamp: new Date(),
        });

      } catch (error) {
        logger.error('Error triggering agent:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to trigger agent',
          timestamp: new Date(),
        });
      }
    });

    router.get('/debug/logs/:agentId', async (req, res) => {
      try {
        const { agentId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;
        
        // This would return recent logs for the agent
        const logs = [
          { timestamp: new Date(), level: 'info', message: 'Agent execution started' },
          { timestamp: new Date(), level: 'debug', message: 'Evaluating trigger conditions' },
        ];

        res.json({
          success: true,
          data: { agentId, logs },
          timestamp: new Date(),
        });

      } catch (error) {
        logger.error('Error getting agent logs:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get agent logs',
          timestamp: new Date(),
        });
      }
    });
  }

  return router;
}