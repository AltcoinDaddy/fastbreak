import { PurchaseAction, PurchaseActionConfig } from '../../actions/purchase-action';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');

describe('PurchaseAction Integration Tests', () => {
  let action: PurchaseAction;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: PurchaseActionConfig;

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
    };

    action = new PurchaseAction(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Purchase Execution', () => {
    it('should execute purchase action successfully', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const input = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot',
        urgency: 'medium' as const,
      };

      const result = await action.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting action execution',
        expect.objectContaining({
          userId: context.userId,
          requestId: context.requestId,
        })
      );
    });

    it('should handle validation failure', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const invalidInput = {
        momentId: '', // Invalid empty momentId
        listingId: 'listing456',
        maxPrice: -100, // Invalid negative price
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'invalid_marketplace',
        urgency: 'medium' as const,
      };

      const result = await action.execute(context, invalidInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should handle different marketplace configurations', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const topShotInput = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        urgency: 'medium' as const,
      };

      const otherMarketInput = {
        ...topShotInput,
        marketplaceId: 'othermarkets' as const,
      };

      const topShotResult = await action.execute(context, topShotInput);
      const otherMarketResult = await action.execute(context, otherMarketInput);

      expect(topShotResult.success).toBe(true);
      expect(otherMarketResult.success).toBe(true);
    });

    it('should handle different urgency levels', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const baseInput = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
      };

      const urgencyLevels = ['low', 'medium', 'high'] as const;

      for (const urgency of urgencyLevels) {
        const input = { ...baseInput, urgency };
        const result = await action.execute(context, input);
        
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
      }
    });

    it('should handle configuration updates', () => {
      const originalConfig = action.getConfig();
      expect(originalConfig.slippageTolerance).toBe(0.05);

      action.updateConfig({ slippageTolerance: 0.1 });

      const updatedConfig = action.getConfig();
      expect(updatedConfig.slippageTolerance).toBe(0.1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Action configuration updated',
        { updates: { slippageTolerance: 0.1 } }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout scenarios', async () => {
      // Create action with very short timeout
      const shortTimeoutConfig = { ...config, timeoutMs: 1 };
      const shortTimeoutAction = new PurchaseAction(shortTimeoutConfig, mockDb, mockRedis, mockLogger);

      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const input = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        urgency: 'medium' as const,
      };

      const result = await shortTimeoutAction.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.setEx.mockRejectedValue(new Error('Redis connection failed'));

      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const input = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        urgency: 'medium' as const,
      };

      // Should still execute successfully despite Redis errors
      const result = await action.execute(context, input);
      expect(result.success).toBe(true);
    });
  });

  describe('Action Properties', () => {
    it('should have correct action properties', () => {
      expect(action.getName()).toBe('PurchaseAction');
      expect(action.getType()).toBe('purchase');
      expect(action.getId()).toBeDefined();
      expect(typeof action.getId()).toBe('string');
    });

    it('should return configuration', () => {
      const actionConfig = action.getConfig();
      
      expect(actionConfig.maxRetries).toBe(config.maxRetries);
      expect(actionConfig.timeoutMs).toBe(config.timeoutMs);
      expect(actionConfig.gasLimit).toBe(config.gasLimit);
      expect(actionConfig.enabled).toBe(config.enabled);
    });
  });

  describe('Strategy Integration', () => {
    it('should handle strategy-specific purchases', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const inputWithStrategy = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        strategyId: 'rookie_risers_strategy',
        urgency: 'high' as const,
      };

      const result = await action.execute(context, inputWithStrategy);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should work without strategy ID', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const inputWithoutStrategy = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        urgency: 'medium' as const,
      };

      const result = await action.execute(context, inputWithoutStrategy);

      expect(result.success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete execution within reasonable time', async () => {
      const context = {
        userId: 'user123',
        requestId: 'req456',
        timestamp: new Date(),
      };

      const input = {
        momentId: 'moment123',
        listingId: 'listing456',
        maxPrice: 100,
        sellerAddress: '0x123',
        buyerAddress: '0x456',
        marketplaceId: 'topshot' as const,
        urgency: 'medium' as const,
      };

      const startTime = Date.now();
      const result = await action.execute(context, input);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds for mock
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.executionTime).toBeLessThan(executionTime + 100); // Allow some margin
    });
  });
});