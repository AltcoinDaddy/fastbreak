---
inclusion: always
---

# Project Structure & Organization

## Monorepo Architecture
FastBreak uses npm workspaces to organize code into packages, services, and apps with shared dependencies and build processes.

## Directory Structure

### Root Level
- `package.json` - Root workspace configuration with scripts for all services
- `tsconfig.json` - Shared TypeScript configuration with path mapping
- `flow.json` - Flow blockchain configuration and contract deployments
- `docker-compose.yml` - Development environment orchestration
- `.eslintrc.js` / `.prettierrc` - Code quality and formatting rules

### Core Directories

#### `/packages/` - Shared Libraries
- `packages/types/` - Shared TypeScript type definitions
- `packages/shared/` - Common utilities and helpers
- `packages/database/` - Database schema, migrations, and ORM

#### `/services/` - Microservices
- `services/api-gateway/` - Express.js API gateway and orchestration
- `services/ai-scouting/` - FastAPI service for AI-powered moment analysis
- `services/marketplace-monitor/` - Node.js service for real-time data ingestion
- `services/trading-service/` - Flow SDK integration for transaction execution
- `services/user-service/` - User management and authentication
- `services/risk-management/` - Risk assessment and budget controls
- `services/strategy-service/` - Trading strategy configuration and execution
- `services/forte-agents/` - Forte Actions for atomic transactions

#### `/contracts/` - Smart Contracts
- `contracts/cadence/` - Cadence smart contract source files
- `contracts/scripts/` - Deployment and interaction scripts
- Core contracts: `FastBreakController.cdc`, `SafetyControls.cdc`, `TradeAnalytics.cdc`

#### `/apps/` (implied from README)
- `apps/frontend/` - Next.js 14 dashboard application

## Naming Conventions
- **Packages**: Scoped with `@fastbreak/` prefix (e.g., `@fastbreak/types`)
- **Services**: Kebab-case directory names (e.g., `marketplace-monitor`)
- **Files**: Camel case for TypeScript/JavaScript, PascalCase for Cadence contracts
- **Environment**: `.env.example` template with all required variables

## Import Patterns
- Use TypeScript path mapping: `@/shared/*`, `@/types/*`
- Cross-service communication through API Gateway
- Shared types imported from `@fastbreak/types`

## Development Workflow
1. Each service can be developed independently
2. Use Docker Compose for full-stack development
3. Flow emulator for blockchain testing
4. Shared packages automatically linked via npm workspaces

## Testing Structure
- Unit tests: `**/__tests__/**/*.test.ts`
- Integration tests: Service-specific test directories
- Smart contract tests: `contracts/cadence/tests/`
- Coverage reports generated per package/service