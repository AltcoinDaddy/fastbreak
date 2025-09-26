# FastBreak Smart Contracts

This directory contains the Cadence smart contracts for the FastBreak NBA Top Shot automated trading system on the Flow blockchain.

## Overview

The FastBreak smart contracts provide on-chain functionality for:
- User account management and strategy configuration
- Budget limits and spending controls
- Safety mechanisms and emergency stops
- Trade analytics and performance tracking
- Risk assessment and monitoring

## Contracts

### 1. FastBreakController.cdc

The main contract that manages automated NBA Top Shot trading functionality.

**Key Features:**
- User account creation and management
- Strategy configuration (Rookie Risers, Post-Game Spikes, Arbitrage Mode)
- Budget limits enforcement
- Spending validation and tracking
- Trade recording and history
- Emergency stop mechanisms

**Resources:**
- `UserAccount`: Main user resource containing strategies, budget limits, and trade history
- `Admin`: Administrative functions for contract management

**Key Functions:**
- `createUserAccount()`: Creates a new user account with budget limits
- `validateSpending()`: Validates transactions against budget limits
- `recordTrade()`: Records trade execution and updates spending
- `triggerEmergencyStop()`: Activates emergency stop for user account

### 2. SafetyControls.cdc

Provides additional safety mechanisms and risk monitoring for the trading system.

**Key Features:**
- Circuit breaker system with multiple levels
- Global emergency controls
- User suspension and reinstatement
- Activity monitoring and suspicious pattern detection
- Risk assessment and scoring

**Resources:**
- `SafetyAdmin`: Administrative controls for safety mechanisms
- `ActivityMonitor`: Tracks user activity patterns and calculates risk scores

**Key Functions:**
- `canUserTrade()`: Checks if user is allowed to trade
- `validateTransaction()`: Validates transactions against safety controls
- `checkRiskThreshold()`: Monitors user risk levels
- Circuit breaker management functions

### 3. TradeAnalytics.cdc

Comprehensive performance tracking and analytics for trading strategies.

**Key Features:**
- Strategy performance metrics (win rate, profit/loss, Sharpe ratio)
- Risk metrics calculation (volatility, maximum drawdown)
- Market benchmarks and comparisons
- Leaderboard generation
- Advanced analytics (correlation, beta, etc.)

**Resources:**
- `AnalyticsAdmin`: Administrative functions for analytics management
- `UserAnalyticsResource`: User-specific analytics and performance tracking

**Key Functions:**
- `recordTrade()`: Records trade performance data
- `calculateRiskMetrics()`: Computes advanced risk metrics
- `generateLeaderboard()`: Creates performance rankings
- `getBenchmarkComparison()`: Compares user performance to market benchmarks

## Architecture

### Data Flow

1. **User Registration**: Users create accounts with budget limits
2. **Strategy Configuration**: Users set up trading strategies with parameters
3. **Trade Validation**: All trades validated against budget limits and safety controls
4. **Trade Execution**: Approved trades recorded with analytics tracking
5. **Performance Analysis**: Continuous performance monitoring and risk assessment

### Safety Mechanisms

1. **Budget Controls**: Multi-level spending limits (daily, weekly, monthly, total)
2. **Circuit Breakers**: Automatic trading halts based on market conditions
3. **Emergency Stops**: User and admin-triggered trading suspensions
4. **Risk Monitoring**: Continuous assessment of user trading patterns
5. **Activity Detection**: Identification of suspicious trading behavior

### Integration Points

- **Flow SDK**: JavaScript/TypeScript integration for web applications
- **NBA Top Shot API**: Off-chain data integration for moment information
- **AI Services**: Integration with AI analysis and recommendation systems
- **Risk Management**: Real-time risk assessment and control systems

## Testing

### Unit Tests

Comprehensive test suites for all contracts:

- `FastBreakController_test.cdc`: Tests user accounts, strategies, budget controls
- `SafetyControls_test.cdc`: Tests safety mechanisms and risk monitoring
- `TradeAnalytics_test.cdc`: Tests performance tracking and analytics

### Test Coverage

