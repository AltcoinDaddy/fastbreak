import { PriceAlertAgent, PriceAlertAgentConfig } from '../../agents/price-alert-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';
import axios from 'axios';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PriceAlertAgent Integration Tests', () => {
  let agent: PriceAlertAgent;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: PriceAlertAgentConfig;

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
      checkIntervalMs: 30000,
      priceChangeThresholds: {
        significant: 0.1,  // 10%
        major: 0.2,        // 20%
        extreme: 0.5,      // 50%
      },
      volumeThresholds: {
        low: 10,
        medium: 50,
        high: 100,
      },
      trackingCategories: ['all', 'user_portfolio'],
      enableVolumeAlerts: true,
    };

    // Setup axios mocks
    mockedAxios.create.mockReturnValue(mockedAxios);

    agent = new PriceAlertAgent(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize trigger conditions successfully', async () => {
      await agent.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Price alert trigger conditions initialized');
    });

    it('should handle initialization failure gracefully', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      await expect(agent.start()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Price Change Detection', () => {
    beforeEach(async () => {
      // Mock API responses
      mockedAxios.get.mockResolvedValue({
        data: {
          listings: [
            {
              momentId: 'moment1',
              price: 100,
              volume24h: 50,
              createdAt: new Date().toISOString(),
            },
            {
              momentId: 'moment2', 
              price: 200,
              volume24h: 25,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      await agent.start();
    });

    it('should detect significant price changes', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      // Simulate price change by updating mock data
      mockedAxios.get.mockResolvedValue({
        data: {
          price: 120, // 20% increase
          volume24h: 60,
        },
      });

      // Trigger evaluation manually for testing
      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should generate alert for significant price change
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringContaining('price_'),
          severity: expect.any(String),
        })
      );
    });

    it('should detect volume spikes', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      // Mock historical data for volume comparison
      mockRedis.get.mockResolvedValue(JSON.stringify([
        { volume24h: 20, timestamp: new Date() },
        { volume24h: 25, timestamp: new Date() },
        { volume24h: 30, timestamp: new Date() },
      ]));

      // Simulate volume spike
      mockedAxios.get.mockResolvedValue({
        data: {
          price: 100,
          volume24h: 150, // 5x normal volume
        },
      });

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'volume_spike',
          severity: expect.any(String),
        })
      );
    });

    it('should generate opportunities for major price movements', async () => {
      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      // Simulate major price drop (buying opportunity)
      mockedAxios.get.mockResolvedValue({
        data: {
          price: 70, // 30% decrease
          volume24h: 80,
        },
      });

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      expect(opportunitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'price_movement_opportunity',
          action: 'buy',
          estimatedProfit: expect.any(Number),
          confidence: expect.any(Number),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await agent.start();

      // Should not crash and should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.any(Error)
      );
    });

    it('should handle Redis failures gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis Error'));

      await agent.start();

      // Should continue operating without cache
      expect(agent.isActive()).toBe(true);
    });
  });

  describe('Configuration Updates', () => {
    it('should update thresholds dynamically', async () => {
      await agent.start();

      const newConfig = {
        ...config,
        priceChangeThresholds: {
          significant: 0.05, // 5%
          major: 0.15,       // 15%
          extreme: 0.4,      // 40%
        },
      };

      agent.updateConfig(newConfig);

      const updatedConfig = agent.getConfig();
      expect(updatedConfig.priceChangeThresholds.significant).toBe(0.05);
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of tracked moments', async () => {
      // Mock large dataset
      const largeMomentList = Array.from({ length: 1000 }, (_, i) => ({
        momentId: `moment${i}`,
        price: Math.random() * 1000,
        volume24h: Math.random() * 100,
        createdAt: new Date().toISOString(),
      }));

      mockedAxios.get.mockResolvedValue({
        data: { listings: largeMomentList },
      });

      const startTime = Date.now();
      await agent.start();
      const endTime = Date.now();

      // Should complete initialization within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });

    it('should respect rate limits', async () => {
      let callCount = 0;
      mockedAxios.get.mockImplementation(() => {
        callCount++;
        return Promise.resolve({ data: { listings: [] } });
      });

      await agent.start();

      // Simulate multiple rapid evaluations
      for (let i = 0; i < 10; i++) {
        await (agent as any).evaluateTriggerConditions();
      }

      // Should not exceed reasonable call rate
      expect(callCount).toBeLessThan(50);
    });
  });

  describe('Alert Cooldowns', () => {
    it('should respect alert cooldowns to prevent spam', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      // Simulate repeated price changes for same moment
      mockedAxios.get.mockResolvedValue({
        data: {
          price: 120, // 20% increase
          volume24h: 60,
        },
      });

      // Trigger multiple times rapidly
      for (let i = 0; i < 5; i++) {
        const triggers = await (agent as any).evaluateTriggerConditions();
        if (triggers.length > 0) {
          await (agent as any).executeTriggerActions(triggers);
        }
      }

      // Should only generate one alert due to cooldown
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });
  });
});