import { UserRepository } from '../repositories/user';
import { DatabaseConnection } from '../connection';

// Mock the database connection
const mockDb = {
  query: jest.fn(),
  transaction: jest.fn(),
} as any;

describe('UserRepository', () => {
  let userRepo: UserRepository;

  beforeEach(() => {
    userRepo = new UserRepository(mockDb);
    jest.clearAllMocks();
  });

  describe('findByWalletAddress', () => {
    it('should find user by wallet address', async () => {
      const mockUser = {
        id: '123',
        wallet_address: '0x1234567890abcdef',
        created_at: new Date(),
        last_active: new Date(),
      };

      mockDb.query.mockResolvedValue({ rows: [mockUser] });

      const result = await userRepo.findByWalletAddress('0x1234567890abcdef');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('wallet_address = $1'),
        ['0x1234567890abcdef']
      );
      expect(result).toEqual({
        id: '123',
        walletAddress: '0x1234567890abcdef',
        strategies: [],
        budgetLimits: {},
        notificationPreferences: {},
        createdAt: mockUser.created_at,
        lastActive: mockUser.last_active,
      });
    });

    it('should return null if user not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await userRepo.findByWalletAddress('0x1234567890abcdef');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create user with default settings', async () => {
      const mockUser = {
        id: '123',
        wallet_address: '0x1234567890abcdef',
        created_at: new Date(),
        last_active: new Date(),
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockUser] }) // User creation
          .mockResolvedValueOnce({ rows: [] }) // Budget limits creation
          .mockResolvedValueOnce({ rows: [] }), // Notification preferences creation
      };

      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockClient);
      });

      const result = await userRepo.createUser('0x1234567890abcdef');

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(result.walletAddress).toBe('0x1234567890abcdef');
    });
  });

  describe('getUserWithDetails', () => {
    it('should return user with all details', async () => {
      const mockUser = {
        id: '123',
        wallet_address: '0x1234567890abcdef',
        created_at: new Date(),
        last_active: new Date(),
      };

      const mockStrategy = {
        id: 'strategy-1',
        type: 'rookie_risers',
        parameters: { threshold: 0.8 },
        is_active: true,
        total_trades: 5,
        successful_trades: 3,
        total_profit: 150.50,
        average_return: 30.10,
        last_executed: new Date(),
      };

      const mockBudget = {
        daily_spending_cap: 1000.00,
        max_price_per_moment: 500.00,
        total_budget_limit: 10000.00,
        emergency_stop_threshold: 5000.00,
      };

      const mockNotifications = {
        email: 'test@example.com',
        push_enabled: true,
        trade_notifications: true,
        budget_alerts: true,
        system_alerts: true,
      };

      // Mock the findById call
      jest.spyOn(userRepo as any, 'findById').mockResolvedValue({
        id: '123',
        walletAddress: '0x1234567890abcdef',
        strategies: [],
        budgetLimits: {},
        notificationPreferences: {},
        createdAt: mockUser.created_at,
        lastActive: mockUser.last_active,
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockStrategy] }) // Strategies
        .mockResolvedValueOnce({ rows: [mockBudget] }) // Budget limits
        .mockResolvedValueOnce({ rows: [mockNotifications] }); // Notifications

      const result = await userRepo.getUserWithDetails('123');

      expect(result).toBeDefined();
      expect(result!.strategies).toHaveLength(1);
      expect(result!.strategies[0].type).toBe('rookie_risers');
      expect(result!.budgetLimits.dailySpendingCap).toBe(1000.00);
      expect(result!.notificationPreferences.email).toBe('test@example.com');
    });

    it('should return null if user not found', async () => {
      jest.spyOn(userRepo as any, 'findById').mockResolvedValue(null);

      const result = await userRepo.getUserWithDetails('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateLastActive', () => {
    it('should update user last active timestamp', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await userRepo.updateLastActive('123');

      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE users SET last_active = NOW() WHERE id = $1',
        ['123']
      );
    });
  });

  describe('getUserStats', () => {
    it('should return user trading statistics', async () => {
      const mockStats = {
        total_trades: 10,
        profitable_trades: 6,
        total_profit: 250.75,
        average_profit: 25.08,
        trades_today: 2,
        spent_today: 150.00,
      };

      mockDb.query.mockResolvedValue({ rows: [mockStats] });

      const result = await userRepo.getUserStats('123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM trades t'),
        ['123']
      );
      expect(result).toEqual(mockStats);
    });
  });
});