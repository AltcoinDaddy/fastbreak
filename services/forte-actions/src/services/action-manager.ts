import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { BaseAction, ActionConfig, ActionContext, ActionResult } from '../types/action';
import { PurchaseAction, PurchaseActionConfig } from '../actions/purchase-action';
import { ArbitrageAction, ArbitrageActionConfig } from '../actions/arbitrage-action';
import { PortfolioRebalanceAction, PortfolioRebalanceConfig } from '../actions/portfolio-rebalance-action';
import { v4 as uuidv4 } from 'uuid';

export interface ActionManagerConfig {
  maxConcurrentActions: number;
  actionTimeoutMs: number;
  retryDelayMs: number;
  maxRetryAttempts: number;
  enableMetrics: boolean;
  metricsRetentionDays: number;
  purchaseAction: PurchaseActionConfig;
  arbitrageAction: ArbitrageActionConfig;
  portfolioRebalanceAction: PortfolioRebalanceConfig;
}

export interface ActionRequest {
  id: string;
  userId: string;
  actionType: 'purchase' | 'arbitrage' | 'portfolio_rebalance';
  input: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scheduledAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface ActionExecution {
  id: string;
  requestId: string;
  actionType: string;
  userId: string;
  status: 'queued' | 'executing' | 'completed' | 'failed' | 'expired' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  result?: ActionResult;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
}

export interface ActionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  successRate: number;
  actionTypeBreakdown: Record<string, {
    count: number;
    successRate: number;
    averageTime: number;
  }>;
  recentExecutions: ActionExecution[];
}

export class ActionManager extends EventEmitter {
  private config: ActionManagerConfig;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private logger: Logger;
  private actions: Map<string, BaseAction>;
  private executionQueue: ActionRequest[];
  private activeExecutions: Map<string, ActionExecution>;
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    config: ActionManagerConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger;
    this.actions = new Map();
    this.executionQueue = [];
    this.activeExecutions = new Map();
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize actions
      await this.initializeActions();

      // Start processing queue
      this.startProcessing();

      // Start metrics collection if enabled
      if (this.config.enableMetrics) {
        this.startMetricsCollection();
      }

      this.logger.info('Action manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize action manager:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      // Stop processing
      this.stopProcessing();

      // Wait for active executions to complete or timeout
      await this.waitForActiveExecutions();

      // Stop metrics collection
      if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
      }

