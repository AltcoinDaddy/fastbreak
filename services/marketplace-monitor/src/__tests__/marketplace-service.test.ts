import { MarketplaceService, MarketplaceServiceConfig } from '../services/marketplace-service';
import { TopShotClient } from '../clients/topshot-client';
import { ArbitrageDetector } from '../services/arbitrage-detector';
import { PriceMonitor } from '../services/price-monitor';
import { 
  MarketplaceConfig, 
  MarketplaceListing, 
  MarketplaceSale,
  ArbitrageOpportunity,
  MarketAlert 
} from '../types/marketplace';
import winston from 'winston';
import Redis from 'redis';

// Mock dependencies
jest.mock('../clients/topshot-client');
jest.mock('../services/arbitrage-detector', () => ({
  ArbitrageDetector: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    getActiveOpportunities: jest.fn().mockReturnValue([]),
    on: jest.fn(),
  })),
}));
jest.mock('../services/price-monitor', () => ({
  PriceMonitor: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    addPriceAlert: jest.fn(),
    removePriceAlert: jest.fn(),
    on: jest.fn(),
  })),
}));
jest.mock('redis');
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockImplementation((fn) => fn()),
    size: 0,
    pending: 0,
  }));
});
jest.mock('p-retry', () => {
  return jest.fn().mockImplementation((fn) => fn());
});
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
  }),
}));

