import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// Collect default Node.js metrics
collectDefaultMetrics({ register });

// Custom metrics for FastBreak
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service']
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

export const databaseConnectionsActive = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  labelNames: ['service']
});

export const aiAnalysisRequests = new Counter({
  name: 'ai_analysis_requests_total',
  help: 'Total number of AI analysis requests',
  labelNames: ['strategy_type', 'result', 'service']
});

export const aiAnalysisDuration = new Histogram({
  name: 'ai_analysis_duration_seconds',
  help: 'Duration of AI analysis requests in seconds',
  labelNames: ['strategy_type', 'service'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

export const tradingOpportunities = new Counter({
  name: 'trading_opportunities_total',
  help: 'Total number of trading opportunities detected',
  labelNames: ['strategy_type', 'action_taken', 'service']
});

export const blockchainTransactions = new Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['transaction_type', 'status', 'service']
});

export const blockchainTransactionDuration = new Histogram({
  name: 'blockchain_transaction_duration_seconds',
  help: 'Duration of blockchain transactions in seconds',
  labelNames: ['transaction_type', 'service'],
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

export const cacheHitRate = new Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result', 'service']
});

export const activeUsers = new Gauge({
  name: 'active_users_current',
  help: 'Current number of active users',
  labelNames: ['service']
});

export const portfolioValue = new Gauge({
  name: 'portfolio_value_usd',
  help: 'Total portfolio value in USD',
  labelNames: ['user_id']
});

// Export the registry for metrics endpoint
export { register };