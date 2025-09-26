import { RetryConfig } from '@fastbreak/types';
import { FastBreakAppError } from './errors';
import { FastBreakLogger } from './logger';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  if (config.jitter) {
    // Add random jitter (±25% of the delay)
    const jitterRange = cappedDelay * 0.25;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, cappedDelay + jitter);
  }
  
  return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger?: FastBreakLogger,
  operationName?: string
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      if (logger && operationName) {
        logger.debug(`Attempting operation: ${operationName}`, {
          metadata: { attempt, maxAttempts: retryConfig.maxAttempts }
        });
      }
      
      const result = await operation();
      
      if (attempt > 1 && logger && operationName) {
        logger.info(`Operation succeeded after ${attempt} attempts: ${operationName}`);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      if (error instanceof FastBreakAppError && !error.retryable) {
        if (logger && operationName) {
          logger.warn(`Operation failed with non-retryable error: ${operationName}`, {
            metadata: { 
              attempt,
              error: error instanceof FastBreakAppError ? error.toJSON() : { message: (error as Error).message }
            }
          });
        }
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === retryConfig.maxAttempts) {
        if (logger && operationName) {
          logger.error(`Operation failed after ${attempt} attempts: ${operationName}`, {
            metadata: { 
              maxAttempts: retryConfig.maxAttempts,
              error: error instanceof FastBreakAppError ? error.toJSON() : { message: (error as Error).message }
            }
          });
        }
        throw error;
      }
      
      // Calculate delay and wait before next attempt
      const delay = calculateDelay(attempt, retryConfig);
      
      if (logger && operationName) {
        logger.warn(`Operation failed, retrying in ${delay}ms: ${operationName}`, {
          metadata: { 
            attempt, 
            maxAttempts: retryConfig.maxAttempts, 
            delay,
            nextAttempt: attempt + 1,
            error: error instanceof FastBreakAppError ? error.toJSON() : { message: (error as Error).message }
          }
        });
      }
      
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Retry decorator for class methods
 */
export function retry(config: Partial<RetryConfig> = {}, operationName?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const logger = (this as any).logger as FastBreakLogger;
      const operation = operationName || `${target.constructor.name}.${propertyName}`;
      
      return withRetry(
        () => method.apply(this, args),
        config,
        logger,
        operation
      );
    };

    return descriptor;
  };
}

/**
 * Circuit breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly logger?: FastBreakLogger
  ) {}

  async execute<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        const error = new Error(`Circuit breaker is open for ${operationName || 'operation'}`);
        if (this.logger) {
          this.logger.warn('Circuit breaker prevented operation execution', {
            metadata: { 
              operationName, 
              state: this.state, 
              failures: this.failures,
              timeUntilRetry: this.timeout - (Date.now() - this.lastFailureTime)
            }
          });
        }
        throw error;
      } else {
        this.state = 'half-open';
        if (this.logger) {
          this.logger.info('Circuit breaker transitioning to half-open', {
            metadata: { operationName }
          });
        }
      }
    }

    try {
      const result = await operation();
      this.onSuccess(operationName);
      return result;
    } catch (error) {
      this.onFailure(error as Error, operationName);
      throw error;
    }
  }

  private onSuccess(operationName?: string): void {
    this.failures = 0;
    this.state = 'closed';
    if (this.logger) {
      this.logger.debug('Circuit breaker reset after successful operation', {
        metadata: { operationName, state: this.state }
      });
    }
  }

  private onFailure(error: Error, operationName?: string): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      if (this.logger) {
        this.logger.error('Circuit breaker opened due to repeated failures', {
          metadata: { 
            operationName, 
            failures: this.failures, 
            threshold: this.threshold,
            timeout: this.timeout,
            error: error instanceof FastBreakAppError ? error.toJSON() : { message: error.message }
          }
        });
      }
    } else if (this.logger) {
      this.logger.warn('Circuit breaker recorded failure', {
        metadata: { 
          operationName, 
          failures: this.failures, 
          threshold: this.threshold
        }
      });
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Bulkhead pattern for resource isolation
 */
export class Bulkhead {
  private activeRequests = 0;
  private queue: Array<{
    operation: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  constructor(
    private readonly maxConcurrent: number = 10,
    private readonly maxQueue: number = 100,
    private readonly logger?: FastBreakLogger
  ) {}

  async execute<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.activeRequests < this.maxConcurrent) {
        this.executeImmediately(operation, resolve, reject, operationName);
      } else if (this.queue.length < this.maxQueue) {
        this.queue.push({ operation, resolve, reject });
        if (this.logger) {
          this.logger.debug('Operation queued due to bulkhead limit', {
            metadata: { 
              operationName, 
              activeRequests: this.activeRequests,
              queueLength: this.queue.length,
              maxConcurrent: this.maxConcurrent
            }
          });
        }
      } else {
        const error = new Error(`Bulkhead queue full for ${operationName || 'operation'}`);
        if (this.logger) {
          this.logger.error('Bulkhead rejected operation - queue full', {
            metadata: { 
              operationName,
              error: error instanceof FastBreakAppError ? error.toJSON() : { message: error.message }, 
              activeRequests: this.activeRequests,
              queueLength: this.queue.length,
              maxQueue: this.maxQueue
            }
          });
        }
        reject(error);
      }
    });
  }

  private async executeImmediately<T>(
    operation: () => Promise<T>,
    resolve: (value: T) => void,
    reject: (error: any) => void,
    operationName?: string
  ): Promise<void> {
    this.activeRequests++;
    
    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const { operation, resolve, reject } = this.queue.shift()!;
      this.executeImmediately(operation, resolve, reject);
    }
  }

  getStats(): { activeRequests: number; queueLength: number } {
    return {
      activeRequests: this.activeRequests,
      queueLength: this.queue.length
    };
  }
}