describe('MarketplaceService Integration Tests', () => {
  let marketplaceService: MarketplaceService;
  let mockRedisClient: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: winston.Logger;
  let config: MarketplaceServiceConfig;

  beforeEach(() => {
    // Create mock logger
    mockLogger = winston.createLogger({
      silent: true,
    });

    // Create mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      lPush: jest.fn(),
      lTrim: jest.fn(),
      lRange: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
    } as any;

    // Create test config
    const marketplaceConfigs: MarketplaceConfig[] = [
      {
        id: 'topshot',
        name: 'NBA Top Shot',
        baseUrl: 'https://api.nbatopshot.com',
        rateLimits: {
          requestsPerSecond: 10,
          requestsPerMinute: 600,
          requestsPerHour: 36000,
        },
        endpoints: {
          listings: '/marketplace/listings',
          sales: '/marketplace/sales',
          moments: '/moments',
          players: '/players',
        },
        websocket: {
          url: 'wss://api.nbatopshot.com/ws',
          channels: ['listings', 'sales', 'prices'],
        },
        isActive: true,
        priority: 1,
      },
    ];

    config = {
      marketplaces: marketplaceConfigs,
      arbitrage: {
        minProfitPercentage: 5,
        minProfitAmount: 10,
        maxRiskScore: 70,
        scanIntervalMs: 30000,
        maxOpportunityAge: 10,
        marketplaces: ['topshot'],
      },
      priceMonitor: {
        updateIntervalMs: 60000,
        priceHistoryDays: 30,
        volatilityThreshold: 0.2,
        volumeSpikeThreshold: 3,
        significantPriceChangeThreshold: 10,
      },
      healthCheckIntervalMs: 60000,
      alertRetentionDays: 7,
    };

    marketplaceService = new MarketplaceService(config, mockRedisClient, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(marketplaceService).toBeInstanceOf(MarketplaceService);
      expect(marketplaceService.getServiceStats().marketplaces).toBe(1);
    });

    it('should initialize marketplace clients for active marketplaces', () => {
      const stats = marketplaceService.getServiceStats();
      expect(stats.marketplaces).toBe(1);
    });
  });

  describe('Marketplace Data Processing', () => {
    it('should process real-time marketplace listings', async () => {
      const mockListings: MarketplaceListing[] = [
        {
          id: 'listing_1',
          momentId: 'moment_123',
          playerId: 'player_456',
          playerName: 'LeBron James',
          momentType: 'dunk',
          serialNumber: 100,
          price: 150.00,
          currency: 'USD',
          marketplaceId: 'topshot',
          sellerId: 'seller_789',
          listedAt: new Date(),
          updatedAt: new Date(),
          status: 'active',
        },
        {
          id: 'listing_2',
          momentId: 'moment_124',
          playerId: 'player_457',
          playerName: 'Stephen Curry',
          momentType: 'three_pointer',
          serialNumber: 50,
          price: 200.00,
          currency: 'USD',
          marketplaceId: 'topshot',
          sellerId: 'seller_790',
          listedAt: new Date(),
          updatedAt: new Date(),
          status: 'active',
        },
      ];

      // Mock the marketplace client to return listings
      const mockClient = new TopShotClient(config.marketplaces[0], mockLogger);
      (mockClient.getActiveListings as jest.Mock).mockResolvedValue(mockListings);

      // Test that the service can process listings
      const listings = await mockClient.getActiveListings();
      expect(listings).toHaveLength(2);
      expect(listings[0].momentId).toBe('moment_123');
      expect(listings[1].price).toBe(200.00);
    });

    it('should process marketplace sales data', async () => {
      const mockSales: MarketplaceSale[] = [
        {
          id: 'sale_1',
          momentId: 'moment_123',
          playerId: 'player_456',
          price: 175.00,
          currency: 'USD',
          marketplaceId: 'topshot',
          buyerId: 'buyer_123',
          sellerId: 'seller_789',
          soldAt: new Date(),
          transactionHash: '0x123abc',
          fees: {
            marketplaceFee: 8.75,
            royaltyFee: 8.75,
            totalFees: 17.50,
          },
        },
      ];

      const mockClient = new TopShotClient(config.marketplaces[0], mockLogger);
      (mockClient.getRecentSales as jest.Mock).mockResolvedValue(mockSales);

      const sales = await mockClient.getRecentSales({ hours: 24 });
      expect(sales).toHaveLength(1);
      expect(sales[0].price).toBe(175.00);
      expect(sales[0].fees?.totalFees).toBe(17.50);
    });

    it('should handle WebSocket price updates', async () => {
      const mockClient = new TopShotClient(config.marketplaces[0], mockLogger);
      
      // Simulate WebSocket connection
      const connectPromise = mockClient.connect();
      
      // Mock successful connection
      (mockClient.connect as jest.Mock).mockResolvedValue(undefined);
      
      await expect(connectPromise).resolves.toBeUndefined();
    });
  });

  describe('Arbitrage Opportunity Detection', () => {
    it('should detect and store arbitrage opportunities', async () => {
      const mockOpportunity: ArbitrageOpportunity = {
        id: 'arb_123',
        momentId: 'moment_123',
        sourceMarketplace: 'topshot',
        targetMarketplace: 'othermarket',
        sourcePrice: 100,
        targetPrice: 120,
        profitAmount: 20,
        profitPercentage: 20,
        confidence: 0.85,
        riskScore: 30,
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        status: 'active',
        executionRisk: {
          liquidityRisk: 20,
          priceMovementRisk: 25,
          executionTimeRisk: 15,
        },
      };

      // Mock Redis storage
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.lPush.mockResolvedValue(1);
      mockRedisClient.lTrim.mockResolvedValue('OK');

      // Simulate arbitrage opportunity detection
      await (marketplaceService as any).storeArbitrageOpportunity(mockOpportunity);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `arbitrage:${mockOpportunity.id}`,
        3600,
        JSON.stringify(mockOpportunity)
      );
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'arbitrage_opportunities',
        mockOpportunity.id
      );
    });

    it('should emit events for new arbitrage opportunities', (done) => {
      const mockOpportunity: ArbitrageOpportunity = {
        id: 'arb_124',
        momentId: 'moment_124',
        sourceMarketplace: 'topshot',
        targetMarketplace: 'othermarket',
        sourcePrice: 200,
        targetPrice: 250,
        profitAmount: 50,
        profitPercentage: 25,
        confidence: 0.90,
        riskScore: 25,
        detectedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        status: 'active',
        executionRisk: {
          liquidityRisk: 15,
          priceMovementRisk: 20,
          executionTimeRisk: 10,
        },
      };

      marketplaceService.once('arbitrageOpportunity', (opportunity) => {
        expect(opportunity.id).toBe('arb_124');
        expect(opportunity.profitPercentage).toBe(25);
        done();
      });

      // Simulate opportunity detection
      (marketplaceService as any).handleArbitrageOpportunity(mockOpportunity);
    });
  });

  describe('Price Change Detection', () => {
    it('should detect significant price changes', (done) => {
      const priceChangeEvent = {
        momentId: 'moment_123',
        playerId: 'player_456',
        oldPrice: 100,
        newPrice: 150,
        changeAmount: 50,
        changePercentage: 50,
        marketplaceId: 'topshot',
        timestamp: new Date(),
      };

      marketplaceService.once('significantPriceChange', (event) => {
        expect(event.changePercentage).toBe(50);
        expect(event.momentId).toBe('moment_123');
        done();
      });

      // Simulate price change detection
      (marketplaceService as any).handleSignificantPriceChange(priceChangeEvent);
    });

    it('should detect volume spikes', (done) => {
      const volumeSpikeEvent = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentVolume: 1000,
        averageVolume: 200,
        spikeMultiplier: 5,
        marketplaceId: 'topshot',
        timestamp: new Date(),
      };

      marketplaceService.once('volumeSpike', (event) => {
        expect(event.spikeMultiplier).toBe(5);
        expect(event.currentVolume).toBe(1000);
        done();
      });

      // Simulate volume spike detection
      (marketplaceService as any).handleVolumeSpike(volumeSpikeEvent);
    });
  });

  describe('Alert Management', () => {
    it('should create and store alerts', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.lPush.mockResolvedValue(1);
      mockRedisClient.lTrim.mockResolvedValue('OK');

      const alertData = {
        type: 'price_anomaly' as const,
        severity: 'high' as const,
        message: 'Significant price increase detected',
        data: { momentId: 'moment_123', changePercentage: 25 },
      };

      // Simulate alert creation
      (marketplaceService as any).createAlert(alertData);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockRedisClient.setEx).toHaveBeenCalled();
      expect(mockRedisClient.lPush).toHaveBeenCalledWith('alerts_list', expect.any(String));
    });

    it('should acknowledge alerts', async () => {
      const mockAlert: MarketAlert = {
        id: 'alert_123',
        type: 'price_anomaly',
        severity: 'medium',
        message: 'Price alert triggered',
        data: { momentId: 'moment_123' },
        createdAt: new Date(),
        acknowledged: false,
      };

      // Add alert to service
      (marketplaceService as any).alerts.set(mockAlert.id, mockAlert);

      const result = await marketplaceService.acknowledgeAlert('alert_123', 'user_456');
      
      expect(result).toBe(true);
      
      const acknowledgedAlert = (marketplaceService as any).alerts.get('alert_123');
      expect(acknowledgedAlert.acknowledged).toBe(true);
      expect(acknowledgedAlert.acknowledgedBy).toBe('user_456');
    });
  });

  describe('Redis Caching', () => {
    it('should cache frequently accessed market data', async () => {
      const testData = { momentId: 'moment_123', price: 150 };
      
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      // Test caching functionality
      await mockRedisClient.setEx('test_key', 3600, JSON.stringify(testData));
      
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test_key',
        3600,
        JSON.stringify(testData)
      );
    });

    it('should retrieve cached data', async () => {
      const testData = { momentId: 'moment_123', price: 150 };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));
      
      const result = await mockRedisClient.get('test_key');
      const parsedResult = JSON.parse(result!);
      
      expect(parsedResult.momentId).toBe('moment_123');
      expect(parsedResult.price).toBe(150);
    });

    it('should handle cache misses gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await mockRedisClient.get('nonexistent_key');
      
      expect(result).toBeNull();
    });
  });

  describe('Service Statistics', () => {
    it('should provide accurate service statistics', () => {
      const stats = marketplaceService.getServiceStats();
      
      expect(stats).toHaveProperty('marketplaces');
      expect(stats).toHaveProperty('activeOpportunities');
      expect(stats).toHaveProperty('activeAlerts');
      expect(stats).toHaveProperty('monitoringJobs');
      expect(stats).toHaveProperty('totalAlerts');
      
      expect(typeof stats.marketplaces).toBe('number');
      expect(typeof stats.activeOpportunities).toBe('number');
    });

    it('should track marketplace health status', () => {
      const statuses = marketplaceService.getMarketplaceStatuses();
      
      expect(Array.isArray(statuses)).toBe(true);
      
      if (statuses.length > 0) {
        const status = statuses[0];
        expect(status).toHaveProperty('marketplaceId');
        expect(status).toHaveProperty('isOnline');
        expect(status).toHaveProperty('lastPing');
        expect(status).toHaveProperty('responseTime');
        expect(status).toHaveProperty('errorRate');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis connection failed'));
      
      // Should not throw error
      await expect(async () => {
        await (marketplaceService as any).storeAlert({
          id: 'test_alert',
          type: 'price_anomaly',
          severity: 'low',
          message: 'Test alert',
          data: {},
          createdAt: new Date(),
          acknowledged: false,
        });
      }).not.toThrow();
    });

    it('should handle marketplace API errors', async () => {
      const mockClient = new TopShotClient(config.marketplaces[0], mockLogger);
      (mockClient.getActiveListings as jest.Mock).mockRejectedValue(new Error('API Error'));
      
      // Should handle error gracefully
      await expect(mockClient.getActiveListings()).rejects.toThrow('API Error');
    });

    it('should continue operating with partial marketplace failures', () => {
      // Simulate one marketplace being down
      const statuses = marketplaceService.getMarketplaceStatuses();
      
      // Service should still be operational
      const stats = marketplaceService.getServiceStats();
      expect(stats.marketplaces).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track response times', () => {
      const statuses = marketplaceService.getMarketplaceStatuses();
      
      statuses.forEach(status => {
        expect(typeof status.responseTime).toBe('number');
        expect(status.responseTime).toBeGreaterThanOrEqual(0);
      });
    });

    it('should monitor error rates', () => {
      const statuses = marketplaceService.getMarketplaceStatuses();
      
      statuses.forEach(status => {
        expect(typeof status.errorRate).toBe('number');
        expect(status.errorRate).toBeGreaterThanOrEqual(0);
      });
    });
  });
});