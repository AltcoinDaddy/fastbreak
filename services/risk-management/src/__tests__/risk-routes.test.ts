import request from 'supertest';
import express from 'express';
import { createRiskRouter } from '../routes/risk';
import { BudgetManager } from '../services/budget-manager';
import { BudgetLimits, SpendingTracker } from '../types/risk';
import winston from 'winston';

// Mock dependencies
jest.mock('../services/budget-manager');

describe('Risk Management Routes', () => {
  let app: express.Application;
  let mockBudgetManager: jest.Mocked<BudgetManager>;
  let mockLogger: jest.Mocked<winston.Logger>;

  const userId = 'test-user-123';
  const mockBudgetLimits: BudgetLimits = {
    id: 'budget-123',
    userId,
    dailySpendingCap: 1000,
    weeklySpendingCap: 5000,
    monthlySpendingCap: 20000,
    maxPricePerMoment: 500,
    totalBudgetLimit: 100000,
    emergencyStopThreshold: 50000,
    reserveAmount: 20000,
    autoRebalance: true,
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSpendingTracker: SpendingTracker = {
    id: 'spending-123',
    userId,
    date: new Date(),
    dailySpent: 500,
    weeklySpent: 2000,
    monthlySpent: 8000,
    totalSpent: 30000,
    transactionCount: 15,
    averageTransactionSize: 200,
    largestTransaction: 400,
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Setup mocks
    mockBudgetManager = {
      getBudgetLimits: jest.fn(),
      setBudgetLimits: jest.fn(),
      getBudgetStatus: jest.fn(),
      approveSpending: jest.fn(),
      recordSpending: jest.fn(),
      getCurrentSpending: jest.fn(),
      triggerEmergencyStop: jest.fn(),
      resolveEmergencyStop: jest.fn(),
      createBudgetAllocation: jest.fn(),
      getStats: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api', createRiskRouter({
      budgetManager: mockBudgetManager,
      logger: mockLogger,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Budget Limits Routes', () => {
    describe('GET /api/budget/limits', () => {
      it('should return budget limits for valid user', async () => {
        mockBudgetManager.getBudgetLimits.mockResolvedValue(mockBudgetLimits);

        const response = await request(app)
          .get('/api/budget/limits')
          .set('X-User-ID', userId);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockBudgetLimits);
        expect(mockBudgetManager.getBudgetLimits).toHaveBeenCalledWith(userId);
      });

      it('should return 404 when budget limits not found', async () => {
        mockBudgetManager.getBudgetLimits.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/budget/limits')
          .set('X-User-ID', userId);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Budget limits not found');
      });

      it('should return 400 when user ID is missing', async () => {
        const response = await request(app)
          .get('/api/budget/limits');

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('User ID required in X-User-ID header');
      });

      it('should handle service errors gracefully', async () => {
        mockBudgetManager.getBudgetLimits.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/api/budget/limits')
          .set('X-User-ID', userId);

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Failed to get budget limits');
      });
    });

    describe('PUT /api/budget/limits', () => {
      it('should update budget limits successfully', async () => {
        const updates = { dailySpendingCap: 1500, maxPricePerMoment: 750 };
        const updatedLimits = { ...mockBudgetLimits, ...updates };
        
        mockBudgetManager.setBudgetLimits.mockResolvedValue(updatedLimits);

        const response = await request(app)
          .put('/api/budget/limits')
          .set('X-User-ID', userId)
          .send(updates);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(updatedLimits);
        expect(response.body.message).toBe('Budget limits updated successfully');
        expect(mockBudgetManager.setBudgetLimits).toHaveBeenCalledWith(userId, updates);
      });

      it('should return 400 when no updates provided', async () => {
        const response = await request(app)
          .put('/api/budget/limits')
          .set('X-User-ID', userId)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('No budget limit updates provided');
      });

      it('should handle validation errors', async () => {
        const updates = { dailySpendingCap: -100 };
        mockBudgetManager.setBudgetLimits.mockRejectedValue(new Error('Daily spending cap must be positive'));

        const response = await request(app)
          .put('/api/budget/limits')
          .set('X-User-ID', userId)
          .send(updates);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Daily spending cap must be positive');
      });
    });

    describe('GET /api/budget/status', () => {
      it('should return complete budget status', async () => {
        const mockStatus = {
          limits: mockBudgetLimits,
          spending: mockSpendingTracker,
          utilization: {
            daily: 0.5,
            weekly: 0.4,
            monthly: 0.4,
            total: 0.3,
          },
          warnings: ['Some warning'],
        };

        mockBudgetManager.getBudgetStatus.mockResolvedValue(mockStatus);

        const response = await request(app)
          .get('/api/budget/status')
          .set('X-User-ID', userId);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockStatus);
        expect(mockBudgetManager.getBudgetStatus).toHaveBeenCalledWith(userId);
      });
    });
  });

  describe('Spending Routes', () => {
    describe('POST /api/spending/approve', () => {
      it('should approve valid spending request', async () => {
        const spendingRequest = {
          amount: 200,
          momentId: 'moment-123',
          strategyId: 'strategy-123',
          transactionType: 'buy',
        };

        const mockApproval = {
          approved: true,
          warnings: [],
          riskScore: 25,
        };

        mockBudgetManager.approveSpending.mockResolvedValue(mockApproval);

        const response = await request(app)
          .post('/api/spending/approve')
          .set('X-User-ID', userId)
          .send(spendingRequest);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockApproval);
        expect(mockBudgetManager.approveSpending).toHaveBeenCalledWith({
          userId,
          ...spendingRequest,
        });
      });

      it('should return 400 for missing required fields', async () => {
        const incompleteRequest = {
          amount: 200,
          // Missing momentId, strategyId, transactionType
        };

        const response = await request(app)
          .post('/api/spending/approve')
          .set('X-User-ID', userId)
          .send(incompleteRequest);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Missing required fields');
      });

      it('should reject spending that exceeds limits', async () => {
        const spendingRequest = {
          amount: 600,
          momentId: 'moment-123',
          strategyId: 'strategy-123',
          transactionType: 'buy',
        };

        const mockApproval = {
          approved: false,
          reason: 'Transaction amount exceeds maximum price per moment',
          warnings: [],
          riskScore: 100,
        };

        mockBudgetManager.approveSpending.mockResolvedValue(mockApproval);

        const response = await request(app)
          .post('/api/spending/approve')
          .set('X-User-ID', userId)
          .send(spendingRequest);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.approved).toBe(false);
        expect(response.body.data.reason).toContain('exceeds maximum price per moment');
      });
    });

    describe('POST /api/spending/record', () => {
      it('should record spending successfully', async () => {
        const spendingRequest = {
          amount: 200,
          momentId: 'moment-123',
          strategyId: 'strategy-123',
          transactionType: 'buy',
        };

        mockBudgetManager.recordSpending.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/spending/record')
          .set('X-User-ID', userId)
          .send(spendingRequest);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Spending recorded successfully');
        expect(mockBudgetManager.recordSpending).toHaveBeenCalledWith({
          userId,
          ...spendingRequest,
        });
      });
    });

    describe('GET /api/spending/current', () => {
      it('should return current spending tracker', async () => {
        mockBudgetManager.getCurrentSpending.mockResolvedValue(mockSpendingTracker);

        const response = await request(app)
          .get('/api/spending/current')
          .set('X-User-ID', userId);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockSpendingTracker);
        expect(mockBudgetManager.getCurrentSpending).toHaveBeenCalledWith(userId);
      });
    });
  });

  describe('Emergency Stop Routes', () => {
    describe('POST /api/emergency/trigger', () => {
      it('should trigger emergency stop successfully', async () => {
        const emergencyData = {
          reason: 'budget_threshold_exceeded',
          data: { currentSpending: 45000, threshold: 50000 },
        };

        mockBudgetManager.triggerEmergencyStop.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/emergency/trigger')
          .set('X-User-ID', userId)
          .send(emergencyData);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Emergency stop triggered successfully');
        expect(mockBudgetManager.triggerEmergencyStop).toHaveBeenCalledWith(
          userId,
          emergencyData.reason,
          emergencyData.data
        );
      });

      it('should return 400 when reason is missing', async () => {
        const response = await request(app)
          .post('/api/emergency/trigger')
          .set('X-User-ID', userId)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Reason is required for emergency stop');
      });
    });

    describe('POST /api/emergency/resolve/:emergencyStopId', () => {
      it('should resolve emergency stop successfully', async () => {
        const emergencyStopId = 'emergency-123';
        const resolveData = { resolvedBy: 'admin' };

        mockBudgetManager.resolveEmergencyStop.mockResolvedValue(undefined);

        const response = await request(app)
          .post(`/api/emergency/resolve/${emergencyStopId}`)
          .set('X-User-ID', userId)
          .send(resolveData);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Emergency stop resolved successfully');
        expect(mockBudgetManager.resolveEmergencyStop).toHaveBeenCalledWith(
          userId,
          emergencyStopId,
          'admin'
        );
      });

      it('should return 400 when resolvedBy is missing', async () => {
        const response = await request(app)
          .post('/api/emergency/resolve/emergency-123')
          .set('X-User-ID', userId)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('resolvedBy is required');
      });
    });
  });

  describe('Budget Allocation Routes', () => {
    describe('POST /api/budget/allocation', () => {
      it('should create budget allocation successfully', async () => {
        const allocationData = {
          totalBudget: 10000,
          allocations: [
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
          ],
        };

        const mockAllocation = {
          userId,
          ...allocationData,
          unallocated: 0,
          rebalanceFrequency: 'weekly',
          lastRebalance: new Date(),
          nextRebalance: new Date(),
        };

        mockBudgetManager.createBudgetAllocation.mockResolvedValue(mockAllocation);

        const response = await request(app)
          .post('/api/budget/allocation')
          .set('X-User-ID', userId)
          .send(allocationData);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockAllocation);
        expect(response.body.message).toBe('Budget allocation created successfully');
        expect(mockBudgetManager.createBudgetAllocation).toHaveBeenCalledWith(
          userId,
          allocationData.totalBudget,
          allocationData.allocations
        );
      });

      it('should return 400 for invalid allocation data', async () => {
        const invalidData = {
          totalBudget: 10000,
          // Missing allocations
        };

        const response = await request(app)
          .post('/api/budget/allocation')
          .set('X-User-ID', userId)
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('totalBudget and allocations array are required');
      });

      it('should handle allocation validation errors', async () => {
        const allocationData = {
          totalBudget: 10000,
          allocations: [
            {
              category: 'rookies',
              allocatedPercentage: 0.6, // Total > 100%
            },
            {
              category: 'veterans',
              allocatedPercentage: 0.6,
            },
          ],
        };

        mockBudgetManager.createBudgetAllocation.mockRejectedValue(
          new Error('Allocation percentages must sum to 100%')
        );

        const response = await request(app)
          .post('/api/budget/allocation')
          .set('X-User-ID', userId)
          .send(allocationData);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Allocation percentages must sum to 100%');
      });
    });
  });

  describe('Statistics Routes', () => {
    describe('GET /api/stats', () => {
      it('should return risk management statistics', async () => {
        const mockStats = {
          totalUsers: 150,
          averageDailySpending: 250,
          emergencyStopsActive: 2,
          alertsTriggered: 15,
        };

        mockBudgetManager.getStats.mockReturnValue(mockStats);

        const response = await request(app)
          .get('/api/stats');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockStats);
        expect(mockBudgetManager.getStats).toHaveBeenCalled();
      });
    });
  });
});