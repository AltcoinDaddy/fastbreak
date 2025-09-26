import { withRetry, retry, CircuitBreaker, Bulkhead, DEFAULT_RETRY_CONFIG } from '../retry';
import { FastBreakAppError, createError, ErrorCodes } from '../errors';
import { FastBreakLogger } from '../logger';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as unknown as FastBreakLogger;

describe('withRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should succeed on first attempt', async () => {
    const mockOperation = jest.fn().mockResolvedValue('success');
    
    const result = await withRetry(mockOperation);
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('success');
    
    const promise = withRetry(mockOperation, { 
      maxAttempts: 3, 
      baseDelay: 10, // Very short delay for testing
      maxDelay: 50 
    }, mockLogger, 'test-operation');
    
    // Fast-forward through delays
    jest.runAllTimers();
    
    const result = await promise;
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(3);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Two retry warnings
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Operation succeeded after 3 attempts')
    );
  }, 15000);

  it('should fail after max attempts', async () => {
    const error = new Error('Persistent failure');
    const mockOperation = jest.fn().mockRejectedValue(error);
    
    const promise = withRetry(mockOperation, { 
      maxAttempts: 2, 
      baseDelay: 10,
      maxDelay: 50 
    }, mockLogger, 'test-operation');
    
    jest.runAllTimers();
    
    await expect(promise).rejects.toThrow('Persistent failure');
    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Operation failed after 2 attempts'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          maxAttempts: 2
        })
      })
    );
  }, 15000);

  it('should not retry non-retryable errors', async () => {
    const error = createError(
      ErrorCodes.BUDGET_LIMIT_EXCEEDED,
      { service: 'test' },
      { retryable: false }
    );
    const mockOperation = jest.fn().mockRejectedValue(error);
    
    await expect(withRetry(mockOperation, {}, mockLogger, 'test-operation')).rejects.toThrow(error);
    
    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-retryable error'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          attempt: 1
        })
      })
    );
  });

  it('should calculate exponential backoff delays', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('success');
    
    const config = {
      maxAttempts: 3,
      baseDelay: 10, // Shorter for testing
      backoffMultiplier: 2,
      jitter: false
    };
    
    const promise = withRetry(mockOperation, config, mockLogger, 'test-operation');
    
    // Fast-forward through all delays
    jest.runAllTimers();
    
    await promise;
    
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying in 10ms'),
      expect.objectContaining({
        metadata: expect.objectContaining({ delay: 10 })
      })
    );
    
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('retrying in 20ms'),
      expect.objectContaining({
        metadata: expect.objectContaining({ delay: 20 })
      })
    );
  }, 15000);
});

describe('retry decorator', () => {
  it('should retry method calls', async () => {
    class TestClass {
      logger = mockLogger;
      callCount = 0;

      async testMethod(): Promise<string> {
        this.callCount++;
        if (this.callCount < 3) {
          throw new Error('Not ready yet');
        }
        return 'success';
      }
    }

    const instance = new TestClass();
    
    // Manually wrap the method with retry
    const retryWrappedMethod = retry({ maxAttempts: 3 }, 'test-method')(
      instance,
      'testMethod',
      Object.getOwnPropertyDescriptor(TestClass.prototype, 'testMethod')!
    );
    
    jest.useFakeTimers();
    const promise = retryWrappedMethod.value.call(instance);
    jest.runAllTimers();
    jest.useRealTimers();
    
    const result = await promise;
    
    expect(result).toBe('success');
    expect(instance.callCount).toBe(3);
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(2, 1000, mockLogger); // threshold: 2, timeout: 1s
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should allow operations when closed', async () => {
    const mockOperation = jest.fn().mockResolvedValue('success');
    
    const result = await circuitBreaker.execute(mockOperation, 'test-operation');
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should open circuit after threshold failures', async () => {
    const mockOperation = jest.fn().mockRejectedValue(new Error('Failure'));
    
    // First failure
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Failure');
    
    // Second failure - should open circuit
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Failure');
    
    // Third attempt - should be blocked by open circuit
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Circuit breaker is open');
    
    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Circuit breaker opened'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          operationName: 'test-operation',
          failures: 2
        })
      })
    );
  });

  it('should transition to half-open after timeout', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('Failure 1'))
      .mockRejectedValueOnce(new Error('Failure 2'))
      .mockResolvedValue('success');
    
    // Cause circuit to open
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Failure 1');
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Failure 2');
    
    // Fast-forward past timeout
    jest.advanceTimersByTime(1100);
    
    // Should now allow operation and succeed
    const result = await circuitBreaker.execute(mockOperation, 'test-operation');
    
    expect(result).toBe('success');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Circuit breaker transitioning to half-open'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          operationName: 'test-operation'
        })
      })
    );
  });

  it('should reset on successful operation', async () => {
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('Failure'))
      .mockResolvedValue('success');
    
    // One failure
    await expect(circuitBreaker.execute(mockOperation, 'test-operation')).rejects.toThrow('Failure');
    
    // Success should reset
    await circuitBreaker.execute(mockOperation, 'test-operation');
    
    const state = circuitBreaker.getState();
    expect(state.state).toBe('closed');
    expect(state.failures).toBe(0);
  });
});

describe('Bulkhead', () => {
  let bulkhead: Bulkhead;

  beforeEach(() => {
    bulkhead = new Bulkhead(2, 5, mockLogger); // maxConcurrent: 2, maxQueue: 5
  });

  it('should execute operations within limit', async () => {
    const mockOperation = jest.fn().mockResolvedValue('success');
    
    const result = await bulkhead.execute(mockOperation, 'test-operation');
    
    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should queue operations when at capacity', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const mockOperation = jest.fn().mockImplementation(() => {
      return new Promise<string>((resolve) => {
        resolvers.push(resolve);
      });
    });
    
    // Start two operations (at capacity)
    const promise1 = bulkhead.execute(mockOperation, 'operation-1');
    const promise2 = bulkhead.execute(mockOperation, 'operation-2');
    
    // Third operation should be queued
    const promise3 = bulkhead.execute(mockOperation, 'operation-3');
    
    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Operation queued due to bulkhead limit'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          operationName: 'operation-3'
        })
      })
    );
    
    // Complete first operation
    resolvers[0]('success-1');
    await promise1;
    
    // Third operation should now start
    expect(mockOperation).toHaveBeenCalledTimes(3);
    
    // Complete remaining operations
    resolvers[1]('success-2');
    resolvers[2]('success-3');
    
    await Promise.all([promise2, promise3]);
  });

  it('should reject operations when queue is full', async () => {
    const mockOperation = jest.fn().mockImplementation(() => new Promise(() => {})); // Never resolves
    
    // Fill capacity and queue
    const promises = [];
    for (let i = 0; i < 7; i++) { // 2 active + 5 queued
      promises.push(bulkhead.execute(mockOperation, `operation-${i}`));
    }
    
    // 8th operation should be rejected
    await expect(bulkhead.execute(mockOperation, 'operation-8')).rejects.toThrow('Bulkhead queue full');
    
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Bulkhead rejected operation - queue full'),
      expect.objectContaining({
        metadata: expect.objectContaining({
          operationName: 'operation-8'
        })
      })
    );
  });

  it('should provide stats', () => {
    const stats = bulkhead.getStats();
    
    expect(stats).toEqual({
      activeRequests: 0,
      queueLength: 0
    });
  });
});