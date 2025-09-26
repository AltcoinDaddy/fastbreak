import { BudgetManager, BudgetManagerConfig, SpendingRequest } from '../services/budget-manager';
import { BudgetLimits, SpendingTracker } from '../types/risk';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');

describe('BudgetManager', () => {
  let budgetManager: BudgetManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: BudgetManagerConfig;

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      initialize: jest.fn(),
      close: jest.fn(),
      budgetLimits: {
        findByUserId: jest.fn(),
        createBudgetLimits: jest.fn(),
        updateBudgetLimits: jest.fn(),
      },
      spendingTracker: {
        findByUserId: jest.fn(),
        findByUserIdAndDate: jest.fn(),
        createSpendingTracker: jest.fn(),
        updateSpendingTracker: jest.fn(),
      },
      emergencyStops: {
        createEmergencyStop: jest.fn(),
        findById: jest.fn(),
      },
      riskAlerts: {
        createRiskAlert: jest.fn(),
      },
    } as any;

    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    config = {
      defaultDailyLimit: 1000,
      defaultWeeklyLimit: 5000,
      defaultMonthlyLimit: 20000,
      defaultMaxPricePerMoment: 500,
      defaultReservePercentage: 0.2,
      warningThresholds: {
        daily: 0.8,
        weekly: 0.8,
        monthly: 0.8,
      },
      autoResetEnabled: true,
      complianceCheckEnabled: true,
      suspiciousActivityConfig: {
        maxTransactionsPerHour: 20,
        maxTransactionsPerDay: 100,
        unusualAmountThreshold: 5.0,
        rapidFireThreshold: 10,
        geolocationCheckEnabled: true,
        deviceFingerprintingEnabled: true,
        behaviorAnalysisEnabled: true,
      },
    };

    budgetManager = new BudgetManager(config, mockDb, mockRedis, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Budget Limits Validation', () => {
    test('should validate positive daily spending cap', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { dailySpendingCap: -100 };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Daily spending cap must be positive');
    });

    test('should validate maximum daily spending cap', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { dailySpendingCap: 150000 };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Daily spending cap cannot exceed $100,000');
    });

    test('should validate positive max price per moment', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { maxPricePerMoment: -50 };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Max price per moment must be positive');
    });

    test('should validate maximum price per moment', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { maxPricePerMoment: 75000 };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Max price per moment cannot exceed $50,000');
    });

    test('should validate weekly limit is at least 7x daily limit', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { 
        dailySpendingCap: 1000,
        weeklySpendingCap: 5000 // Less than 7x daily
      };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Weekly limit should be at least 7x daily limit');
    });

    test('should validate monthly limit is at least 4x weekly limit', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { 
        weeklySpendingCap: 10000,
        monthlySpendingCap: 30000 // Less than 4x weekly
      };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Monthly limit should be at least 4x weekly limit');
    });

    test('should validate emergency stop threshold does not exceed total budget', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { 
        totalBudgetLimit: 50000,
        emergencyStopThreshold: 75000
      };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Emergency stop threshold cannot exceed total budget limit');
    });

    test('should validate reserve amount does not exceed 50% of total budget', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { 
        totalBudgetLimit: 100000,
        reserveAmount: 60000 // More than 50%
      };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Reserve amount cannot exceed 50% of total budget');
    });

    test('should validate max price per moment does not exceed daily cap', async () => {
      const userId = 'test-user-1';
      const invalidLimits = { 
        dailySpendingCap: 1000,
        maxPricePerMoment: 1500
      };

      await expect(budgetManager.setBudgetLimits(userId, invalidLimits, false))
        .rejects.toThrow('Max price per moment cannot exceed daily spending cap');
    });
  });

  describe('Daily Spending Cap Enforcement', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 800, // Already spent $800 today
        weeklySpent: 3000,
        monthlySpent: 15000,
        totalSpent: 50000,
        transactionCount: 10,
        averageTransactionSize: 100,
        largestTransaction: 300,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
    });

    test('should approve spending within daily limit', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 150, // Would total $950, under $1000 limit
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(true);
      expect(approval.reason).toBeUndefined();
    });

    test('should reject spending that exceeds daily limit', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 250, // Would total $1050, over $1000 limit
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('exceed daily spending limit');
      expect(approval.riskScore).toBe(90);
    });

    test('should reset daily spending for user', async () => {
      // Mock the saveSpendingTracker method
      const saveSpy = jest.spyOn(budgetManager as any, 'saveSpendingTracker')
        .mockResolvedValue(undefined);

      // Test the resetDailySpendingForUser method directly
      await budgetManager['resetDailySpendingForUser']('test-user-1', mockSpendingTracker);

      // Verify spending was saved
      expect(saveSpy).toHaveBeenCalled();
      
      // Verify the spending tracker was updated correctly
      const savedSpending = saveSpy.mock.calls[0][0];
      expect(savedSpending.dailySpent).toBe(0);
      expect(savedSpending.userId).toBe('test-user-1');
    });
  });

  describe('Maximum Price Per Moment Validation', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 100,
        weeklySpent: 500,
        monthlySpent: 2000,
        totalSpent: 10000,
        transactionCount: 5,
        averageTransactionSize: 100,
        largestTransaction: 200,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
    });

    test('should approve spending within max price per moment', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 400, // Under $500 limit
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(true);
    });

    test('should reject spending that exceeds max price per moment', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 600, // Over $500 limit
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('exceeds maximum price per moment');
      expect(approval.riskScore).toBe(100);
    });
  });

  describe('Suspicious Activity Detection', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 100,
        weeklySpent: 500,
        monthlySpent: 2000,
        totalSpent: 10000,
        transactionCount: 5,
        averageTransactionSize: 100,
        largestTransaction: 200,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
    });

    test('should block transaction when suspicious activity is detected with block recommendation', async () => {
      // Mock suspicious activity detector to return block recommendation
      const mockSuspiciousResult = {
        isSuspicious: true,
        riskScore: 85,
        reasons: ['Rapid-fire transactions detected', 'New device fingerprint'],
        recommendedAction: 'block' as const,
        metadata: {},
      };

      jest.spyOn(budgetManager['suspiciousActivityDetector'], 'analyzeTransaction')
        .mockResolvedValue(mockSuspiciousResult);

      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 200,
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
        metadata: {
          ipAddress: '192.168.1.1',
          deviceFingerprint: 'new-device-123',
        },
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('blocked due to suspicious activity');
      expect(approval.riskScore).toBe(100);
      expect(approval.suspiciousActivity?.detected).toBe(true);
    });

    test('should require verification when suspicious activity needs verification', async () => {
      // Mock suspicious activity detector to return require_verification recommendation
      const mockSuspiciousResult = {
        isSuspicious: true,
        riskScore: 65,
        reasons: ['Transaction from new location'],
        recommendedAction: 'require_verification' as const,
        metadata: {},
      };

      jest.spyOn(budgetManager['suspiciousActivityDetector'], 'analyzeTransaction')
        .mockResolvedValue(mockSuspiciousResult);

      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 200,
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
        metadata: {
          geolocation: 'New York, NY',
        },
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('requires additional verification');
      expect(approval.riskScore).toBeGreaterThanOrEqual(75);
    });

    test('should flag transaction but allow when suspicious activity is flagged', async () => {
      // Mock suspicious activity detector to return flag recommendation
      const mockSuspiciousResult = {
        isSuspicious: true,
        riskScore: 35,
        reasons: ['Slightly unusual transaction time'],
        recommendedAction: 'flag' as const,
        metadata: {},
      };

      jest.spyOn(budgetManager['suspiciousActivityDetector'], 'analyzeTransaction')
        .mockResolvedValue(mockSuspiciousResult);

      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 200,
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(true);
      expect(approval.warnings).toContain('Transaction flagged for monitoring due to unusual patterns');
    });
  });

  describe('Budget Limit Modification with User Confirmation', () => {
    let mockBudgetLimits: BudgetLimits;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockRedis.setEx.mockResolvedValue('OK');
      mockRedis.get.mockResolvedValue(null);
    });

    test('should require confirmation for significant daily limit increase', async () => {
      const userId = 'test-user-1';
      const significantIncrease = { dailySpendingCap: 2500 }; // 150% increase

      // Mock the requiresConfirmation method to return true
      jest.spyOn(budgetManager as any, 'requiresConfirmation').mockReturnValue(true);

      await expect(budgetManager.setBudgetLimits(userId, significantIncrease, true))
        .rejects.toThrow('Budget changes require user confirmation');

      // Verify pending changes were stored
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        `pending_budget_changes:${userId}`,
        24 * 3600,
        expect.stringContaining('dailySpendingCap')
      );
    });

    test('should require confirmation for significant daily limit decrease', async () => {
      const userId = 'test-user-1';
      const significantDecrease = { dailySpendingCap: 400 }; // 60% decrease

      // Mock the requiresConfirmation method to return true
      jest.spyOn(budgetManager as any, 'requiresConfirmation').mockReturnValue(true);

      await expect(budgetManager.setBudgetLimits(userId, significantDecrease, true))
        .rejects.toThrow('Budget changes require user confirmation');
    });

    test('should not require confirmation for small changes', async () => {
      const userId = 'test-user-1';
      const smallChange = { dailySpendingCap: 1200 }; // 20% increase

      mockDb.budgetLimits.updateBudgetLimits.mockResolvedValue(undefined);

      const result = await budgetManager.setBudgetLimits(userId, smallChange, true);

      expect(result.dailySpendingCap).toBe(1200);
      expect(mockDb.budgetLimits.updateBudgetLimits).toHaveBeenCalled();
    });

    test('should apply changes when user confirms', async () => {
      const userId = 'test-user-1';
      const pendingChanges = { dailySpendingCap: 2500 };

      // Mock pending changes exist
      mockRedis.get.mockResolvedValue(JSON.stringify({
        changes: pendingChanges,
        timestamp: new Date(),
        expiresAt: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      }));

      mockDb.budgetLimits.updateBudgetLimits.mockResolvedValue(undefined);

      const result = await budgetManager.confirmBudgetLimitChanges(userId, true);

      expect(result?.dailySpendingCap).toBe(2500);
      expect(mockRedis.del).toHaveBeenCalledWith(`pending_budget_changes:${userId}`);
    });

    test('should reject changes when user declines', async () => {
      const userId = 'test-user-1';
      const pendingChanges = { dailySpendingCap: 2500 };

      // Mock pending changes exist
      mockRedis.get.mockResolvedValue(JSON.stringify({
        changes: pendingChanges,
        timestamp: new Date(),
        expiresAt: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      }));

      const result = await budgetManager.confirmBudgetLimitChanges(userId, false);

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalledWith(`pending_budget_changes:${userId}`);
    });
  });

  describe('Emergency Stop Functionality', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 500,
        weeklySpent: 3000,
        monthlySpent: 15000,
        totalSpent: 79500, // Close to emergency threshold
        transactionCount: 50,
        averageTransactionSize: 1590,
        largestTransaction: 5000,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
      mockDb.emergencyStops.createEmergencyStop.mockResolvedValue(undefined);
      mockDb.riskAlerts.createRiskAlert.mockResolvedValue(undefined);
    });

    test('should trigger emergency stop when threshold is exceeded', async () => {
      // Modify limits to allow the transaction amount but trigger emergency stop
      const modifiedLimits = { 
        ...mockBudgetLimits, 
        maxPricePerMoment: 1500, // Allow the transaction
        dailySpendingCap: 2000,
        weeklySpendingCap: 10000,
        monthlySpendingCap: 50000,
        totalBudgetLimit: 200000,
        emergencyStopThreshold: 80000 // Lower threshold
      };
      mockDb.budgetLimits.findByUserId.mockResolvedValue(modifiedLimits);

      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 1000, // Would exceed emergency threshold
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('trigger emergency stop threshold');
      expect(approval.riskScore).toBe(100);
      expect(mockDb.emergencyStops.createEmergencyStop).toHaveBeenCalled();
      expect(mockDb.riskAlerts.createRiskAlert).toHaveBeenCalled();
    });

    test('should manually trigger emergency stop', async () => {
      const userId = 'test-user-1';
      const reason = 'Manual emergency stop due to market volatility';
      const data = { marketCondition: 'high_volatility' };

      await budgetManager.triggerEmergencyStop(userId, reason, data);

      expect(mockDb.emergencyStops.createEmergencyStop).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          reason,
          isActive: true,
        })
      );
    });
  });

  describe('Additional Safety Checks', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 600,
        weeklySpent: 3000,
        monthlySpent: 15000,
        totalSpent: 50000,
        transactionCount: 20,
        averageTransactionSize: 100,
        largestTransaction: 300,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
    });

    test('should block transaction that consumes more than 50% of remaining daily budget', async () => {
      // Remaining daily budget: $1000 - $600 = $400
      // Transaction of $250 would be more than 50% of remaining ($200)
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 250,
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      // Mock high risk score to trigger additional safety checks
      jest.spyOn(budgetManager as any, 'calculateTransactionRiskScore').mockReturnValue(75);

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('more than 50% of remaining daily budget');
    });

    test('should block transaction when too many transactions in last hour', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 100,
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      // Mock high hourly transaction count
      mockRedis.get.mockResolvedValue('15'); // More than 10 transactions per hour
      
      // Mock high risk score to trigger additional safety checks
      jest.spyOn(budgetManager as any, 'calculateTransactionRiskScore').mockReturnValue(75);

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.approved).toBe(false);
      expect(approval.reason).toContain('Too many transactions in the last hour');
    });

    test('should warn about large transactions compared to average', async () => {
      const spendingRequest: SpendingRequest = {
        userId: 'test-user-1',
        amount: 400, // 4x larger than average of $100
        momentId: 'moment-1',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const approval = await budgetManager.approveSpending(spendingRequest);

      expect(approval.warnings.some(warning => warning.includes('4.0x larger than average'))).toBe(true);
    });
  });

  describe('Budget Status and Statistics', () => {
    let mockBudgetLimits: BudgetLimits;
    let mockSpendingTracker: SpendingTracker;

    beforeEach(() => {
      mockBudgetLimits = {
        id: 'budget-1',
        userId: 'test-user-1',
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000,
        monthlySpendingCap: 30000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
        reserveAmount: 20000,
        autoRebalance: true,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSpendingTracker = {
        id: 'spending-1',
        userId: 'test-user-1',
        date: new Date(),
        dailySpent: 900, // 90% of daily limit
        weeklySpent: 6300, // 90% of weekly limit
        monthlySpent: 27000, // 90% of monthly limit
        totalSpent: 80000, // 80% of total limit
        transactionCount: 50,
        averageTransactionSize: 1600,
        largestTransaction: 5000,
        updatedAt: new Date(),
      };

      mockDb.budgetLimits.findByUserId.mockResolvedValue(mockBudgetLimits);
      mockDb.spendingTracker.findByUserId.mockResolvedValue(mockSpendingTracker);
      mockRedis.get.mockResolvedValue(null); // No temporary reductions or pending reviews
    });

    test('should return comprehensive budget status', async () => {
      const status = await budgetManager.getBudgetStatus('test-user-1');

      expect(status.limits).toEqual(mockBudgetLimits);
      expect(status.spending).toEqual(mockSpendingTracker);
      expect(status.utilization.daily).toBeCloseTo(0.9);
      expect(status.utilization.weekly).toBeCloseTo(0.9);
      expect(status.utilization.monthly).toBeCloseTo(0.9);
      expect(status.utilization.total).toBeCloseTo(0.8);
      expect(status.safetyStatus).toBeDefined();
      expect(status.safetyStatus.emergencyStopActive).toBe(false);
      expect(status.safetyStatus.limitsTemporarilyReduced).toBe(false);
    });

    test('should return system statistics', () => {
      // Add some data to caches
      budgetManager['budgetCache'].set('user1', mockBudgetLimits);
      budgetManager['budgetCache'].set('user2', mockBudgetLimits);
      budgetManager['spendingCache'].set('user1', mockSpendingTracker);
      budgetManager['spendingCache'].set('user2', mockSpendingTracker);

      const stats = budgetManager.getStats();

      expect(stats.totalUsersTracked).toBe(2);
      expect(stats.totalSpendingTracked).toBe(160000); // 2 * 80000
      expect(stats.averageDailySpending).toBe(900);
    });
  });
});