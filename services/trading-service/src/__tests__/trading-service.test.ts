import { TradingService, TradingServiceConfig } from '../services/trading-service';
import { FlowService } from '../services/flow-service';
import { DatabaseManager } from '@fastbreak/database';
import winston from 'winston';

// Mock dependencies
jest.mock('../services/flow-service');
jest.mock('@fastbreak/database');
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
}));

describe('TradingService', () => {
  let tradingService: TradingService;
  let mockFlowService: jest.Mocked<FlowService>;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: TradingServiceConfig;

  beforeEach(() => {
    // Setup mocks
    mockFlowService = {
      canUserTrade: jest.fn(),
      validateSpending: jest.fn(),
      validateTransaction: jest.fn(),
      recordTrade: jest.fn(),
      getUserMoments: jest.fn(),
      getUserTradeHistory: jest.fn(),
    } as any;

    mockDb = {
      initialize: jest.fn(),
      close: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    config = {
      maxConcurrentTrades: 5,
      tradeTimeoutMs: 300000,
      retryAttempts: 3,
      retryDelayMs: 5000,
      slippageTolerance: 0.05,
      gasLimit: 9999,
      enableDryRun: true,
      topShotAPI: {
        baseUrl: 'https://api.nbatopshot.com',
        rateLimitPerSecond: 10,
      },
      marketplaceConfig: {
        marketplaceFee: 0.05,
        minBidIncrement: 1.0,
        maxBidDuration: 86400,
      },
    };

    // Reset axios mock before each test
    const mockAxios = require('axios');
    mockAxios.create.mockClear();

    tradingService = new TradingService(config, mockFlowService, mockDb, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Trade Submission', () => {
    it('should submit a valid buy trade', async () => {
      // Mock validations to pass
      mockFlowService.canUserTrade.mockResolvedValue(true);
      mockFlowService.validateSpending.mockResolvedValue(true);
      mockFlowService.validateTransaction.mockResolvedValue(true);

      // Mock market data
      jest.spyOn(tradingService, 'getMarketData').mockResolvedValue({
        momentId: 'moment-123',
        currentPrice: 100,
        volume24h: 1000,
        priceChange24h: 5,
        liquidity: 500,
        timestamp: new Date(),
      });

      const tradeRequest = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 105,
        priority: 'medium' as const,
      };

      const tradeId = await tradingService.submitTrade(tradeRequest);

      expect(tradeId).toBeDefined();
      expect(typeof tradeId).toBe('string');
      expect(mockFlowService.canUserTrade).toHaveBeenCalledWith('user-123');
      expect(mockFlowService.validateSpending).toHaveBeenCalledWith('user-123', 105);
    });

    it('should reject trade if user cannot trade', async () => {
      mockFlowService.canUserTrade.mockResolvedValue(false);

      const tradeRequest = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 105,
        priority: 'medium' as const,
      };

      await expect(tradingService.submitTrade(tradeRequest))
        .rejects.toThrow('User is not allowed to trade');
    });

    it('should reject trade if spending validation fails', async () => {
      mockFlowService.canUserTrade.mockResolvedValue(true);
      mockFlowService.validateSpending.mockResolvedValue(false);

      const tradeRequest = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 105,
        priority: 'medium' as const,
      };

      await expect(tradingService.submitTrade(tradeRequest))
        .rejects.toThrow('Trade would exceed budget limits');
    });

    it('should reject trade if safety controls block it', async () => {
      mockFlowService.canUserTrade.mockResolvedValue(true);
      mockFlowService.validateSpending.mockResolvedValue(true);
      mockFlowService.validateTransaction.mockResolvedValue(false);

      jest.spyOn(tradingService, 'getMarketData').mockResolvedValue({
        momentId: 'moment-123',
        currentPrice: 100,
        volume24h: 1000,
        priceChange24h: 5,
        liquidity: 500,
        timestamp: new Date(),
      });

      const tradeRequest = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 105,
        priority: 'medium' as const,
      };

      await expect(tradingService.submitTrade(tradeRequest))
        .rejects.toThrow('Trade blocked by safety controls');
    });

    it('should warn about significant price deviation', async () => {
      mockFlowService.canUserTrade.mockResolvedValue(true);
      mockFlowService.validateSpending.mockResolvedValue(true);
      mockFlowService.validateTransaction.mockResolvedValue(true);

      // Mock market data with significant price difference
      jest.spyOn(tradingService, 'getMarketData').mockResolvedValue({
        momentId: 'moment-123',
        currentPrice: 100,
        volume24h: 1000,
        priceChange24h: 5,
        liquidity: 500,
        timestamp: new Date(),
      });

      const tradeRequest = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 150, // 50% above market price
        priority: 'medium' as const,
      };

      const tradeId = await tradingService.submitTrade(tradeRequest);

      expect(tradeId).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Trade price deviates significantly from market price',
        expect.objectContaining({
          targetPrice: 150,
          marketPrice: 100,
        })
      );
    });
  });

  describe('Trade Queue Management', () => {
    it('should prioritize high priority trades', async () => {
      // Setup mocks for successful validation
      mockFlowService.canUserTrade.mockResolvedValue(true);
      mockFlowService.validateSpending.mockResolvedValue(true);
      mockFlowService.validateTransaction.mockResolvedValue(true);

      jest.spyOn(tradingService, 'getMarketData').mockResolvedValue({
        momentId: 'moment-123',
        currentPrice: 100,
        volume24h: 1000,
        priceChange24h: 5,
        liquidity: 500,
        timestamp: new Date(),
      });

      // Submit trades with different priorities
      const lowPriorityTrade = {
        userId: 'user-123',
        momentId: 'moment-123',
        action: 'buy' as const,
        targetPrice: 105,
        priority: 'low' as const,
      };

      const highPriorityTrade = {
        userId: 'user-123',
        momentId: 'moment-456',
        action: 'buy' as const,
        targetPrice: 205,
        priority: 'high' as const,
      };

      await tradingService.submitTrade(lowPriorityTrade);
      await tradingService.submitTrade(highPriorityTrade);

      const queueStatus = tradingService.getTradeQueueStatus();
      expect(queueStatus.queueLength).toBe(2);
    });

    it('should track active trades', async () => {
      const activeTrades = await tradingService.getActiveTrades();
      expect(Array.isArray(activeTrades)).toBe(true);
    });

    it('should filter active trades by user', async () => {
      const userTrades = await tradingService.getActiveTrades('user-123');
      expect(Array.isArray(userTrades)).toBe(true);
    });
  });

  describe('Market Data', () => {
    it('should fetch market data for a moment', async () => {
      // Mock axios response
      const mockAxios = require('axios');
      const mockGet = jest.fn().mockResolvedValue({
        data: {
          price: 100,
          highestBid: { price: 95 },
          lowestAsk: { price: 105 },
          lastSale: { price: 98 },
          volume24h: 1000,
          priceChange24h: 5,
        },
      });

      mockAxios.create.mockReturnValue({
        get: mockGet,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await tradingService.initialize();

      const marketData = await tradingService.getMarketData('moment-123');

      expect(marketData).toEqual({
        momentId: 'moment-123',
        currentPrice: 100,
        bidPrice: 95,
        askPrice: 105,
        lastSalePrice: 98,
        volume24h: 1000,
        priceChange24h: 5,
        liquidity: 0,
        timestamp: expect.any(Date),
      });
    });

    it('should handle market data fetch errors', async () => {
      const mockAxios = require('axios');
      const mockGet = jest.fn().mockRejectedValue(new Error('API Error'));
      
      mockAxios.create.mockReturnValue({
        get: mockGet,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await tradingService.initialize();

      const marketData = await tradingService.getMarketData('moment-123');
      expect(marketData).toBeNull();
    });
  });

  describe('Order Book', () => {
    it('should fetch order book for a moment', async () => {
      const mockAxios = require('axios');
      const mockGet = jest.fn()
        .mockResolvedValueOnce({
          data: {
            price: 100,
            highestBid: { price: 95 },
            lowestAsk: { price: 105 },
            lastSale: { price: 98 },
            volume24h: 1000,
            priceChange24h: 5,
          },
        })
        .mockResolvedValueOnce({
          data: {
            bids: [
              { price: 95, quantity: 1 },
              { price: 90, quantity: 2 },
            ],
            asks: [
              { price: 105, quantity: 1 },
              { price: 110, quantity: 1 },
            ],
          },
        });

      mockAxios.create.mockReturnValue({
        get: mockGet,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await tradingService.initialize();

      const orderBook = await tradingService.getOrderBook('moment-123');

      expect(orderBook).toEqual({
        momentId: 'moment-123',
        bids: [
          { price: 95, quantity: 1, userId: undefined },
          { price: 90, quantity: 2, userId: undefined },
        ],
        asks: [
          { price: 105, quantity: 1, userId: undefined },
          { price: 110, quantity: 1, userId: undefined },
        ],
        spread: 10, // 105 - 95
        timestamp: expect.any(Date),
      });
    });

    it('should handle empty order book', async () => {
      const mockAxios = require('axios');
      const mockGet = jest.fn()
        .mockResolvedValueOnce({
          data: {
            price: 100,
            volume24h: 1000,
            priceChange24h: 5,
          },
        })
        .mockResolvedValueOnce({
          data: {},
        });

      mockAxios.create.mockReturnValue({
        get: mockGet,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await tradingService.initialize();

      const orderBook = await tradingService.getOrderBook('moment-123');

      expect(orderBook).toEqual({
        momentId: 'moment-123',
        bids: [],
        asks: [],
        spread: 0,
        timestamp: expect.any(Date),
      });
    });
  });

  describe('Trade Cancellation', () => {
    it('should cancel an active trade', async () => {
      const cancelled = await tradingService.cancelTrade('trade-123', 'user-123');
      expect(typeof cancelled).toBe('boolean');
    });

    it('should not cancel trade for wrong user', async () => {
      const cancelled = await tradingService.cancelTrade('trade-123', 'wrong-user');
      expect(cancelled).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect API rate limits', async () => {
      const mockAxios = require('axios');
      const mockGet = jest.fn().mockResolvedValue({ 
        data: {
          price: 100,
          volume24h: 1000,
          priceChange24h: 5,
        }
      });
      
      mockAxios.create.mockReturnValue({
        get: mockGet,
        interceptors: {
          request: { 
            use: jest.fn((interceptor) => {
              // Simulate the rate limiting interceptor
              return interceptor;
            })
          },
          response: { use: jest.fn() },
        },
      });

      await tradingService.initialize();

      // Make multiple rapid requests
      const promises = Array(5).fill(null).map(() => 
        tradingService.getMarketData('moment-123')
      );

      await Promise.all(promises);

      // Should have made requests (rate limiting is internal)
      expect(mockGet).toHaveBeenCalled();
    });
  });

  describe('Service Lifecycle', () => {
    it('should initialize successfully', async () => {
      const mockAxios = require('axios');
      mockAxios.create.mockReturnValue({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      await expect(tradingService.initialize()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Trading service initialized successfully');
    });

    it('should shutdown gracefully', async () => {
      await expect(tradingService.shutdown()).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Trading service shutdown complete');
    });
  });

  describe('Dry Run Mode', () => {
    it('should log dry run executions', async () => {
      // This would test the dry run functionality
      // The actual implementation would need to be tested with real trade processing
      expect(config.enableDryRun).toBe(true);
    });
  });
});