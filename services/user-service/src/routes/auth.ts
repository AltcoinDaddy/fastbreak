import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/auth-service';
import { AuthMiddleware, RateLimitMiddleware } from '../middleware/auth';
import { 
  validate, 
  walletAuthSchema, 
  refreshTokenSchema, 
  updateProfileSchema,
  validateWalletAddress 
} from '../validation/auth';
import { createSuccessResponse, createErrorResponse } from '@fastbreak/shared';

export class AuthRoutes {
  private router: Router;
  private authService: AuthService;
  private authMiddleware: AuthMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;

  constructor(authService: AuthService) {
    this.router = Router();
    this.authService = authService;
    this.authMiddleware = new AuthMiddleware(authService);
    this.rateLimitMiddleware = new RateLimitMiddleware();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Generate authentication message
    this.router.get('/auth/message', 
      this.rateLimitMiddleware.apiRateLimit,
      this.generateAuthMessage.bind(this)
    );

    // Authenticate with wallet signature
    this.router.post('/auth/wallet',
      this.rateLimitMiddleware.authRateLimit,
      validate(walletAuthSchema),
      this.authenticateWallet.bind(this)
    );

    // Refresh access token
    this.router.post('/auth/refresh',
      this.rateLimitMiddleware.authRateLimit,
      validate(refreshTokenSchema),
      this.refreshToken.bind(this)
    );

    // Logout
    this.router.post('/auth/logout',
      this.authMiddleware.authenticate,
      this.logout.bind(this)
    );

    // Get current user profile
    this.router.get('/auth/profile',
      this.rateLimitMiddleware.apiRateLimit,
      this.authMiddleware.authenticate,
      this.getProfile.bind(this)
    );

    // Update user profile
    this.router.put('/auth/profile',
      this.rateLimitMiddleware.apiRateLimit,
      this.authMiddleware.authenticate,
      validate(updateProfileSchema),
      this.updateProfile.bind(this)
    );

    // Get wallet balance
    this.router.get('/auth/wallet/:walletAddress/balance',
      this.rateLimitMiddleware.apiRateLimit,
      this.authMiddleware.authenticate,
      validateWalletAddress,
      this.getWalletBalance.bind(this)
    );

    // Get wallet info
    this.router.get('/auth/wallet/:walletAddress/info',
      this.rateLimitMiddleware.apiRateLimit,
      this.authMiddleware.authenticate,
      validateWalletAddress,
      this.getWalletInfo.bind(this)
    );

    // Verify token (for other services)
    this.router.post('/auth/verify',
      this.rateLimitMiddleware.apiRateLimit,
      this.verifyToken.bind(this)
    );
  }

  private async generateAuthMessage(req: Request, res: Response): Promise<void> {
    try {
      const message = this.authService.generateAuthMessage();
      res.json(createSuccessResponse({ message }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Failed to generate auth message: ${error}`));
    }
  }

  private async authenticateWallet(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress, message, signatures } = req.body;
      
      const result = await this.authService.authenticateWithWallet({
        walletAddress,
        message,
        signatures,
      });

      res.json(createSuccessResponse({
        user: {
          id: result.user.id,
          walletAddress: result.user.walletAddress,
          strategies: result.user.strategies,
          budgetLimits: result.user.budgetLimits,
          notificationPreferences: result.user.notificationPreferences,
          createdAt: result.user.createdAt,
          lastActive: result.user.lastActive,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
    } catch (error) {
      res.status(401).json(createErrorResponse(`Authentication failed: ${error}`));
    }
  }

  private async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      
      const result = await this.authService.refreshToken(refreshToken);

      res.json(createSuccessResponse({
        user: {
          id: result.user.id,
          walletAddress: result.user.walletAddress,
          strategies: result.user.strategies,
          budgetLimits: result.user.budgetLimits,
          notificationPreferences: result.user.notificationPreferences,
          createdAt: result.user.createdAt,
          lastActive: result.user.lastActive,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
    } catch (error) {
      res.status(401).json(createErrorResponse(`Token refresh failed: ${error}`));
    }
  }

  private async logout(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      await this.authService.logout(req.user.id);
      res.json(createSuccessResponse({ message: 'Logged out successfully' }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Logout failed: ${error}`));
    }
  }

  private async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      res.json(createSuccessResponse({
        user: {
          id: req.user.id,
          walletAddress: req.user.walletAddress,
          strategies: req.user.strategies,
          budgetLimits: req.user.budgetLimits,
          notificationPreferences: req.user.notificationPreferences,
          createdAt: req.user.createdAt,
          lastActive: req.user.lastActive,
        },
      }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Failed to get profile: ${error}`));
    }
  }

  private async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json(createErrorResponse('User not authenticated'));
        return;
      }

      const updatedUser = await this.authService.updateUserProfile(req.user.id, req.body);

      res.json(createSuccessResponse({
        user: {
          id: updatedUser.id,
          walletAddress: updatedUser.walletAddress,
          strategies: updatedUser.strategies,
          budgetLimits: updatedUser.budgetLimits,
          notificationPreferences: updatedUser.notificationPreferences,
          createdAt: updatedUser.createdAt,
          lastActive: updatedUser.lastActive,
        },
      }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Failed to update profile: ${error}`));
    }
  }

  private async getWalletBalance(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress } = req.params;
      
      // Verify user owns this wallet or has permission to view it
      if (req.user?.walletAddress !== walletAddress) {
        res.status(403).json(createErrorResponse('Access denied to wallet information'));
        return;
      }

      const balance = await this.authService.getWalletBalance(walletAddress);
      res.json(createSuccessResponse({ balance }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Failed to get wallet balance: ${error}`));
    }
  }

  private async getWalletInfo(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress } = req.params;
      
      // Verify user owns this wallet or has permission to view it
      if (req.user?.walletAddress !== walletAddress) {
        res.status(403).json(createErrorResponse('Access denied to wallet information'));
        return;
      }

      const walletInfo = await this.authService.getWalletInfo(walletAddress);
      res.json(createSuccessResponse({ walletInfo }));
    } catch (error) {
      res.status(500).json(createErrorResponse(`Failed to get wallet info: ${error}`));
    }
  }

  private async verifyToken(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        res.status(401).json(createErrorResponse('Authorization header required'));
        return;
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        res.status(401).json(createErrorResponse('Token required'));
        return;
      }

      const user = await this.authService.verifyToken(token);
      
      res.json(createSuccessResponse({
        valid: true,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
        },
      }));
    } catch (error) {
      res.status(401).json(createErrorResponse(`Token verification failed: ${error}`));
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}