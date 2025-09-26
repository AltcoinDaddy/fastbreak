import { AgentManager, AgentManagerConfig } from '../services/agent-manager';
import { BaseAgent } from '../agents/base-agent';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');

// Mock agent class for testing
class MockAgent extends BaseAgent {
  constructor(name: string, config: any, db: any, redis: any, logger: any) {
    super(name, 'test_agent', config, db, redis, logger);
  }

  protected async initializeTriggerConditions(): Promise<void> {
    this.addTriggerCondition({
      type: 'test_trigger',
      parameters: { threshold: 10 },
      isActive: true,
    });
  }

  protected async evaluateTriggerConditions(): Promise<any[]> {
    return [this.getAllTriggerConditions()[0]];
  }

  protected async executeTriggerActions(triggers: any[]): Promise<void> {
    this.emit('triggered', { triggers });
  }
}

describe('AgentManager', () => {
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
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;

    config = {
      maxConcurrentAgents: 5,
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

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await agentManager.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Agent manager initialized successfully');
    });

    it('should handle initialization failure', async () => {
      const error = new Error('Initialization failed');
      mockLogger.info.mockImplementationOnce(() => {
        throw error;
      });

      await expect(agentManager.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('Agent Registration', () => {
    let mockAgent: MockAgent;

    beforeEach(() => {
      mockAgent = new MockAgent('TestAgent', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
    });

    it('should register agent successfully', async () => {
      await agentManager.registerAgent(mockAgent);

      expect(agentManager.getRegisteredAgentCount()).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Agent registered',
        expect.objectContaining({
          agentId: mockAgent.getId(),
          agentName: mockAgent.getName(),
          type: mockAgent.getType(),
        })
      );
    });

    it('should prevent duplicate agent registration', async () => {
      await agentManager.registerAgent(mockAgent);

      await expect(agentManager.registerAgent(mockAgent))
        .rejects.toThrow(`Agent with ID ${mockAgent.getId()} is already registered`);
    });

    it('should unregister agent successfully', async () => {
      await agentManager.registerAgent(mockAgent);
      await agentManager.unregisterAgent(mockAgent.getId());

      expect(agentManager.getRegisteredAgentCount()).toBe(0);
    });

    it('should handle unregistering non-existent agent', async () => {
      await expect(agentManager.unregisterAgent('non-existent'))
        .rejects.toThrow('Agent with ID non-existent not found');
    });
  });

  describe('Agent Execution Control', () => {
    let mockAgent: MockAgent;

    beforeEach(async () => {
      mockAgent = new MockAgent('TestAgent', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
      await agentManager.registerAgent(mockAgent);
    });

    it('should start agent successfully', async () => {
      await agentManager.startAgent(mockAgent.getId());

      expect(agentManager.getActiveAgentCount()).toBe(1);
      const status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('running');
    });

    it('should stop agent successfully', async () => {
      await agentManager.startAgent(mockAgent.getId());
      await agentManager.stopAgent(mockAgent.getId());

      expect(agentManager.getActiveAgentCount()).toBe(0);
      const status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('stopped');
    });

    it('should pause and resume agent', async () => {
      await agentManager.startAgent(mockAgent.getId());
      await agentManager.pauseAgent(mockAgent.getId());

      let status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('paused');

      await agentManager.resumeAgent(mockAgent.getId());
      status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('running');
    });

    it('should enforce concurrent agent limit', async () => {
      const agents: MockAgent[] = [];
      
      // Register more agents than the limit
      for (let i = 0; i < config.maxConcurrentAgents + 1; i++) {
        const agent = new MockAgent(`TestAgent${i}`, { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
        agents.push(agent);
        await agentManager.registerAgent(agent);
      }

      // Start agents up to the limit
      for (let i = 0; i < config.maxConcurrentAgents; i++) {
        await agentManager.startAgent(agents[i].getId());
      }

      // Starting one more should fail
      await expect(agentManager.startAgent(agents[config.maxConcurrentAgents].getId()))
        .rejects.toThrow('Maximum concurrent agents limit reached');
    });

    it('should handle agent start failure', async () => {
      // Mock agent start to fail
      jest.spyOn(mockAgent, 'start').mockRejectedValue(new Error('Start failed'));

      await expect(agentManager.startAgent(mockAgent.getId()))
        .rejects.toThrow('Start failed');

      const status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('failed');
      expect(status?.lastError).toBe('Start failed');
    });
  });

  describe('Event Handling', () => {
    let mockAgent: MockAgent;

    beforeEach(async () => {
      mockAgent = new MockAgent('TestAgent', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
      await agentManager.registerAgent(mockAgent);
    });

    it('should handle agent triggered event', async () => {
      const eventSpy = jest.fn();
      agentManager.on('agentTriggered', eventSpy);

      await agentManager.startAgent(mockAgent.getId());
      
      // Simulate agent trigger
      mockAgent.emit('triggered', { test: 'data' });

      expect(eventSpy).toHaveBeenCalledWith(
        mockAgent.getId(),
        mockAgent.getName(),
        { test: 'data' }
      );
    });

    it('should handle agent completed event', async () => {
      await agentManager.startAgent(mockAgent.getId());
      
      // Simulate agent completion
      mockAgent.emit('completed', 1500);

      const status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.performance.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should handle agent failed event', async () => {
      const eventSpy = jest.fn();
      agentManager.on('agentFailed', eventSpy);

      await agentManager.startAgent(mockAgent.getId());
      
      const error = new Error('Agent execution failed');
      mockAgent.emit('failed', error);

      expect(eventSpy).toHaveBeenCalledWith(
        mockAgent.getId(),
        mockAgent.getName(),
        error
      );

      const status = agentManager.getAgentStatus(mockAgent.getId());
      expect(status?.status).toBe('failed');
      expect(status?.lastError).toBe('Agent execution failed');
    });

    it('should handle alert generated event', async () => {
      const eventSpy = jest.fn();
      agentManager.on('alertGenerated', eventSpy);

      await agentManager.startAgent(mockAgent.getId());
      
      const alertData = {
        type: 'test_alert',
        severity: 'medium',
        title: 'Test Alert',
        message: 'This is a test alert',
        data: { test: true },
      };

      mockAgent.emit('alertGenerated', alertData);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: mockAgent.getId(),
          agentName: mockAgent.getName(),
          type: 'test_alert',
          severity: 'medium',
        })
      );
    });

    it('should handle opportunity detected event', async () => {
      const eventSpy = jest.fn();
      agentManager.on('opportunityDetected', eventSpy);

      await agentManager.startAgent(mockAgent.getId());
      
      const opportunityData = {
        type: 'test_opportunity',
        momentId: 'moment123',
        action: 'buy',
        estimatedProfit: 100,
        confidence: 85,
        riskScore: 15,
        expiresAt: new Date(),
        data: { test: true },
      };

      mockAgent.emit('opportunityDetected', opportunityData);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: mockAgent.getId(),
          agentName: mockAgent.getName(),
          type: 'test_opportunity',
          momentId: 'moment123',
        })
      );
    });
  });

  describe('System Metrics', () => {
    it('should return correct system metrics', async () => {
      const agent1 = new MockAgent('Agent1', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
      const agent2 = new MockAgent('Agent2', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);

      await agentManager.registerAgent(agent1);
      await agentManager.registerAgent(agent2);
      await agentManager.startAgent(agent1.getId());

      const metrics = agentManager.getSystemMetrics();

      expect(metrics.totalAgents).toBe(2);
      expect(metrics.activeAgents).toBe(1);
      expect(metrics.failedAgents).toBe(0);
    });

    it('should calculate average success rate correctly', async () => {
      const agent = new MockAgent('TestAgent', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
      await agentManager.registerAgent(agent);
      await agentManager.startAgent(agent.getId());

      // Simulate some completions and failures
      agent.emit('completed', 1000);
      agent.emit('completed', 1500);
      agent.emit('failed', new Error('Test failure'));

      const metrics = agentManager.getSystemMetrics();
      expect(metrics.averageSuccessRate).toBeGreaterThan(0);
      expect(metrics.averageSuccessRate).toBeLessThan(100);
    });
  });

  describe('Bulk Operations', () => {
    let agents: MockAgent[];

    beforeEach(async () => {
      agents = [];
      for (let i = 0; i < 3; i++) {
        const agent = new MockAgent(`Agent${i}`, { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
        agents.push(agent);
        await agentManager.registerAgent(agent);
      }
    });

    it('should start all agents', async () => {
      await agentManager.startAllAgents();

      expect(agentManager.getActiveAgentCount()).toBe(3);
      
      for (const agent of agents) {
        const status = agentManager.getAgentStatus(agent.getId());
        expect(status?.status).toBe('running');
      }
    });

    it('should stop all agents', async () => {
      await agentManager.startAllAgents();
      await agentManager.stopAllAgents();

      expect(agentManager.getActiveAgentCount()).toBe(0);
      
      for (const agent of agents) {
        const status = agentManager.getAgentStatus(agent.getId());
        expect(status?.status).toBe('stopped');
      }
    });

    it('should handle partial failures in bulk operations', async () => {
      // Mock one agent to fail on start
      jest.spyOn(agents[1], 'start').mockRejectedValue(new Error('Start failed'));

      await agentManager.startAllAgents();

      // Should have started 2 out of 3 agents
      expect(agentManager.getActiveAgentCount()).toBe(2);
      
      const failedStatus = agentManager.getAgentStatus(agents[1].getId());
      expect(failedStatus?.status).toBe('failed');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const agent = new MockAgent('TestAgent', { checkIntervalMs: 1000 }, mockDb, mockRedis, mockLogger);
      await agentManager.registerAgent(agent);
      await agentManager.startAgent(agent.getId());

      await agentManager.shutdown();

      expect(agentManager.getActiveAgentCount()).toBe(0);
      expect(agentManager.getRegisteredAgentCount()).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Agent manager shutdown complete');
    });
  });
});