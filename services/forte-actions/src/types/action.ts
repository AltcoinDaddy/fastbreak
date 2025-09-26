import { Logger } from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';

export interface ActionConfig {
  maxRetries: number;
  timeoutMs: number;
  gasLimit: number;
  maxGasCost: number;
  enabled: boolean;
}

export interface ActionContext {
  userId: string;
  requestId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  transactionId?: string;
  blockHeight?: number;
  gasUsed?: number;
  gasCost?: number;
  error?: string;
  executionTime: number;
  data?: any;
}

export interface TransactionStep {
  id: string;
  type: 'cadence_script' | 'cadence_transaction' | 'api_call' | 'validation';
  description: string;
  cadenceCode?: string;
  arguments?: any[];
  gasLimit?: number;
  authorizers?: string[];
  proposer?: string;
  payer?: string;
  apiEndpoint?: string;
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  apiPayload?: any;
  validationFunction?: (context: ActionContext, data: any) => Promise<boolean>;
  rollbackFunction?: (context: ActionContext, data: any) => Promise<void>;
}

export interface ActionExecution {
  id: string;
  actionType: string;
  context: ActionContext;
  steps: TransactionStep[];
  currentStep: number;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  startTime: Date;
  endTime?: Date;
  result?: ActionResult;
  stepResults: Array<{
    stepId: string;
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
  }>;
  rollbackSteps: TransactionStep[];
}

export abstract class BaseAction {
  protected id: string;
  protected name: string;
  protected type: string;
  protected config: ActionConfig;
  protected db: DatabaseManager;
  protected redisClient: Redis.RedisClientType;
  protected logger: Logger;

