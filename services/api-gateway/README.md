# FastBreak API Gateway

The API Gateway serves as the central entry point for all client requests to the FastBreak microservices architecture. It provides service orchestration, authentication, rate limiting, monitoring, and error handling.

## Features

### ✅ Completed Features

#### Service Orchestration
- **Service Discovery**: Automatic routing to 9 configured microservices
- **Service Proxy**: Intelligent request forwarding with retry logic and error handling
- **Load Balancing**: Service-specific timeout and retry configurations
- **Health Monitoring**: Continuous health checks for all services with automatic recovery

#### Authentication & Security
- **JWT Authentication**: Secure token-based authentication with configurable expiration
- **Optional Authentication**: Support for public endpoints with optional user context
- **Security Headers**: Comprehensive security headers via Helmet.js
- **CORS Configuration**: Configurable cross-origin resource sharing

#### Rate Limiting
- **Global Rate Limiting**: Configurable request limits per IP address
- **Endpoint-Specific Limits**: Stricter limits for authentication endpoints
- **Smart Bypassing**: Health check endpoints bypass rate limiting

#### Request/Response Processing
- **Request Logging**: Comprehensive request/response logging with correlation IDs
- **Request Monitoring**: Real-time performance metrics and monitoring
- **Error Handling**: Centralized error handling with user-friendly messages
- **Request Validation**: JSON parsing and validation with proper error responses

#### Monitoring & Observability
- **Performance Metrics**: Response time tracking, error rates, and throughput monitoring
- **Health Checks**: Individual service health monitoring and system-wide status
- **Request Tracing**: Unique request IDs for distributed tracing
- **System Metrics**: Memory usage, CPU usage, and uptime monitoring

#### API Routing
Complete routing implementation for all FastBreak services:
- **User Management**: Registration, authentication, profile management
- **AI Scouting**: Moment analysis, recommendations, performance insights
- **Marketplace Monitoring**: Price tracking, arbitrage detection, trending moments
- **Trading**: Trade execution, history, performance metrics
- **Notifications**: User notifications and preferences
- **Strategy Management**: Trading strategy configuration and management
- **Portfolio**: Holdings tracking and performance analysis
- **Leaderboards**: User rankings and performance comparison

## Architecture

### Service Configuration
The gateway is configured to communicate with the following services:

```typescript
const services = [
  'user-service',           // Port 3001 - User management and authentication
  'ai-scouting',           // Port 8001 - AI-powered moment analysis
  'marketplace-monitor',    // Port 3002 - Real-time marketplace monitoring
  'trading-service',       // Port 3003 - Trade execution and management
  'notification-service',  // Port 3004 - User notifications
  'risk-management',       // Port 3005 - Risk assessment and controls
  'strategy-service',      // Port 3006 - Trading strategy management
  'forte-actions',         // Port 3007 - Atomic transaction execution
  'forte-agents',          // Port 3008 - Real-time monitoring agents
];
```

### Request Flow
1. **Client Request** → API Gateway
2. **Authentication** → JWT validation (if required)
3. **Rate Limiting** → Request throttling
4. **Request Monitoring** → Metrics collection
5. **Service Routing** → Forward to appropriate microservice
6. **Response Processing** → Error handling and response formatting
7. **Response** → Client

### Error Handling Strategy
- **Service Unavailable (503)**: When target service is down
- **Gateway Timeout (504)**: When service request times out
- **Bad Request (400)**: For malformed requests
- **Unauthorized (401)**: For missing authentication
- **Forbidden (403)**: For invalid authentication
- **Not Found (404)**: For unknown routes

## API Endpoints

### System Endpoints
- `GET /health` - Basic health check
- `GET /api/health/detailed` - Detailed system health
- `GET /api/health/:serviceName` - Individual service health
- `GET /api/status` - System status overview
- `GET /api/metrics` - System performance metrics
- `GET /api/performance` - API Gateway performance metrics

### User Management (`/api/v1/users`)
- `POST /register` - User registration
- `POST /login` - User authentication
- `GET /profile` - Get user profile (authenticated)
- `PUT /profile` - Update user profile (authenticated)
- `GET /settings` - Get user settings (authenticated)
- `PUT /settings` - Update user settings (authenticated)
- `GET /budget` - Get budget limits (authenticated)
- `PUT /budget` - Update budget limits (authenticated)

### AI Scouting (`/api/v1/ai`)
- `POST /analyze/moment` - Analyze specific moment
- `POST /analyze/batch` - Batch moment analysis
- `GET /recommendations` - Get AI recommendations
- `GET /analysis/history` - Analysis history
- `GET /performance` - AI model performance
- `GET /trends` - Market trend analysis

