import { FastBreakLogger, CorrelationContext, createLogger } from '../logger';
import { FastBreakAppError } from '../errors';

// Mock winston
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    }))
  })),
  format: {
    combine: jest.fn(),
    colorize: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
    json: jest.fn(),
    errors: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

describe('CorrelationContext', () => {
  beforeEach(() => {
    CorrelationContext.clear();
  });

  it('should set and get correlation ID', () => {
    const correlationId = 'test-correlation-id';
    CorrelationContext.set('test', correlationId);
    
    expect(CorrelationContext.get('test')).toBe(correlationId);
  });

  it('should generate new ID if not found', () => {
    const id = CorrelationContext.get('nonexistent');
    
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should clear correlation ID', () => {
    CorrelationContext.set('test', 'test-id');
    CorrelationContext.clear('test');
    
    const newId = CorrelationContext.get('test');
    expect(newId).not.toBe('test-id');
  });

  it('should generate unique IDs', () => {
    const id1 = CorrelationContext.generateId();
    const id2 = CorrelationContext.generateId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('FastBreakLogger', () => {
  let logger: FastBreakLogger;
  let mockWinstonLogger: any;

  beforeEach(() => {
    const winston = require('winston');
    mockWinstonLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => mockWinstonLogger)
    };
    winston.createLogger.mockReturnValue(mockWinstonLogger);
    
    logger = new FastBreakLogger('test-service');
  });

  it('should log error with correlation ID', () => {
    const correlationId = 'test-correlation-id';
    CorrelationContext.set('default', correlationId);
    
    logger.error('Test error message', {
      operation: 'test-operation',
      userId: 'user-123',
      metadata: { key: 'value' }
    });

    expect(mockWinstonLogger.error).toHaveBeenCalledWith({
      level: 'error',
      message: 'Test error message',
      correlationId,
      service: 'test-service',
      operation: 'test-operation',
      userId: 'user-123',
      timestamp: expect.any(Date),
      metadata: { key: 'value' },
      error: undefined
    });
  });

  it('should log with FastBreakAppError', () => {
    const error = new FastBreakAppError(
      'TEST_ERROR',
      'Test error',
      'User message',
      { service: 'test' }
    );

    logger.error('Error occurred', { error });

    expect(mockWinstonLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        message: 'Error occurred',
        error
      })
    );
  });

  it('should start operation and generate correlation ID', () => {
    const correlationId = logger.startOperation('test-operation', {
      userId: 'user-123',
      metadata: { key: 'value' }
    });

    expect(correlationId).toBeDefined();
    expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(mockWinstonLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Starting operation: test-operation',
        correlationId,
        operation: 'test-operation',
        userId: 'user-123'
      })
    );
  });

  it('should complete operation with duration', () => {
    const correlationId = 'test-correlation-id';
    
    logger.completeOperation('test-operation', {
      correlationId,
      userId: 'user-123',
      duration: 1500
    });

    expect(mockWinstonLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Completed operation: test-operation',
        correlationId,
        operation: 'test-operation',
        userId: 'user-123',
        metadata: expect.objectContaining({
          duration: 1500
        })
      })
    );
  });

  it('should fail operation with error', () => {
    const error = new Error('Test error');
    const correlationId = 'test-correlation-id';
    
    logger.failOperation('test-operation', error, {
      correlationId,
      userId: 'user-123',
      duration: 500
    });

    expect(mockWinstonLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Failed operation: test-operation',
        correlationId,
        operation: 'test-operation',
        userId: 'user-123',
        error,
        metadata: expect.objectContaining({
          duration: 500
        })
      })
    );
  });

  it('should create child logger', () => {
    const childLogger = logger.child({
      operation: 'child-operation',
      userId: 'user-123'
    });

    expect(childLogger).toBeInstanceOf(FastBreakLogger);
    expect(mockWinstonLogger.child).toHaveBeenCalledWith({
      operation: 'child-operation',
      userId: 'user-123'
    });
  });
});

describe('createLogger', () => {
  it('should create logger with default options', () => {
    const logger = createLogger('test-service');
    
    expect(logger).toBeInstanceOf(FastBreakLogger);
  });

  it('should create logger with custom options', () => {
    const logger = createLogger('test-service', {
      level: 'debug',
      enableConsole: true,
      enableFile: true,
      filename: 'custom.log'
    });
    
    expect(logger).toBeInstanceOf(FastBreakLogger);
  });
});