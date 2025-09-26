import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { createLogger } from '@fastbreak/monitoring';
import * as cron from 'node-cron';

const logger = createLogger({ serviceName: 'alert-manager' });

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  notificationChannels: string[];
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'webhook' | 'slack';
  config: Record<string, any>;
  enabled: boolean;
}

export class AlertManager {
  private redis: Redis;
  private emailTransporter: nodemailer.Transporter | null = null;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.initializeEmailTransporter();
    this.loadDefaultAlertRules();
  }

  async start() {
    logger.info('Starting alert manager');
    
    // Load existing alerts from Redis
    await this.loadActiveAlerts();
    
    // Schedule alert evaluation every minute
    cron.schedule('* * * * *', async () => {
      await this.evaluateAlerts();
    });

    // Schedule alert cleanup every hour
    cron.schedule('0 * * * *', async () => {
      await this.cleanupResolvedAlerts();
    });
  }

  async stop() {
    logger.info('Alert manager stopped');
  }

  private initializeEmailTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (emailConfig.auth.user && emailConfig.auth.pass) {
      this.emailTransporter = nodemailer.createTransporter(emailConfig);
      logger.info('Email transporter initialized');
    } else {
      logger.warn('Email configuration not found, email alerts disabled');
    }
  }

  private loadDefaultAlertRules() {
    const defaultRules: AlertRule[] = [
      {
        id: 'high_response_time',
        name: 'High Response Time',
        condition: 'avgResponseTime > threshold',
        threshold: 2000, // 2 seconds
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['email', 'webhook']
      },
      {
        id: 'critical_response_time',
        name: 'Critical Response Time',
        condition: 'avgResponseTime > threshold',
        threshold: 5000, // 5 seconds
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 2,
        notificationChannels: ['email', 'webhook']
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        condition: 'errorRate > threshold',
        threshold: 0.05, // 5%
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['email']
      },
      {
        id: 'critical_error_rate',
        name: 'Critical Error Rate',
        condition: 'errorRate > threshold',
        threshold: 0.15, // 15%
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 2,
        notificationChannels: ['email', 'webhook']
      },
      {
        id: 'low_cache_hit_rate',
        name: 'Low Cache Hit Rate',
        condition: 'cacheHitRate < threshold',
        threshold: 0.7, // 70%
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 10,
        notificationChannels: ['email']
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: 'memoryUsage > threshold',
        threshold: 0.85, // 85%
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['email']
      },
      {
        id: 'critical_memory_usage',
        name: 'Critical Memory Usage',
        condition: 'memoryUsage > threshold',
        threshold: 0.95, // 95%
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 2,
        notificationChannels: ['email', 'webhook']
      },
      {
        id: 'database_connection_limit',
        name: 'Database Connection Limit',
        condition: 'dbConnections > threshold',
        threshold: 80, // 80 connections
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        notificationChannels: ['email']
      },
      {
        id: 'no_active_users',
        name: 'No Active Users',
        condition: 'activeUsers < threshold',
        threshold: 1,
        severity: 'info',
        enabled: true,
        cooldownMinutes: 30,
        notificationChannels: ['email']
      }
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });

    logger.info('Default alert rules loaded', { count: defaultRules.length });
  }

  async evaluateAlerts() {
    try {
      // Get current metrics from Redis
      const metricsData = await this.redis.zrevrange('performance_metrics', 0, 0);
      if (metricsData.length === 0) {
        return;
      }

      const currentMetrics = JSON.parse(metricsData[0]);
      
      // Evaluate each alert rule
      for (const [ruleId, rule] of this.alertRules) {
        if (!rule.enabled) continue;

        const shouldAlert = this.evaluateRule(rule, currentMetrics);
        const existingAlert = this.activeAlerts.get(ruleId);
        const lastAlertTime = this.lastAlertTimes.get(ruleId) || 0;
        const cooldownExpired = Date.now() - lastAlertTime > (rule.cooldownMinutes * 60 * 1000);

        if (shouldAlert && !existingAlert && cooldownExpired) {
          // Create new alert
          const alert = await this.createAlert(rule, currentMetrics);
          this.activeAlerts.set(ruleId, alert);
          this.lastAlertTimes.set(ruleId, Date.now());
          
          await this.sendNotifications(alert, rule);
          await this.persistAlert(alert);
          
          logger.warn('Alert triggered', { 
            ruleId, 
            ruleName: rule.name, 
            severity: rule.severity 
          });
        } else if (!shouldAlert && existingAlert && !existingAlert.resolved) {
          // Resolve existing alert
          existingAlert.resolved = true;
          existingAlert.resolvedAt = Date.now();
          
          await this.persistAlert(existingAlert);
          
          logger.info('Alert resolved', { 
            ruleId, 
            ruleName: rule.name 
          });
        }
      }
    } catch (error) {
      logger.error('Error evaluating alerts', { error: (error as Error).message });
    }
  }

  private evaluateRule(rule: AlertRule, metrics: any): boolean {
    try {
      // Simple condition evaluation - could be enhanced with a proper expression parser
      const condition = rule.condition;
      const threshold = rule.threshold;

      if (condition.includes('avgResponseTime > threshold')) {
        return metrics.avgResponseTime > threshold;
      } else if (condition.includes('errorRate > threshold')) {
        return metrics.errorRate > threshold;
      } else if (condition.includes('cacheHitRate < threshold')) {
        return metrics.cacheHitRate < threshold;
      } else if (condition.includes('memoryUsage > threshold')) {
        return metrics.memoryUsage > threshold;
      } else if (condition.includes('dbConnections > threshold')) {
        return metrics.dbConnections > threshold;
      } else if (condition.includes('activeUsers < threshold')) {
        return metrics.activeUsers < threshold;
      }

      return false;
    } catch (error) {
      logger.error('Error evaluating rule condition', { 
        ruleId: rule.id, 
        condition: rule.condition, 
        error: (error as Error).message 
      });
      return false;
    }
  }

  private async createAlert(rule: AlertRule, metrics: any): Promise<Alert> {
    const alert: Alert = {
      id: `${rule.id}_${Date.now()}`,
      title: rule.name,
      message: this.generateAlertMessage(rule, metrics),
      severity: rule.severity,
      timestamp: Date.now(),
      resolved: false,
      metadata: {
        ruleId: rule.id,
        metrics: metrics,
        threshold: rule.threshold
      }
    };

    return alert;
  }

  private generateAlertMessage(rule: AlertRule, metrics: any): string {
    const threshold = rule.threshold;
    
    switch (rule.id) {
      case 'high_response_time':
      case 'critical_response_time':
        return `Average response time is ${metrics.avgResponseTime.toFixed(0)}ms, exceeding threshold of ${threshold}ms`;
      
      case 'high_error_rate':
      case 'critical_error_rate':
        return `Error rate is ${(metrics.errorRate * 100).toFixed(2)}%, exceeding threshold of ${(threshold * 100).toFixed(2)}%`;
      
      case 'low_cache_hit_rate':
        return `Cache hit rate is ${(metrics.cacheHitRate * 100).toFixed(1)}%, below threshold of ${(threshold * 100).toFixed(1)}%`;
      
      case 'high_memory_usage':
      case 'critical_memory_usage':
        return `Memory usage is ${(metrics.memoryUsage * 100).toFixed(1)}%, exceeding threshold of ${(threshold * 100).toFixed(1)}%`;
      
      case 'database_connection_limit':
        return `Database connections: ${metrics.dbConnections}, exceeding threshold of ${threshold}`;
      
      case 'no_active_users':
        return `No active users detected (current: ${metrics.activeUsers})`;
      
      default:
        return `Alert condition met for ${rule.name}`;
    }
  }

  private async sendNotifications(alert: Alert, rule: AlertRule) {
    for (const channelType of rule.notificationChannels) {
      try {
        switch (channelType) {
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
          case 'slack':
            await this.sendSlackNotification(alert);
            break;
        }
      } catch (error) {
        logger.error('Error sending notification', { 
          channelType, 
          alertId: alert.id, 
          error: (error as Error).message 
        });
      }
    }
  }

  private async sendEmailNotification(alert: Alert) {
    if (!this.emailTransporter) {
      logger.warn('Email transporter not configured, skipping email notification');
      return;
    }

    const recipients = process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [];
    if (recipients.length === 0) {
      logger.warn('No email recipients configured');
      return;
    }

    const subject = `[FastBreak ${alert.severity.toUpperCase()}] ${alert.title}`;
    const html = `
      <h2>FastBreak Alert</h2>
      <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
      <p><strong>Title:</strong> ${alert.title}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
      <hr>
      <p>This is an automated alert from the FastBreak monitoring system.</p>
    `;

    await this.emailTransporter.sendMail({
      from: process.env.ALERT_EMAIL_FROM || 'alerts@fastbreak.com',
      to: recipients.join(','),
      subject,
      html
    });

    logger.info('Email notification sent', { alertId: alert.id, recipients: recipients.length });
  }

  private async sendWebhookNotification(alert: Alert) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.warn('Webhook URL not configured');
      return;
    }

    const payload = {
      alert,
      timestamp: Date.now(),
      service: 'fastbreak'
    };

    // This would use fetch or axios to send the webhook
    logger.info('Webhook notification would be sent', { alertId: alert.id, url: webhookUrl });
  }

  private async sendSlackNotification(alert: Alert) {
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!slackWebhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return;
    }

    const color = alert.severity === 'critical' ? 'danger' : 
                  alert.severity === 'warning' ? 'warning' : 'good';

    const payload = {
      attachments: [{
        color,
        title: `FastBreak Alert: ${alert.title}`,
        text: alert.message,
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Time',
            value: new Date(alert.timestamp).toLocaleString(),
            short: true
          }
        ]
      }]
    };

    logger.info('Slack notification would be sent', { alertId: alert.id });
  }

  private async persistAlert(alert: Alert) {
    try {
      await this.redis.hset('alerts', alert.id, JSON.stringify(alert));
      await this.redis.zadd('alerts_timeline', alert.timestamp, alert.id);
    } catch (error) {
      logger.error('Error persisting alert', { alertId: alert.id, error: (error as Error).message });
    }
  }

  private async loadActiveAlerts() {
    try {
      const alertIds = await this.redis.hkeys('alerts');
      
      for (const alertId of alertIds) {
        const alertData = await this.redis.hget('alerts', alertId);
        if (alertData) {
          const alert: Alert = JSON.parse(alertData);
          if (!alert.resolved) {
            this.activeAlerts.set(alert.metadata?.ruleId || alertId, alert);
          }
        }
      }

      logger.info('Active alerts loaded', { count: this.activeAlerts.size });
    } catch (error) {
      logger.error('Error loading active alerts', { error: (error as Error).message });
    }
  }

  private async cleanupResolvedAlerts() {
    try {
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      // Get old alert IDs
      const oldAlertIds = await this.redis.zrangebyscore('alerts_timeline', '-inf', cutoffTime);
      
      if (oldAlertIds.length > 0) {
        // Remove from hash
        await this.redis.hdel('alerts', ...oldAlertIds);
        
        // Remove from timeline
        await this.redis.zremrangebyscore('alerts_timeline', '-inf', cutoffTime);
        
        logger.info('Cleaned up old alerts', { count: oldAlertIds.length });
      }
    } catch (error) {
      logger.error('Error cleaning up alerts', { error: (error as Error).message });
    }
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  async getAlertHistory(hours: number = 24): Promise<Alert[]> {
    try {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      const alertIds = await this.redis.zrangebyscore('alerts_timeline', cutoffTime, '+inf');
      
      const alerts: Alert[] = [];
      for (const alertId of alertIds) {
        const alertData = await this.redis.hget('alerts', alertId);
        if (alertData) {
          alerts.push(JSON.parse(alertData));
        }
      }
      
      return alerts.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('Error retrieving alert history', { error: (error as Error).message });
      return [];
    }
  }

  async addAlertRule(rule: AlertRule) {
    this.alertRules.set(rule.id, rule);
    logger.info('Alert rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  async removeAlertRule(ruleId: string) {
    this.alertRules.delete(ruleId);
    logger.info('Alert rule removed', { ruleId });
  }

  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>) {
    const existingRule = this.alertRules.get(ruleId);
    if (existingRule) {
      const updatedRule = { ...existingRule, ...updates };
      this.alertRules.set(ruleId, updatedRule);
      logger.info('Alert rule updated', { ruleId, updates });
    }
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }
}