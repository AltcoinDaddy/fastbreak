# FastBreak Comprehensive Error Handling System

## Overview

FastBreak implements a comprehensive error handling system that provides:

- **Structured Error Reporting**: Consistent error format across all services
- **Automatic Retry Logic**: Exponential backoff with jitter for transient failures
- **Circuit Breaker Pattern**: Prevents cascading failures when services are down
- **Bulkhead Pattern**: Resource isolation to prevent system overload
- **Correlation ID Tracking**: Request tracing across distributed services
- **Comprehensive Logging**: Structured logging with context and metadata
- **Error Monitoring**: Real-time error tracking and alerting
- **Health Checks**: Continuous monitoring of service dependencies

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Services      │
│                 │    │                 │    │                 │
│ Error Display   │◄───┤ Error Handler   │◄───┤ Error Context   │
│ User Messages   │    │ Correlation ID  │    │ Retry Logic     │
│ Troubleshooting │    │ Rate Limiting   │    │ Circuit Breaker │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Error Monitor   │    │ Health Checker  │
                       │ Alerting        │    │ Dependencies    │
                       │ Metrics         │    │ Status          │
                       └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. FastBreakAppError

Custom error class that provides structured error information:

```typescript
import { createError, ErrorCodes } from '@fastbreak/shared';

// Create a structured error
const error = createError(
  ErrorCodes.WALLET_NOT_CONNECTED,
  {
    correlationId: 'req-123',
    service: 'trading-service',
    operation: 'executeTrade',
    userId: 'user-456'
  },
  {
    severity: 'medium',
    retryable: false,
    metadata: { walletAddress: '0x...' }
  }
);
```

### 2. Structured Logging

Comprehensive logging with correlation ID tracking:

```typescript
import { createLogger, CorrelationContext } from '@fastbreak/shared';

const logger = createLogger('my-service');

// Start an operation
const correlationId = logger.startOperation('processPayment', {
  userId: 'user-123',
  metadata: { amount: 100 }
});

try {
  // Your business logic here
  logger.info('Payment processed successfully');
  logger.completeOperation('processPayment', { correlationId });
} catch (error) {
  logger.failOperation('processPayment', error, { correlationId });
  throw error;
}
```

### 3. Retry Logic with Exponential Backoff

Automatic retry for transient failures:

```typescript
import { withRetry, RetryConfig } from '@fastbreak/shared';

const config: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
};

const result = await withRetry(
  async () => {
    // Your operation that might fail
    return await externalApiCall();
  },
  config,
  logger,
  'externalApiCall'
);
```

### 4. Circuit Breaker Pattern

Prevents cascading failures:

```typescript
import { CircuitBreaker } from '@fastbreak/shared';

const circuitBreaker = new CircuitBreaker(
  5,     // failure threshold
  60000, // timeout (1 minute)
  logger
);

const result = await circuitBreaker.execute(
  async () => {
    return await unreliableService();
  },
  'unreliableService'
);
```

### 5. Express.js Middleware

Comprehensive error handling for HTTP APIs:

```typescript
import express from 'express';
import {
  correlationIdMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  createLogger,
  ErrorMonitor
} from '@fastbreak/shared';

const app = express();
const logger = createLogger('api-gateway');
const errorMonitor = new ErrorMonitor(alertConfig, logger);

// Add middleware in correct order
app.use(correlationIdMiddleware());
app.use(requestLoggingMiddleware(logger));

// Your routes here
app.get('/api/users', async (req, res, next) => {
  try {
    const users = await getUsersService();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error); // Will be handled by error middleware
  }
});

// Error handling (must be last)
app.use(errorHandlingMiddleware(logger, errorMonitor));
```

### 6. Error Monitoring and Alerting

Real-time error tracking:

