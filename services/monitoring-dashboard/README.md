# FastBreak Performance Monitoring Dashboard

A comprehensive performance monitoring and alerting system for the FastBreak NBA Top Shot auto-collector platform.

## Features

### 📊 Real-time Metrics Collection
- HTTP request metrics (response time, throughput, error rates)
- Database performance (connection pool, query duration)
- Cache performance (hit rates, memory usage)
- AI analysis performance (processing time, confidence scores)
- System metrics (CPU, memory, disk usage)

### 🚨 Intelligent Alerting
- Configurable alert rules with thresholds
- Multiple severity levels (info, warning, critical)
- Cooldown periods to prevent alert spam
- Multiple notification channels (email, webhook, Slack)
- Alert history and resolution tracking

### 📈 Performance Dashboard
- Real-time WebSocket updates
- Interactive charts and graphs
- System health overview
- Historical trend analysis
- Mobile-responsive design

### 🔧 Database Optimization
- Automated index creation and management
- Query performance analysis
- Slow query detection
- Index usage statistics
- Table size and growth monitoring

### ⚡ Caching Strategies
- Multi-level caching (memory + Redis)
- Cache-aside, write-through, and write-behind patterns
- Intelligent cache warming
- Tag-based invalidation
- Performance metrics and hit rate tracking

### 📦 Request Batching
- Automatic request batching for external APIs
- Deduplication and rate limiting
- Configurable batch sizes and timeouts
- Retry logic with exponential backoff
- Performance monitoring and throughput optimization

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fastbreak
DB_USER=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Monitoring Dashboard
PORT=3001

# Email Alerts (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL_RECIPIENTS=admin@fastbreak.com,ops@fastbreak.com
ALERT_EMAIL_FROM=alerts@fastbreak.com

# Webhook Alerts (optional)
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Slack Alerts (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

3. Start the monitoring dashboard:
```bash
npm run dev
```

4. Access the dashboard at `http://localhost:3001`

## Usage

### Adding Monitoring to Services

1. Install the monitoring package:
```bash
npm install @fastbreak/monitoring
```

2. Add monitoring middleware to your Express app:
```typescript
import { createMonitoringMiddleware, createMetricsEndpoint } from '@fastbreak/monitoring';

const app = express();

// Add monitoring middleware
app.use(createMonitoringMiddleware({
  serviceName: 'my-service',
  excludePaths: ['/health', '/metrics']
}));

// Add metrics endpoint
app.get('/metrics', createMetricsEndpoint());
```

3. Use database monitoring:
```typescript
import { DatabaseMonitor } from '@fastbreak/monitoring';

const dbMonitor = new DatabaseMonitor({
  serviceName: 'my-service',
  pool: dbPool,
  enableQueryLogging: true,
  slowQueryThreshold: 1000
});

// Use monitored queries
const result = await dbMonitor.query('SELECT * FROM users WHERE id = $1', [userId]);
```

4. Use cache monitoring:
```typescript
import { FastBreakCache } from '@fastbreak/shared';

const cache = new FastBreakCache(redis);

// Cache operations are automatically monitored
const userProfile = await cache.getUserProfile(userId);
```

### Performance Testing

Run comprehensive benchmarks:
```bash
npm run benchmark
```

Run specific performance tests:
```bash
npm run test:performance
```

### Database Optimization

Optimize database performance:
```bash
npm run db:optimize
```

Analyze database performance:
```bash
npm run db:analyze
```

## Architecture

### Monitoring Stack
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │───▶│   Prometheus    │───▶│   Dashboard     │
│   Services      │    │   Metrics       │    │   WebSocket     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Database      │    │     Redis       │    │   Alert         │
│   Monitoring    │    │   Metrics       │    │   Manager       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow
1. **Collection**: Services emit metrics via Prometheus client
2. **Storage**: Metrics stored in Redis with TTL
3. **Processing**: Performance collector aggregates and analyzes data
4. **Alerting**: Alert manager evaluates rules and sends notifications
5. **Visualization**: Dashboard displays real-time data via WebSocket

## Configuration

### Alert Rules

Default alert rules are automatically configured, but you can customize them:

```typescript
await alertManager.addAlertRule({
  id: 'custom_alert',
  name: 'Custom Performance Alert',
  condition: 'avgResponseTime > threshold',
  threshold: 1000,
  severity: 'warning',
  enabled: true,
  cooldownMinutes: 5,
  notificationChannels: ['email']
});
```

### Cache Configuration

Configure caching strategies:

```typescript
const cache = new CacheStrategy(redis, {
  defaultTTL: 3600,
  keyPrefix: 'fb:custom',
  enableCompression: true,
  maxRetries: 3
}, 'my-service');
```

### Batching Configuration

Configure request batching:

```typescript
const batcher = new RequestBatcher({
  maxBatchSize: 50,
  maxWaitTime: 200,
  maxConcurrentBatches: 3,
  retryAttempts: 2,
  retryDelay: 500
}, {
  process: async (requests) => {
    // Process batch of requests
    return results;
  }
});
```

## API Reference

### Metrics Endpoints

- `GET /metrics` - Prometheus metrics
- `GET /api/metrics/current` - Current performance metrics
- `GET /api/metrics/history?hours=24` - Historical metrics
- `GET /api/system/info` - System information

### Alert Endpoints

- `GET /api/alerts/active` - Active alerts
- `GET /api/alerts/history?hours=24` - Alert history
- `GET /api/alerts/rules` - Alert rules
- `PUT /api/alerts/rules/:ruleId` - Update alert rule

## Performance Benchmarks

Expected performance targets:

### Cache Performance
- **Write Operations**: >10,000 ops/sec
- **Read Operations**: >50,000 ops/sec
- **Memory Usage**: <100MB for 1M keys
- **Hit Rate**: >90% for typical workloads

### Database Performance
- **Simple Queries**: <10ms average
- **Complex Queries**: <100ms average
- **Connection Pool**: <50 active connections
- **Index Usage**: >95% of queries use indexes

### API Performance
- **Response Time**: <200ms p95
- **Throughput**: >1000 RPS
- **Error Rate**: <1%
- **Availability**: >99.9%

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for memory leaks in cache
   - Verify TTL settings are appropriate
   - Monitor garbage collection

2. **Slow Database Queries**
   - Run `npm run db:analyze` to identify issues
   - Check for missing indexes
   - Analyze query execution plans

3. **Cache Misses**
   - Verify cache warming strategies
   - Check TTL configurations
   - Monitor cache invalidation patterns

4. **Alert Spam**
   - Adjust alert thresholds
   - Increase cooldown periods
   - Review alert rule conditions

### Debugging

Enable debug logging:
```bash
DEBUG=fastbreak:* npm run dev
```

Check service health:
```bash
curl http://localhost:3001/health
```

View metrics:
```bash
curl http://localhost:3001/metrics
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Run benchmarks to verify performance
5. Test alert rules and thresholds

## License

MIT License - see LICENSE file for details.