---
inclusion: always
---

# Technology Stack & Build System

## Core Technologies
- **Frontend**: Next.js 14 with React, TypeScript
- **Backend Services**: Node.js with Express.js, FastAPI (Python)
- **Blockchain**: Flow blockchain with Cadence smart contracts
- **Database**: PostgreSQL with Redis caching
- **Container**: Docker & Docker Compose for development

## Key Dependencies
- **Flow SDK**: `@onflow/fcl`, `@onflow/types` for blockchain integration
- **Database**: `pg` for PostgreSQL, Redis for caching
- **Testing**: Jest for JavaScript/TypeScript, Flow test framework for Cadence
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

## Build System
- **Monorepo**: npm workspaces with packages, services, and apps
- **TypeScript**: Strict configuration with path mapping (`@/*` for packages)
- **Concurrent Development**: Uses `concurrently` to run multiple services

## Common Commands

### Development
```bash
npm run dev                    # Start all services concurrently
npm run dev:frontend          # Frontend only (Next.js)
npm run dev:gateway           # API Gateway only
npm run dev:ai                # AI service only (Python/FastAPI)
npm run dev:marketplace       # Marketplace monitor only
```

### Docker Environment
```bash
npm run docker:up            # Start full Docker environment
npm run docker:down          # Stop Docker environment
```

### Flow Blockchain
```bash
npm run flow:emulator         # Start Flow emulator
flow project deploy --network emulator  # Deploy contracts
flow test --cover contracts/ # Run contract tests
```

### Code Quality
```bash
npm run lint                  # ESLint across all packages
npm run format               # Prettier formatting
npm run test                 # Run all tests
npm run build                # Build all packages
```

### Database Operations
```bash
cd packages/database
npm run migrate              # Run database migrations
npm run seed                 # Seed development data
npm run seed:reset           # Reset and reseed database
```

## Environment Requirements
- Node.js 18+ and npm 9+
- Python 3.9+ (for AI service)
- Docker and Docker Compose
- Flow CLI for smart contract development