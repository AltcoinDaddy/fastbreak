# FastBreak Trading Service

The FastBreak Trading Service is a comprehensive microservice that handles automated trading of NBA Top Shot moments on the Flow blockchain. It provides Flow SDK integration, transaction composition and validation, portfolio tracking, and performance calculation with proper error handling and retry mechanisms.

## Features

- **Flow Blockchain Integration**: Complete integration with Flow blockchain using Flow SDK
- **Smart Contract Integration**: Interfaces with FastBreak smart contracts for trade authorization
- **Transaction Composition**: Builds and validates blockchain transactions
- **Portfolio Tracking**: Real-time portfolio monitoring and performance calculation
- **Trade Execution**: Automated trade execution with proper error handling and retries
- **Market Data**: Integration with Top Shot marketplace APIs
- **Safety Controls**: Budget limits and risk management integration
- **Rate Limiting**: Intelligent API rate limiting and request queuing

## Architecture

The service consists of three main components:

### FlowService
- Handles all Flow blockchain interactions
- Manages smart contract calls and queries
- Provides transaction signing and submission
- Integrates with FastBreak smart contracts

### TradingService
- Manages trade queue and execution
- Handles market data fetching
- Implements retry logic and error handling
- Provides rate limiting for external APIs

### PortfolioService
- Tracks user portfolio in real-time
- Calculates performance metrics
- Provides portfolio analytics and insights
- Manages portfolio allocation data

## Installation

```bash
cd services/trading-service
npm install
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Flow Configuration
FLOW_NETWORK=testnet
FLOW_ACCESS_NODE_API=https://rest-testnet.onflow.org
FLOW_PRIVATE_KEY=your_private_key_here
FLOW_ACCOUNT_ADDRESS=0x1234567890abcdef

# Contract Addresses
FASTBREAK_CONTROLLER_ADDRESS=0x1234567890abcdef
SAFETY_CONTROLS_ADDRESS=0x1234567890abcdef
TRADE_ANALYTICS_ADDRESS=0x1234567890abcdef
TOP_SHOT_CONTRACT_ADDRESS=0x0b2a3299cc857e29

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/fastbreak

# Service Configuration
TRADING_SERVICE_PORT=8003
MAX_CONCURRENT_TRADES=10
TRADE_TIMEOUT_MS=300000
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
SLIPPAGE_TOLERANCE=0.05
ENABLE_DRY_RUN=false

# Top Shot API
TOP_SHOT_API_URL=https://api.nbatopshot.com
TOP_SHOT_API_KEY=your_api_key_here
TOP_SHOT_RATE_LIMIT=10

# Marketplace Configuration
MARKETPLACE_FEE=0.05
MIN_BID_INCREMENT=1.0
MAX_BID_DURATION=86400

# Security
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000

# Logging
LOG_LEVEL=info
NODE_ENV=development
```

## Development

### Running the Service

```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests (requires Flow testnet setup)
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Integration Tests Setup

Integration tests require Flow testnet configuration. Create a `.env.test` file:

```bash
# Copy the example file
cp .env.test.example .env.test

# Edit with your testnet credentials
# You'll need:
# - Flow testnet private key
# - Flow testnet account address
# - Deployed contract addresses on testnet
# - Test database URL
```

**Important**: Integration tests interact with Flow testnet and require:
1. A funded Flow testnet account
2. Deployed FastBreak smart contracts on testnet
3. Valid Top Shot API credentials (optional, for marketplace tests)

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Clean build artifacts
npm run clean
```

## API Endpoints

### Trading Endpoints

- `POST /api/trades` - Submit a new trade
- `GET /api/trades/active` - Get active trades for user
- `GET /api/trades/history` - Get trade history for user
- `DELETE /api/trades/:tradeId` - Cancel a trade
- `GET /api/trades/queue-status` - Get trade queue status

### Portfolio Endpoints

- `GET /api/portfolio` - Get user portfolio
- `GET /api/portfolio/performance` - Get portfolio performance metrics
- `GET /api/portfolio/summary` - Get portfolio summary
- `GET /api/portfolio/top-performers` - Get top performing moments
- `GET /api/portfolio/worst-performers` - Get worst performing moments
- `GET /api/portfolio/allocation` - Get portfolio allocation breakdown

### Market Data Endpoints

- `GET /api/market/:momentId` - Get market data for a moment
- `GET /api/market/:momentId/orderbook` - Get order book for a moment

### Flow Integration Endpoints

- `GET /api/flow/moments/:momentId` - Get moment data from Flow
- `GET /api/flow/user/moments` - Get user's moments from Flow
- `GET /api/flow/user/strategies` - Get user's strategies from Flow
- `GET /api/flow/user/budget-limits` - Get user's budget limits from Flow
- `POST /api/flow/validate-spending` - Validate spending against limits
- `GET /api/flow/user/can-trade` - Check if user can trade

### Health Check

- `GET /health` - Service health status
- `GET /` - Service information

## Usage Examples

### Submit a Buy Trade

```bash
curl -X POST http://localhost:8003/api/trades \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 0x1234567890abcdef" \
  -d '{
    "momentId": "12345",
    "action": "buy",
    "targetPrice": 100,
    "maxPrice": 110,
    "priority": "high",
    "reasoning": "AI recommendation based on player performance",
    "strategyId": "rookie-risers-1"
  }'
```

### Get Portfolio

```bash
curl -X GET http://localhost:8003/api/portfolio \
  -H "X-User-ID: 0x1234567890abcdef"
```

### Get Market Data

```bash
curl -X GET http://localhost:8003/api/market/12345
```

## Error Handling

The service implements comprehensive error handling:

- **Validation Errors**: Invalid trade parameters return 400 with details
- **Authorization Errors**: Missing or invalid user ID returns 401
- **Blockchain Errors**: Flow transaction failures are logged and retried
- **Rate Limiting**: API rate limits are respected with intelligent queuing
- **Network Errors**: Automatic retry with exponential backoff
- **Safety Controls**: Budget and risk management validation

## Monitoring

The service emits various events for monitoring:

- `tradeSubmitted` - When a trade is submitted to the queue
- `tradeExecuted` - When a trade is successfully executed
- `tradeFailed` - When a trade execution fails
- `tradeCancelled` - When a trade is cancelled
- `orderPlaced` - When an order is placed on the marketplace
- `orderFilled` - When an order is filled
- `portfolioUpdated` - When a portfolio is updated
- `transactionSealed` - When a Flow transaction is sealed
- `transactionFailed` - When a Flow transaction fails

## Performance Considerations

- **Concurrent Trades**: Configurable limit on concurrent trade executions
- **Rate Limiting**: Intelligent rate limiting for external API calls
- **Caching**: Portfolio data is cached to reduce blockchain queries
- **Batch Processing**: Multiple operations are batched when possible
- **Connection Pooling**: Database connections are pooled for efficiency

## Security

- **Input Validation**: All inputs are validated and sanitized
- **Budget Controls**: Spending limits are enforced at multiple levels
- **Safety Controls**: Integration with safety control smart contracts
- **Rate Limiting**: Protection against abuse and DDoS
- **Error Handling**: Sensitive information is not exposed in error messages

## Deployment

The service is containerized and can be deployed using Docker:

```bash
# Build the container
docker build -t fastbreak-trading-service .

# Run the container
docker run -p 8003:8003 --env-file .env fastbreak-trading-service
```

For production deployment, use the provided Kubernetes configurations or Docker Compose setup.

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update documentation for API changes
4. Run linting and tests before submitting PRs
5. Integration tests should pass on Flow testnet

## License

MIT License - see LICENSE file for details