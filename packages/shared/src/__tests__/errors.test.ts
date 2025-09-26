import { FastBreakAppError, createError, ErrorCodes, withErrorContext } from '../errors';

describe('FastBreakAppError', () => {
  it('should create error with all properties', () => {
    const context = {
      correlationId: 'test-123',
      service: 'test-service',
      operation: 'test-operation',
      userId: 'user-123',
      timestamp: new Date(),
      metadata: { key: 'value' }
    };

    const error = new FastBreakAppError(
      'TEST_ERROR',
      'Test error message',
      'User-friendly message',
      context,
      {
        severity: 'high',
        category: 'validation',
        retryable: true,
        troubleshootingGuide: 'Try again later'
      }
    );

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test error message');
    expect(error.userMessage).toBe('User-friendly message');
    expect(error.context.correlationId).toBe('test-123');
    expect(error.context.service).toBe('test-service');
    expect(error.severity).toBe('high');
    expect(error.category).toBe('validation');
    expect(error.retryable).toBe(true);
    expect(error.troubleshootingGuide).toBe('Try again later');
  });

  it('should generate correlation ID if not provided', () => {
    const error = new FastBreakAppError(
      'TEST_ERROR',
      'Test message',
      'User message',
      { service: 'test' }
    );

    expect(error.context.correlationId).toBeDefined();
    expect(error.context.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should convert to JSON correctly', () => {
    const error = new FastBreakAppError(
      'TEST_ERROR',
      'Test message',
      'User message',
      { service: 'test' }
    );

    const json = error.toJSON();

    expect(json.code).toBe('TEST_ERROR');
    expect(json.message).toBe('Test message');
    expect(json.userMessage).toBe('User message');
    expect(json.context).toBeDefined();
    expect(json.severity).toBe('medium'); // default
    expect(json.category).toBe('system'); // default
  });
});

describe('createError', () => {
  it('should create error with predefined error code', () => {
    const error = createError(
      ErrorCodes.WALLET_NOT_CONNECTED,
      { service: 'test-service' }
    );

    expect(error.code).toBe('WALLET_NOT_CONNECTED');
    expect(error.message).toBe('Wallet connection required');
    expect(error.userMessage).toBe('Please connect your Flow wallet to continue');
    expect(error.troubleshootingGuide).toContain('Connect Wallet');
    expect(error.category).toBe('authentication');
  });

  it('should handle budget limit exceeded error', () => {
    const error = createError(
      ErrorCodes.BUDGET_LIMIT_EXCEEDED,
      { service: 'trading-service', userId: 'user-123' }
    );

    expect(error.code).toBe('BUDGET_LIMIT_EXCEEDED');
    expect(error.category).toBe('authorization');
    expect(error.retryable).toBe(false);
  });

  it('should handle retryable network errors', () => {
    const error = createError(
      ErrorCodes.NETWORK_TIMEOUT,
      { service: 'api-gateway' }
    );

    expect(error.code).toBe('NETWORK_TIMEOUT');
    expect(error.category).toBe('network');
    expect(error.retryable).toBe(true);
  });
});

describe('withErrorContext', () => {
  it('should wrap function with error context', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = withErrorContext(mockFn, {
      service: 'test-service',
      operation: 'test-operation'
    });

    const result = await wrappedFn('arg1', 'arg2');

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should wrap unknown errors with context', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Unknown error'));
    const wrappedFn = withErrorContext(mockFn, {
      service: 'test-service',
      operation: 'test-operation'
    });

    await expect(wrappedFn()).rejects.toThrow(FastBreakAppError);
    
    try {
      await wrappedFn();
    } catch (error) {
      expect(error).toBeInstanceOf(FastBreakAppError);
      expect((error as FastBreakAppError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((error as FastBreakAppError).context.service).toBe('test-service');
      expect((error as FastBreakAppError).context.operation).toBe('test-operation');
      expect((error as FastBreakAppError).originalError?.message).toBe('Unknown error');
    }
  });

  it('should preserve FastBreakAppError and update context', async () => {
    const originalError = createError(
      ErrorCodes.INVALID_INPUT,
      { service: 'original-service' }
    );
    
    const mockFn = jest.fn().mockRejectedValue(originalError);
    const wrappedFn = withErrorContext(mockFn, {
      service: 'wrapper-service',
      operation: 'wrapper-operation'
    });

    try {
      await wrappedFn();
    } catch (error) {
      expect(error).toBeInstanceOf(FastBreakAppError);
      expect((error as FastBreakAppError).code).toBe('INVALID_INPUT');
      expect((error as FastBreakAppError).context.service).toBe('wrapper-service');
      expect((error as FastBreakAppError).context.operation).toBe('wrapper-operation');
    }
  });
});