      this.logger.info('Action manager shutdown complete');
    } catch (error) {
      this.logger.error('Error during action manager shutdown:', error);
      throw error;
    }
  }

  // Action execution methods
  public async executeAction(
    userId: string,
    actionType: 'purchase' | 'arbitrage' | 'portfolio_rebalance',
    input: any,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      scheduledAt?: Date;
      expiresAt?: Date;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    try {
      const request: ActionRequest = {
        id: uuidv4(),
        userId,
        actionType,
        input,
        priority: options.priority || 'medium',
        scheduledAt: options.scheduledAt,
        expiresAt: options.expiresAt,
        metadata: options.metadata,
        createdAt: new Date(),
      };

      // Validate action type
      if (!this.actions.has(actionType)) {
        throw new Error(`Unknown action type: ${actionType}`);
      }

      // Check concurrent execution limits
      if (this.activeExecutions.size >= this.config.maxConcurrentActions) {
        // Queue the request
        this.queueRequest(request);
        this.logger.info('Action queued due to concurrency limit', {
          requestId: request.id,
          actionType,
          userId,
        });
      } else {
        // Execute immediately
        await this.executeRequest(request);
      }

      return request.id;

    } catch (error) {
      this.logger.error('Error executing action:', error);
      throw error;
    }
  }

  public async cancelAction(requestId: string, userId: string): Promise<boolean> {
    try {
      // Check if action is in queue
      const queueIndex = this.executionQueue.findIndex(req => req.id === requestId && req.userId === userId);
      if (queueIndex !== -1) {
        this.executionQueue.splice(queueIndex, 1);
        this.logger.info('Action cancelled from queue', { requestId, userId });
        return true;
      }

      // Check if action is currently executing
      const execution = this.activeExecutions.get(requestId);
      if (execution && execution.userId === userId) {
        execution.status = 'cancelled';
        execution.endTime = new Date();
        this.activeExecutions.delete(requestId);
        
        this.logger.info('Action cancelled during execution', { requestId, userId });
        this.emit('actionCancelled', requestId, userId);
        return true;
      }

      return false;

    } catch (error) {
      this.logger.error('Error cancelling action:', error);
      return false;
    }
  }

  public getActionStatus(requestId: string): ActionExecution | null {
    return this.activeExecutions.get(requestId) || null;
  }

  public getUserActions(userId: string): ActionExecution[] {
    return Array.from(this.activeExecutions.values())
      .filter(execution => execution.userId === userId);
  }

  public async getActionHistory(
    userId: string,
    limit: number = 50,
    actionType?: string
  ): Promise<ActionExecution[]> {
    try {
      // This would query the database for historical executions
      // For now, returning empty array as placeholder
      return [];
    } catch (error) {
      this.logger.error('Error getting action history:', error);
      return [];
    }
  }

  public getMetrics(): ActionMetrics {
    const executions = Array.from(this.activeExecutions.values());
    const completedExecutions = executions.filter(e => e.status === 'completed' || e.status === 'failed');
    
    const totalExecutions = completedExecutions.length;
    const successfulExecutions = completedExecutions.filter(e => e.status === 'completed').length;
    const failedExecutions = totalExecutions - successfulExecutions;
    
    const executionTimes = completedExecutions
      .filter(e => e.startTime && e.endTime)
      .map(e => e.endTime!.getTime() - e.startTime!.getTime());
    
    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      : 0;

    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    // Action type breakdown
    const actionTypeBreakdown: Record<string, any> = {};
    for (const actionType of this.actions.keys()) {
      const typeExecutions = completedExecutions.filter(e => e.actionType === actionType);
      const typeSuccessful = typeExecutions.filter(e => e.status === 'completed').length;
      const typeTimes = typeExecutions
        .filter(e => e.startTime && e.endTime)
        .map(e => e.endTime!.getTime() - e.startTime!.getTime());

      actionTypeBreakdown[actionType] = {
        count: typeExecutions.length,
        successRate: typeExecutions.length > 0 ? (typeSuccessful / typeExecutions.length) * 100 : 0,
        averageTime: typeTimes.length > 0 ? typeTimes.reduce((sum, time) => sum + time, 0) / typeTimes.length : 0,
      };
    }

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      successRate,
      actionTypeBreakdown,
      recentExecutions: executions.slice(-10), // Last 10 executions
    };
  }

  // Private methods
  private async initializeActions(): Promise<void> {
    // Initialize Purchase Action
    const purchaseAction = new PurchaseAction(
      this.config.purchaseAction,
      this.db,
      this.redisClient,
      this.logger
    );
    this.actions.set('purchase', purchaseAction);

    // Initialize Arbitrage Action
    const arbitrageAction = new ArbitrageAction(
      this.config.arbitrageAction,
      this.db,
      this.redisClient,
      this.logger
    );
    this.actions.set('arbitrage', arbitrageAction);

    // Initialize Portfolio Rebalance Action
    const portfolioRebalanceAction = new PortfolioRebalanceAction(
      this.config.portfolioRebalanceAction,
      this.db,
      this.redisClient,
      this.logger
    );
    this.actions.set('portfolio_rebalance', portfolioRebalanceAction);

    this.logger.info('Actions initialized', { 
      actionCount: this.actions.size,
      actionTypes: Array.from(this.actions.keys()),
    });
  }

  private startProcessing(): void {
    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        this.logger.error('Error processing action queue:', error);
      }
    }, 1000); // Process queue every second

    this.logger.info('Action processing started');
  }

  private stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.logger.info('Action processing stopped');
  }

  private async processQueue(): Promise<void> {
    if (!this.isProcessing || this.executionQueue.length === 0) {
      return;
    }

    // Check for available execution slots
    const availableSlots = this.config.maxConcurrentActions - this.activeExecutions.size;
    if (availableSlots <= 0) {
      return;
    }

    // Sort queue by priority and scheduled time
    this.executionQueue.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Same priority, sort by scheduled time
      const aTime = a.scheduledAt?.getTime() || a.createdAt.getTime();
      const bTime = b.scheduledAt?.getTime() || b.createdAt.getTime();
      return aTime - bTime; // Earlier time first
    });

    // Execute requests up to available slots
    const requestsToExecute = this.executionQueue.splice(0, availableSlots);
    
    for (const request of requestsToExecute) {
      // Check if request has expired
      if (request.expiresAt && new Date() > request.expiresAt) {
        this.logger.warn('Action request expired', { requestId: request.id });
        continue;
      }

      // Check if scheduled time has arrived
      if (request.scheduledAt && new Date() < request.scheduledAt) {
        // Put back in queue for later
        this.executionQueue.unshift(request);
        continue;
      }

      await this.executeRequest(request);
    }
  }

  private queueRequest(request: ActionRequest): void {
    this.executionQueue.push(request);
    this.emit('actionQueued', request.id, request.actionType, request.userId);
  }

  private async executeRequest(request: ActionRequest): Promise<void> {
    const execution: ActionExecution = {
      id: uuidv4(),
      requestId: request.id,
      actionType: request.actionType,
      userId: request.userId,
      status: 'executing',
      startTime: new Date(),
      retryCount: 0,
      createdAt: new Date(),
    };

    this.activeExecutions.set(request.id, execution);

    try {
      this.logger.info('Starting action execution', {
        requestId: request.id,
        executionId: execution.id,
        actionType: request.actionType,
        userId: request.userId,
      });

      const action = this.actions.get(request.actionType);
      if (!action) {
        throw new Error(`Action not found: ${request.actionType}`);
      }

      const context: ActionContext = {
        userId: request.userId,
        requestId: request.id,
        timestamp: new Date(),
        metadata: request.metadata,
      };

      // Execute the action with timeout
      const result = await Promise.race([
        action.execute(context, request.input),
        this.createTimeoutPromise(this.config.actionTimeoutMs),
      ]);

      // Update execution record
      execution.status = result.success ? 'completed' : 'failed';
      execution.endTime = new Date();
      execution.result = result;

      if (result.success) {
        this.logger.info('Action execution completed successfully', {
          requestId: request.id,
          executionId: execution.id,
          executionTime: result.executionTime,
        });

        this.emit('actionCompleted', request.id, request.actionType, request.userId, result);
      } else {
        this.logger.error('Action execution failed', {
          requestId: request.id,
          executionId: execution.id,
          error: result.error,
        });

        // Check if we should retry
        if (execution.retryCount < this.config.maxRetryAttempts) {
          await this.scheduleRetry(request, execution);
          return;
        }

        this.emit('actionFailed', request.id, request.actionType, request.userId, result);
      }

      // Store execution history
      await this.storeExecutionHistory(execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.lastError = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Action execution error:', {
        requestId: request.id,
        executionId: execution.id,
        error: execution.lastError,
      });

      // Check if we should retry
      if (execution.retryCount < this.config.maxRetryAttempts) {
        await this.scheduleRetry(request, execution);
        return;
      }

      this.emit('actionFailed', request.id, request.actionType, request.userId, {
        success: false,
        error: execution.lastError,
        executionTime: execution.endTime.getTime() - (execution.startTime?.getTime() || 0),
      });

      await this.storeExecutionHistory(execution);
    } finally {
      // Remove from active executions
      this.activeExecutions.delete(request.id);
    }
  }

  private async scheduleRetry(request: ActionRequest, execution: ActionExecution): Promise<void> {
    execution.retryCount++;
    execution.status = 'queued';
    
    // Calculate retry delay with exponential backoff
    const retryDelay = this.config.retryDelayMs * Math.pow(2, execution.retryCount - 1);
    
    setTimeout(() => {
      this.queueRequest(request);
    }, retryDelay);

    this.logger.info('Action scheduled for retry', {
      requestId: request.id,
      retryCount: execution.retryCount,
      retryDelay,
    });
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Action execution timeout'));
      }, timeoutMs);
    });
  }

  private async waitForActiveExecutions(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeExecutions.size > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.activeExecutions.size > 0) {
      this.logger.warn('Some actions still executing during shutdown', {
        activeCount: this.activeExecutions.size,
      });
    }
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        this.logger.error('Error collecting metrics:', error);
      }
    }, 60000); // Collect metrics every minute

    this.logger.info('Metrics collection started');
  }

  private async collectMetrics(): Promise<void> {
    const metrics = this.getMetrics();
    
    // Store metrics in Redis for monitoring
    await this.redisClient.setEx(
      'action_manager_metrics',
      300, // 5 minutes TTL
      JSON.stringify(metrics)
    );

    this.emit('metricsCollected', metrics);
  }

  private async storeExecutionHistory(execution: ActionExecution): Promise<void> {
    try {
      // Store execution history in database
      // This would be implemented with actual database operations
      this.logger.debug('Storing execution history', { executionId: execution.id });
    } catch (error) {
      this.logger.error('Error storing execution history:', error);
    }
  }
}