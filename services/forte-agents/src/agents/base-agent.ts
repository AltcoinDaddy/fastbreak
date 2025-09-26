import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { v4 as uuidv4 } from 'uuid';

export interface AgentConfig {
  checkIntervalMs: number;
  enabled?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface TriggerCondition {
  id: string;
  type: string;
  parameters: Record<string, any>;
  isActive: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  triggersEvaluated: number;
  triggersActivated: number;
  alertsGenerated: number;
  opportunitiesDetected: number;
}

export abstract class BaseAgent extends EventEmitter {
  protected id: string;
  protected name: string;
  protected type: string;
  protected config: AgentConfig;
  protected db: DatabaseManager;
  protected redisClient: Redis.RedisClientType;
  protected logger: Logger;
  protected isRunning: boolean = false;
  protected isPaused: boolean = false;
  protected intervalId?: NodeJS.Timeout;
  protected triggerConditions: Map<string, TriggerCondition> = new Map();
  protected lastExecution?: AgentExecution;

  constructor(
    name: string,
    type: string,
    config: AgentConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.id = uuidv4();
    this.name = name;
    this.type = type;
    this.config = { enabled: true, maxRetries: 3, retryDelayMs: 5000, timeoutMs: 30000, ...config };
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger.child({ agentId: this.id, agentName: this.name });
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract initializeTriggerConditions(): Promise<void>;
  protected abstract evaluateTriggerConditions(): Promise<TriggerCondition[]>;
  protected abstract executeTriggerActions(triggers: TriggerCondition[]): Promise<void>;

  // Public interface methods
  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getType(): string {
    return this.type;
  }

  public isActive(): boolean {
    return this.isRunning && !this.isPaused;
  }

  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        this.logger.warn('Agent is already running');
        return;
      }

      if (!this.config.enabled) {
        this.logger.warn('Agent is disabled');
        return;
      }

      this.logger.info('Starting agent');

      // Initialize trigger conditions
      await this.initializeTriggerConditions();

      // Start the execution loop
      this.isRunning = true;
      this.isPaused = false;
      this.scheduleNextExecution();

      this.logger.info('Agent started successfully');
      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start agent:', error);
      this.isRunning = false;
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        this.logger.warn('Agent is not running');
        return;
      }

      this.logger.info('Stopping agent');

