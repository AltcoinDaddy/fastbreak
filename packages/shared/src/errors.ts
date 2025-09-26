import { v4 as uuidv4 } from 'uuid';
import { FastBreakError, ErrorContext, ErrorCategory, RetryConfig } from '@fastbreak/types';

/**
 * Custom error class for FastBreak application errors
 */
export class FastBreakAppError extends Error implements FastBreakError {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly context: ErrorContext;
  public readonly originalError?: Error;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly troubleshootingGuide?: string;

  constructor(
    code: string,
    message: string,
    userMessage: string,
    context: Partial<ErrorContext>,
    options: {
      originalError?: Error;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      category?: ErrorCategory;
      retryable?: boolean;
      troubleshootingGuide?: string;
    } = {}
  ) {
    super(message);
    
    this.name = 'FastBreakAppError';
    this.code = code;
    this.userMessage = userMessage;
    this.context = {
      correlationId: context.correlationId || uuidv4(),
      service: context.service || 'unknown',
      operation: context.operation || 'unknown',
      timestamp: context.timestamp || new Date(),
      userId: context.userId,
      metadata: context.metadata
    };
    this.originalError = options.originalError;
    this.severity = options.severity || 'medium';
    this.category = options.category || 'system';
    this.retryable = options.retryable || false;
    this.troubleshootingGuide = options.troubleshootingGuide;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FastBreakAppError);
    }
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON(): FastBreakError {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      context: this.context,
      originalError: this.originalError,
      stack: this.stack,
      severity: this.severity,
      category: this.category,
      retryable: this.retryable,
      troubleshootingGuide: this.troubleshootingGuide
    };
  }
}

/**
 * Predefined error codes and messages
 */
export const ErrorCodes = {
  // Validation Errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Authentication Errors
  WALLET_NOT_CONNECTED: 'WALLET_NOT_CONNECTED',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // Authorization Errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  BUDGET_LIMIT_EXCEEDED: 'BUDGET_LIMIT_EXCEEDED',
  STRATEGY_NOT_ACTIVE: 'STRATEGY_NOT_ACTIVE',
  
  // Network Errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // Blockchain Errors
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  GAS_LIMIT_EXCEEDED: 'GAS_LIMIT_EXCEEDED',
  
  // Database Errors
  DATABASE_CONNECTION_FAILED: 'DATABASE_CONNECTION_FAILED',
  QUERY_FAILED: 'QUERY_FAILED',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  
  // External API Errors
  NBA_API_ERROR: 'NBA_API_ERROR',
  TOPSHOT_API_ERROR: 'TOPSHOT_API_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Business Logic Errors
  MOMENT_NOT_AVAILABLE: 'MOMENT_NOT_AVAILABLE',
  STRATEGY_EXECUTION_FAILED: 'STRATEGY_EXECUTION_FAILED',
  AI_ANALYSIS_FAILED: 'AI_ANALYSIS_FAILED',
  
  // System Errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DEPENDENCY_FAILURE: 'DEPENDENCY_FAILURE',
  
  // Route Errors
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND'
} as const;

/**
 * User-friendly error messages and troubleshooting guides
 */
export const ErrorMessages: Record<string, {
  message: string;
  userMessage: string;
  troubleshootingGuide: string;
}> = {
  [ErrorCodes.INVALID_INPUT]: {
    message: 'Invalid input provided',
    userMessage: 'The provided input is not valid',
    troubleshootingGuide: 'Please check your input format and try again.'
  },
  [ErrorCodes.MISSING_REQUIRED_FIELD]: {
    message: 'Missing required field',
    userMessage: 'A required field is missing',
    troubleshootingGuide: 'Please ensure all required fields are provided.'
  },
  [ErrorCodes.WALLET_NOT_CONNECTED]: {
    message: 'Wallet connection required',
    userMessage: 'Please connect your Flow wallet to continue',
    troubleshootingGuide: 'Click the "Connect Wallet" button and follow the prompts to connect your Flow wallet. Make sure you have a compatible wallet extension installed.'
  },
  [ErrorCodes.BUDGET_LIMIT_EXCEEDED]: {
    message: 'Budget limit exceeded',
    userMessage: 'This purchase would exceed your daily spending limit',
    troubleshootingGuide: 'You can increase your daily spending limit in the Budget Controls section of your dashboard, or wait until tomorrow when your limit resets.'
  },
  [ErrorCodes.TRANSACTION_FAILED]: {
    message: 'Blockchain transaction failed',
    userMessage: 'Transaction could not be completed. Please try again.',
    troubleshootingGuide: 'Check your wallet balance and network connection. If the problem persists, the blockchain network may be experiencing high congestion.'
  },
  [ErrorCodes.NBA_API_ERROR]: {
    message: 'NBA Stats API error',
    userMessage: 'Unable to fetch latest player statistics',
    troubleshootingGuide: 'Our system is temporarily unable to access NBA statistics. AI analysis may be limited until the connection is restored.'
  },
  [ErrorCodes.MOMENT_NOT_AVAILABLE]: {
    message: 'Moment no longer available',
    userMessage: 'This moment has already been purchased by another collector',
    troubleshootingGuide: 'The marketplace moves quickly. Consider adjusting your strategy parameters to act faster on opportunities.'
  },
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: {
    message: 'Rate limit exceeded',
    userMessage: 'Too many requests, please try again later',
    troubleshootingGuide: 'Please wait a moment before making another request.'
  },
  [ErrorCodes.INTERNAL_SERVER_ERROR]: {
    message: 'Internal server error',
    userMessage: 'An unexpected error occurred. Please try again.',
    troubleshootingGuide: 'If this problem persists, please contact support.'
  },
  [ErrorCodes.ROUTE_NOT_FOUND]: {
    message: 'Route not found',
    userMessage: 'The requested page or endpoint was not found.',
    troubleshootingGuide: 'Please check the URL and try again. If you believe this is an error, contact support.'
  }
};

