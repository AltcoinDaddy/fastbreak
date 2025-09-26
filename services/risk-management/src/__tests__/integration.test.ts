import { BudgetManager, BudgetManagerConfig, SpendingRequest } from '../services/budget-manager';
import { BudgetLimits } from '../types/risk';
import { DatabaseManager } from '@fastbreak/database';
import Redis from 'redis';
import winston from 'winston';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('redis');

describe('Budget Management Integration Tests', () => {
  let budgetManager: BudgetManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockRedis: jest.Mocked<Redis.RedisClientType>;
  let mockLogger: jest.Mocked<winston.Logger>;
  let config: BudgetManagerConfig;

  beforeEach(async () => {
    // Setup mocks
    mockDb = {
      initialize: jest.fn(),
      close: jest.fn(),
    } as any;

    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
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
    };

    budgetManager = new BudgetManager(config, mockDb, mockRedis, mockLogger);
    await budgetManager.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Budget Control Workflow', () => {
    const userId = 'integration-test-user';

    it('should handle complete user budget lifecycle', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveBudgetLimits').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveSpendingTracker').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'storeEmergencyStop').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'createRiskAlert').mockResolvedValue(undefined);

      // Step 1: Create initial budget limits
      const initialLimits = await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 500,
        maxPricePerMoment: 200,
        totalBudgetLimit: 10000,
        emergencyStopThreshold: 8000,
      });

      expect(initialLimits.dailySpendingCap).toBe(500);
      expect(initialLimits.maxPricePerMoment).toBe(200);

      // Step 2: Approve and record several valid transactions
      const validTransactions = [
        { amount: 100, momentId: 'moment-1', strategyId: 'strategy-1', transactionType: 'buy' as const },
        { amount: 150, momentId: 'moment-2', strategyId: 'strategy-1', transactionType: 'buy' as const },
        { amount: 120, momentId: 'moment-3', strategyId: 'strategy-2', transactionType: 'buy' as const },
      ];

      for (const transaction of validTransactions) {
        const request: SpendingRequest = { userId, ...transaction };
        
        // Approve transaction
        const approval = await budgetManager.approveSpending(request);
        expect(approval.approved).toBe(true);
        
        // Record transaction
        await budgetManager.recordSpending(request);
      }

      // Step 3: Check budget status after transactions
      const status = await budgetManager.getBudgetStatus(userId);
      expect(status.spending.dailySpent).toBe(370); // 100 + 150 + 120
      expect(status.spending.transactionCount).toBe(3);
      expect(status.utilization.daily).toBe(0.74); // 370/500

      // Step 4: Try to exceed daily limit
      const exceedingRequest: SpendingRequest = {
        userId,
        amount: 200, // Would make daily total 570 > 500
        momentId: 'moment-4',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const rejectedApproval = await budgetManager.approveSpending(exceedingRequest);
      expect(rejectedApproval.approved).toBe(false);
      expect(rejectedApproval.reason).toContain('exceed daily spending limit');

      // Step 5: Try to exceed max price per moment
      const expensiveRequest: SpendingRequest = {
        userId,
        amount: 250, // Exceeds maxPricePerMoment (200)
        momentId: 'moment-5',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const expensiveRejection = await budgetManager.approveSpending(expensiveRequest);
      expect(expensiveRejection.approved).toBe(false);
      expect(expensiveRejection.reason).toContain('exceeds maximum price per moment');

      // Step 6: Update budget limits
      const updatedLimits = await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 800,
        maxPricePerMoment: 300,
      });

      expect(updatedLimits.dailySpendingCap).toBe(800);
      expect(updatedLimits.maxPricePerMoment).toBe(300);

      // Step 7: Now the previously rejected transaction should be approved
      const nowValidRequest: SpendingRequest = {
        userId,
        amount: 250,
        momentId: 'moment-6',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const nowValidApproval = await budgetManager.approveSpending(nowValidRequest);
      expect(nowValidApproval.approved).toBe(true);
    });

    it('should trigger emergency stop when threshold exceeded', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveBudgetLimits').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveSpendingTracker').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'storeEmergencyStop').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'createRiskAlert').mockResolvedValue(undefined);

      // Set up budget limits with low emergency threshold
      await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 10000,
        emergencyStopThreshold: 1000, // Very low threshold
      });

      // Simulate spending close to emergency threshold
      const highSpendingTracker = {
        id: 'spending-123',
        userId,
        date: new Date(),
        dailySpent: 400,
        weeklySpent: 800,
        monthlySpent: 800,
        totalSpent: 800, // Close to emergency threshold
        transactionCount: 4,
        averageTransactionSize: 200,
        largestTransaction: 300,
        updatedAt: new Date(),
      };

      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb')
        .mockResolvedValue(highSpendingTracker);

      // Try to make a transaction that would exceed emergency threshold
      const emergencyRequest: SpendingRequest = {
        userId,
        amount: 300, // Would make total 1100 > 1000 emergency threshold
        momentId: 'moment-emergency',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const emergencyApproval = await budgetManager.approveSpending(emergencyRequest);

      expect(emergencyApproval.approved).toBe(false);
      expect(emergencyApproval.reason).toContain('trigger emergency stop threshold');
      expect(emergencyApproval.riskScore).toBe(100);

      // Create spy for emergency stop
      const emergencyStopSpy = jest.spyOn(budgetManager, 'triggerEmergencyStop').mockResolvedValue(undefined);

      // Verify emergency stop was triggered
      expect(emergencyStopSpy).toHaveBeenCalledWith(
        userId,
        'budget_threshold_exceeded',
        expect.objectContaining({
          currentSpending: 800,
          threshold: 1000,
          attemptedAmount: 300,
        })
      );
    });

    it('should handle budget allocation creation and validation', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'storeBudgetAllocation').mockResolvedValue(undefined);

      // Create valid budget allocation
      const validAllocation = await budgetManager.createBudgetAllocation(
        userId,
        10000,
        [
          {
            category: 'rookies',
            allocatedPercentage: 0.4,
            maxRiskLevel: 'medium',
          },
          {
            category: 'veterans',
            allocatedPercentage: 0.6,
            maxRiskLevel: 'low',
          },
        ]
      );

      expect(validAllocation.userId).toBe(userId);
      expect(validAllocation.totalBudget).toBe(10000);
      expect(validAllocation.allocations).toHaveLength(2);

      // Try to create invalid allocation (percentages don't sum to 100%)
      await expect(budgetManager.createBudgetAllocation(
        userId,
        10000,
        [
          {
            category: 'rookies',
            allocatedPercentage: 0.3,
          },
          {
            category: 'veterans',
            allocatedPercentage: 0.5, // Total = 0.8, not 1.0
          },
        ]
      )).rejects.toThrow('Allocation percentages must sum to 100%');
    });

    it('should generate appropriate warnings based on spending patterns', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveBudgetLimits').mockResolvedValue(undefined);

      // Set up budget limits
      await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 1000,
        weeklySpendingCap: 7000, // Fixed to be at least 7x daily limit
        monthlySpendingCap: 20000,
        maxPricePerMoment: 500,
      });

      // Simulate high utilization spending
      const highUtilizationSpending = {
        id: 'spending-123',
        userId,
        date: new Date(),
        dailySpent: 850, // 85% of daily limit
        weeklySpent: 4200, // 84% of weekly limit
        monthlySpent: 16500, // 82.5% of monthly limit
        totalSpent: 50000,
        transactionCount: 20,
        averageTransactionSize: 200,
        largestTransaction: 400,
        updatedAt: new Date(),
      };

      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb')
        .mockResolvedValue(highUtilizationSpending);

      // Make a small transaction that should generate warnings
      const warningRequest: SpendingRequest = {
        userId,
        amount: 50,
        momentId: 'moment-warning',
        strategyId: 'strategy-1',
        transactionType: 'buy',
      };

      const warningApproval = await budgetManager.approveSpending(warningRequest);

      expect(warningApproval.approved).toBe(true);
      expect(warningApproval.warnings).toContain(expect.stringContaining('Daily spending at'));
      expect(warningApproval.warnings).toContain(expect.stringContaining('Weekly spending at'));
      expect(warningApproval.warnings).toContain(expect.stringContaining('Monthly spending at'));
      expect(warningApproval.riskScore).toBeGreaterThan(50); // High risk due to high utilization
    });

    it('should calculate risk scores accurately based on multiple factors', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveBudgetLimits').mockResolvedValue(undefined);

      await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 100000,
        emergencyStopThreshold: 80000,
      });

      const baseSpending = {
        id: 'spending-123',
        userId,
        date: new Date(),
        dailySpent: 200,
        weeklySpent: 1000,
        monthlySpent: 4000,
        totalSpent: 20000,
        transactionCount: 10,
        averageTransactionSize: 200,
        largestTransaction: 300,
        updatedAt: new Date(),
      };

      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb')
        .mockResolvedValue(baseSpending);

      // Test different transaction amounts and their risk scores
      const testCases = [
        { amount: 50, expectedRiskRange: [0, 30] },    // Low risk
        { amount: 200, expectedRiskRange: [20, 50] },  // Medium risk
        { amount: 400, expectedRiskRange: [40, 70] },  // High risk
        { amount: 500, expectedRiskRange: [50, 80] },  // Very high risk
      ];

      for (const testCase of testCases) {
        const request: SpendingRequest = {
          userId,
          amount: testCase.amount,
          momentId: `moment-${testCase.amount}`,
          strategyId: 'strategy-1',
          transactionType: 'buy',
        };

        const approval = await budgetManager.approveSpending(request);
        
        expect(approval.approved).toBe(true);
        expect(approval.riskScore).toBeGreaterThanOrEqual(testCase.expectedRiskRange[0]);
        expect(approval.riskScore).toBeLessThanOrEqual(testCase.expectedRiskRange[1]);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    const userId = 'edge-case-user';

    it('should handle concurrent spending requests safely', async () => {
      // Mock database operations
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveBudgetLimits').mockResolvedValue(undefined);
      jest.spyOn(budgetManager as any, 'loadSpendingTrackerFromDb').mockResolvedValue(null);
      jest.spyOn(budgetManager as any, 'saveSpendingTracker').mockResolvedValue(undefined);

      await budgetManager.setBudgetLimits(userId, {
        dailySpendingCap: 1000,
        maxPricePerMoment: 300,
      });

      // Simulate concurrent requests that together would exceed limits
      const concurrentRequests = [
        { amount: 400, momentId: 'moment-1', strategyId: 'strategy-1', transactionType: 'buy' as const },
        { amount: 400, momentId: 'moment-2', strategyId: 'strategy-1', transactionType: 'buy' as const },
        { amount: 400, momentId: 'moment-3', strategyId: 'strategy-1', transactionType: 'buy' as const },
      ];

      const approvalPromises = concurrentRequests.map(req => 
        budgetManager.approveSpending({ userId, ...req })
      );

      const approvals = await Promise.all(approvalPromises);

      // At least one should be rejected due to daily limit
      const rejectedCount = approvals.filter(approval => !approval.approved).length;
      expect(rejectedCount).toBeGreaterThan(0);
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(budgetManager as any, 'loadBudgetLimitsFromDb')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(budgetManager.getBudgetLimits(userId))
        .rejects.toThrow('Database connection failed');
    });

    it('should validate budget limit constraints properly', async () => {
      const invalidConstraints = [
        { dailySpendingCap: -100 }, // Negative value
        { maxPricePerMoment: 0 }, // Zero value
        { dailySpendingCap: 1000, weeklySpendingCap: 5000 }, // Weekly < 7x daily
        { totalBudgetLimit: 50000, emergencyStopThreshold: 60000 }, // Emergency > total
      ];

      for (const constraint of invalidConstraints) {
        await expect(budgetManager.setBudgetLimits(userId, constraint))
          .rejects.toThrow();
      }
    });
  });
});