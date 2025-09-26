import { DatabaseManager } from '../index';
import { validateUser, validateMoment, validateTrade } from '../validation';

// Mock database for integration testing
const mockDb = {
  query: jest.fn(),
  transaction: jest.fn(),
  healthCheck: jest.fn(),
  close: jest.fn(),
} as any;

const mockMigrationManager = {
  runMigrations: jest.fn(),
} as any;

// Mock the DatabaseConnection and MigrationManager
jest.mock('../connection', () => ({
  DatabaseConnection: {
    fromUrl: jest.fn(() => mockDb),
  },
}));

jest.mock('../migrations', () => ({
  MigrationManager: jest.fn(() => mockMigrationManager),
}));

describe('Database Integration Tests', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    jest.clearAllMocks();
    dbManager = new DatabaseManager('postgresql://test:test@localhost:5432/test');
  });

  describe('Data Model Validation Integration', () => {
    it('should validate user data before database operations', () => {
      const validUser = {
        walletAddress: '0x1234567890abcdef',
        budgetLimits: {
          dailySpendingCap: 1000,
          maxPricePerMoment: 500,
          totalBudgetLimit: 10000,
          emergencyStopThreshold: 5000,
        },
      };

      expect(() => validateUser(validUser)).not.toThrow();
    });

    it('should validate moment data before database operations', () => {
      const validMoment = {
        playerId: 'lebron-james',
        playerName: 'LeBron James',
        serialNumber: 123,
        currentPrice: 150.00,
        aiValuation: 200.00,
        confidence: 0.85,
        scarcityRank: 5,
        gameDate: new Date('2024-01-15'),
      };

      expect(() => validateMoment(validMoment)).not.toThrow();
    });

    it('should validate trade data before database operations', () => {
      const validTrade = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        momentId: 'moment-123',
        action: 'buy' as const,
        price: 150.50,
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        reasoning: 'AI detected undervalued moment',
      };

      expect(() => validateTrade(validTrade)).not.toThrow();
    });

    it('should reject invalid data', () => {
      const invalidUser = {
        walletAddress: 'invalid-address',
      };

      expect(() => validateUser(invalidUser)).toThrow('Invalid Flow wallet address format');
    });
  });

  describe('Database Manager Integration', () => {
    it('should initialize database manager with all repositories', () => {
      expect(dbManager.users).toBeDefined();
      expect(dbManager.strategies).toBeDefined();
      expect(dbManager.moments).toBeDefined();
      expect(dbManager.trades).toBeDefined();
      expect(dbManager.notifications).toBeDefined();
    });

    it('should initialize database with migrations', async () => {
      mockDb.healthCheck.mockResolvedValue(true);
      mockMigrationManager.runMigrations.mockResolvedValue(undefined);

      await dbManager.initialize();

      expect(mockMigrationManager.runMigrations).toHaveBeenCalled();
      expect(mockDb.healthCheck).toHaveBeenCalled();
    });

    it('should handle database connection errors', async () => {
      mockDb.healthCheck.mockResolvedValue(false);
      mockMigrationManager.runMigrations.mockResolvedValue(undefined);

      await expect(dbManager.initialize()).rejects.toThrow('Database connection failed health check');
    });

    it('should provide transaction support', async () => {
      const mockCallback = jest.fn().mockResolvedValue('test-result');
      mockDb.transaction.mockImplementation(async (callback: any) => {
        return callback(mockDb);
      });

      const result = await dbManager.transaction(mockCallback);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalled();
      expect(result).toBe('test-result');
    });
  });

  describe('Repository Integration', () => {
    it('should provide access to all repository types', () => {
      expect(dbManager.users.constructor.name).toBe('UserRepository');
      expect(dbManager.strategies.constructor.name).toBe('StrategyRepository');
      expect(dbManager.moments.constructor.name).toBe('MomentRepository');
      expect(dbManager.trades.constructor.name).toBe('TradeRepository');
      expect(dbManager.notifications.constructor.name).toBe('NotificationRepository');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle validation errors gracefully', () => {
      const invalidMoment = {
        serialNumber: -1, // Invalid
        confidence: 1.5, // Invalid
      };

      expect(() => validateMoment(invalidMoment)).toThrow();
    });

    it('should handle database connection cleanup', async () => {
      await dbManager.close();
      expect(mockDb.close).toHaveBeenCalled();
    });
  });
});