### Marketplace (`/api/v1/marketplace`)
- `GET /opportunities` - Trading opportunities
- `GET /moments/:id/price-history` - Price history
- `GET /moments/:id/market-data` - Current market data
- `GET /arbitrage` - Arbitrage opportunities
- `GET /stats` - Market statistics
- `GET /trending` - Trending moments
- `GET /search` - Search moments

### Trading (`/api/v1/trades`)
- `POST /execute` - Execute trade
- `GET /history` - Trade history
- `GET /:id` - Get trade details
- `POST /:id/cancel` - Cancel trade
- `GET /status/pending` - Pending trades
- `GET /performance/metrics` - Performance metrics

## Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h

# Service URLs (automatically configured for development)
USER_SERVICE_URL=http://localhost:3001
AI_SCOUTING_SERVICE_URL=http://localhost:8001
MARKETPLACE_MONITOR_URL=http://localhost:3002
# ... (other services)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100    # Max requests per window

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000    # 30 seconds
HEALTH_CHECK_TIMEOUT=5000      # 5 seconds

# Logging
LOG_LEVEL=info
LOG_FILE=logs/api-gateway.log
```

### Service-Specific Configurations
Each service has customized timeout and retry settings:
- **AI Scouting**: 10s timeout, 2 retries (longer processing time)
- **Trading Service**: 15s timeout, 2 retries (critical operations)
- **Other Services**: 5s timeout, 3 retries (standard operations)

## Development

### Running the Gateway
```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start

# Run tests
npm test

# Run integration tests only
npm run test:integration
```

### Testing
The gateway includes comprehensive test coverage:
- **Unit Tests**: Service proxy, middleware, utilities
- **Integration Tests**: Full request/response cycles, authentication, rate limiting
- **Health Check Tests**: System and service health monitoring
- **Error Handling Tests**: Various error scenarios and recovery

### Monitoring
Access monitoring endpoints:
- System health: `GET /api/health/detailed`
- Performance metrics: `GET /api/performance`
- Individual service status: `GET /api/health/:serviceName`

## Security Features

### Authentication
- JWT-based authentication with configurable expiration
- Secure token validation with proper error handling
- Optional authentication for public endpoints

### Rate Limiting
- IP-based rate limiting with configurable windows
- Stricter limits for authentication endpoints
- Bypass for health check endpoints

### Security Headers
- Content Security Policy (CSP)
- X-Frame-Options protection
- XSS protection headers
- CORS configuration

### Request Validation
- JSON parsing with size limits (10MB max)
- Request sanitization and validation
- Proper error responses for malformed requests

## Logging and Monitoring

### Request Logging
- Unique request IDs for tracing
- Response time tracking
- Error logging with context
- User activity logging

### Performance Monitoring
- Average response times
- Error rates by endpoint
- Requests per minute
- Top endpoints by usage
- Service health metrics

### System Monitoring
- Memory usage tracking
- CPU usage monitoring
- Service availability status
- Health check results

## Error Recovery

### Service Resilience
- Automatic retry with exponential backoff
- Circuit breaker pattern for failing services
- Graceful degradation when services are unavailable
- Health check recovery monitoring

### Request Recovery
- Timeout handling with appropriate error codes
- Network error recovery
- Malformed request handling
- Authentication error recovery

## Future Enhancements

### Planned Features
- [ ] Circuit breaker implementation
- [ ] Request caching layer
- [ ] WebSocket support for real-time updates
- [ ] API versioning support
- [ ] Request/response transformation
- [ ] Advanced monitoring dashboards
- [ ] Distributed tracing integration
- [ ] API documentation generation

### Performance Optimizations
- [ ] Response compression optimization
- [ ] Connection pooling
- [ ] Request batching
- [ ] Cache-aside pattern implementation
- [ ] Load balancing algorithms

## Contributing

When adding new routes or services:
1. Update service configuration in `ServiceProxy`
2. Add route handlers in appropriate route files
3. Update authentication requirements
4. Add comprehensive tests
5. Update this documentation

## Dependencies

### Core Dependencies
- **Express.js**: Web framework
- **Axios**: HTTP client for service communication
- **Winston**: Logging framework
- **Helmet**: Security headers
- **JWT**: Authentication tokens
- **Express Rate Limit**: Rate limiting

### Development Dependencies
- **Jest**: Testing framework
- **Supertest**: HTTP testing
- **TypeScript**: Type safety
- **Nodemon**: Development server

## License

This API Gateway is part of the FastBreak NBA Top Shot Auto-Collector project.