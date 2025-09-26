import { ActionManager, ActionManagerConfig } from '../services/action-manager';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');

describe('ActionManager', () => {
  let actionManager: ActionManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: ActionManagerConfig;

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      initialize: jest.fn(),
      close: jest.fn(),
    } as any;

    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    config = {
      maxConcurrentActions: 5,
      actionTimeoutMs: 300000,
      retryDelayMs: 5000,
      maxRetryAttempts: 3,
      enableMetrics: true,
      metricsRetentionDays: 30,
      purchaseAction: {
        maxRetries: 3,
        timeoutMs: 120000,
        gasLimit: 1000,
        maxGasCost: 0.01,
        enabled: true,
        slippageTolerance: 0.05,
        priceValidityWindow: 30000,
        marketplaceTimeouts: {
          topshot: 60000,
          othermarkets: 90000,
        },
      },
      arbitrageAction: {
        maxRetries: 2,
        timeoutMs: 180000,
        gasLimit: 2000,
        maxGasCost: 0.02,
        enabled: true,
        minProfitThreshold: 10,
        maxExecutionTime: 300000,
        crossMarketplaceEnabled: true,
        simultaneousExecutionEnabled: true,
      },
      portfolioRebalanceAction: {
        maxRetries: 2,
        timeoutMs: 600000,
        gasLimit: 5000,
        maxGasCost: 0.05,
        enabled: true,
        maxBatchSize: 20,
        minProfitThreshold: 5,
        maxLossThreshold: 0.2,
        marketImpactLimit: 0.1,
        priceValidityWindow: 60000,
      },
    };

    actionManager = new ActionManager(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await actionManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Action manager initialized successfully');
    });

    it('should handle initialization failure', async () => {
      const error = new Error('Initialization failed');
      mockLogger.info.mockImplementationOnce(() => {
        throw error;
      });

      await expect(actionManager.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('Action Execution', () => {
    beforeEach(async () => {
      await actionManager.initialize();
    });

    it('should execute purchase action successfully', async () => {
      const input = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot',
        urgency: 'medium',
      };

      const requestId = await actionManager.executeAction('user123', 'purchase', input);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });

    it('should execute arbitrage action successfully', async () => {
      const input = {
        momentId: 'moment123',
        buyListing: {
          listingId: 'buy123',
          price: 100,
          marketplaceId: 'topshot',
          sellerAddress: '0x123',
        },
        sellListing: {
          listingId: 'sell456',
          price: 120,
          marketplaceId: 'topshot',
          buyerAddress: '0x456',
        },
        userAddress: '0x789',
        expectedProfit: 15,
        maxSlippage: 0.05,
        timeoutMs: 300000,
      };

      const requestId = await actionManager.executeAction('user123', 'arbitrage', input);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });

    it('should execute portfolio rebalance action successfully', async () => {
      const input = {
        userId: 'user123',
        userAddress: '0x123',
        rebalanceType: 'profit_taking',
        sellCriteria: {
          minProfitPercentage: 0.1,
        },
        maxMomentsToSell: 5,
        urgency: 'medium',
        dryRun: false,
      };

      const requestId = await actionManager.executeAction('user123', 'portfolio_rebalance', input);

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
    });

    it('should reject unknown action type', async () => {
      await expect(
        actionManager.executeAction('user123', 'unknown' as any, {})
      ).rejects.toThrow('Unknown action type: unknown');
    });

    it('should handle concurrent execution limits', async () => {
      // Fill up all execution slots
      const promises = [];
      for (let i = 0; i < config.maxConcurrentActions + 2; i++) {
        promises.push(
          actionManager.executeAction('user123', 'purchase', {
            momentId: `moment${i}`,
            listingId: `listing${i}`,
            maxPrice: 100,
            sellerAddress: '0x123',
            buyerAddress: '0x456',
            marketplaceId: 'topshot',
            urgency: 'medium',
          })
        );
      }

      const requestIds = await Promise.all(promises);
      expect(requestIds).toHaveLength(config.maxConcurrentActions + 2);
      
      // All should have request IDs
      requestIds.forEach(id => {
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
      });
    });
  });

  describe('Action Management', () => {
    beforeEach(async () => {
      await actionManager.initialize();
    });

    it('should get action status', async () => {
      const requestId = await actionManager.executeAction('user123', 'purchase', {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot',
        urgency: 'medium',
      });

      const status = actionManager.getActionStatus(requestId);
      expect(status).toBeDefined();
      expect(status?.requestId).toBe(requestId);
      expect(status?.userId).toBe('user123');
    });

    it('should return null for non-existent action', () => {
      const status = actionManager.getActionStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should get user actions', async () => {
      await actionManager.executeAction('user123', 'purchase', {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot',
        urgency: 'medium',
      });

      const userActions = actionManager.getUserActions('user123');
      expect(userActions).toHaveLength(1);
      expect(userActions[0].userId).toBe('user123');
    });

    it('should cancel queued action', async () => {
      // Fill up execution slots to force queueing
      const promises = [];
      for (let i = 0; i < config.maxConcurrentActions + 1; i++) {
        promises.push(
          actionManager.executeAction('user123', 'purchase', {
            momentId: `moment${i}`,
            listingId: `listing${i}`,
            maxPrice: 100,
            sellerAddress: '0x123',
            buyerAddress: '0x456',
            marketplaceId: 'topshot',
            urgency: 'medium',
          })
        );
      }

      const requestIds = await Promise.all(promises);
      const lastRequestId = requestIds[requestIds.length - 1];

      const cancelled = await actionManager.cancelAction(lastRequestId, 'user123');
      expect(cancelled).toBe(true);
    });

    it('should not cancel action for wrong user', async () => {
      const requestId = await actionManager.executeAction('user123', 'purchase', {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot',
        urgency: 'medium',
      });

      const cancelled = await actionManager.cancelAction(requestId, 'user456');
      expect(cancelled).toBe(false);
    });
  });

  describe('Metrics', () => {
    beforeEach(async () => {
      await actionManager.initialize();
    });

    it('should return system metrics', () => {
      const metrics = actionManager.getMetrics();

      expect(metrics).toHaveProperty('totalExecutions');
      expect(metrics).toHaveProperty('successfulExecutions');
      expect(metrics).toHaveProperty('failedExecutions');
      expect(metrics).toHaveProperty('averageExecutionTime');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('actionTypeBreakdown');
      expect(metrics).toHaveProperty('recentExecutions');

      expect(typeof metrics.totalExecutions).toBe('number');
      expect(typeof metrics.successRate).toBe('number');
      expect(Array.isArray(metrics.recentExecutions)).toBe(true);
    });

    it('should track action type breakdown', () => {
      const metrics = actionManager.getMetrics();

      expect(metrics.actionTypeBreakdown).toHaveProperty('purchase');
      expect(metrics.actionTypeBreakdown).toHaveProperty('arbitrage');
      expect(metrics.actionTypeBreakdown).toHaveProperty('portfolio_rebalance');

      Object.values(metrics.actionTypeBreakdown).forEach(breakdown => {
        expect(breakdown).toHaveProperty('count');
        expect(breakdown).toHaveProperty('successRate');
        expect(breakdown).toHaveProperty('averageTime');
      });
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await actionManager.initialize();
      await actionManager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Action manager shutdown complete');
    });
  });
});