/**
 * Create a FastBreakAppError with predefined error code
 */
export function createError(
  code: keyof typeof ErrorCodes,
  context: Partial<ErrorContext>,
  options: {
    originalError?: Error;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    retryable?: boolean;
    metadata?: Record<string, any>;
  } = {}
): FastBreakAppError {
  const errorInfo = ErrorMessages[code] || {
    message: 'Unknown error occurred',
    userMessage: 'An unexpected error occurred. Please try again.',
    troubleshootingGuide: 'If this problem persists, please contact support.'
  };

  const category = getErrorCategory(code);
  const retryable = isRetryableError(code);

  return new FastBreakAppError(
    code,
    errorInfo.message,
    errorInfo.userMessage,
    {
      ...context,
      metadata: { ...context.metadata, ...options.metadata }
    },
    {
      originalError: options.originalError,
      severity: options.severity,
      category,
      retryable: options.retryable ?? retryable,
      troubleshootingGuide: errorInfo.troubleshootingGuide
    }
  );
}

/**
 * Determine error category based on error code
 */
function getErrorCategory(code: string): ErrorCategory {
  if (code.includes('INVALID') || code.includes('MISSING') || code.includes('FORMAT')) {
    return 'validation';
  }
  if (code.includes('WALLET') || code.includes('SIGNATURE') || code.includes('TOKEN')) {
    return 'authentication';
  }
  if (code.includes('PERMISSIONS') || code.includes('UNAUTHORIZED') || code.includes('BUDGET_LIMIT')) {
    return 'authorization';
  }
  if (code.includes('NETWORK') || code.includes('CONNECTION') || code.includes('TIMEOUT')) {
    return 'network';
  }
  if (code.includes('TRANSACTION') || code.includes('BALANCE') || code.includes('CONTRACT') || code.includes('GAS')) {
    return 'blockchain';
  }
  if (code.includes('DATABASE') || code.includes('QUERY') || code.includes('CONSTRAINT')) {
    return 'database';
  }
  if (code.includes('API') || code.includes('RATE_LIMIT')) {
    return 'external_api';
  }
  if (code.includes('MOMENT') || code.includes('STRATEGY') || code.includes('AI_ANALYSIS')) {
    return 'business_logic';
  }
  if (code.includes('CONFIGURATION') || code.includes('DEPENDENCY')) {
    return 'configuration';
  }
  return 'system';
}

/**
 * Determine if error is retryable based on error code
 */
function isRetryableError(code: string): boolean {
  const retryableCodes = [
    ErrorCodes.NETWORK_TIMEOUT,
    ErrorCodes.CONNECTION_FAILED,
    ErrorCodes.SERVICE_UNAVAILABLE,
    ErrorCodes.DATABASE_CONNECTION_FAILED,
    ErrorCodes.NBA_API_ERROR,
    ErrorCodes.TOPSHOT_API_ERROR,
    ErrorCodes.RATE_LIMIT_EXCEEDED
  ];
  return retryableCodes.includes(code as any);
}

/**
 * Wrap async function with error context
 */
export function withErrorContext<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context: Partial<ErrorContext>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof FastBreakAppError) {
        // Update context if it's already a FastBreakAppError
        const updatedError = new FastBreakAppError(
          error.code,
          error.message,
          error.userMessage,
          { ...error.context, ...context },
          {
            originalError: error.originalError,
            severity: error.severity,
            category: error.category,
            retryable: error.retryable,
            troubleshootingGuide: error.troubleshootingGuide
          }
        );
        throw updatedError;
      }
      
      // Wrap unknown errors
      throw createError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        context,
        { originalError: error as Error, severity: 'high' }
      );
    }
  };
}