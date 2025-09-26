import { ArbitrageAgent, ArbitrageAgentConfig } from '../../agents/arbitrage-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';
import axios from 'axios';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ArbitrageAgent Integration Tests', () => {
  let agent: ArbitrageAgent;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: ArbitrageAgentConfig;

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
      checkIntervalMs: 15000,
      minProfitPercentage: 0.05, // 5%
      minProfitAmount: 10,
      maxRiskScore: 70,
      marketplaces: ['topshot', 'othermarkets'],
      maxOpportunityAge: 300000, // 5 minutes
      enableAutoExecution: false,
    };

    // Setup axios mocks
    mockedAxios.create.mockReturnValue(mockedAxios);

    agent = new ArbitrageAgent(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with multiple marketplaces', async () => {
      await agent.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Arbitrage trigger conditions initialized');
    });

    it('should handle marketplace API initialization', async () => {
      await agent.start();

      // Should create API clients for each marketplace
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('nbatopshot.com'),
        })
      );
    });
  });

  describe('Arbitrage Opportunity Detection', () => {
    beforeEach(async () => {
      // Mock marketplace listings
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('topshot')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 100,
                  quantity: 1,
                  sellerId: 'seller1',
                  id: 'listing1',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        } else if (url.includes('othermarkets')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 120, // Higher price on different marketplace
                  quantity: 1,
                  sellerId: 'seller2',
                  id: 'listing2',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { listings: [] } });
      });

      await agent.start();
    });

    it('should detect cross-marketplace arbitrage opportunities', async () => {
      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      expect(opportunitySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'arbitrage_opportunity',
          action: 'arbitrage',
          estimatedProfit: expect.any(Number),
          confidence: expect.any(Number),
          data: expect.objectContaining({
            buyListing: expect.objectContaining({
              marketplaceId: 'topshot',
              price: 100,
            }),
            sellListing: expect.objectContaining({
              marketplaceId: 'othermarkets',
              price: 120,
            }),
          }),
        })
      );
    });

    it('should calculate profit correctly after fees', async () => {
      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const opportunity = opportunitySpy.mock.calls[0][0];
      const grossProfit = 120 - 100; // 20
      const expectedFees = 100 * 0.05 + 120 * 0.05; // 5% on each side
      const expectedNetProfit = grossProfit - expectedFees;

      expect(opportunity.data.netProfit).toBeCloseTo(expectedNetProfit, 2);
    });

    it('should filter opportunities by minimum profit requirements', async () => {
      // Mock small price difference that doesn't meet minimum
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('topshot')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 100,
                  quantity: 1,
                  sellerId: 'seller1',
                  id: 'listing1',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        } else if (url.includes('othermarkets')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 102, // Only 2% difference, below minimum
                  quantity: 1,
                  sellerId: 'seller2',
                  id: 'listing2',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { listings: [] } });
      });

      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should not generate opportunity due to insufficient profit
      expect(opportunitySpy).not.toHaveBeenCalled();
    });

    it('should calculate risk scores appropriately', async () => {
      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const opportunity = opportunitySpy.mock.calls[0][0];
      
      // Risk score should be within reasonable bounds
      expect(opportunity.riskScore).toBeGreaterThanOrEqual(0);
      expect(opportunity.riskScore).toBeLessThanOrEqual(100);
      
      // Cross-marketplace should have higher risk
      expect(opportunity.riskScore).toBeGreaterThan(30);
    });
  });

  describe('Auto-Execution', () => {
    beforeEach(() => {
      config.enableAutoExecution = true;
      agent = new ArbitrageAgent(config, mockDb, mockRedis, mockLogger);
    });

    it('should auto-execute high-confidence opportunities', async () => {
      // Mock high-profit opportunity
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('topshot')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 100,
                  quantity: 1,
                  sellerId: 'seller1',
                  id: 'listing1',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        } else if (url.includes('othermarkets')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 200, // 100% profit opportunity
                  quantity: 1,
                  sellerId: 'seller2',
                  id: 'listing2',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { listings: [] } });
      });

      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should generate execution alert
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'arbitrage_executed',
          severity: 'high',
        })
      );
    });

    it('should not auto-execute high-risk opportunities', async () => {
      // Mock opportunity with high risk (old listings)
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes old

      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('topshot')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 100,
                  quantity: 1,
                  sellerId: 'seller1',
                  id: 'listing1',
                  createdAt: oldDate.toISOString(),
                },
              ],
            },
          });
        } else if (url.includes('othermarkets')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 150,
                  quantity: 1,
                  sellerId: 'seller2',
                  id: 'listing2',
                  createdAt: oldDate.toISOString(),
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { listings: [] } });
      });

      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should generate opportunity alert but not execution alert
      const executionAlerts = alertSpy.mock.calls.filter(
        call => call[0].type === 'arbitrage_executed'
      );
      expect(executionAlerts).toHaveLength(0);
    });
  });

  describe('Opportunity Cleanup', () => {
    it('should clean up expired opportunities', async () => {
      await agent.start();

      // Add some mock expired opportunities
      const expiredOpportunity = {
        momentId: 'moment1',
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      (agent as any).detectedOpportunities.set('expired1', expiredOpportunity);

      const triggers = await (agent as any).evaluateTriggerConditions();
      const cleanupTrigger = triggers.find(t => t.type === 'opportunity_cleanup');
      
      if (cleanupTrigger) {
        await (agent as any).executeTriggerActions([cleanupTrigger]);
      }

      // Expired opportunity should be removed
      expect((agent as any).detectedOpportunities.has('expired1')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle marketplace API failures', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Marketplace API Error'));

      await agent.start();

      // Should not crash and should log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.any(Error)
      );
    });

    it('should handle execution failures gracefully', async () => {
      config.enableAutoExecution = true;
      agent = new ArbitrageAgent(config, mockDb, mockRedis, mockLogger);

      // Mock execution failure
      jest.spyOn(agent as any, 'executeBuyOrder').mockResolvedValue({
        success: false,
        error: 'Insufficient funds',
      });

      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      // Should generate failure alert
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'arbitrage_execution_failed',
          severity: 'medium',
        })
      );
    });
  });

  describe('Performance', () => {
    it('should handle multiple marketplace updates efficiently', async () => {
      // Mock large number of listings across marketplaces
      const largeListingSet = Array.from({ length: 500 }, (_, i) => ({
        momentId: `moment${i}`,
        price: Math.random() * 1000,
        quantity: 1,
        sellerId: `seller${i}`,
        id: `listing${i}`,
        createdAt: new Date().toISOString(),
      }));

      mockedAxios.get.mockResolvedValue({
        data: { listings: largeListingSet },
      });

      const startTime = Date.now();
      await agent.start();
      
      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }
      
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
    });

    it('should limit concurrent API calls', async () => {
      let callCount = 0;
      mockedAxios.get.mockImplementation(() => {
        callCount++;
        return Promise.resolve({ data: { listings: [] } });
      });

      await agent.start();

      // Should not make excessive API calls
      expect(callCount).toBeLessThan(20);
    });
  });

  describe('Configuration', () => {
    it('should respect profit thresholds', async () => {
      const highThresholdConfig = {
        ...config,
        minProfitPercentage: 0.5, // 50%
        minProfitAmount: 100,
      };

      agent = new ArbitrageAgent(highThresholdConfig, mockDb, mockRedis, mockLogger);

      // Mock moderate profit opportunity
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('topshot')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 100,
                  quantity: 1,
                  sellerId: 'seller1',
                  id: 'listing1',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        } else if (url.includes('othermarkets')) {
          return Promise.resolve({
            data: {
              listings: [
                {
                  momentId: 'moment1',
                  price: 130, // 30% profit, below 50% threshold
                  quantity: 1,
                  sellerId: 'seller2',
                  id: 'listing2',
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { listings: [] } });
      });

      const opportunitySpy = jest.fn();
      agent.on('opportunityDetected', opportunitySpy);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should not generate opportunity due to high threshold
      expect(opportunitySpy).not.toHaveBeenCalled();
    });
  });
});