import { AuthService } from '../auth/auth-service';
import { DatabaseManager } from '@fastbreak/database';
import { JWTService } from '../auth/jwt';
import { FlowWalletService } from '../auth/flow-wallet';

// Mock dependencies
jest.mock('@fastbreak/database');
jest.mock('../auth/jwt');
jest.mock('../auth/flow-wallet');

describe('AuthService', () => {
  let authService: AuthService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockJwtService: jest.Mocked<JWTService>;
  let mockFlowWalletService: jest.Mocked<FlowWalletService>;

  const mockUser = {
    id: 'user-123',
    walletAddress: '0x1234567890abcdef',
    strategies: [],
    budgetLimits: {
      dailySpendingCap: 1000,
      maxPricePerMoment: 500,
      totalBudgetLimit: 10000,
      emergencyStopThreshold: 5000,
    },
    notificationPreferences: {
      pushEnabled: true,
      tradeNotifications: true,
      budgetAlerts: true,
      systemAlerts: true,
    },
    createdAt: new Date(),
    lastActive: new Date(),
  };

  beforeEach(() => {
    // Create mocked instances
    mockDb = {
      users: {
        findByWalletAddress: jest.fn(),
        createUser: jest.fn(),
        updateLastActive: jest.fn(),
        getUserWithDetails: jest.fn(),
      },
      getConnection: jest.fn().mockReturnValue({
        transaction: jest.fn(),
      }),
    } as any;

    mockJwtService = {
      generateToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      verifyToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    } as any;

    mockFlowWalletService = {
      isValidFlowAddress: jest.fn(),
      verifySignature: jest.fn(),
    } as any;

    // Mock constructors
    (JWTService as jest.MockedClass<typeof JWTService>).mockImplementation(() => mockJwtService);
    (FlowWalletService as jest.MockedClass<typeof FlowWalletService>).mockImplementation(() => mockFlowWalletService);

    authService = new AuthService(mockDb, 'test-secret');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateWithWallet', () => {
    const validRequest = {
      walletAddress: '0x1234567890abcdef',
      message: 'FastBreak Authentication\n\nTimestamp: 1640995200000\nNonce: test-nonce',
      signatures: [
        {
          addr: '0x1234567890abcdef',
          keyId: 0,
          signature: 'test-signature',
        },
      ],
    };

    it('should authenticate existing user successfully', async () => {
      // Setup mocks
      mockFlowWalletService.isValidFlowAddress.mockReturnValue(true);
      mockFlowWalletService.verifySignature.mockResolvedValue(true);
      mockDb.users.findByWalletAddress.mockResolvedValue(mockUser);
      mockDb.users.getUserWithDetails.mockResolvedValue(mockUser);
      mockJwtService.generateToken.mockReturnValue('access-token');
      mockJwtService.generateRefreshToken.mockReturnValue('refresh-token');

      // Mock isValidAuthMessage to return true
      jest.spyOn(authService as any, 'isValidAuthMessage').mockReturnValue(true);

      const result = await authService.authenticateWithWallet(validRequest);

      expect(result).toEqual({
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(mockFlowWalletService.isValidFlowAddress).toHaveBeenCalledWith(validRequest.walletAddress);
      expect(mockFlowWalletService.verifySignature).toHaveBeenCalledWith(
        validRequest.message,
        validRequest.signatures,
        validRequest.walletAddress
      );
      expect(mockDb.users.findByWalletAddress).toHaveBeenCalledWith(validRequest.walletAddress);
      expect(mockDb.users.updateLastActive).toHaveBeenCalledWith(mockUser.id);
    });

    it('should create new user if not exists', async () => {
      // Setup mocks
      mockFlowWalletService.isValidFlowAddress.mockReturnValue(true);
      mockFlowWalletService.verifySignature.mockResolvedValue(true);
      mockDb.users.findByWalletAddress.mockResolvedValue(null);
      mockDb.users.createUser.mockResolvedValue(mockUser);
      mockDb.users.getUserWithDetails.mockResolvedValue(mockUser);
      mockJwtService.generateToken.mockReturnValue('access-token');
      mockJwtService.generateRefreshToken.mockReturnValue('refresh-token');

      jest.spyOn(authService as any, 'isValidAuthMessage').mockReturnValue(true);

      const result = await authService.authenticateWithWallet(validRequest);

      expect(result.user).toEqual(mockUser);
      expect(mockDb.users.createUser).toHaveBeenCalledWith(validRequest.walletAddress);
    });

    it('should throw error for invalid wallet address', async () => {
      mockFlowWalletService.isValidFlowAddress.mockReturnValue(false);

      await expect(authService.authenticateWithWallet(validRequest))
        .rejects.toThrow('Invalid Flow wallet address format');
    });

    it('should throw error for invalid signature', async () => {
      mockFlowWalletService.isValidFlowAddress.mockReturnValue(true);
      mockFlowWalletService.verifySignature.mockResolvedValue(false);

      await expect(authService.authenticateWithWallet(validRequest))
        .rejects.toThrow('Invalid wallet signature');
    });

    it('should throw error for invalid auth message', async () => {
      mockFlowWalletService.isValidFlowAddress.mockReturnValue(true);
      mockFlowWalletService.verifySignature.mockResolvedValue(true);
      jest.spyOn(authService as any, 'isValidAuthMessage').mockReturnValue(false);

      await expect(authService.authenticateWithWallet(validRequest))
        .rejects.toThrow('Invalid authentication message');
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { userId: mockUser.id, walletAddress: mockUser.walletAddress };

      mockJwtService.verifyRefreshToken.mockReturnValue(payload);
      mockDb.users.getUserWithDetails.mockResolvedValue(mockUser);
      mockJwtService.generateToken.mockReturnValue('new-access-token');
      mockJwtService.generateRefreshToken.mockReturnValue('new-refresh-token');

      const result = await authService.refreshToken(refreshToken);

      expect(result).toEqual({
        user: mockUser,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      expect(mockJwtService.verifyRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(mockDb.users.getUserWithDetails).toHaveBeenCalledWith(payload.userId);
      expect(mockDb.users.updateLastActive).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error for invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';
      mockJwtService.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(refreshToken))
        .rejects.toThrow('Token refresh failed');
    });

    it('should throw error if user not found', async () => {
      const refreshToken = 'valid-refresh-token';
      const payload = { userId: 'nonexistent-user', walletAddress: mockUser.walletAddress };

      mockJwtService.verifyRefreshToken.mockReturnValue(payload);
      mockDb.users.getUserWithDetails.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshToken))
        .rejects.toThrow('Token refresh failed: Error: User not found');
    });
  });

  describe('verifyToken', () => {
    it('should verify token successfully', async () => {
      const token = 'valid-access-token';
      const payload = { userId: mockUser.id, walletAddress: mockUser.walletAddress };

      mockJwtService.verifyToken.mockReturnValue(payload);
      mockDb.users.getUserWithDetails.mockResolvedValue(mockUser);

      const result = await authService.verifyToken(token);

      expect(result).toEqual(mockUser);
      expect(mockJwtService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockDb.users.getUserWithDetails).toHaveBeenCalledWith(payload.userId);
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalid-token';
      mockJwtService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken(token))
        .rejects.toThrow('Token verification failed');
    });
  });

  describe('generateAuthMessage', () => {
    it('should generate valid auth message', () => {
      const message = authService.generateAuthMessage();

      expect(message).toContain('FastBreak Authentication');
      expect(message).toContain('Timestamp:');
      expect(message).toContain('Nonce:');
      expect(message).toContain('This request will not trigger any blockchain transaction');
    });
  });

  describe('isValidAuthMessage', () => {
    it('should validate correct auth message', () => {
      const currentTime = Date.now();
      const message = `FastBreak Authentication

Timestamp: ${currentTime}
Nonce: test-nonce-123

This request will not trigger any blockchain transaction or cost any gas fees.`;

      const isValid = (authService as any).isValidAuthMessage(message);
      expect(isValid).toBe(true);
    });

    it('should reject message without FastBreak Authentication', () => {
      const message = 'Invalid message';
      const isValid = (authService as any).isValidAuthMessage(message);
      expect(isValid).toBe(false);
    });

    it('should reject message without timestamp', () => {
      const message = `FastBreak Authentication

Nonce: test-nonce-123`;

      const isValid = (authService as any).isValidAuthMessage(message);
      expect(isValid).toBe(false);
    });

    it('should reject message without nonce', () => {
      const currentTime = Date.now();
      const message = `FastBreak Authentication

Timestamp: ${currentTime}`;

      const isValid = (authService as any).isValidAuthMessage(message);
      expect(isValid).toBe(false);
    });

    it('should reject expired message', () => {
      const expiredTime = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      const message = `FastBreak Authentication

Timestamp: ${expiredTime}
Nonce: test-nonce-123`;

      const isValid = (authService as any).isValidAuthMessage(message);
      expect(isValid).toBe(false);
    });
  });
});