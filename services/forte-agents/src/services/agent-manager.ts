import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { BaseAgent } from '../agents/base-agent';
import { v4 as uuidv4 } from 'uuid';

export interface AgentManagerConfig {
  maxConcurrentAgents: number;
  agentCheckIntervalMs: number;
  failureRetryDelayMs: number;
  maxRetryAttempts: number;
  enableHealthChecks: boolean;
  healthCheckIntervalMs: number;
  dataRetentionDays: number;
  alertCooldownMs: number;
  externalServices: {
    nbaStatsAPI: {
      baseUrl: string;
      rateLimitPerSecond: number;
    };
    topShotAPI: {
      baseUrl: string;
      apiKey?: string;
      rateLimitPerSecond: number;
    };
    tradingService: {
      baseUrl: string;
      apiKey?: string;
    };
    aiScoutingService: {
      baseUrl: string;
      apiKey?: string;
    };
  };
}

export interface AgentStatus {
  id: string;
  name: string;
  type: string;
  status: 'stopped' | 'running' | 'failed' | 'paused';
  lastRun: Date | null;
  nextRun: Date | null;
  runCount: number;
  failureCount: number;
  lastError?: string;
  performance: {
    averageExecutionTime: number;
    successRate: number;
    alertsGenerated: number;
    opportunitiesDetected: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  agentId: string;
  agentName: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data: any;
  userId?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
}

export interface Opportunity {
  id: string;
  agentId: string;
  agentName: string;
  type: string;
  momentId: string;
  action: 'buy' | 'sell' | 'arbitrage';
  estimatedProfit: number;
  confidence: number;
  riskScore: number;
  expiresAt: Date;
  data: any;
  status: 'active' | 'executed' | 'expired' | 'cancelled';
  createdAt: Date;
}

export class AgentManager extends EventEmitter {
  private config: AgentManagerConfig;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private logger: Logger;
  private agents: Map<string, BaseAgent>;
  private agentStatuses: Map<string, AgentStatus>;
  private runningAgents: Set<string>;
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    config: AgentManagerConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger;
    this.agents = new Map();
    this.agentStatuses = new Map();
    this.runningAgents = new Set();
  }

