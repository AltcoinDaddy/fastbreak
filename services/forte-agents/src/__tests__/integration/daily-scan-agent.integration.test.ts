import { DailyScanAgent, DailyScanAgentConfig } from '../../agents/daily-scan-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';
import axios from 'axios';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');
jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DailyScanAgent Integration Tests', () => {
  let agent: DailyScanAgent;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: DailyScanAgentConfig;

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
      checkIntervalMs: 86400000, // 24 hours
      scanTime: '09:00',
      timezone: 'America/New_York',
      scanCategories: ['market_overview', 'portfolio_analysis', 'strategy_performance'],
      reportRecipients: ['admin@fastbreak.com'],
      enableDetailedAnalysis: true,
      includeRecommendations: true,
    };

    // Setup axios mocks
    mockedAxios.create.mockReturnValue(mockedAxios);

    agent = new DailyScanAgent(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with daily scan configuration', async () => {
      await agent.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Daily scan trigger conditions initialized');
    });

    it('should configure triggers based on scan categories', async () => {
      await agent.start();

      const triggers = (agent as any).getAllTriggerConditions();
      const triggerTypes = triggers.map((t: any) => t.type);

      expect(triggerTypes).toContain('daily_scan_time');
      expect(triggerTypes).toContain('market_analysis');
      expect(triggerTypes).toContain('portfolio_analysis');
      expect(triggerTypes).toContain('strategy_performance');
    });
  });

  describe('Daily Scan Timing', () => {
    it('should trigger at configured scan time', async () => {
      // Mock current time to be near scan time
      const mockDate = new Date();
      mockDate.setHours(9, 2, 0, 0); // 9:02 AM (within 5-minute window)
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      const scanTimeTrigger = triggers.find((t: any) => t.type === 'daily_scan_time');

      expect(scanTimeTrigger).toBeDefined();

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should not trigger outside scan time window', async () => {
      // Mock current time to be outside scan window
      const mockDate = new Date();
      mockDate.setHours(15, 0, 0, 0); // 3:00 PM (outside window)
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      const scanTimeTrigger = triggers.find((t: any) => t.type === 'daily_scan_time');

      expect(scanTimeTrigger).toBeUndefined();

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should not run multiple scans on same day', async () => {
      // Set last scan date to today
      (agent as any).lastScanDate = new Date();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      await agent.start();

      const triggers = await (agent as any).evaluateTriggerConditions();
      const scanTimeTrigger = triggers.find((t: any) => t.type === 'daily_scan_time');

      expect(scanTimeTrigger).toBeUndefined();

      // Restore Date
      (global.Date as any).mockRestore();
    });
  });

  describe('Market Analysis', () => {
    beforeEach(() => {
      // Mock API responses
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('nbatopshot.com')) {
          return Promise.resolve({
            data: {
              totalVolume: 2500000,
              totalTransactions: 1250,
              averagePrice: 125.50,
              priceChange24h: 8.5,
              topGainers: [
                { momentId: 'moment1', priceChange: 25.0 },
                { momentId: 'moment2', priceChange: 18.5 },
              ],
              topLosers: [
                { momentId: 'moment3', priceChange: -15.2 },
              ],
              volumeLeaders: [
                { momentId: 'moment4', volume: 150000 },
              ],
            },
          });
        } else if (url.includes('localhost:8003')) {
          return Promise.resolve({
            data: {
              marketOverview: {
                sentiment: 'bullish',
                volatility: 'medium',
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    it('should perform comprehensive market analysis', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      // Simulate daily scan trigger
      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daily_scan_completed',
          severity: 'low',
          data: expect.objectContaining({
            marketOverview: expect.objectContaining({
              totalVolume24h: 2500000,
              priceChange24h: 8.5,
              marketSentiment: 'bullish',
            }),
          }),
        })
      );

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should generate market insights', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const completedAlert = alertSpy.mock.calls.find(
        call => call[0].type === 'daily_scan_completed'
      );

      expect(completedAlert[0].data.insightCount).toBeGreaterThan(0);

      // Restore Date
      (global.Date as any).mockRestore();
    });
  });

  describe('Portfolio Analysis', () => {
    beforeEach(() => {
      // Mock portfolio API responses
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('/api/portfolio/summary')) {
          return Promise.resolve({
            data: {
              data: {
                portfolio: {
                  totalValue: 5000,
                  moments: [
                    { playerId: 'player1', setId: 'set1' },
                    { playerId: 'player2', setId: 'set1' },
                    { playerId: 'player3', setId: 'set2' },
                  ],
                },
                performance: {
                  totalReturn: 750,
                  totalReturnPercent: 15.0,
                  bestPerformer: { momentId: 'moment1', return: 45.0 },
                  worstPerformer: { momentId: 'moment2', return: -12.0 },
                },
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    it('should analyze user portfolios', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const completedAlert = alertSpy.mock.calls.find(
        call => call[0].type === 'daily_scan_completed'
      );

      expect(completedAlert[0].data.portfolioCount).toBeGreaterThan(0);

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should calculate portfolio risk scores', async () => {
      await agent.start();

      // Test risk score calculation
      const portfolioData = {
        portfolio: {
          moments: [
            { playerId: 'player1', setId: 'set1' },
            { playerId: 'player2', setId: 'set2' },
          ],
        },
        performance: {
          totalReturnPercent: 25.0, // High volatility
        },
      };

      const riskScore = (agent as any).calculatePortfolioRiskScore(portfolioData);

      expect(riskScore).toBeGreaterThanOrEqual(0);
      expect(riskScore).toBeLessThanOrEqual(100);
      expect(riskScore).toBeGreaterThan(50); // High return should increase risk
    });

    it('should calculate diversification scores', async () => {
      await agent.start();

      const portfolioData = {
        portfolio: {
          moments: [
            { playerId: 'player1', setId: 'set1' },
            { playerId: 'player2', setId: 'set2' },
            { playerId: 'player3', setId: 'set3' },
          ],
        },
      };

      const diversificationScore = (agent as any).calculateDiversificationScore(portfolioData);

      expect(diversificationScore).toBeGreaterThan(0);
      expect(diversificationScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Strategy Performance Analysis', () => {
    it('should analyze strategy performance across users', async () => {
      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const completedAlert = alertSpy.mock.calls.find(
        call => call[0].type === 'daily_scan_completed'
      );

      expect(completedAlert[0].data.strategyCount).toBeGreaterThan(0);

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should generate strategy-specific recommendations', async () => {
      await agent.start();

      const rookieRecommendations = (agent as any).generateStrategyRecommendations('RookieRisers');
      const postGameRecommendations = (agent as any).generateStrategyRecommendations('PostGameSpikes');
      const arbitrageRecommendations = (agent as any).generateStrategyRecommendations('ArbitrageMode');

      expect(rookieRecommendations).toContain(expect.stringContaining('rookie'));
      expect(postGameRecommendations).toContain(expect.stringContaining('post-game'));
      expect(arbitrageRecommendations).toContain(expect.stringContaining('arbitrage'));
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive daily report', async () => {
      // Mock all API responses
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('nbatopshot.com')) {
          return Promise.resolve({
            data: {
              totalVolume: 1500000,
              priceChange24h: 5.2,
              marketSentiment: 'bullish',
            },
          });
        } else if (url.includes('/api/portfolio/summary')) {
          return Promise.resolve({
            data: {
              data: {
                portfolio: { totalValue: 5000, moments: [] },
                performance: { totalReturnPercent: 12.0 },
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should cache the report
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.stringContaining('daily_report:'),
        expect.any(Number),
        expect.any(String)
      );

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should generate report summary for distribution', async () => {
      await agent.start();

      const mockReport = {
        date: new Date(),
        marketOverview: {
          totalVolume24h: 1500000,
          priceChange24h: 5.2,
          marketSentiment: 'bullish' as const,
        },
        keyInsights: ['Strong market performance'],
        recommendations: ['Consider increasing positions'],
        riskAlerts: [],
      };

      const summary = (agent as any).generateReportSummary(mockReport);

      expect(summary).toContain('# FastBreak Daily Report');
      expect(summary).toContain('Market Overview');
      expect(summary).toContain('1.5M'); // Volume formatting
      expect(summary).toContain('5.2%'); // Price change
      expect(summary).toContain('bullish'); // Sentiment
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should generate failure alert
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daily_scan_failed',
          severity: 'medium',
        })
      );

      // Restore Date
      (global.Date as any).mockRestore();
    });

    it('should handle partial data gracefully', async () => {
      // Mock partial API responses
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('nbatopshot.com')) {
          return Promise.resolve({
            data: {
              totalVolume: 1500000,
              // Missing other fields
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const alertSpy = jest.fn();
      agent.on('alertGenerated', alertSpy);

      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      // Should still complete scan with available data
      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'daily_scan_completed',
        })
      );

      // Restore Date
      (global.Date as any).mockRestore();
    });
  });

  describe('Configuration', () => {
    it('should respect scan categories configuration', async () => {
      const limitedConfig = {
        ...config,
        scanCategories: ['market_overview'], // Only market analysis
      };

      agent = new DailyScanAgent(limitedConfig, mockDb, mockRedis, mockLogger);
      await agent.start();

      const triggers = (agent as any).getAllTriggerConditions();
      const activeMarketTrigger = triggers.find((t: any) => 
        t.type === 'market_analysis' && t.isActive
      );
      const inactivePortfolioTrigger = triggers.find((t: any) => 
        t.type === 'portfolio_analysis' && !t.isActive
      );

      expect(activeMarketTrigger).toBeDefined();
      expect(inactivePortfolioTrigger).toBeDefined();
    });

    it('should handle different timezones', async () => {
      const utcConfig = {
        ...config,
        timezone: 'UTC',
        scanTime: '14:00', // 2 PM UTC
      };

      agent = new DailyScanAgent(utcConfig, mockDb, mockRedis, mockLogger);
      await agent.start();

      // Should initialize without errors
      expect(mockLogger.info).toHaveBeenCalledWith('Daily scan trigger conditions initialized');
    });
  });

  describe('Performance', () => {
    it('should handle large datasets efficiently', async () => {
      // Mock large user base
      jest.spyOn(agent as any, 'getActiveUsers').mockResolvedValue(
        Array.from({ length: 1000 }, (_, i) => `user${i}`)
      );

      mockedAxios.get.mockResolvedValue({
        data: {
          data: {
            portfolio: { totalValue: 1000, moments: [] },
            performance: { totalReturnPercent: 5.0 },
          },
        },
      });

      const startTime = Date.now();
      await agent.start();

      const mockDate = new Date();
      mockDate.setHours(9, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const triggers = await (agent as any).evaluateTriggerConditions();
      if (triggers.length > 0) {
        await (agent as any).executeTriggerActions(triggers);
      }

      const endTime = Date.now();

      // Should complete within reasonable time even with large dataset
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds

      // Restore Date
      (global.Date as any).mockRestore();
    });
  });
});