import { TradeRepository } from '../repositories/trade';
import { Trade } from '@fastbreak/types';

// Mock the database connection
const mockDb = {
  query: jest.fn(),
} as any;

describe('TradeRepository', () => {
  let tradeRepo: TradeRepository;

  beforeEach(() => {
    tradeRepo = new TradeRepository(mockDb);
    jest.clearAllMocks();
  });

  describe('createTrade', () => {
    it('should create new trade', async () => {
      const mockTrade = {
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategy_used: 'rookie_risers',
        profit_loss: null,
        transaction_hash: '0xabc123',
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockTrade] });

      const tradeData: Omit<Trade, 'id' | 'timestamp'> = {
        userId: 'user-1',
        momentId: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategyUsed: 'rookie_risers',
        transactionHash: '0xabc123',
      };

      const result = await tradeRepo.createTrade(tradeData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trades'),
        [
          'user-1',
          'moment-1',
          'buy',
          150.00,
          'AI detected undervalued moment',
          'rookie_risers',
          undefined,
          '0xabc123'
        ]
      );
      expect(result.action).toBe('buy');
      expect(result.price).toBe(150.00);
    });
  });

  describe('getTradesByUser', () => {
    it('should return user trades with moment details', async () => {
      const mockTrades = [{
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategy_used: 'rookie_risers',
        profit_loss: 25.50,
        transaction_hash: '0xabc123',
        created_at: new Date(),
        player_name: 'LeBron James',
        moment_type: 'Dunk',
        serial_number: 123,
      }];

      const mockCount = 1;

      mockDb.query
        .mockResolvedValueOnce({ rows: mockTrades }) // Trades query
        .mockResolvedValueOnce({ rows: [{ count: mockCount }] }); // Count query

      jest.spyOn(tradeRepo as any, 'count').mockResolvedValue(mockCount);

      const result = await tradeRepo.getTradesByUser('user-1', 50, 0);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM trades t'),
        ['user-1', 50, 0]
      );
      expect(result.trades).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.trades[0].action).toBe('buy');
      expect((result.trades[0] as any).momentDetails.playerName).toBe('LeBron James');
    });
  });

  describe('getTradesByMoment', () => {
    it('should return trades for specific moment', async () => {
      const mockTrades = [{
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategy_used: 'rookie_risers',
        profit_loss: null,
        transaction_hash: '0xabc123',
        created_at: new Date(),
      }];

      jest.spyOn(tradeRepo as any, 'findByCondition').mockResolvedValue(
        mockTrades.map(t => tradeRepo['mapRowToEntity'](t))
      );

      const result = await tradeRepo.getTradesByMoment('moment-1');

      expect(tradeRepo['findByCondition']).toHaveBeenCalledWith(
        'moment_id = $1 ORDER BY created_at DESC',
        ['moment-1']
      );
      expect(result).toHaveLength(1);
      expect(result[0].momentId).toBe('moment-1');
    });
  });

  describe('getTradesByStrategy', () => {
    it('should return trades for specific strategy', async () => {
      const mockTrades = [{
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategy_used: 'rookie_risers',
        profit_loss: null,
        transaction_hash: '0xabc123',
        created_at: new Date(),
      }];

      jest.spyOn(tradeRepo as any, 'findByCondition').mockResolvedValue(
        mockTrades.map(t => tradeRepo['mapRowToEntity'](t))
      );

      const result = await tradeRepo.getTradesByStrategy('rookie_risers', 100);

      expect(tradeRepo['findByCondition']).toHaveBeenCalledWith(
        'strategy_used = $1 ORDER BY created_at DESC LIMIT $2',
        ['rookie_risers', 100]
      );
      expect(result).toHaveLength(1);
      expect(result[0].strategyUsed).toBe('rookie_risers');
    });
  });

  describe('updateTradeProfit', () => {
    it('should update trade profit/loss', async () => {
      const mockTrade = {
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'sell',
        price: 175.00,
        reasoning: 'Profit taking',
        strategy_used: 'rookie_risers',
        profit_loss: 25.00, // Updated profit
        transaction_hash: '0xdef456',
        created_at: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockTrade] });

      const result = await tradeRepo.updateTradeProfit('trade-1', 25.00);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trades'),
        [25.00, 'trade-1']
      );
      expect(result!.profitLoss).toBe(25.00);
    });

    it('should return null if trade not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await tradeRepo.updateTradeProfit('nonexistent', 10.00);

      expect(result).toBeNull();
    });
  });

  describe('getUserTradingStats', () => {
    it('should return comprehensive trading statistics', async () => {
      const mockStats = {
        total_trades: 10,
        total_buys: 6,
        total_sells: 4,
        profitable_trades: 7,
        total_spent: 1500.00,
        total_earned: 1750.00,
        total_profit: 250.00,
        average_profit: 25.00,
        unique_moments: 8,
      };

      mockDb.query.mockResolvedValue({ rows: [mockStats] });

      const result = await tradeRepo.getUserTradingStats('user-1', 30);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM trades'),
        ['user-1', 30]
      );
      expect(result.totalTrades).toBe(10);
      expect(result.successRate).toBe(70); // 7/10 * 100
      expect(result.totalProfit).toBe(250.00);
      expect(result.uniqueMoments).toBe(8);
    });

    it('should handle zero trades gracefully', async () => {
      const mockStats = {
        total_trades: 0,
        total_buys: 0,
        total_sells: 0,
        profitable_trades: 0,
        total_spent: 0,
        total_earned: 0,
        total_profit: 0,
        average_profit: 0,
        unique_moments: 0,
      };

      mockDb.query.mockResolvedValue({ rows: [mockStats] });

      const result = await tradeRepo.getUserTradingStats('user-1', 30);

      expect(result.successRate).toBe(0);
      expect(result.totalTrades).toBe(0);
    });
  });

  describe('getRecentTrades', () => {
    it('should return recent trades with user and moment details', async () => {
      const mockTrades = [{
        id: 'trade-1',
        user_id: 'user-1',
        moment_id: 'moment-1',
        action: 'buy',
        price: 150.00,
        reasoning: 'AI detected undervalued moment',
        strategy_used: 'rookie_risers',
        profit_loss: null,
        transaction_hash: '0xabc123',
        created_at: new Date(),
        player_name: 'LeBron James',
        moment_type: 'Dunk',
        serial_number: 123,
        wallet_address: '0x1234567890abcdef',
      }];

      mockDb.query.mockResolvedValue({ rows: mockTrades });

      const result = await tradeRepo.getRecentTrades(20);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY t.created_at DESC'),
        [20]
      );
      expect(result).toHaveLength(1);
      expect((result[0] as any).momentDetails.playerName).toBe('LeBron James');
      expect((result[0] as any).userWallet).toBe('0x1234567890abcdef');
    });
  });

  describe('getDailySpending', () => {
    it('should return daily spending for user', async () => {
      const mockSpending = { daily_spending: 350.00 };

      mockDb.query.mockResolvedValue({ rows: [mockSpending] });

      const result = await tradeRepo.getDailySpending('user-1');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('action = \'buy\''),
        ['user-1', expect.any(Date)]
      );
      expect(result).toBe(350.00);
    });

    it('should return daily spending for specific date', async () => {
      const mockSpending = { daily_spending: 200.00 };
      const specificDate = new Date('2024-01-15');

      mockDb.query.mockResolvedValue({ rows: [mockSpending] });

      const result = await tradeRepo.getDailySpending('user-1', specificDate);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DATE(created_at) = DATE($2)'),
        ['user-1', specificDate]
      );
      expect(result).toBe(200.00);
    });

    it('should return 0 if no spending found', async () => {
      const mockSpending = { daily_spending: 0 };

      mockDb.query.mockResolvedValue({ rows: [mockSpending] });

      const result = await tradeRepo.getDailySpending('user-1');

      expect(result).toBe(0);
    });
  });
});