```typescript
import { ErrorMonitor } from '@fastbreak/shared';

const errorMonitor = new ErrorMonitor({
  enabled: true,
  channels: ['email', 'slack', 'webhook'],
  threshold: {
    errorRate: 10,      // errors per minute
    criticalErrors: 1   // immediate alert
  },
  cooldown: 5 // minutes between similar alerts
}, logger);

// Errors are automatically recorded by middleware
// Manual recording:
errorMonitor.recordError(error, {
  service: 'trading-service',
  operation: 'executeTrade',
  userId: 'user-123'
});
```

### 7. Health Checks

Monitor service dependencies:

```typescript
import { HealthChecker } from '@fastbreak/shared';

const healthChecker = new HealthChecker(logger);

// Register health checks
healthChecker.registerHealthCheck('database', async () => {
  const startTime = Date.now();
  try {
    await db.query('SELECT 1');
    return {
      name: 'database',
      status: 'healthy',
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
});

// Check overall health
const health = await healthChecker.checkHealth('my-service');
```

## Error Categories and HTTP Status Codes

| Category | HTTP Status | Description | Examples |
|----------|-------------|-------------|----------|
| validation | 400 | Invalid input data | Missing fields, wrong format |
| authentication | 401 | Authentication required | Invalid token, wallet not connected |
| authorization | 403 | Permission denied | Budget exceeded, insufficient permissions |
| business_logic | 422 | Business rule violation | Moment not available, strategy failed |
| external_api | 502 | External service error | NBA API down, rate limited |
| network | 503 | Network/connectivity issues | Timeout, connection failed |
| database | 500 | Database errors | Query failed, connection lost |
| system | 500 | Internal system errors | Unexpected errors, configuration issues |

## Error Codes Reference

### Authentication Errors
- `WALLET_NOT_CONNECTED`: User needs to connect their Flow wallet
- `INVALID_SIGNATURE`: Wallet signature verification failed
- `TOKEN_EXPIRED`: Authentication token has expired

### Authorization Errors
- `BUDGET_LIMIT_EXCEEDED`: Purchase would exceed daily spending limit
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `STRATEGY_NOT_ACTIVE`: Trading strategy is not currently active

### Business Logic Errors
- `MOMENT_NOT_AVAILABLE`: Moment was purchased by another collector
- `STRATEGY_EXECUTION_FAILED`: Automated strategy encountered an error
- `AI_ANALYSIS_FAILED`: AI system couldn't analyze the moment

### External API Errors
- `NBA_API_ERROR`: NBA Stats API is unavailable
- `TOPSHOT_API_ERROR`: Top Shot marketplace API error
- `RATE_LIMIT_EXCEEDED`: API rate limit reached

### System Errors
- `INTERNAL_SERVER_ERROR`: Unexpected system error
- `CONFIGURATION_ERROR`: System configuration issue
- `DEPENDENCY_FAILURE`: Required service is unavailable

## Best Practices

### For Service Developers

1. **Always use structured errors**:
   ```typescript
   // Good
   throw createError(ErrorCodes.INVALID_INPUT, context, options);
   
   // Bad
   throw new Error('Invalid input');
   ```

2. **Include correlation IDs**:
   ```typescript
   const correlationId = CorrelationContext.get();
   logger.error('Operation failed', { correlationId, error });
   ```

3. **Use appropriate error categories**:
   ```typescript
   // For user input errors
   createError(ErrorCodes.INVALID_INPUT, context, { category: 'validation' });
   
   // For external service errors
   createError(ErrorCodes.NBA_API_ERROR, context, { 
     category: 'external_api',
     retryable: true 
   });
   ```

4. **Implement health checks**:
   ```typescript
   healthChecker.registerHealthCheck('my-dependency', 
     HealthChecker.createSimpleCheck('my-dependency', checkFunction)
   );
   ```

### For Frontend Developers

1. **Display user-friendly messages**:
   ```typescript
   // Use error.userMessage, not error.message
   setErrorMessage(error.userMessage);
   ```

2. **Show troubleshooting guidance**:
   ```typescript
   if (error.troubleshootingGuide) {
     setHelpText(error.troubleshootingGuide);
   }
   ```

