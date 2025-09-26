import request from 'supertest';
import express from 'express';
import { AuthRoutes } from '../routes/auth';
import { AuthService } from '../auth/auth-service';

// Mock the AuthService
jest.mock('../auth/auth-service');

describe('AuthRoutes', () => {
  let app: express.Application;
  let mockAuthService: jest.Mocked<AuthService>;
  let authRoutes: AuthRoutes;

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
    // Create mock AuthService
    mockAuthService = {
      generateAuthMessage: jest.fn(),
      authenticateWithWallet: jest.fn(),
      refreshToken: jest.fn(),
      verifyToken: jest.fn(),
      logout: jest.fn(),
      getWalletBalance: jest.fn(),
      getWalletInfo: jest.fn(),
      updateUserProfile: jest.fn(),
    } as any;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    
    authRoutes = new AuthRoutes(mockAuthService);
    app.use('/api', authRoutes.getRouter());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/auth/message', () => {
    it('should generate auth message successfully', async () => {
      const message = 'FastBreak Authentication\n\nTimestamp: 1640995200000\nNonce: test-nonce';
      mockAuthService.generateAuthMessage.mockReturnValue(message);

      const response = await request(app)
        .get('/api/auth/message')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe(message);
      expect(mockAuthService.generateAuthMessage).toHaveBeenCalled();
    });

    it('should handle auth message generation error', async () => {
      mockAuthService.generateAuthMessage.mockImplementation(() => {
        throw new Error('Message generation failed');
      });

      const response = await request(app)
        .get('/api/auth/message')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to generate auth message');
    });
  });

  describe('POST /api/auth/wallet', () => {
    const validWalletAuthRequest = {
      walletAddress: '0x1234567890abcdef',
      message: 'FastBreak Authentication\n\nTimestamp: 1640995200000\nNonce: test-nonce\n\nThis request will not trigger any blockchain transaction or cost any gas fees.',
      signatures: [
        {
          addr: '0x1234567890abcdef',
          keyId: 0,
          signature: 'test-signature',
        },
      ],
    };

    it('should authenticate wallet successfully', async () => {
      const authResult = {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockAuthService.authenticateWithWallet.mockResolvedValue(authResult);

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(validWalletAuthRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(mockUser.id);
      expect(response.body.data.accessToken).toBe('access-token');
      expect(response.body.data.refreshToken).toBe('refresh-token');
      expect(mockAuthService.authenticateWithWallet).toHaveBeenCalledWith(validWalletAuthRequest);
    });

    it('should return 401 for authentication failure', async () => {
      mockAuthService.authenticateWithWallet.mockRejectedValue(new Error('Invalid signature'));

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(validWalletAuthRequest)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication failed');
    });

    it('should return 400 for invalid wallet address', async () => {
      const invalidRequest = {
        ...validWalletAuthRequest,
        walletAddress: 'invalid-address',
      };

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Validation error');
    });

    it('should return 400 for missing signatures', async () => {
      const invalidRequest = {
        ...validWalletAuthRequest,
        signatures: [],
      };

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('At least one signature is required');
    });

    it('should return 400 for short message', async () => {
      const invalidRequest = {
        ...validWalletAuthRequest,
        message: 'short',
      };

      const response = await request(app)
        .post('/api/auth/wallet')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication message too short');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshResult = {
        user: mockUser,
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockAuthService.refreshToken.mockResolvedValue(refreshResult);

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBe('new-access-token');
      expect(response.body.data.refreshToken).toBe('new-refresh-token');
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return 401 for invalid refresh token', async () => {
      mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token refresh failed');
    });

    it('should return 400 for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Refresh token is required');
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should verify token successfully', async () => {
      mockAuthService.verifyToken.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.user.id).toBe(mockUser.id);
      expect(mockAuthService.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should return 401 for invalid token', async () => {
      mockAuthService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token verification failed');
    });

    it('should return 401 for missing authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header required');
    });

    it('should return 401 for malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token required');
    });
  });

  describe('Protected routes', () => {
    beforeEach(() => {
      // Mock successful token verification for protected routes
      mockAuthService.verifyToken.mockResolvedValue(mockUser);
    });

    describe('GET /api/auth/profile', () => {
      it('should get user profile successfully', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.id).toBe(mockUser.id);
        expect(response.body.data.user.walletAddress).toBe(mockUser.walletAddress);
      });

      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/auth/profile')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Authorization header required');
      });
    });

    describe('PUT /api/auth/profile', () => {
      it('should update user profile successfully', async () => {
        const updateData = {
          notificationPreferences: {
            email: 'test@example.com',
            pushEnabled: false,
          },
        };

        const updatedUser = { ...mockUser, ...updateData };
        mockAuthService.updateUserProfile.mockResolvedValue(updatedUser);

        const response = await request(app)
          .put('/api/auth/profile')
          .set('Authorization', 'Bearer valid-token')
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockAuthService.updateUserProfile).toHaveBeenCalledWith(mockUser.id, updateData);
      });

      it('should return 400 for empty update data', async () => {
        const response = await request(app)
          .put('/api/auth/profile')
          .set('Authorization', 'Bearer valid-token')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('At least one field must be provided');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should logout successfully', async () => {
        mockAuthService.logout.mockResolvedValue();

        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', 'Bearer valid-token')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('Logged out successfully');
        expect(mockAuthService.logout).toHaveBeenCalledWith(mockUser.id);
      });
    });
  });
});