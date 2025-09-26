# FastBreak - NBA Top Shot Auto-Collector

FastBreak is a decentralized application (dApp) built on the Flow blockchain that automatically detects and purchases undervalued NBA Top Shot moments using AI-powered scouting and automated trading strategies.

## Features

- 🤖 **AI-Powered Scouting**: Intelligent moment valuation using NBA stats and market data
- 📊 **Strategy Configuration**: Customizable trading strategies (rookie risers, post-game spikes, arbitrage)
- 🔒 **Wallet Integration**: Secure Flow wallet connection and transaction management
- 💰 **Budget Controls**: Comprehensive spending limits and risk management
- 📈 **Real-time Monitoring**: Continuous marketplace scanning and opportunity detection
- ⚡ **Atomic Transactions**: Forte Actions for reliable trade execution
- 📱 **Dashboard**: Real-time portfolio tracking and performance metrics
- 🏆 **Leaderboards**: Compare performance with other users

## Architecture

FastBreak follows a microservices architecture with the following components:

- **Frontend**: Next.js 14 dashboard with Flow wallet integration
- **API Gateway**: Express.js gateway for service orchestration
- **AI Scouting Service**: FastAPI service for moment analysis
- **Marketplace Monitor**: Node.js service for real-time data ingestion
- **Trading Service**: Flow SDK integration for transaction execution
- **Smart Contracts**: Cadence contracts for on-chain logic
- **Database**: PostgreSQL for data persistence
- **Cache**: Redis for performance optimization

## Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Python 3.9+ (for AI service)
- Flow CLI (for smart contract development)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fastbreak-nba-auto-collector
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development environment**
   ```bash
   # Start all services with Docker
   npm run docker:up
   
   # Or start services individually
   npm run dev
   ```

5. **Access the application**
   - Frontend Dashboard: http://localhost:3001
   - API Gateway: http://localhost:3000
   - Flow Emulator: http://localhost:8080

## Development

### Project Structure

```
fastbreak-nba-auto-collector/
├── apps/
│   └── frontend/              # Next.js dashboard
├── services/
│   ├── api-gateway/           # Express.js API gateway
│   ├── ai-scouting/           # FastAPI AI service
│   ├── marketplace-monitor/   # Node.js monitoring service
│   ├── trading-service/       # Flow SDK trading service
│   ├── user-service/          # User management service
│   └── notification-service/  # Notification service
├── packages/
│   ├── types/                 # Shared TypeScript types
│   ├── shared/                # Shared utilities
│   └── database/              # Database schema and migrations
├── contracts/                 # Cadence smart contracts
├── docker-compose.yml         # Development environment
└── flow.json                  # Flow configuration
```

### Available Scripts

- `npm run dev` - Start all services in development mode
- `npm run build` - Build all packages and services
- `npm run test` - Run tests across all packages
- `npm run lint` - Lint all TypeScript/JavaScript files
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker development environment
- `npm run docker:down` - Stop Docker environment
- `npm run flow:emulator` - Start Flow emulator

### Service Development

Each service can be developed independently:

```bash
# Frontend development
cd apps/frontend && npm run dev

# AI service development
cd services/ai-scouting && python -m uvicorn main:app --reload

# Other services
cd services/<service-name> && npm run dev
```

## Smart Contracts

FastBreak includes three main Cadence smart contracts:

- **FastBreakController.cdc**: Core contract for user strategies and trade authorization
- **SafetyControls.cdc**: Safety mechanisms and emergency controls
- **TradeAnalytics.cdc**: Performance tracking and analytics

Deploy contracts to the emulator:

```bash
flow project deploy --network emulator
```

## Testing

Run tests for all packages:

```bash
npm run test
```

Run tests for specific packages:

```bash
# Frontend tests
cd apps/frontend && npm test

# Backend service tests
cd services/api-gateway && npm test

# Smart contract tests
flow test --cover contracts/
```

## Deployment

### Development
- Uses Docker Compose for local development
- Flow emulator for blockchain testing
- Hot reloading for all services

### Staging
- Flow Testnet integration
- Production-like environment
- Automated testing pipeline

### Production
- Flow Mainnet deployment
- Kubernetes orchestration
- Multi-region setup
- Comprehensive monitoring

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue in the repository
- Join our Discord community
- Check the documentation wiki

---

Built with ❤️ for the NBA Top Shot community