3. **Include correlation ID in support requests**:
   ```typescript
   const supportInfo = `Error ID: ${error.correlationId}`;
   ```

### For Operations Teams

1. **Monitor error rates and patterns**:
   - Set up alerts for error rate thresholds
   - Monitor critical error types
   - Track error trends over time

2. **Use correlation IDs for debugging**:
   - Search logs by correlation ID
   - Trace requests across services
   - Identify root causes faster

3. **Review health check status**:
   - Monitor service dependencies
   - Set up alerts for unhealthy services
   - Plan maintenance based on health trends

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info                    # debug, info, warn, error
ENABLE_FILE_LOGGING=true          # Enable file logging in production

# Error Monitoring
ENABLE_ERROR_MONITORING=true      # Enable error monitoring and alerting
ERROR_RATE_THRESHOLD=10           # Errors per minute before alert
CRITICAL_ERROR_THRESHOLD=1        # Critical errors before immediate alert
ALERT_COOLDOWN_MINUTES=5          # Minutes between similar alerts

# Retry Configuration
DEFAULT_MAX_RETRY_ATTEMPTS=3      # Default retry attempts
DEFAULT_RETRY_BASE_DELAY=1000     # Base delay in milliseconds
DEFAULT_RETRY_MAX_DELAY=30000     # Maximum delay in milliseconds

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5       # Failures before opening circuit
CIRCUIT_BREAKER_TIMEOUT=60000     # Timeout before trying half-open

# Health Checks
HEALTH_CHECK_TIMEOUT=5000         # Health check timeout in milliseconds
HEALTH_CHECK_INTERVAL=30000       # Health check interval in milliseconds
```

### Alert Channels Configuration

```typescript
const alertConfig: AlertConfig = {
  enabled: process.env.NODE_ENV === 'production',
  channels: ['email', 'slack', 'webhook'],
  threshold: {
    errorRate: parseInt(process.env.ERROR_RATE_THRESHOLD || '10'),
    criticalErrors: parseInt(process.env.CRITICAL_ERROR_THRESHOLD || '1')
  },
  cooldown: parseInt(process.env.ALERT_COOLDOWN_MINUTES || '5')
};
```

## Testing

The error handling system includes comprehensive tests:

```bash
# Run all error handling tests
npm run test

# Run specific test suites
npm run test -- --testNamePattern="errors"
npm run test -- --testNamePattern="retry"
npm run test -- --testNamePattern="monitoring"

# Run with coverage
npm run test:coverage
```

## Monitoring and Observability

### Metrics to Monitor

1. **Error Rates**:
   - Total errors per minute
   - Error rate by service
   - Error rate by category
   - Critical error count

2. **Retry Patterns**:
   - Retry success rate
   - Average retry attempts
   - Retry delay effectiveness

3. **Circuit Breaker Status**:
   - Circuit state changes
   - Failure threshold breaches
   - Recovery times

4. **Health Check Results**:
   - Service availability
   - Response times
   - Dependency health

### Dashboards

Create monitoring dashboards that show:
- Real-time error rates and trends
- Service health status
- Alert history and resolution times
- Performance metrics and SLA compliance

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed troubleshooting guidance and common error resolution steps.

## Migration Guide

### From Basic Error Handling

1. Replace generic Error throws with createError calls
2. Add correlation ID middleware to Express apps
3. Implement structured logging
4. Add health checks for dependencies
5. Configure error monitoring and alerting

### Example Migration

Before:
```typescript
app.get('/api/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

After:
```typescript
app.use(correlationIdMiddleware());
app.use(requestLoggingMiddleware(logger));

app.get('/api/users', async (req, res, next) => {
  try {
    const users = await getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error); // Handled by error middleware
  }
});

app.use(errorHandlingMiddleware(logger, errorMonitor));
```

This comprehensive error handling system ensures FastBreak provides reliable, observable, and maintainable error management across all services.