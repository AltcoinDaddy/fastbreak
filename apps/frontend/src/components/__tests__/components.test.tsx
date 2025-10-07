/**
 * Basic component tests for FastBreak dashboard components
 * These tests verify that components can be imported and have the expected structure
 */

describe('FastBreak Dashboard Components', () => {
  it('should import WalletConnection component', async () => {
    const WalletConnection = await import('../WalletConnection')
    expect(WalletConnection.default).toBeDefined()
    expect(typeof WalletConnection.default).toBe('function')
  })

  it('should import PortfolioOverview component', async () => {
    const PortfolioOverview = await import('../PortfolioOverview')
    expect(PortfolioOverview.default).toBeDefined()
    expect(typeof PortfolioOverview.default).toBe('function')
  })

  it('should import StrategyConfiguration component', async () => {
    const StrategyConfiguration = await import('../StrategyConfiguration')
    expect(StrategyConfiguration.default).toBeDefined()
    expect(typeof StrategyConfiguration.default).toBe('function')
  })

  it('should import TradeHistory component', async () => {
    const TradeHistory = await import('../TradeHistory')
    expect(TradeHistory.default).toBeDefined()
    expect(typeof TradeHistory.default).toBe('function')
  })

  it('should import BudgetControls component', async () => {
    const BudgetControls = await import('../BudgetControls')
    expect(BudgetControls.default).toBeDefined()
    expect(typeof BudgetControls.default).toBe('function')
  })

  it('should import Flow utilities', async () => {
    const flowUtils = await import('../../lib/flow')
    expect(flowUtils.fcl).toBeDefined()
    expect(flowUtils.authenticate).toBeDefined()
    expect(flowUtils.unauthenticate).toBeDefined()
    expect(flowUtils.subscribeToUser).toBeDefined()
  })
})