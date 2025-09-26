import { DatabaseManager } from '../index';
import { DatabaseConnection } from '../connection';
import { MigrationManager } from '../migrations';

// Mock all dependencies
jest.mock('../connection');
jest.mock('../migrations');
jest.mock('../repositories/user');
jest.mock('../repositories/strategy');
jest.mock('../repositories/moment');
jest.mock('../repositories/trade');
jest.mock('../repositories/notification');

const MockDatabaseConnection = DatabaseConnection as jest.MockedClass<typeof DatabaseConnection>;
const MockMigrationManager = MigrationManager as jest.MockedClass<typeof MigrationManager>;

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockMigrationManager: jest.Mocked<MigrationManager>;

  beforeEach(() => {
    mockConnection = {
      healthCheck: jest.fn(),
      close: jest.fn(),
      transaction: jest.fn(),
      query: jest.fn(),
    } as any;

    mockMigrationManager = {
      runMigrations: jest.fn(),
    } as any;

    MockDatabaseConnection.fromUrl.mockReturnValue(mockConnection);
    MockMigrationManager.mockImplementation(() => mockMigrationManager);

    dbManager = new DatabaseManager('postgresql://test:test@localhost:5432/test');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with database URL', () => {
      expect(MockDatabaseConnection.fromUrl).toHaveBeenCalledWith(
        'postgresql://test:test@localhost:5432/test'
      );
      expect(MockMigrationManager).toHaveBeenCalledWith(mockConnection);
    });

    it('should initialize all repositories', () => {
      expect(dbManager.users).toBeDefined();
      expect(dbManager.strategies).toBeDefined();
      expect(dbManager.moments).toBeDefined();
      expect(dbManager.trades).toBeDefined();
      expect(dbManager.notifications).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should run migrations and verify connection', async () => {
      mockMigrationManager.runMigrations.mockResolvedValue();
      mockConnection.healthCheck.mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await dbManager.initialize();

      expect(mockMigrationManager.runMigrations).toHaveBeenCalledWith(expect.stringContaining('src'));
      expect(mockConnection.healthCheck).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Database initialized successfully');

      consoleSpy.mockRestore();
    });

    it('should throw error if health check fails', async () => {
      mockMigrationManager.runMigrations.mockResolvedValue();
      mockConnection.healthCheck.mockResolvedValue(false);

      await expect(dbManager.initialize()).rejects.toThrow('Database connection failed health check');
    });

    it('should propagate migration errors', async () => {
      const migrationError = new Error('Migration failed');
      mockMigrationManager.runMigrations.mockRejectedValue(migrationError);

      await expect(dbManager.initialize()).rejects.toThrow('Migration failed');
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      mockConnection.close.mockResolvedValue();

      await dbManager.close();

      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('should return database connection', () => {
      const connection = dbManager.getConnection();

      expect(connection).toBe(mockConnection);
    });
  });

  describe('transaction', () => {
    it('should execute callback within transaction', async () => {
      const mockClient = { query: jest.fn() };
      const mockCallback = jest.fn().mockResolvedValue('success');

      mockConnection.transaction.mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });

      const result = await dbManager.transaction(mockCallback);

      expect(mockConnection.transaction).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith(expect.any(DatabaseManager));
      expect(result).toBe('success');
    });

    it('should propagate transaction errors', async () => {
      const transactionError = new Error('Transaction failed');
      const mockCallback = jest.fn().mockRejectedValue(transactionError);

      mockConnection.transaction.mockImplementation(async (callback) => {
        const mockClient = { query: jest.fn() };
        return callback(mockClient as any);
      });

      await expect(dbManager.transaction(mockCallback)).rejects.toThrow('Transaction failed');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete initialization flow', async () => {
      mockMigrationManager.runMigrations.mockResolvedValue();
      mockConnection.healthCheck.mockResolvedValue(true);
      mockConnection.close.mockResolvedValue();

      // Initialize
      await dbManager.initialize();

      // Verify repositories are accessible
      expect(dbManager.users).toBeDefined();
      expect(dbManager.strategies).toBeDefined();
      expect(dbManager.moments).toBeDefined();
      expect(dbManager.trades).toBeDefined();
      expect(dbManager.notifications).toBeDefined();

      // Close
      await dbManager.close();

      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle transaction with multiple repository operations', async () => {
      const mockClient = { query: jest.fn() };
      
      mockConnection.transaction.mockImplementation(async (callback) => {
        return callback(mockClient as any);
      });

      const result = await dbManager.transaction(async (db) => {
        // Simulate operations with different repositories
        expect(db.users).toBeDefined();
        expect(db.strategies).toBeDefined();
        expect(db.moments).toBeDefined();
        expect(db.trades).toBeDefined();
        expect(db.notifications).toBeDefined();
        
        return 'transaction-success';
      });

      expect(result).toBe('transaction-success');
      expect(mockConnection.transaction).toHaveBeenCalled();
    });
  });
});