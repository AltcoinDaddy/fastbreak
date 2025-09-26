import { AgentManager, AgentManagerConfig } from '../../services/agent-manager';
import { GameEventAgent } from '../../agents/game-event-agent';
import { PriceAlertAgent } from '../../agents/price-alert-agent';
import { ArbitrageAgent } from '../../agents/arbitrage-agent';
import { DailyScanAgent } from '../../agents/daily-scan-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');
jest.mock('axios');

describe('Forte Agents Integration Tests', () => {
  let agentManager: AgentManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: AgentManagerConfig;

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
      maxConcurrentAgents: 10,
      agentCheckIntervalMs: 30000,
      failureRetryDelayMs: 60000,
      maxRetryAttempts: 3,
      enableHealthChecks: true,
      healthCheckIntervalMs: 300000,
      dataRetentionDays: 30,
      alertCooldownMs: 300000,
      externalServices: {
        nbaStatsAPI: {
          baseUrl: 'https://stats.nba.com/stats',
          rateLimitPerSecond: 5,
        },
        topShotAPI: {
          baseUrl: 'https://api.nbatopshot.com',
          rateLimitPerSecond: 10,
        },
        tradingService: {
          baseUrl: 'http://localhost:8003',
        },
        aiScoutingService: {
          baseUrl: 'http://localhost:8001',
        },
      },
    };

    agentManager = new AgentManager(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Agent Registration and Management', () => {
    it('should register all four agent types successfully', async () => {
      await agentManager.initialize();

      // Create all four agent types
      const gameEventAgent = new GameEventAgent(
        {
          checkIntervalMs: 60000,
          lookAheadHours: 24,
          performanceThresholds: {
            points: 30,
            rebounds: 10,
            assists: 10,
            blocks: 3,
            steals: 3,
          },
          momentCategories: ['rookie', 'veteran', 'legendary'],
          enableRealTimeUpdates: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      const priceAlertAgent = new PriceAlertAgent(
        {
          checkIntervalMs: 30000,
          priceChangeThresholds: {
            significant: 0.1,
            major: 0.2,
            extreme: 0.5,
          },
          volumeThresholds: {
            low: 10,
            medium: 50,
            high: 100,
          },
          trackingCategories: ['all', 'user_portfolio', 'watchlist'],
          enableVolumeAlerts: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      const arbitrageAgent = new ArbitrageAgent(
        {
          checkIntervalMs: 15000,
          minProfitPercentage: 0.05,
          minProfitAmount: 10,
          maxRiskScore: 70,
          marketplaces: ['topshot', 'othermarkets'],
          maxOpportunityAge: 300000,
          enableAutoExecution: false,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      const dailyScanAgent = new DailyScanAgent(
        {
          checkIntervalMs: 86400000,
          scanTime: '09:00',
          timezone: 'America/New_York',
          scanCategories: ['market_overview', 'portfolio_analysis', 'strategy_performance'],
          reportRecipients: [],
          enableDetailedAnalysis: true,
          includeRecommendations: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      // Register all agents
      await agentManager.registerAgent(gameEventAgent);
      await agentManager.registerAgent(priceAlertAgent);
      await agentManager.registerAgent(arbitrageAgent);
      await agentManager.registerAgent(dailyScanAgent);

      // Verify registration
      expect(agentManager.getRegisteredAgentCount()).toBe(4);

      const statuses = agentManager.getAllAgentStatuses();
      expect(statuses).toHaveLength(4);

      const agentTypes = statuses.map(s => s.type);
      expect(agentTypes).toContain('game_event_monitoring');
      expect(agentTypes).toContain('price_monitoring');
      expect(agentTypes).toContain('arbitrage_monitoring');
      expect(agentTypes).toContain('daily_analysis');
    });

    it('should start and manage all agents', async () => {
      await agentManager.initialize();

      // Create and register agents
      const gameEventAgent = new GameEventAgent(
        {
          checkIntervalMs: 60000,
          lookAheadHours: 24,
          performanceThresholds: { points: 30, rebounds: 10, assists: 10, blocks: 3, steals: 3 },
          momentCategories: ['rookie'],
          enableRealTimeUpdates: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      await agentManager.registerAgent(gameEventAgent);

      // Start the agent
      await agentManager.startAgent(gameEventAgent.getId());

      expect(agentManager.getActiveAgentCount()).toBe(1);

      const status = agentManager.getAgentStatus(gameEventAgent.getId());
      expect(status?.status).toBe('running');

      // Stop the agent
      await agentManager.stopAgent(gameEventAgent.getId());

      expect(agentManager.getActiveAgentCount()).toBe(0);
    });

    it('should provide system metrics', async () => {
      await agentManager.initialize();

      const gameEventAgent = new GameEventAgent(
        {
          checkIntervalMs: 60000,
          lookAheadHours: 24,
          performanceThresholds: { points: 30, rebounds: 10, assists: 10, blocks: 3, steals: 3 },
          momentCategories: ['rookie'],
          enableRealTimeUpdates: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      await agentManager.registerAgent(gameEventAgent);
      await agentManager.startAgent(gameEventAgent.getId());

      const metrics = agentManager.getSystemMetrics();

      expect(metrics.totalAgents).toBe(1);
      expect(metrics.activeAgents).toBe(1);
      expect(metrics.failedAgents).toBe(0);
      expect(metrics.totalRuns).toBe(0); // No runs yet
      expect(metrics.averageSuccessRate).toBe(0); // No runs yet
    });
  });

  describe('Agent Configuration', () => {
    it('should create agents with proper configurations', () => {
      const gameEventConfig = {
        checkIntervalMs: 60000,
        lookAheadHours: 24,
        performanceThresholds: {
          points: 30,
          rebounds: 10,
          assists: 10,
          blocks: 3,
          steals: 3,
        },
        momentCategories: ['rookie', 'veteran', 'legendary'],
        enableRealTimeUpdates: true,
      };

      const gameEventAgent = new GameEventAgent(
        gameEventConfig,
        mockDb,
        mockRedis,
        mockLogger
      );

      expect(gameEventAgent.getName()).toBe('GameEventAgent');
      expect(gameEventAgent.getType()).toBe('game_event_monitoring');

      const agentConfig = gameEventAgent.getConfig();
      expect(agentConfig.checkIntervalMs).toBe(60000);
    });

    it('should handle agent configuration updates', () => {
      const priceAlertAgent = new PriceAlertAgent(
        {
          checkIntervalMs: 30000,
          priceChangeThresholds: { significant: 0.1, major: 0.2, extreme: 0.5 },
          volumeThresholds: { low: 10, medium: 50, high: 100 },
          trackingCategories: ['all'],
          enableVolumeAlerts: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      // Update configuration
      priceAlertAgent.updateConfig({ checkIntervalMs: 15000 });

      const updatedConfig = priceAlertAgent.getConfig();
      expect(updatedConfig.checkIntervalMs).toBe(15000);
    });
  });

  describe('Agent Health and Statistics', () => {
    it('should provide agent statistics', async () => {
      const arbitrageAgent = new ArbitrageAgent(
        {
          checkIntervalMs: 15000,
          minProfitPercentage: 0.05,
          minProfitAmount: 10,
          maxRiskScore: 70,
          marketplaces: ['topshot'],
          maxOpportunityAge: 300000,
          enableAutoExecution: false,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      const stats = arbitrageAgent.getStatistics();

      expect(stats.id).toBeDefined();
      expect(stats.name).toBe('ArbitrageAgent');
      expect(stats.type).toBe('arbitrage_monitoring');
      expect(stats.isRunning).toBe(false);
      expect(stats.isPaused).toBe(false);
      expect(stats.triggerConditions).toBe(0); // Not initialized yet
    });

    it('should perform health checks', async () => {
      const dailyScanAgent = new DailyScanAgent(
        {
          checkIntervalMs: 86400000,
          scanTime: '09:00',
          timezone: 'America/New_York',
          scanCategories: ['market_overview'],
          reportRecipients: [],
          enableDetailedAnalysis: true,
          includeRecommendations: true,
        },
        mockDb,
        mockRedis,
        mockLogger
      );

      // Health check should return false when not running
      const healthWhenStopped = await dailyScanAgent.healthCheck();
      expect(healthWhenStopped).toBe(false);
    });
  });
});