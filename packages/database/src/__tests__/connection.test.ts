import { DatabaseConnection } from '../connection';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  })),
}));

describe('DatabaseConnection', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = DatabaseConnection.fromUrl('postgresql://test:test@localhost:5432/test');
  });

  afterEach(async () => {
    await db.close();
  });

  describe('getInstance', () => {
    it('should create a singleton instance', () => {
      const db1 = DatabaseConnection.getInstance({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      });
      const db2 = DatabaseConnection.getInstance();
      
      expect(db1).toBe(db2);
    });

    it('should throw error if no config provided on first call', () => {
      expect(() => {
        DatabaseConnection.getInstance();
      }).toThrow('Database configuration required for first initialization');
    });
  });

  describe('fromUrl', () => {
    it('should create instance from database URL', () => {
      const dbFromUrl = DatabaseConnection.fromUrl('postgresql://test:test@localhost:5432/test');
      expect(dbFromUrl).toBeInstanceOf(DatabaseConnection);
    });
  });

  describe('query', () => {
    it('should execute query and return result', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }] };
      const mockClient = {
        query: jest.fn().mockResolvedValue(mockResult),
        release: jest.fn(),
      };
      
      jest.spyOn(db, 'getClient').mockResolvedValue(mockClient as any);

      const result = await db.query('SELECT * FROM test WHERE id = $1', [1]);
      
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toBe(mockResult);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('should execute transaction and commit on success', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      
      jest.spyOn(db, 'getClient').mockResolvedValue(mockClient as any);

      const callback = jest.fn().mockResolvedValue('success');
      const result = await db.transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe('success');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      
      jest.spyOn(db, 'getClient').mockResolvedValue(mockClient as any);

      const error = new Error('Transaction failed');
      const callback = jest.fn().mockRejectedValue(error);

      await expect(db.transaction(callback)).rejects.toThrow('Transaction failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      jest.spyOn(db, 'query').mockResolvedValue({ rows: [{ health: 1 }] });

      const isHealthy = await db.healthCheck();
      
      expect(isHealthy).toBe(true);
      expect(db.query).toHaveBeenCalledWith('SELECT 1 as health');
    });

    it('should return false when database is unhealthy', async () => {
      jest.spyOn(db, 'query').mockRejectedValue(new Error('Connection failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const isHealthy = await db.healthCheck();
      
      expect(isHealthy).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Database health check failed:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});