import { TradingService, TradingServiceConfig } from '../services/trading-service';
import { FlowService, FlowConfig } from '../services/flow-service';
import { PortfolioService } from '../services/portfolio-service';
import { DatabaseManager } from '@fastbreak/database';
import winston from 'winston';
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

describe('Trading Service Integration Tests', () => {
  let tradingService: TradingService;
  let flowService: FlowService;
  let portfolioService: PortfolioService;
  let db: DatabaseManager;
  let logger: winston.Logger;

  const testTimeout = 60000; // 60 seconds for blockchain operations

  beforeAll(async () => {
    // Skip integration tests if not in test environment
    if (!process.env.FLOW_TESTNET_PRIVATE_KEY || !process.env.FLOW_TESTNET_ACCOUNT_ADDRESS) {
      console.log('Skipping integration tests - Flow testnet credentials not provided');
      return;
    }

    // Setup logger
    logger = winston.createLogger({
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
      ),
      transports: [new winston.transports.Console()],
    });

    // Setup database
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL required for integration tests');
    }

    db = new DatabaseManager(databaseUrl);
    await db.initialize();

    // Setup Flow service with testnet configuration
    const flowConfig: FlowConfig = {
      network: 'testnet',
      accessNodeAPI: process.env.FLOW_TESTNET_ACCESS_NODE || 'https://rest-testnet.onflow.org',
      privateKey: process.env.FLOW_TESTNET_PRIVATE_KEY!,
      accountAddress: process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!,
      contracts: {
        FastBreakController: process.env.FASTBREAK_CONTROLLER_TESTNET_ADDRESS || '0x1234567890abcdef',
        SafetyControls: process.env.SAFETY_CONTROLS_TESTNET_ADDRESS || '0x1234567890abcdef',
        TradeAnalytics: process.env.TRADE_ANALYTICS_TESTNET_ADDRESS || '0x1234567890abcdef',
        TopShot: process.env.TOP_SHOT_TESTNET_ADDRESS || '0x877931736ee77cff',
      },
    };

    flowService = new FlowService(flowConfig, logger);
    await flowService.initialize();

    // Setup trading service with test configuration
    const tradingConfig: TradingServiceConfig = {
      maxConcurrentTrades: 3,
      tradeTimeoutMs: 30000,
      retryAttempts: 2,
      retryDelayMs: 2000,
      slippageTolerance: 0.1, // 10% for testing
      gasLimit: 9999,
      enableDryRun: true, // Enable dry run for integration tests
      topShotAPI: {
        baseUrl: process.env.TOP_SHOT_API_URL || 'https://api.nbatopshot.com',
        apiKey: process.env.TOP_SHOT_API_KEY,
        rateLimitPerSecond: 5, // Lower rate limit for testing
      },
      marketplaceConfig: {
        marketplaceFee: 0.05,
        minBidIncrement: 1.0,
        maxBidDuration: 3600, // 1 hour for testing
      },
    };

    tradingService = new TradingService(tradingConfig, flowService, db, logger);
    await tradingService.initialize();

    portfolioService = new PortfolioService(flowService, db, logger);
    await portfolioService.initialize();

  }, testTimeout);

  afterAll(async () => {
    if (tradingService) {
      await tradingService.shutdown();
    }
    if (portfolioService) {
      await portfolioService.shutdown();
    }
    if (flowService) {
      await flowService.shutdown();
    }
    if (db) {
      await db.close();
    }
  });

  describe('Flow Blockchain Integration', () => {
    const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;

    it('should connect to Flow testnet successfully', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      expect(flowService.isConnected()).toBe(true);
    }, testTimeout);

    it('should validate user spending limits', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const canSpend = await flowService.validateSpending(testUserId, 100);
      expect(typeof canSpend).toBe('boolean');
    }, testTimeout);

    it('should check if user can trade', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const canTrade = await flowService.canUserTrade(testUserId);
      expect(typeof canTrade).toBe('boolean');
    }, testTimeout);

    it('should get user strategies from blockchain', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const strategies = await flowService.getUserStrategies(testUserId);
      expect(Array.isArray(strategies)).toBe(true);
    }, testTimeout);

    it('should get user budget limits from blockchain', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const budgetLimits = await flowService.getUserBudgetLimits(testUserId);
      // Budget limits might be null if user hasn't set them up yet
      expect(budgetLimits === null || typeof budgetLimits === 'object').toBe(true);
    }, testTimeout);

    it('should get user trade history from blockchain', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const tradeHistory = await flowService.getUserTradeHistory(testUserId, 10);
      expect(Array.isArray(tradeHistory)).toBe(true);
    }, testTimeout);

    it('should get user moments from blockchain', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const userMoments = await flowService.getUserMoments(testUserId);
      expect(Array.isArray(userMoments)).toBe(true);
    }, testTimeout);
  });

  describe('Trading Service Integration', () => {
    const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;
    const testMomentId = process.env.TEST_MOMENT_ID || '1';

    it('should submit and process a buy trade request', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const tradeRequest = {
        userId: testUserId,
        momentId: testMomentId,
        action: 'buy' as const,
        targetPrice: 50,
        maxPrice: 60,
        priority: 'high' as const,
        reasoning: 'Integration test trade',
        strategyId: 'test-strategy-1',
      };

      const tradeId = await tradingService.submitTrade(tradeRequest);
      expect(typeof tradeId).toBe('string');
      expect(tradeId.length).toBeGreaterThan(0);

      // Wait a moment for trade processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check trade queue status
      const queueStatus = tradingService.getTradeQueueStatus();
      expect(queueStatus).toHaveProperty('queueLength');
      expect(queueStatus).toHaveProperty('activeTrades');
      expect(queueStatus).toHaveProperty('processing');
    }, testTimeout);

    it('should get active trades for user', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const activeTrades = await tradingService.getActiveTrades(testUserId);
      expect(Array.isArray(activeTrades)).toBe(true);
    }, testTimeout);

    it('should get trade history for user', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const tradeHistory = await tradingService.getTradeHistory(testUserId, 10);
      expect(Array.isArray(tradeHistory)).toBe(true);
    }, testTimeout);

    it('should fetch market data for a moment', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const marketData = await tradingService.getMarketData(testMomentId);
      
      if (marketData) {
        expect(marketData).toHaveProperty('momentId', testMomentId);
        expect(marketData).toHaveProperty('currentPrice');
        expect(marketData).toHaveProperty('timestamp');
        expect(typeof marketData.currentPrice).toBe('number');
      }
      // Market data might be null if moment doesn't exist or API is unavailable
    }, testTimeout);

    it('should fetch order book for a moment', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const orderBook = await tradingService.getOrderBook(testMomentId);
      
      expect(orderBook).toHaveProperty('momentId', testMomentId);
      expect(orderBook).toHaveProperty('bids');
      expect(orderBook).toHaveProperty('asks');
      expect(orderBook).toHaveProperty('spread');
      expect(orderBook).toHaveProperty('timestamp');
      expect(Array.isArray(orderBook.bids)).toBe(true);
      expect(Array.isArray(orderBook.asks)).toBe(true);
    }, testTimeout);

    it('should handle trade validation errors gracefully', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const invalidTradeRequest = {
        userId: 'invalid-user-id',
        momentId: testMomentId,
        action: 'buy' as const,
        targetPrice: 1000000, // Extremely high price to trigger validation failure
        priority: 'medium' as const,
      };

      await expect(tradingService.submitTrade(invalidTradeRequest))
        .rejects.toThrow();
    }, testTimeout);
  });

  describe('Portfolio Service Integration', () => {
    const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;

    it('should get user portfolio from blockchain', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const portfolio = await portfolioService.getPortfolio(testUserId);
      
      expect(portfolio).toHaveProperty('userId', testUserId);
      expect(portfolio).toHaveProperty('moments');
      expect(portfolio).toHaveProperty('totalValue');
      expect(portfolio).toHaveProperty('totalCost');
      expect(portfolio).toHaveProperty('momentCount');
      expect(portfolio).toHaveProperty('lastUpdated');
      expect(Array.isArray(portfolio.moments)).toBe(true);
      expect(typeof portfolio.totalValue).toBe('number');
      expect(typeof portfolio.momentCount).toBe('number');
    }, testTimeout);

    it('should calculate portfolio performance metrics', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const performance = await portfolioService.getPortfolioPerformance(testUserId, 'all');
      
      expect(performance).toHaveProperty('userId', testUserId);
      expect(performance).toHaveProperty('totalReturn');
      expect(performance).toHaveProperty('totalReturnPercent');
      expect(performance).toHaveProperty('realizedPnL');
      expect(performance).toHaveProperty('unrealizedPnL');
      expect(performance).toHaveProperty('winRate');
      expect(performance).toHaveProperty('averageHoldingPeriod');
      expect(performance).toHaveProperty('period', 'all');
      expect(typeof performance.totalReturn).toBe('number');
      expect(typeof performance.winRate).toBe('number');
    }, testTimeout);

    it('should get portfolio summary', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const summary = await portfolioService.getPortfolioSummary(testUserId);
      
      expect(summary).toHaveProperty('portfolio');
      expect(summary).toHaveProperty('performance');
      expect(summary.portfolio).toHaveProperty('userId', testUserId);
      expect(summary.performance).toHaveProperty('userId', testUserId);
    }, testTimeout);

    it('should get top and worst performers', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const [topPerformers, worstPerformers] = await Promise.all([
        portfolioService.getTopPerformers(testUserId, 3),
        portfolioService.getWorstPerformers(testUserId, 3),
      ]);

      expect(Array.isArray(topPerformers)).toBe(true);
      expect(Array.isArray(worstPerformers)).toBe(true);
      expect(topPerformers.length).toBeLessThanOrEqual(3);
      expect(worstPerformers.length).toBeLessThanOrEqual(3);
    }, testTimeout);

    it('should get portfolio allocation', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const allocation = await portfolioService.getPortfolioAllocation(testUserId);
      
      expect(allocation).toHaveProperty('byPlayer');
      expect(allocation).toHaveProperty('bySet');
      expect(Array.isArray(allocation.byPlayer)).toBe(true);
      expect(Array.isArray(allocation.bySet)).toBe(true);
    }, testTimeout);
  });

  describe('Error Handling and Retry Logic', () => {
    const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;

    it('should handle network timeouts gracefully', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      // Test with a very short timeout to simulate network issues
      const shortTimeoutConfig: TradingServiceConfig = {
        maxConcurrentTrades: 1,
        tradeTimeoutMs: 100, // Very short timeout
        retryAttempts: 1,
        retryDelayMs: 100,
        slippageTolerance: 0.1,
        gasLimit: 9999,
        enableDryRun: true,
        topShotAPI: {
          baseUrl: 'https://api.nbatopshot.com',
          rateLimitPerSecond: 1,
        },
        marketplaceConfig: {
          marketplaceFee: 0.05,
          minBidIncrement: 1.0,
          maxBidDuration: 3600,
        },
      };

      const shortTimeoutService = new TradingService(shortTimeoutConfig, flowService, db, logger);
      await shortTimeoutService.initialize();

      try {
        // This should handle the timeout gracefully
        const marketData = await shortTimeoutService.getMarketData('nonexistent-moment');
        expect(marketData).toBeNull();
      } finally {
        await shortTimeoutService.shutdown();
      }
    }, testTimeout);

    it('should handle blockchain transaction failures', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      // Try to record a trade with invalid data to test error handling
      try {
        await flowService.recordTrade(
          'invalid-address',
          'invalid-moment',
          'buy',
          -100, // Invalid negative price
          'test-strategy',
          'Error handling test'
        );
      } catch (error) {
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
    }, testTimeout);
  });

  describe('Rate Limiting and Performance', () => {
    it('should respect API rate limits', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const startTime = Date.now();
      
      // Make multiple requests that should be rate limited
      const promises = Array(5).fill(null).map((_, index) => 
        tradingService.getMarketData(`test-moment-${index}`)
      );

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should take at least some time due to rate limiting
      // With 5 requests per second, 5 requests should take at least 800ms
      expect(duration).toBeGreaterThan(500);
    }, testTimeout);

    it('should handle concurrent trade submissions', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;
      
      // Submit multiple trades concurrently
      const tradePromises = Array(3).fill(null).map((_, index) => 
        tradingService.submitTrade({
          userId: testUserId,
          momentId: `concurrent-test-${index}`,
          action: 'buy' as const,
          targetPrice: 10 + index,
          priority: 'low' as const,
          reasoning: `Concurrent test trade ${index}`,
        }).catch(error => {
          // Some trades might fail due to validation, which is expected
          return `error-${index}`;
        })
      );

      const results = await Promise.all(tradePromises);
      
      // At least some trades should be submitted successfully
      const successfulTrades = results.filter(result => typeof result === 'string' && !result.startsWith('error'));
      expect(successfulTrades.length).toBeGreaterThan(0);
    }, testTimeout);
  });

  describe('Event Handling', () => {
    it('should emit trade events correctly', async () => {
      if (!process.env.FLOW_TESTNET_PRIVATE_KEY) {
        pending('Flow testnet credentials not provided');
        return;
      }

      const events: string[] = [];
      
      // Listen for trade events
      tradingService.on('tradeSubmitted', () => events.push('tradeSubmitted'));
      tradingService.on('tradeExecuted', () => events.push('tradeExecuted'));
      tradingService.on('tradeFailed', () => events.push('tradeFailed'));
      tradingService.on('tradeCancelled', () => events.push('tradeCancelled'));

      const testUserId = process.env.FLOW_TESTNET_ACCOUNT_ADDRESS!;
      
      try {
        await tradingService.submitTrade({
          userId: testUserId,
          momentId: 'event-test-moment',
          action: 'buy' as const,
          targetPrice: 25,
          priority: 'medium' as const,
          reasoning: 'Event handling test',
        });

        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(events).toContain('tradeSubmitted');
      } catch (error) {
        // Trade might fail due to validation, but should still emit events
        expect(events.length).toBeGreaterThan(0);
      }
    }, testTimeout);
  });
});