import { StrategyRepository } from '../repositories/strategy';
import { StrategyParameters } from '@fastbreak/types';

// Mock the database connection
const mockDb = {
  query: jest.fn(),
  transaction: jest.fn(),
} as any;

describe('StrategyRepository', () => {
  let strategyRepo: StrategyRepository;

  beforeEach(() => {
    strategyRepo = new StrategyRepository(mockDb);
    jest.clearAllMocks();
  });

  describe('createStrategy', () => {
    it('should create strategy with performance tracking', async () => {
      const mockStrategy = {
        id: 'strategy-1',
        user_id: 'user-1',
        type: 'rookie_risers',
        parameters: { performanceThreshold: 0.8, priceLimit: 500 },
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockStrategy] }) // Strategy creation
          .mockResolvedValueOnce({ rows: [] }), // Performance tracking creation
      };

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const parameters: StrategyParameters = {
        rookieRisers: { 
          performanceThreshold: 0.8, 
          priceLimit: 500, 
          minGamesPlayed: 10,
          maxYearsExperience: 3,
          targetPositions: ['PG', 'SG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 18,
          projectedGrowthRate: 0.25,
        }
      };

      const result = await strategyRepo.createStrategy('user-1', 'rookie_risers', parameters);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result.type).toBe('rookie_risers');
      expect(result.isActive).toBe(true);
    });
  });

  describe('getStrategiesByUser', () => {
    it('should return strategies with performance data', async () => {
      const mockStrategies = [{
        id: 'strategy-1',
        type: 'rookie_risers',
        parameters: { threshold: 0.8 },
        is_active: true,
        total_trades: 5,
        successful_trades: 3,
        total_profit: 150.50,
        average_return: 30.10,
        last_executed: new Date(),
      }];

      mockDb.query.mockResolvedValue({ rows: mockStrategies });

      const result = await strategyRepo.getStrategiesByUser('user-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM strategies s'),
        ['user-1']
      );
      expect(result).toHaveLength(1);
      expect(result[0].performance.totalTrades).toBe(5);
      expect(result[0].performance.totalProfit).toBe(150.50);
    });
  });

  describe('getActiveStrategiesByUser', () => {
    it('should return only active strategies', async () => {
      const mockStrategies = [{
        id: 'strategy-1',
        type: 'post_game_spikes',
        parameters: { timeWindow: 24 },
        is_active: true,
        total_trades: 2,
        successful_trades: 2,
        total_profit: 75.25,
        average_return: 37.63,
        last_executed: null,
      }];

      mockDb.query.mockResolvedValue({ rows: mockStrategies });

      const result = await strategyRepo.getActiveStrategiesByUser('user-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('s.is_active = true'),
        ['user-1']
      );
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
    });
  });

  describe('updateStrategy', () => {
    it('should update strategy parameters', async () => {
      const mockStrategy = {
        id: 'strategy-1',
        user_id: 'user-1',
        type: 'arbitrage_mode',
        parameters: { priceDifferenceThreshold: 0.15 },
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockStrategy] });

      const parameters: StrategyParameters = {
        arbitrageMode: { 
          priceDifferenceThreshold: 0.15, 
          maxExecutionTime: 30, 
          marketplaces: ['topshot'],
          maxRiskScore: 0.7,
          minConfidenceLevel: 0.8,
          slippageTolerance: 0.05,
          maxPositionSize: 1000,
          excludeHighVolatility: true,
        }
      };

      const result = await strategyRepo.updateStrategy('strategy-1', parameters);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE strategies'),
        [JSON.stringify(parameters), 'strategy-1']
      );
      expect(result).toBeDefined();
      expect(result!.type).toBe('arbitrage_mode');
    });

    it('should return null if strategy not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await strategyRepo.updateStrategy('nonexistent', {});

      expect(result).toBeNull();
    });
  });

  describe('toggleStrategy', () => {
    it('should toggle strategy active status', async () => {
      const mockStrategy = {
        id: 'strategy-1',
        user_id: 'user-1',
        type: 'rookie_risers',
        parameters: {},
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockStrategy] });

      const result = await strategyRepo.toggleStrategy('strategy-1', false);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET is_active = $1'),
        [false, 'strategy-1']
      );
      expect(result!.isActive).toBe(false);
    });
  });

  describe('updateStrategyPerformance', () => {
    it('should update strategy performance metrics', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await strategyRepo.updateStrategyPerformance('strategy-1', true, 25.50);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE strategy_performance'),
        ['strategy-1', true, 25.50]
      );
    });
  });

  describe('getStrategyPerformance', () => {
    it('should return strategy performance data', async () => {
      const mockPerformance = {
        total_trades: 10,
        successful_trades: 7,
        total_profit: 325.75,
        average_return: 32.58,
        last_executed: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockPerformance] });

      const result = await strategyRepo.getStrategyPerformance('strategy-1');

      expect(result).toBeDefined();
      expect(result!.totalTrades).toBe(10);
      expect(result!.totalProfit).toBe(325.75);
    });

    it('should return null if performance not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await strategyRepo.getStrategyPerformance('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteStrategy', () => {
    it('should delete strategy and performance data', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete performance
          .mockResolvedValueOnce({ rowCount: 1 }), // Delete strategy
      };

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await strategyRepo.deleteStrategy('strategy-1');

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });

    it('should return false if strategy not found', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // Delete performance
          .mockResolvedValueOnce({ rowCount: 0 }), // Delete strategy
      };

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await strategyRepo.deleteStrategy('nonexistent');

      expect(result).toBe(false);
    });
  });
});