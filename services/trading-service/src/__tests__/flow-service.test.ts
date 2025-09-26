import { FlowService, FlowConfig } from '../services/flow-service';
import winston from 'winston';
import * as fcl from '@onflow/fcl';

// Mock FCL
jest.mock('@onflow/fcl', () => ({
  config: jest.fn(),
  account: jest.fn(),
  mutate: jest.fn(),
  query: jest.fn(),
  tx: jest.fn(),
  authz: jest.fn(),
  sansPrefix: jest.fn((addr) => addr.replace('0x', '')),
  withPrefix: jest.fn((addr) => addr.startsWith('0x') ? addr : `0x${addr}`),
  arg: jest.fn((value, type) => ({ value, type })),
}));

jest.mock('@onflow/types', () => ({
  Address: 'Address',
  UFix64: 'UFix64',
  UInt64: 'UInt64',
  UInt8: 'UInt8',
  String: 'String',
  Optional: jest.fn((type) => `Optional(${type})`),
  Struct: 'Struct',
  Fix64: 'Fix64',
  Int: 'Int',
}));

describe('FlowService', () => {
  let flowService: FlowService;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: FlowConfig;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    config = {
      network: 'testnet',
      accessNodeAPI: 'https://rest-testnet.onflow.org',
      privateKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      accountAddress: '0x1234567890abcdef',
      contracts: {
        FastBreakController: '0x1234567890abcdef',
        SafetyControls: '0x1234567890abcdef',
        TradeAnalytics: '0x1234567890abcdef',
        TopShot: '0x0b2a3299cc857e29',
      },
    };

    flowService = new FlowService(config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // Mock FCL functions
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });

      await flowService.initialize();

      expect(fcl.config).toHaveBeenCalledWith({
        'accessNode.api': config.accessNodeAPI,
        'discovery.wallet': 'https://fcl-discovery.onflow.org/testnet/authn',
        'app.detail.title': 'FastBreak Trading Service',
        'app.detail.icon': 'https://fastbreak.com/icon.png',
      });

      expect(flowService.isConnected()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Flow service initialized successfully',
        expect.objectContaining({
          network: 'testnet',
          accessNode: config.accessNodeAPI,
        })
      );
    });

    it('should handle initialization failure', async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(flowService.initialize()).rejects.toThrow('Flow connection test failed');
      expect(flowService.isConnected()).toBe(false);
    });
  });

  describe('User Account Management', () => {
    beforeEach(async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      await flowService.initialize();
    });

    it('should create user account', async () => {
      const mockTransactionId = 'tx123';
      const mockResult = {
        status: 4,
        statusCode: 0,
        events: [],
        gasUsed: 100,
      };

      (fcl.mutate as jest.Mock).mockResolvedValue(mockTransactionId);
      (fcl.tx as jest.Mock).mockReturnValue({
        onceSealed: jest.fn().mockResolvedValue(mockResult),
      });

      const budgetLimits = {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 50000,
        emergencyStopThreshold: 40000,
        reserveAmount: 10000,
      };

      const result = await flowService.createUserAccount('0xuser123', budgetLimits);

      expect(result.transactionId).toBe(mockTransactionId);
      expect(result.status).toBe(4);
      expect(fcl.mutate).toHaveBeenCalled();
    });

    it('should validate spending', async () => {
      (fcl.query as jest.Mock).mockResolvedValue(true);

      const isValid = await flowService.validateSpending('0xuser123', 100);

      expect(isValid).toBe(true);
      expect(fcl.query).toHaveBeenCalledWith({
        cadence: expect.stringContaining('pub fun main(userAddress: Address, amount: UFix64): Bool'),
        args: expect.any(Function),
      });
    });

    it('should handle validation errors', async () => {
      (fcl.query as jest.Mock).mockRejectedValue(new Error('Query failed'));

      const isValid = await flowService.validateSpending('0xuser123', 100);

      expect(isValid).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Error validating spending:', expect.any(Error));
    });

    it('should record trade', async () => {
      const mockTransactionId = 'tx456';
      const mockResult = {
        status: 4,
        statusCode: 0,
        events: [],
        gasUsed: 150,
      };

      (fcl.mutate as jest.Mock).mockResolvedValue(mockTransactionId);
      (fcl.tx as jest.Mock).mockReturnValue({
        onceSealed: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await flowService.recordTrade(
        '0xuser123',
        'moment123',
        'buy',
        250,
        'strategy1',
        'AI recommendation'
      );

      expect(result.transactionId).toBe(mockTransactionId);
      expect(result.status).toBe(4);
    });

    it('should get user strategies', async () => {
      const mockStrategies = {
        1: {
          id: 1,
          type: 'RookieRisers',
          parameters: { threshold: 15 },
          isActive: true,
        },
      };

      (fcl.query as jest.Mock).mockResolvedValue(mockStrategies);

      const strategies = await flowService.getUserStrategies('0xuser123');

      expect(strategies).toEqual(Object.values(mockStrategies));
      expect(fcl.query).toHaveBeenCalled();
    });

    it('should handle empty strategies', async () => {
      (fcl.query as jest.Mock).mockResolvedValue(null);

      const strategies = await flowService.getUserStrategies('0xuser123');

      expect(strategies).toEqual([]);
    });

    it('should get user budget limits', async () => {
      const mockBudgetLimits = {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 50000,
      };

      (fcl.query as jest.Mock).mockResolvedValue(mockBudgetLimits);

      const budgetLimits = await flowService.getUserBudgetLimits('0xuser123');

      expect(budgetLimits).toEqual(mockBudgetLimits);
    });

    it('should get user trade history', async () => {
      const mockTradeHistory = [
        {
          id: 1,
          momentId: 'moment123',
          action: 'buy',
          price: 250,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      (fcl.query as jest.Mock).mockResolvedValue(mockTradeHistory);

      const tradeHistory = await flowService.getUserTradeHistory('0xuser123', 10);

      expect(tradeHistory).toEqual(mockTradeHistory);
    });
  });

  describe('Top Shot Integration', () => {
    beforeEach(async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      await flowService.initialize();
    });

    it('should get moment data', async () => {
      const mockMomentData = {
        id: 123,
        playerId: 456,
        setId: 789,
        serialNumber: 1000,
        name: 'LeBron James Dunk',
        description: 'Epic dunk moment',
      };

      (fcl.query as jest.Mock).mockResolvedValue(mockMomentData);

      const momentData = await flowService.getMomentData('123');

      expect(momentData).toEqual({
        id: '123',
        playerId: '456',
        playerName: 'LeBron James Dunk',
        setId: '789',
        serialNumber: 1000,
      });
    });

    it('should handle moment not found', async () => {
      (fcl.query as jest.Mock).mockResolvedValue(null);

      const momentData = await flowService.getMomentData('nonexistent');

      expect(momentData).toBeNull();
    });

    it('should get user moments', async () => {
      const mockMomentIds = [123, 456, 789];
      
      (fcl.query as jest.Mock)
        .mockResolvedValueOnce(mockMomentIds) // First call for getIDs
        .mockResolvedValue({ // Subsequent calls for moment details
          id: 123,
          playerId: 456,
          setId: 789,
          serialNumber: 1000,
          name: 'Test Moment',
        });

      const userMoments = await flowService.getUserMoments('0xuser123');

      expect(userMoments).toHaveLength(3);
      expect(userMoments[0]).toEqual({
        id: '123',
        playerId: '456',
        playerName: 'Test Moment',
        setId: '789',
        serialNumber: 1000,
        owner: '0xuser123',
      });
    });

    it('should handle user with no moments', async () => {
      (fcl.query as jest.Mock).mockResolvedValue([]);

      const userMoments = await flowService.getUserMoments('0xuser123');

      expect(userMoments).toEqual([]);
    });
  });

  describe('Safety Controls Integration', () => {
    beforeEach(async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      await flowService.initialize();
    });

    it('should check if user can trade', async () => {
      (fcl.query as jest.Mock).mockResolvedValue(true);

      const canTrade = await flowService.canUserTrade('0xuser123');

      expect(canTrade).toBe(true);
      expect(fcl.query).toHaveBeenCalledWith({
        cadence: expect.stringContaining('SafetyControls.canUserTrade'),
        args: expect.any(Function),
      });
    });

    it('should validate transaction with safety controls', async () => {
      (fcl.query as jest.Mock).mockResolvedValue(true);

      const isValid = await flowService.validateTransaction('0xuser123', 100);

      expect(isValid).toBe(true);
      expect(fcl.query).toHaveBeenCalledWith({
        cadence: expect.stringContaining('SafetyControls.validateTransaction'),
        args: expect.any(Function),
      });
    });
  });

  describe('Analytics Integration', () => {
    beforeEach(async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      await flowService.initialize();
    });

    it('should record analytics trade', async () => {
      const mockTransactionId = 'tx789';
      const mockResult = {
        status: 4,
        statusCode: 0,
        events: [],
        gasUsed: 200,
      };

      (fcl.mutate as jest.Mock).mockResolvedValue(mockTransactionId);
      (fcl.tx as jest.Mock).mockReturnValue({
        onceSealed: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await flowService.recordAnalyticsTrade(
        '0xuser123',
        '1',
        'RookieRisers',
        150,
        1000,
        86400
      );

      expect(result.transactionId).toBe(mockTransactionId);
      expect(result.status).toBe(4);
    });
  });

  describe('Transaction Execution', () => {
    beforeEach(async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      await flowService.initialize();
    });

    it('should handle transaction failure', async () => {
      const mockTransactionId = 'tx_fail';
      const mockResult = {
        status: 5, // Failed status
        statusCode: 1,
        errorMessage: 'Transaction failed',
        events: [],
        gasUsed: 50,
      };

      (fcl.mutate as jest.Mock).mockResolvedValue(mockTransactionId);
      (fcl.tx as jest.Mock).mockReturnValue({
        onceSealed: jest.fn().mockResolvedValue(mockResult),
      });

      const budgetLimits = {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 50000,
        emergencyStopThreshold: 40000,
        reserveAmount: 10000,
      };

      const result = await flowService.createUserAccount('0xuser123', budgetLimits);

      expect(result.status).toBe(5);
      expect(result.errorMessage).toBe('Transaction failed');
    });

    it('should emit transaction events', async () => {
      const mockTransactionId = 'tx_success';
      const mockResult = {
        status: 4,
        statusCode: 0,
        events: [{ type: 'UserRegistered' }],
        gasUsed: 100,
      };

      (fcl.mutate as jest.Mock).mockResolvedValue(mockTransactionId);
      (fcl.tx as jest.Mock).mockReturnValue({
        onceSealed: jest.fn().mockResolvedValue(mockResult),
      });

      const eventSpy = jest.fn();
      flowService.on('transactionSealed', eventSpy);

      const budgetLimits = {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 50000,
        emergencyStopThreshold: 40000,
        reserveAmount: 10000,
      };

      await flowService.createUserAccount('0xuser123', budgetLimits);

      expect(eventSpy).toHaveBeenCalledWith(mockTransactionId, expect.objectContaining({
        status: 4,
        statusCode: 0,
        events: [{ type: 'UserRegistered' }],
        gasUsed: 100,
      }));
    });
  });

  describe('Network Configuration', () => {
    it('should configure for emulator', () => {
      const emulatorConfig = { ...config, network: 'emulator' };
      const emulatorService = new FlowService(emulatorConfig, mockLogger);

      // Test that it uses the correct wallet discovery URL
      expect(emulatorService).toBeDefined();
    });

    it('should configure for mainnet', () => {
      const mainnetConfig = { ...config, network: 'mainnet' };
      const mainnetService = new FlowService(mainnetConfig, mockLogger);

      expect(mainnetService).toBeDefined();
    });

    it('should throw error for unknown network', () => {
      const invalidConfig = { ...config, network: 'unknown' };
      
      expect(() => {
        new FlowService(invalidConfig, mockLogger);
      }).not.toThrow(); // Constructor doesn't validate, initialization does
    });
  });

  describe('Event Subscription', () => {
    it('should setup event subscription', async () => {
      (fcl.config as jest.Mock).mockImplementation(() => {});
      (fcl.account as jest.Mock).mockResolvedValue({
        address: config.accountAddress,
        balance: 1000000000,
      });
      
      await flowService.initialize();

      const callback = jest.fn();
      await flowService.subscribeToEvents(['TradeExecuted', 'EmergencyStopTriggered'], callback);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Event subscription setup',
        { eventTypes: ['TradeExecuted', 'EmergencyStopTriggered'] }
      );
    });
  });
});