  constructor(
    name: string,
    type: string,
    config: ActionConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    this.id = `${type}_${Date.now()}`;
    this.name = name;
    this.type = type;
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger.child({ actionType: type, actionName: name });
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract validateInput(context: ActionContext, input: any): Promise<boolean>;
  protected abstract buildTransactionSteps(context: ActionContext, input: any): Promise<TransactionStep[]>;
  protected abstract buildRollbackSteps(context: ActionContext, input: any): Promise<TransactionStep[]>;
  protected abstract processResult(context: ActionContext, result: ActionResult): Promise<void>;

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

  public async execute(context: ActionContext, input: any): Promise<ActionResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting action execution', {
        actionId: this.id,
        userId: context.userId,
        requestId: context.requestId,
      });

      // Validate input
      const isValid = await this.validateInput(context, input);
      if (!isValid) {
        throw new Error('Input validation failed');
      }

      // Build transaction steps
      const steps = await this.buildTransactionSteps(context, input);
      const rollbackSteps = await this.buildRollbackSteps(context, input);

      // Create execution record
      const execution: ActionExecution = {
        id: `exec_${this.id}_${Date.now()}`,
        actionType: this.type,
        context,
        steps,
        currentStep: 0,
        status: 'pending',
        startTime: new Date(),
        stepResults: [],
        rollbackSteps,
      };

      // Store execution in cache for monitoring
      await this.storeExecution(execution);

      // Execute steps atomically
      const result = await this.executeSteps(execution);

      // Process result
      await this.processResult(context, result);

      this.logger.info('Action execution completed', {
        actionId: this.id,
        success: result.success,
        executionTime: result.executionTime,
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: ActionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      };

      this.logger.error('Action execution failed', {
        actionId: this.id,
        error: result.error,
        executionTime,
      });

      return result;
    }
  }

  private async executeSteps(execution: ActionExecution): Promise<ActionResult> {
    const startTime = Date.now();
    execution.status = 'executing';
    await this.updateExecution(execution);

    try {
      for (let i = 0; i < execution.steps.length; i++) {
        const step = execution.steps[i];
        execution.currentStep = i;
        await this.updateExecution(execution);

        this.logger.debug('Executing step', {
          stepId: step.id,
          stepType: step.type,
          description: step.description,
        });

        const stepStartTime = Date.now();
        let stepResult: any;
        let stepSuccess = false;

        try {
          stepResult = await this.executeStep(step, execution.context);
          stepSuccess = true;
        } catch (error) {
          const stepError = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Step execution failed', {
            stepId: step.id,
            error: stepError,
          });

          // Record step failure
          execution.stepResults.push({
            stepId: step.id,
            success: false,
            error: stepError,
            executionTime: Date.now() - stepStartTime,
          });

          // Rollback previous steps
          await this.rollbackExecution(execution);
          
          throw new Error(`Step ${step.id} failed: ${stepError}`);
        }

        // Record step success
        execution.stepResults.push({
          stepId: step.id,
          success: true,
          result: stepResult,
          executionTime: Date.now() - stepStartTime,
        });
      }

      // All steps completed successfully
      execution.status = 'completed';
      execution.endTime = new Date();
      await this.updateExecution(execution);

      const result: ActionResult = {
        success: true,
        executionTime: Date.now() - startTime,
        data: execution.stepResults,
      };

      // Extract transaction details from step results
      const transactionStep = execution.stepResults.find(r => 
        r.result?.transactionId || r.result?.blockHeight
      );
      
      if (transactionStep?.result) {
        result.transactionId = transactionStep.result.transactionId;
        result.blockHeight = transactionStep.result.blockHeight;
        result.gasUsed = transactionStep.result.gasUsed;
        result.gasCost = transactionStep.result.gasCost;
      }

      return result;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      await this.updateExecution(execution);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
      };
    }
  }

  private async executeStep(step: TransactionStep, context: ActionContext): Promise<any> {
    switch (step.type) {
      case 'cadence_script':
        return await this.executeCadenceScript(step, context);
      case 'cadence_transaction':
        return await this.executeCadenceTransaction(step, context);
      case 'api_call':
        return await this.executeApiCall(step, context);
      case 'validation':
        return await this.executeValidation(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeCadenceScript(step: TransactionStep, context: ActionContext): Promise<any> {
    // This would integrate with Flow SDK to execute Cadence scripts
    // For now, returning a mock result
    this.logger.debug('Executing Cadence script', { stepId: step.id });
    
    // Simulate script execution
    await this.sleep(100);
    
    return {
      success: true,
      result: 'script_result',
    };
  }

  private async executeCadenceTransaction(step: TransactionStep, context: ActionContext): Promise<any> {
    // This would integrate with Flow SDK to execute Cadence transactions
    // For now, returning a mock result
    this.logger.debug('Executing Cadence transaction', { stepId: step.id });
    
    // Simulate transaction execution
    await this.sleep(500);
    
    return {
      success: true,
      transactionId: `tx_${Date.now()}`,
      blockHeight: Math.floor(Math.random() * 1000000),
      gasUsed: Math.floor(Math.random() * 1000),
      gasCost: Math.floor(Math.random() * 100),
    };
  }

  private async executeApiCall(step: TransactionStep, context: ActionContext): Promise<any> {
    // This would make HTTP API calls to external services
    this.logger.debug('Executing API call', { 
      stepId: step.id,
      endpoint: step.apiEndpoint,
      method: step.apiMethod,
    });
    
    // Simulate API call
    await this.sleep(200);
    
    return {
      success: true,
      statusCode: 200,
      data: { result: 'api_result' },
    };
  }

  private async executeValidation(step: TransactionStep, context: ActionContext): Promise<any> {
    if (!step.validationFunction) {
      throw new Error('Validation function not provided');
    }

    this.logger.debug('Executing validation', { stepId: step.id });
    
    const isValid = await step.validationFunction(context, {});
    
    if (!isValid) {
      throw new Error('Validation failed');
    }
    
    return { valid: true };
  }

  private async rollbackExecution(execution: ActionExecution): Promise<void> {
    this.logger.warn('Rolling back execution', { executionId: execution.id });
    
    execution.status = 'rolled_back';
    
    // Execute rollback steps in reverse order
    for (let i = execution.rollbackSteps.length - 1; i >= 0; i--) {
      const rollbackStep = execution.rollbackSteps[i];
      
      try {
        this.logger.debug('Executing rollback step', {
          stepId: rollbackStep.id,
          description: rollbackStep.description,
        });
        
        if (rollbackStep.rollbackFunction) {
          await rollbackStep.rollbackFunction(execution.context, {});
        }
        
      } catch (error) {
        this.logger.error('Rollback step failed', {
          stepId: rollbackStep.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with other rollback steps even if one fails
      }
    }
    
    await this.updateExecution(execution);
  }

  // Utility methods
  private async storeExecution(execution: ActionExecution): Promise<void> {
    try {
      const key = `action_execution:${execution.id}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(execution)); // 1 hour TTL
    } catch (error) {
      this.logger.error('Failed to store execution', { error });
    }
  }

  private async updateExecution(execution: ActionExecution): Promise<void> {
    try {
      const key = `action_execution:${execution.id}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(execution));
    } catch (error) {
      this.logger.error('Failed to update execution', { error });
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Configuration management
  public getConfig(): ActionConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<ActionConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('Action configuration updated', { updates });
  }
}