- ✅ Contract initialization
- ✅ User account creation and management
- ✅ Strategy configuration and activation
- ✅ Budget limit validation and enforcement
- ✅ Spending tracking and validation
- ✅ Trade recording and history
- ✅ Emergency stop mechanisms
- ✅ Circuit breaker functionality
- ✅ Risk assessment and monitoring
- ✅ Performance analytics and metrics
- ✅ Market benchmark comparisons

### Running Tests

```bash
# Install Flow CLI
flow version

# Start Flow emulator
flow emulator start

# Run tests
flow test --cover --covercode="contracts" contracts/cadence/tests/
```

## Deployment

### Local Development (Emulator)

```bash
# Start emulator
flow emulator start

# Deploy contracts
flow project deploy --network emulator

# Create test accounts
flow accounts create --network emulator
```

### Testnet Deployment

```bash
# Configure testnet account in flow.json
# Deploy to testnet
flow project deploy --network testnet
```

### Mainnet Deployment

```bash
# Configure mainnet account in flow.json
# Deploy to mainnet (requires security audit)
flow project deploy --network mainnet
```

## Security Considerations

### Audit Requirements

Before mainnet deployment, the contracts require:
- [ ] Professional security audit
- [ ] Penetration testing
- [ ] Economic model validation
- [ ] Stress testing under high load
- [ ] Integration testing with NBA Top Shot

### Security Features

1. **Access Control**: Proper resource ownership and capability management
2. **Input Validation**: Comprehensive validation of all parameters
3. **Overflow Protection**: Safe arithmetic operations
4. **Reentrancy Protection**: Proper state management
5. **Emergency Controls**: Multiple levels of emergency stops

### Known Limitations

1. **Oracle Dependency**: Relies on off-chain data for NBA stats and prices
2. **Market Risk**: Cannot prevent losses due to market volatility
3. **Smart Contract Risk**: Potential bugs or vulnerabilities in contract code
4. **Flow Network Risk**: Dependency on Flow blockchain availability

## Integration Guide

### Frontend Integration

```javascript
import * as fcl from "@onflow/fcl"
import * as t from "@onflow/types"

// Create user account
const createUserAccount = async (budgetLimits) => {
  const transactionId = await fcl.mutate({
    cadence: CREATE_USER_ACCOUNT,
    args: (arg, t) => [
      arg(budgetLimits, t.Struct)
    ],
    proposer: fcl.currentUser,
    payer: fcl.currentUser,
    authorizations: [fcl.currentUser],
    limit: 1000
  })
  
  return await fcl.tx(transactionId).onceSealed()
}

// Validate spending
const validateSpending = async (userAddress, amount) => {
  return await fcl.query({
    cadence: VALIDATE_SPENDING,
    args: (arg, t) => [
      arg(userAddress, t.Address),
      arg(amount.toFixed(8), t.UFix64)
    ]
  })
}
```

### Backend Integration

```typescript
import { FlowService } from '@fastbreak/flow-sdk'

const flowService = new FlowService({
  network: 'testnet',
  privateKey: process.env.FLOW_PRIVATE_KEY
})

// Record trade on-chain
await flowService.recordTrade({
  userAddress: user.walletAddress,
  momentId: trade.momentId,
  action: 'buy',
  price: trade.price,
  strategyId: trade.strategyId
})
```

## Monitoring and Maintenance

### Event Monitoring

Key events to monitor:
- `EmergencyStopTriggered`: User emergency stops
- `CircuitBreakerTriggered`: System-wide safety activations
- `RiskThresholdExceeded`: High-risk user activity
- `SuspiciousActivityDetected`: Potential fraud or abuse

### Performance Metrics

- Transaction throughput and latency
- Gas usage optimization
- Storage efficiency
- Error rates and failure modes

### Upgrade Strategy

1. **Versioned Deployments**: New contract versions for major updates
2. **Migration Scripts**: Data migration between contract versions
3. **Backward Compatibility**: Maintain compatibility with existing integrations
4. **Gradual Rollout**: Phased deployment with monitoring

## Support and Documentation

- **Flow Documentation**: https://docs.onflow.org/
- **Cadence Language**: https://docs.onflow.org/cadence/
- **NBA Top Shot API**: https://docs.nbatopshot.com/
- **FastBreak Documentation**: Internal documentation and API references

## License

This code is proprietary to FastBreak and subject to the terms of the FastBreak License Agreement.