  public async initialize(): Promise<void> {
    try {
      // Start health check monitoring
      if (this.config.enableHealthChecks) {
        this.startHealthCheckMonitoring();
      }

      // Start cleanup tasks
      this.startCleanupTasks();

      this.logger.info('Agent manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize agent manager:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      // Stop all agents
      await this.stopAllAgents();

      // Clear intervals
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      this.agents.clear();
      this.agentStatuses.clear();
      this.runningAgents.clear();

      this.logger.info('Agent manager shutdown complete');
    } catch (error) {
      this.logger.error('Error during agent manager shutdown:', error);
      throw error;
    }
  }

  // Agent Registration and Management
  public async registerAgent(agent: BaseAgent): Promise<void> {
    try {
      const agentId = agent.getId();
      const agentName = agent.getName();

      if (this.agents.has(agentId)) {
        throw new Error(`Agent with ID ${agentId} is already registered`);
      }

      // Register the agent
      this.agents.set(agentId, agent);

      // Initialize agent status
      const status: AgentStatus = {
        id: agentId,
        name: agentName,
        type: agent.getType(),
        status: 'stopped',
        lastRun: null,
        nextRun: null,
        runCount: 0,
        failureCount: 0,
        performance: {
          averageExecutionTime: 0,
          successRate: 100,
          alertsGenerated: 0,
          opportunitiesDetected: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.agentStatuses.set(agentId, status);

      // Setup agent event listeners
      this.setupAgentEventListeners(agent);

      this.logger.info('Agent registered', { agentId, agentName, type: agent.getType() });
      this.emit('agentRegistered', agentId, agentName);

    } catch (error) {
      this.logger.error('Error registering agent:', error);
      throw error;
    }
  }

  public async unregisterAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      // Stop the agent if running
      if (this.runningAgents.has(agentId)) {
        await this.stopAgent(agentId);
      }

      // Remove from collections
      this.agents.delete(agentId);
      this.agentStatuses.delete(agentId);

      this.logger.info('Agent unregistered', { agentId });
      this.emit('agentUnregistered', agentId);

    } catch (error) {
      this.logger.error('Error unregistering agent:', error);
      throw error;
    }
  }

  // Agent Execution Control
  public async startAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      const status = this.agentStatuses.get(agentId);

      if (!agent || !status) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      if (this.runningAgents.has(agentId)) {
        this.logger.warn('Agent is already running', { agentId });
        return;
      }

      // Check concurrent agent limit
      if (this.runningAgents.size >= this.config.maxConcurrentAgents) {
        throw new Error('Maximum concurrent agents limit reached');
      }

      // Start the agent
      await agent.start();
      this.runningAgents.add(agentId);

      // Update status
      status.status = 'running';
      status.updatedAt = new Date();

      this.logger.info('Agent started', { agentId, agentName: agent.getName() });
      this.emit('agentStarted', agentId, agent.getName());

    } catch (error) {
      this.logger.error('Error starting agent:', error);
      
      // Update status to failed
      const status = this.agentStatuses.get(agentId);
      if (status) {
        status.status = 'failed';
        status.lastError = error instanceof Error ? error.message : 'Unknown error';
        status.failureCount++;
        status.updatedAt = new Date();
      }

      throw error;
    }
  }

  public async stopAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      const status = this.agentStatuses.get(agentId);

      if (!agent || !status) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      if (!this.runningAgents.has(agentId)) {
        this.logger.warn('Agent is not running', { agentId });
        return;
      }

      // Stop the agent
      await agent.stop();
      this.runningAgents.delete(agentId);

      // Update status
      status.status = 'stopped';
      status.updatedAt = new Date();

      this.logger.info('Agent stopped', { agentId, agentName: agent.getName() });
      this.emit('agentStopped', agentId, agent.getName());

    } catch (error) {
      this.logger.error('Error stopping agent:', error);
      throw error;
    }
  }

  public async pauseAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      const status = this.agentStatuses.get(agentId);

      if (!agent || !status) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      await agent.pause();

      // Update status
      status.status = 'paused';
      status.updatedAt = new Date();

      this.logger.info('Agent paused', { agentId, agentName: agent.getName() });
      this.emit('agentPaused', agentId, agent.getName());

    } catch (error) {
      this.logger.error('Error pausing agent:', error);
      throw error;
    }
  }

  public async resumeAgent(agentId: string): Promise<void> {
    try {
      const agent = this.agents.get(agentId);
      const status = this.agentStatuses.get(agentId);

      if (!agent || !status) {
        throw new Error(`Agent with ID ${agentId} not found`);
      }

      await agent.resume();

      // Update status
      status.status = 'running';
      status.updatedAt = new Date();

      this.logger.info('Agent resumed', { agentId, agentName: agent.getName() });
      this.emit('agentResumed', agentId, agent.getName());

    } catch (error) {
      this.logger.error('Error resuming agent:', error);
      throw error;
    }
  }

  public async startAllAgents(): Promise<void> {
    const agentIds = Array.from(this.agents.keys());
    
    for (const agentId of agentIds) {
      try {
        await this.startAgent(agentId);
      } catch (error) {
        this.logger.error('Error starting agent during bulk start:', { agentId, error });
      }
    }
  }

  public async stopAllAgents(): Promise<void> {
    const runningAgentIds = Array.from(this.runningAgents);
    
    for (const agentId of runningAgentIds) {
      try {
        await this.stopAgent(agentId);
      } catch (error) {
        this.logger.error('Error stopping agent during bulk stop:', { agentId, error });
      }
    }
  }

  // Event Handling
  private setupAgentEventListeners(agent: BaseAgent): void {
    const agentId = agent.getId();

    agent.on('triggered', (triggerData) => {
      this.handleAgentTriggered(agentId, triggerData);
    });

    agent.on('completed', (executionTime) => {
      this.handleAgentCompleted(agentId, executionTime);
    });

    agent.on('failed', (error) => {
      this.handleAgentFailed(agentId, error);
    });

    agent.on('alertGenerated', (alert) => {
      this.handleAlertGenerated(agentId, alert);
    });

    agent.on('opportunityDetected', (opportunity) => {
      this.handleOpportunityDetected(agentId, opportunity);
    });
  }

  private handleAgentTriggered(agentId: string, triggerData: any): void {
    const status = this.agentStatuses.get(agentId);
    const agent = this.agents.get(agentId);

    if (status && agent) {
      status.lastRun = new Date();
      status.runCount++;
      status.updatedAt = new Date();

      this.emit('agentTriggered', agentId, agent.getName(), triggerData);
    }
  }

  private handleAgentCompleted(agentId: string, executionTime: number): void {
    const status = this.agentStatuses.get(agentId);

    if (status) {
      // Update performance metrics
      const totalExecutionTime = status.performance.averageExecutionTime * (status.runCount - 1) + executionTime;
      status.performance.averageExecutionTime = totalExecutionTime / status.runCount;
      
      const successfulRuns = status.runCount - status.failureCount;
      status.performance.successRate = (successfulRuns / status.runCount) * 100;
      
      status.updatedAt = new Date();
    }
  }

  private handleAgentFailed(agentId: string, error: Error): void {
    const status = this.agentStatuses.get(agentId);
    const agent = this.agents.get(agentId);

    if (status && agent) {
      status.status = 'failed';
      status.lastError = error.message;
      status.failureCount++;
      status.updatedAt = new Date();

      // Update success rate
      const successfulRuns = status.runCount - status.failureCount;
      status.performance.successRate = status.runCount > 0 ? (successfulRuns / status.runCount) * 100 : 0;

      this.emit('agentFailed', agentId, agent.getName(), error);

      // Schedule retry if within limits
      if (status.failureCount <= this.config.maxRetryAttempts) {
        setTimeout(() => {
          this.retryAgent(agentId);
        }, this.config.failureRetryDelayMs);
      } else {
        this.logger.error('Agent exceeded maximum retry attempts', { agentId });
        this.runningAgents.delete(agentId);
      }
    }
  }

  private async retryAgent(agentId: string): Promise<void> {
    try {
      this.logger.info('Retrying failed agent', { agentId });
      await this.startAgent(agentId);
    } catch (error) {
      this.logger.error('Agent retry failed', { agentId, error });
    }
  }

  private handleAlertGenerated(agentId: string, alertData: any): void {
    const agent = this.agents.get(agentId);
    const status = this.agentStatuses.get(agentId);

    if (agent && status) {
      const alert: Alert = {
        id: uuidv4(),
        agentId,
        agentName: agent.getName(),
        type: alertData.type,
        severity: alertData.severity,
        title: alertData.title,
        message: alertData.message,
        data: alertData.data,
        userId: alertData.userId,
        acknowledged: false,
        createdAt: new Date(),
      };

      // Update performance metrics
      status.performance.alertsGenerated++;
      status.updatedAt = new Date();

      // Store alert
      this.storeAlert(alert);

      this.emit('alertGenerated', alert);
    }
  }

  private handleOpportunityDetected(agentId: string, opportunityData: any): void {
    const agent = this.agents.get(agentId);
    const status = this.agentStatuses.get(agentId);

    if (agent && status) {
      const opportunity: Opportunity = {
        id: uuidv4(),
        agentId,
        agentName: agent.getName(),
        type: opportunityData.type,
        momentId: opportunityData.momentId,
        action: opportunityData.action,
        estimatedProfit: opportunityData.estimatedProfit,
        confidence: opportunityData.confidence,
        riskScore: opportunityData.riskScore,
        expiresAt: opportunityData.expiresAt,
        data: opportunityData.data,
        status: 'active',
        createdAt: new Date(),
      };

      // Update performance metrics
      status.performance.opportunitiesDetected++;
      status.updatedAt = new Date();

      // Store opportunity
      this.storeOpportunity(opportunity);

      this.emit('opportunityDetected', opportunity);
    }
  }

  // Health Monitoring
  private startHealthCheckMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        this.logger.error('Error during health check:', error);
      }
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [agentId, agent] of this.agents) {
      try {
        const isHealthy = await agent.healthCheck();
        const status = this.agentStatuses.get(agentId);

        if (!isHealthy && status && status.status === 'running') {
          this.logger.warn('Agent health check failed', { agentId });
          
          // Attempt to restart the agent
          await this.stopAgent(agentId);
          setTimeout(() => {
            this.startAgent(agentId);
          }, 5000);
        }
      } catch (error) {
        this.logger.error('Health check error for agent:', { agentId, error });
      }
    }
  }

  // Data Management
  private startCleanupTasks(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performDataCleanup();
      } catch (error) {
        this.logger.error('Error during data cleanup:', error);
      }
    }, 60 * 60 * 1000);
  }

  private async performDataCleanup(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.dataRetentionDays);

    // Clean up old alerts and opportunities
    // This would be implemented with actual database operations
    this.logger.debug('Performing data cleanup', { cutoffDate });
  }

  private async storeAlert(alert: Alert): Promise<void> {
    try {
      // Store alert in database
      // This would be implemented with actual database operations
      this.logger.debug('Storing alert', { alertId: alert.id, type: alert.type });
    } catch (error) {
      this.logger.error('Error storing alert:', error);
    }
  }

  private async storeOpportunity(opportunity: Opportunity): Promise<void> {
    try {
      // Store opportunity in database
      // This would be implemented with actual database operations
      this.logger.debug('Storing opportunity', { 
        opportunityId: opportunity.id, 
        type: opportunity.type,
        estimatedProfit: opportunity.estimatedProfit 
      });
    } catch (error) {
      this.logger.error('Error storing opportunity:', error);
    }
  }

  // Public API Methods
  public getAgentStatus(agentId: string): AgentStatus | null {
    return this.agentStatuses.get(agentId) || null;
  }

  public getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  public getRegisteredAgentCount(): number {
    return this.agents.size;
  }

  public getActiveAgentCount(): number {
    return this.runningAgents.size;
  }

  public getFailedAgentCount(): number {
    return Array.from(this.agentStatuses.values())
      .filter(status => status.status === 'failed').length;
  }

  public async getRecentAlerts(limit: number = 50): Promise<Alert[]> {
    // This would query the database for recent alerts
    return [];
  }

  public async getActiveOpportunities(): Promise<Opportunity[]> {
    // This would query the database for active opportunities
    return [];
  }

  public getSystemMetrics(): {
    totalAgents: number;
    activeAgents: number;
    failedAgents: number;
    totalRuns: number;
    totalAlerts: number;
    totalOpportunities: number;
    averageSuccessRate: number;
  } {
    const statuses = Array.from(this.agentStatuses.values());
    
    const totalRuns = statuses.reduce((sum, status) => sum + status.runCount, 0);
    const totalAlerts = statuses.reduce((sum, status) => sum + status.performance.alertsGenerated, 0);
    const totalOpportunities = statuses.reduce((sum, status) => sum + status.performance.opportunitiesDetected, 0);
    const averageSuccessRate = statuses.length > 0 
      ? statuses.reduce((sum, status) => sum + status.performance.successRate, 0) / statuses.length
      : 0;

    return {
      totalAgents: this.agents.size,
      activeAgents: this.runningAgents.size,
      failedAgents: this.getFailedAgentCount(),
      totalRuns,
      totalAlerts,
      totalOpportunities,
      averageSuccessRate,
    };
  }
}