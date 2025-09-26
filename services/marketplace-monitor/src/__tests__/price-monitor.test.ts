import { PriceMonitor, PriceMonitorConfig } from '../services/price-monitor';
import { TopShotClient } from '../clients/topshot-client';
import { MomentPriceData, PriceAlert, PricePoint } from '../types/marketplace';
import winston from 'winston';
import Redis from 'redis';

// Mock dependencies
jest.mock('../clients/topshot-client');
jest.mock('redis');

describe('PriceMonitor Integration Tests', () => {
  let priceMonitor: PriceMonitor;
  let mockRedisClient: jest.Mocked<Redis.RedisClientType>;
  let mockClients: Map<string, jest.Mocked<TopShotClient>>;
  let mockLogger: winston.Logger;
  let config: PriceMonitorConfig;

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

    // Create mock marketplace clients
    mockClients = new Map();
    const mockClient = {
      getMomentPriceData: jest.fn(),
      getRecentSales: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as any;
    mockClients.set('topshot', mockClient);

    // Create config
    config = {
      updateIntervalMs: 60000,
      priceHistoryDays: 30,
      volatilityThreshold: 0.2,
      volumeSpikeThreshold: 3,
      significantPriceChangeThreshold: 10,
    };

    priceMonitor = new PriceMonitor(config, mockRedisClient, mockClients, mockLogger);
  });

  afterEach(() => {
    priceMonitor.stop();
    jest.clearAllMocks();
  });

  describe('Price Data Processing', () => {
    it('should update moment price data from marketplace APIs', async () => {
      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [
          {
            timestamp: new Date('2024-01-15T10:00:00Z'),
            price: 145.00,
            volume: 200,
            marketplaceId: 'topshot',
            type: 'sale',
          },
        ],
        volume24h: 5000.00,
        salesCount24h: 25,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      const mockClient = mockClients.get('topshot')!;
      mockClient.getMomentPriceData.mockResolvedValue(mockPriceData);
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.lPush.mockResolvedValue(1);
      mockRedisClient.lTrim.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      // Test price data update
      await (priceMonitor as any).updateMomentPriceData('moment_123');

      expect(mockClient.getMomentPriceData).toHaveBeenCalledWith('moment_123');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'price_data:moment_123',
        3600,
        JSON.stringify(mockPriceData)
      );
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'price_history:moment_123',
        expect.stringContaining('"price":150')
      );
    });

    it('should detect significant price changes', async () => {
      const previousData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 100.00,
        floorPrice: 90.00,
        averagePrice: 95.00,
        lastSalePrice: 98.00,
        priceHistory: [],
        volume24h: 3000.00,
        salesCount24h: 15,
        listingsCount: 10,
        priceChange24h: 0,
        volatility: 0.10,
        lastUpdated: new Date(Date.now() - 3600000), // 1 hour ago
      };

      const currentData: MomentPriceData = {
        ...previousData,
        currentPrice: 120.00, // 20% increase
        priceChange24h: 20.00,
        lastUpdated: new Date(),
      };

      let priceChangeDetected = false;
      priceMonitor.once('significantPriceChange', (event) => {
        expect(event.momentId).toBe('moment_123');
        expect(event.changePercentage).toBe(20);
        expect(event.oldPrice).toBe(100.00);
        expect(event.newPrice).toBe(120.00);
        priceChangeDetected = true;
      });

      // Test price change detection
      await (priceMonitor as any).checkPriceChange(previousData, currentData);

      expect(priceChangeDetected).toBe(true);
    });

    it('should detect volume spikes', async () => {
      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [],
        volume24h: 15000.00, // High volume
        salesCount24h: 75,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      // Mock average volume calculation
      const mockHistoryData = [
        JSON.stringify({
          timestamp: new Date(Date.now() - 86400000),
          price: 145.00,
          volume: 3000, // Normal volume
          marketplaceId: 'topshot',
          type: 'sale',
        }),
        JSON.stringify({
          timestamp: new Date(Date.now() - 172800000),
          price: 140.00,
          volume: 3500,
          marketplaceId: 'topshot',
          type: 'sale',
        }),
      ];

      mockRedisClient.lRange.mockResolvedValue(mockHistoryData);

      // Set up cache with current data
      (priceMonitor as any).priceCache.set('moment_123', mockPriceData);

      let volumeSpikeDetected = false;
      priceMonitor.once('volumeSpike', (event) => {
        expect(event.momentId).toBe('moment_123');
        expect(event.currentVolume).toBe(15000.00);
        expect(event.spikeMultiplier).toBeGreaterThan(3);
        volumeSpikeDetected = true;
      });

      // Test volume spike detection
      await (priceMonitor as any).detectVolumeSpikes();

      expect(volumeSpikeDetected).toBe(true);
    });
  });

  describe('Price Alert Management', () => {
    it('should add and store price alerts', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      const alertData = {
        userId: 'user_123',
        momentId: 'moment_123',
        alertType: 'price_drop' as const,
        threshold: 100.00,
        currentValue: 150.00,
        triggered: false,
        isActive: true,
      };

      const alertId = await priceMonitor.addPriceAlert(alertData);

      expect(alertId).toBeDefined();
      expect(typeof alertId).toBe('string');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'active_price_alerts',
        86400,
        expect.stringContaining(alertId)
      );
    });

    it('should remove price alerts', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      // Add an alert first
      const alertData = {
        userId: 'user_123',
        momentId: 'moment_123',
        alertType: 'price_increase' as const,
        threshold: 200.00,
        currentValue: 150.00,
        triggered: false,
        isActive: true,
      };

      const alertId = await priceMonitor.addPriceAlert(alertData);
      const removed = await priceMonitor.removePriceAlert(alertId);

      expect(removed).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledTimes(2); // Once for add, once for remove
    });

    it('should trigger price drop alerts', async () => {
      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 80.00, // Below threshold
        floorPrice: 75.00,
        averagePrice: 85.00,
        lastSalePrice: 82.00,
        priceHistory: [],
        volume24h: 2000.00,
        salesCount24h: 10,
        listingsCount: 8,
        priceChange24h: -20.00,
        volatility: 0.25,
        lastUpdated: new Date(),
      };

      // Set up cache with price data
      (priceMonitor as any).priceCache.set('moment_123', mockPriceData);

      // Add alert
      const alertData = {
        userId: 'user_123',
        momentId: 'moment_123',
        alertType: 'price_drop' as const,
        threshold: 100.00,
        currentValue: 150.00,
        triggered: false,
        isActive: true,
      };

      const alertId = await priceMonitor.addPriceAlert(alertData);

      let alertTriggered = false;
      priceMonitor.once('alertTriggered', (alert) => {
        expect(alert.id).toBe(alertId);
        expect(alert.triggered).toBe(true);
        expect(alert.currentValue).toBe(80.00);
        alertTriggered = true;
      });

      // Check triggered alerts
      await (priceMonitor as any).checkTriggeredAlerts();

      expect(alertTriggered).toBe(true);
    });

    it('should trigger volume spike alerts', async () => {
      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [],
        volume24h: 12000.00, // High volume
        salesCount24h: 60,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      // Mock average volume calculation
      mockRedisClient.lRange.mockResolvedValue([
        JSON.stringify({ timestamp: new Date(), price: 145, volume: 2000, marketplaceId: 'topshot', type: 'sale' }),
        JSON.stringify({ timestamp: new Date(), price: 140, volume: 2500, marketplaceId: 'topshot', type: 'sale' }),
      ]);

      // Set up cache with price data
      (priceMonitor as any).priceCache.set('moment_123', mockPriceData);

      // Add volume spike alert
      const alertData = {
        userId: 'user_123',
        momentId: 'moment_123',
        alertType: 'volume_spike' as const,
        threshold: 4.0, // 4x average volume
        currentValue: 0,
        triggered: false,
        isActive: true,
      };

      const alertId = await priceMonitor.addPriceAlert(alertData);

      let alertTriggered = false;
      priceMonitor.once('alertTriggered', (alert) => {
        expect(alert.id).toBe(alertId);
        expect(alert.triggered).toBe(true);
        alertTriggered = true;
      });

      // Check triggered alerts
      await (priceMonitor as any).checkTriggeredAlerts();

      expect(alertTriggered).toBe(true);
    });
  });

  describe('Real-time Data Processing', () => {
    it('should handle real-time price changes from WebSocket', async () => {
      const mockClient = mockClients.get('topshot')!;
      mockClient.getMomentPriceData.mockResolvedValue({
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 160.00,
        floorPrice: 130.00,
        averagePrice: 150.00,
        lastSalePrice: 155.00,
        priceHistory: [],
        volume24h: 6000.00,
        salesCount24h: 30,
        listingsCount: 18,
        priceChange24h: 10.00,
        volatility: 0.18,
        lastUpdated: new Date(),
      });

      const priceChangeData = {
        momentId: 'moment_123',
        price: 160.00,
        timestamp: new Date(),
      };

      // Test real-time price change handling
      await (priceMonitor as any).handleRealTimePriceChange(priceChangeData, 'topshot');

      expect(mockClient.getMomentPriceData).toHaveBeenCalledWith('moment_123');
    });

    it('should handle real-time sales from WebSocket', async () => {
      const mockClient = mockClients.get('topshot')!;
      mockClient.getMomentPriceData.mockResolvedValue({
        momentId: 'moment_124',
        playerId: 'player_457',
        currentPrice: 180.00,
        floorPrice: 150.00,
        averagePrice: 170.00,
        lastSalePrice: 175.00,
        priceHistory: [],
        volume24h: 8000.00,
        salesCount24h: 40,
        listingsCount: 20,
        priceChange24h: 15.00,
        volatility: 0.20,
        lastUpdated: new Date(),
      });

      let realTimeSaleReceived = false;
      priceMonitor.once('realTimeSale', (data) => {
        expect(data.momentId).toBe('moment_124');
        expect(data.price).toBe(175.00);
        expect(data.marketplaceId).toBe('topshot');
        realTimeSaleReceived = true;
      });

      const saleData = {
        momentId: 'moment_124',
        price: 175.00,
        timestamp: new Date(),
      };

      // Test real-time sale handling
      await (priceMonitor as any).handleRealTimeSale(saleData, 'topshot');

      expect(realTimeSaleReceived).toBe(true);
      expect(mockClient.getMomentPriceData).toHaveBeenCalledWith('moment_124');
    });
  });

  describe('Data Caching and Persistence', () => {
    it('should cache price data in Redis', async () => {
      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [],
        volume24h: 5000.00,
        salesCount24h: 25,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.lPush.mockResolvedValue(1);
      mockRedisClient.lTrim.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      // Test price data storage
      await (priceMonitor as any).storePriceData(mockPriceData);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'price_data:moment_123',
        3600,
        JSON.stringify(mockPriceData)
      );
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'price_history:moment_123',
        expect.stringContaining('"price":150')
      );
    });

    it('should load active alerts from Redis', async () => {
      const mockAlerts: PriceAlert[] = [
        {
          id: 'alert_1',
          userId: 'user_123',
          momentId: 'moment_123',
          alertType: 'price_drop',
          threshold: 100.00,
          currentValue: 150.00,
          triggered: false,
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 'alert_2',
          userId: 'user_124',
          momentId: 'moment_124',
          alertType: 'price_increase',
          threshold: 200.00,
          currentValue: 180.00,
          triggered: false,
          isActive: true,
          createdAt: new Date(),
        },
      ];

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockAlerts));

      // Test loading active alerts
      await (priceMonitor as any).loadActiveAlerts();

      const activeAlerts = priceMonitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(2);
      expect(activeAlerts[0].id).toBe('alert_1');
      expect(activeAlerts[1].threshold).toBe(200.00);
    });

    it('should clean up old price data', async () => {
      const oldPricePoint = {
        timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        price: 100.00,
        volume: 1000,
        marketplaceId: 'topshot',
        type: 'sale',
      };

      const recentPricePoint = {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        price: 150.00,
        volume: 2000,
        marketplaceId: 'topshot',
        type: 'sale',
      };

      // Set up cache with a moment
      (priceMonitor as any).priceCache.set('moment_123', {
        momentId: 'moment_123',
        currentPrice: 150.00,
      });

      mockRedisClient.lRange.mockResolvedValue([
        JSON.stringify(oldPricePoint),
        JSON.stringify(recentPricePoint),
      ]);
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.lPush.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      // Test cleanup
      await (priceMonitor as any).cleanupOldPriceData();

      expect(mockRedisClient.del).toHaveBeenCalledWith('price_history:moment_123');
      expect(mockRedisClient.lPush).toHaveBeenCalledWith(
        'price_history:moment_123',
        JSON.stringify(recentPricePoint)
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', () => {
      const mockPriceData1: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [],
        volume24h: 5000.00,
        salesCount24h: 25,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      const mockPriceData2: MomentPriceData = {
        momentId: 'moment_124',
        playerId: 'player_457',
        currentPrice: 200.00,
        floorPrice: 180.00,
        averagePrice: 190.00,
        lastSalePrice: 195.00,
        priceHistory: [],
        volume24h: 8000.00,
        salesCount24h: 40,
        listingsCount: 20,
        priceChange24h: 10.00,
        volatility: 0.18,
        lastUpdated: new Date(),
      };

      // Set up cache
      (priceMonitor as any).priceCache.set('moment_123', mockPriceData1);
      (priceMonitor as any).priceCache.set('moment_124', mockPriceData2);

      // Add some alerts
      (priceMonitor as any).activeAlerts.set('alert_1', {
        id: 'alert_1',
        userId: 'user_123',
        alertType: 'price_drop',
        threshold: 100.00,
        isActive: true,
      });

      const stats = priceMonitor.getStats();

      expect(stats.cachedMoments).toBe(2);
      expect(stats.activeAlerts).toBe(1);
      expect(stats.averagePrice).toBe(175.00); // (150 + 200) / 2
      expect(stats.totalVolume24h).toBe(13000.00); // 5000 + 8000
    });

    it('should calculate average volume correctly', async () => {
      const mockHistoryData = [
        JSON.stringify({
          timestamp: new Date(Date.now() - 86400000),
          price: 145.00,
          volume: 3000,
          marketplaceId: 'topshot',
          type: 'sale',
        }),
        JSON.stringify({
          timestamp: new Date(Date.now() - 172800000),
          price: 140.00,
          volume: 4000,
          marketplaceId: 'topshot',
          type: 'sale',
        }),
        JSON.stringify({
          timestamp: new Date(Date.now() - 259200000),
          price: 135.00,
          volume: 2000,
          marketplaceId: 'topshot',
          type: 'sale',
        }),
      ];

      mockRedisClient.lRange.mockResolvedValue(mockHistoryData);

      const avgVolume = await (priceMonitor as any).getAverageVolume('moment_123', 7);

      expect(avgVolume).toBe(3000); // (3000 + 4000 + 2000) / 3
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis connection failed'));

      const mockPriceData: MomentPriceData = {
        momentId: 'moment_123',
        playerId: 'player_456',
        currentPrice: 150.00,
        floorPrice: 120.00,
        averagePrice: 140.00,
        lastSalePrice: 145.00,
        priceHistory: [],
        volume24h: 5000.00,
        salesCount24h: 25,
        listingsCount: 15,
        priceChange24h: 5.50,
        volatility: 0.15,
        lastUpdated: new Date(),
      };

      // Should not throw error
      await expect((priceMonitor as any).storePriceData(mockPriceData)).resolves.toBeUndefined();
    });

    it('should handle marketplace API errors', async () => {
      const mockClient = mockClients.get('topshot')!;
      mockClient.getMomentPriceData.mockRejectedValue(new Error('API Error'));

      // Should not throw error
      await expect((priceMonitor as any).updateMomentPriceData('moment_123')).resolves.toBeUndefined();
    });

    it('should handle malformed WebSocket data', async () => {
      const invalidData = { invalid: 'data' };

      // Should not throw error
      await expect((priceMonitor as any).handleRealTimePriceChange(invalidData, 'topshot')).resolves.toBeUndefined();
    });
  });
});