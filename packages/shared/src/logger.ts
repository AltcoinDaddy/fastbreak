import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import type { LogEntry, FastBreakError } from '@fastbreak/types';

/**
 * Correlation ID context for request tracking
 */
export class CorrelationContext {
  private static context = new Map<string, string>();

  static set(key: string, correlationId: string): void {
    this.context.set(key, correlationId);
  }

  static get(key: string = 'default'): string {
    return this.context.get(key) || uuidv4();
  }

  static clear(key: string = 'default'): void {
    this.context.delete(key);
  }

  static generateId(): string {
    return uuidv4();
  }
}

/**
 * Structured logger with correlation ID support
 */
export class FastBreakLogger {
  private logger: winston.Logger;
  private service: string;

  constructor(service: string, options: {
    level?: string;
    enableConsole?: boolean;
    enableFile?: boolean;
    filename?: string;
  } = {}) {
    this.service = service;
    
    const transports: winston.transport[] = [];

    // Console transport for development
    if (options.enableConsole !== false) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, correlationId, operation, userId, metadata, error }) => {
            let logMessage = `${timestamp} [${level}] [${service}]`;
            if (correlationId) logMessage += ` [${correlationId}]`;
            if (operation) logMessage += ` [${operation}]`;
            if (userId) logMessage += ` [user:${userId}]`;
            logMessage += `: ${message}`;
            
            if (metadata && Object.keys(metadata).length > 0) {
              logMessage += ` | metadata: ${JSON.stringify(metadata)}`;
            }
            
            if (error) {
              logMessage += ` | error: ${JSON.stringify(error, null, 2)}`;
            }
            
            return logMessage;
          })
        )
      }));
    }

    // File transport for production
    if (options.enableFile) {
      transports.push(new winston.transports.File({
        filename: options.filename || `logs/${service}.log`,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }));
    }

    this.logger = winston.createLogger({
      level: options.level || process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports,
      defaultMeta: { service }
    });
  }

  private createLogEntry(
    level: 'error' | 'warn' | 'info' | 'debug',
    message: string,
    options: {
      correlationId?: string;
      operation?: string;
      userId?: string;
      metadata?: Record<string, any>;
      error?: FastBreakError | Error;
    } = {}
  ): LogEntry {
    return {
      level,
      message,
      correlationId: options.correlationId || CorrelationContext.get(),
      service: this.service,
      operation: options.operation,
      userId: options.userId,
      timestamp: new Date(),
      metadata: options.metadata,
      error: options.error as FastBreakError
    };
  }

  error(message: string, options: {
    correlationId?: string;
    operation?: string;
    userId?: string;
    metadata?: Record<string, any>;
    error?: FastBreakError | Error;
  } = {}): void {
    const logEntry = this.createLogEntry('error', message, options);
    this.logger.error(logEntry);
  }

  warn(message: string, options: {
    correlationId?: string;
    operation?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } = {}): void {
    const logEntry = this.createLogEntry('warn', message, options);
    this.logger.warn(logEntry);
  }

  info(message: string, options: {
    correlationId?: string;
    operation?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } = {}): void {
    const logEntry = this.createLogEntry('info', message, options);
    this.logger.info(logEntry);
  }

  debug(message: string, options: {
    correlationId?: string;
    operation?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } = {}): void {
    const logEntry = this.createLogEntry('debug', message, options);
    this.logger.debug(logEntry);
  }

  /**
   * Log operation start
   */
  startOperation(operation: string, options: {
    correlationId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  } = {}): string {
    const correlationId = options.correlationId || CorrelationContext.generateId();
    CorrelationContext.set('default', correlationId);
    
    this.info(`Starting operation: ${operation}`, {
      correlationId,
      operation,
      userId: options.userId,
      metadata: options.metadata
    });
    
    return correlationId;
  }

  /**
   * Log operation completion
   */
  completeOperation(operation: string, options: {
    correlationId?: string;
    userId?: string;
    duration?: number;
    metadata?: Record<string, any>;
  } = {}): void {
    this.info(`Completed operation: ${operation}`, {
      correlationId: options.correlationId || CorrelationContext.get(),
      operation,
      userId: options.userId,
      metadata: {
        ...options.metadata,
        duration: options.duration
      }
    });
  }

  /**
   * Log operation failure
   */
  failOperation(operation: string, error: FastBreakError | Error, options: {
    correlationId?: string;
    userId?: string;
    duration?: number;
    metadata?: Record<string, any>;
  } = {}): void {
    this.error(`Failed operation: ${operation}`, {
      correlationId: options.correlationId || CorrelationContext.get(),
      operation,
      userId: options.userId,
      error,
      metadata: {
        ...options.metadata,
        duration: options.duration
      }
    });
  }

  /**
   * Create child logger with additional context
   */
  child(context: {
    operation?: string;
    userId?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
  }): FastBreakLogger {
    const childLogger = new FastBreakLogger(this.service, { enableConsole: false });
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }
}

/**
 * Create logger instance for a service
 */
export function createLogger(service: string, options?: {
  level?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  filename?: string;
}): FastBreakLogger {
  return new FastBreakLogger(service, options);
}

/**
 * Performance monitoring decorator
 */
export function logPerformance(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Try to get logger from instance, fallback to creating one
      const logger = (this as any).logger instanceof FastBreakLogger 
        ? (this as any).logger 
        : createLogger('unknown');
      const startTime = Date.now();
      const correlationId = CorrelationContext.generateId();
      
      logger.startOperation(operation, { correlationId });
      
      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        
        logger.completeOperation(operation, {
          correlationId,
          duration,
          metadata: { success: true }
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.failOperation(operation, error as Error, {
          correlationId,
          duration,
          metadata: { success: false }
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}