      this.isRunning = false;
      this.isPaused = false;

      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = undefined;
      }

      this.logger.info('Agent stopped successfully');
      this.emit('stopped');

    } catch (error) {
      this.logger.error('Failed to stop agent:', error);
      throw error;
    }
  }

  public async pause(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Cannot pause agent that is not running');
    }

    this.isPaused = true;
    this.logger.info('Agent paused');
    this.emit('paused');
  }

  public async resume(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Cannot resume agent that is not running');
    }

    if (!this.isPaused) {
      this.logger.warn('Agent is not paused');
      return;
    }

    this.isPaused = false;
    this.scheduleNextExecution();
    this.logger.info('Agent resumed');
    this.emit('resumed');
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Basic health checks
      if (!this.isRunning) {
        return false;
      }

      // Check database connection
      // This would be implemented with actual database ping
      
      // Check Redis connection
      await this.redisClient.ping();

      // Check if agent is stuck (no execution in the last interval * 2)
      if (this.lastExecution) {
        const timeSinceLastExecution = Date.now() - this.lastExecution.startTime.getTime();
        if (timeSinceLastExecution > this.config.checkIntervalMs * 2) {
          this.logger.warn('Agent appears to be stuck', { timeSinceLastExecution });
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  // Execution management
  private scheduleNextExecution(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.intervalId = setTimeout(async () => {
      try {
        await this.executeAgent();
      } catch (error) {
        this.logger.error('Agent execution failed:', error);
        this.emit('failed', error);
      } finally {
        this.scheduleNextExecution();
      }
    }, this.config.checkIntervalMs);
  }

  private async executeAgent(): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    const execution: AgentExecution = {
      id: uuidv4(),
      agentId: this.id,
      startTime: new Date(),
      status: 'running',
      triggersEvaluated: 0,
      triggersActivated: 0,
      alertsGenerated: 0,
      opportunitiesDetected: 0,
    };

    this.lastExecution = execution;

    try {
      this.logger.debug('Starting agent execution');

      // Set execution timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Agent execution timeout')), this.config.timeoutMs);
      });

      // Execute with timeout
      await Promise.race([
        this.performExecution(execution),
        timeoutPromise,
      ]);

      // Mark execution as completed
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.status = 'completed';

      this.logger.debug('Agent execution completed', {
        duration: execution.duration,
        triggersEvaluated: execution.triggersEvaluated,
        triggersActivated: execution.triggersActivated,
      });

      this.emit('completed', execution.duration);

    } catch (error) {
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Agent execution failed:', error);
      this.emit('failed', error);
    }
  }

  private async performExecution(execution: AgentExecution): Promise<void> {
    // Evaluate trigger conditions
    const activatedTriggers = await this.evaluateTriggerConditions();
    execution.triggersEvaluated = this.triggerConditions.size;
    execution.triggersActivated = activatedTriggers.length;

    if (activatedTriggers.length > 0) {
      this.logger.info('Triggers activated', { 
        count: activatedTriggers.length,
        triggers: activatedTriggers.map(t => t.type)
      });

      // Update trigger statistics
      for (const trigger of activatedTriggers) {
        trigger.lastTriggered = new Date();
        trigger.triggerCount++;
      }

      // Execute trigger actions
      await this.executeTriggerActions(activatedTriggers);

      this.emit('triggered', {
        triggers: activatedTriggers,
        execution: execution,
      });
    }
  }

  // Trigger condition management
  protected addTriggerCondition(condition: Omit<TriggerCondition, 'id' | 'triggerCount'>): string {
    const id = uuidv4();
    const fullCondition: TriggerCondition = {
      ...condition,
      id,
      triggerCount: 0,
    };

    this.triggerConditions.set(id, fullCondition);
    this.logger.debug('Trigger condition added', { id, type: condition.type });

    return id;
  }

  protected removeTriggerCondition(id: string): boolean {
    const removed = this.triggerConditions.delete(id);
    if (removed) {
      this.logger.debug('Trigger condition removed', { id });
    }
    return removed;
  }

  protected updateTriggerCondition(id: string, updates: Partial<TriggerCondition>): boolean {
    const condition = this.triggerConditions.get(id);
    if (!condition) {
      return false;
    }

    Object.assign(condition, updates);
    this.logger.debug('Trigger condition updated', { id, updates });
    return true;
  }

  protected getTriggerCondition(id: string): TriggerCondition | undefined {
    return this.triggerConditions.get(id);
  }

  protected getAllTriggerConditions(): TriggerCondition[] {
    return Array.from(this.triggerConditions.values());
  }

  // Alert and opportunity generation
  protected generateAlert(alertData: {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    data?: any;
    userId?: string;
  }): void {
    this.logger.info('Alert generated', { 
      type: alertData.type, 
      severity: alertData.severity,
      title: alertData.title 
    });

    if (this.lastExecution) {
      this.lastExecution.alertsGenerated++;
    }

    this.emit('alertGenerated', alertData);
  }

  protected generateOpportunity(opportunityData: {
    type: string;
    momentId: string;
    action: 'buy' | 'sell' | 'arbitrage';
    estimatedProfit: number;
    confidence: number;
    riskScore: number;
    expiresAt: Date;
    data?: any;
  }): void {
    this.logger.info('Opportunity detected', { 
      type: opportunityData.type,
      momentId: opportunityData.momentId,
      action: opportunityData.action,
      estimatedProfit: opportunityData.estimatedProfit 
    });

    if (this.lastExecution) {
      this.lastExecution.opportunitiesDetected++;
    }

    this.emit('opportunityDetected', opportunityData);
  }

  // Utility methods
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.maxRetries || 3,
    delayMs: number = this.config.retryDelayMs || 5000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          break;
        }

        this.logger.warn('Operation failed, retrying', { 
          attempt, 
          maxRetries, 
          error: lastError.message 
        });

        await this.sleep(delayMs * attempt); // Exponential backoff
      }
    }

    throw lastError!;
  }

  protected async cacheGet(key: string): Promise<string | null> {
    try {
      return await this.redisClient.get(`agent:${this.id}:${key}`);
    } catch (error) {
      this.logger.error('Cache get error:', error);
      return null;
    }
  }

  protected async cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      const cacheKey = `agent:${this.id}:${key}`;
      if (ttlSeconds) {
        await this.redisClient.setEx(cacheKey, ttlSeconds, value);
      } else {
        await this.redisClient.set(cacheKey, value);
      }
    } catch (error) {
      this.logger.error('Cache set error:', error);
    }
  }

  protected async cacheDel(key: string): Promise<void> {
    try {
      await this.redisClient.del(`agent:${this.id}:${key}`);
    } catch (error) {
      this.logger.error('Cache delete error:', error);
    }
  }

  // Configuration management
  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('Agent configuration updated', { updates });
    this.emit('configUpdated', this.config);
  }

  // Statistics and monitoring
  public getStatistics(): {
    id: string;
    name: string;
    type: string;
    isRunning: boolean;
    isPaused: boolean;
    triggerConditions: number;
    lastExecution?: {
      startTime: Date;
      duration?: number;
      status: string;
      triggersEvaluated: number;
      triggersActivated: number;
      alertsGenerated: number;
      opportunitiesDetected: number;
    };
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      triggerConditions: this.triggerConditions.size,
      lastExecution: this.lastExecution ? {
        startTime: this.lastExecution.startTime,
        duration: this.lastExecution.duration,
        status: this.lastExecution.status,
        triggersEvaluated: this.lastExecution.triggersEvaluated,
        triggersActivated: this.lastExecution.triggersActivated,
        alertsGenerated: this.lastExecution.alertsGenerated,
        opportunitiesDetected: this.lastExecution.opportunitiesDetected,
      } : undefined,
    };
  }
}