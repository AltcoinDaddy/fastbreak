import { Router } from 'express';
import { PerformanceCollector } from '../collectors/performance-collector';
import { AlertManager } from '../alerting/alert-manager';
import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'dashboard-api' });

export class DashboardAPI {
  private router: Router;

  constructor(
    private performanceCollector: PerformanceCollector,
    private alertManager: AlertManager
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Current metrics
    this.router.get('/metrics/current', async (req, res) => {
      try {
        const metrics = await this.performanceCollector.getCurrentMetrics();
        res.json(metrics);
      } catch (error) {
        logger.error('Error getting current metrics', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get current metrics' });
      }
    });

    // Historical metrics
    this.router.get('/metrics/history', async (req, res) => {
      try {
        const hours = parseInt(req.query.hours as string) || 24;
        const metrics = await this.performanceCollector.getMetricsHistory(hours);
        res.json(metrics);
      } catch (error) {
        logger.error('Error getting metrics history', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get metrics history' });
      }
    });

    // System info
    this.router.get('/system/info', async (req, res) => {
      try {
        const systemInfo = await this.performanceCollector.getSystemInfo();
        res.json(systemInfo);
      } catch (error) {
        logger.error('Error getting system info', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get system info' });
      }
    });

    // Active alerts
    this.router.get('/alerts/active', async (req, res) => {
      try {
        const alerts = await this.alertManager.getActiveAlerts();
        res.json(alerts);
      } catch (error) {
        logger.error('Error getting active alerts', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get active alerts' });
      }
    });

    // Alert history
    this.router.get('/alerts/history', async (req, res) => {
      try {
        const hours = parseInt(req.query.hours as string) || 24;
        const alerts = await this.alertManager.getAlertHistory(hours);
        res.json(alerts);
      } catch (error) {
        logger.error('Error getting alert history', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get alert history' });
      }
    });

    // Alert rules
    this.router.get('/alerts/rules', async (req, res) => {
      try {
        const rules = this.alertManager.getAlertRules();
        res.json(rules);
      } catch (error) {
        logger.error('Error getting alert rules', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to get alert rules' });
      }
    });

    // Update alert rule
    this.router.put('/alerts/rules/:ruleId', async (req, res) => {
      try {
        const { ruleId } = req.params;
        const updates = req.body;
        await this.alertManager.updateAlertRule(ruleId, updates);
        res.json({ success: true });
      } catch (error) {
        logger.error('Error updating alert rule', { error: (error as Error).message });
        res.status(500).json({ error: 'Failed to update alert rule' });
      }
    });
  }

  getRouter(): Router {
    return this.router;
  }
}