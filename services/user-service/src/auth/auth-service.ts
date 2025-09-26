import { User } from '@fastbreak/types';
import { DatabaseManager } from '@fastbreak/database';
import { JWTService, JWTPayload } from './jwt';
import { FlowWalletService, FlowWalletSignature } from './flow-wallet';
import { generateId } from '@fastbreak/shared';

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface WalletAuthRequest {
  walletAddress: string;
  message: string;
  signatures: FlowWalletSignature[];
}

export class AuthService {
  private db: DatabaseManager;
  private jwtService: JWTService;
  private flowWalletService: FlowWalletService;

  constructor(
    db: DatabaseManager,
    jwtSecret: string,
    flowNetwork?: string,
    accessNode?: string
  ) {
    this.db = db;
    this.jwtService = new JWTService(jwtSecret);
    this.flowWalletService = new FlowWalletService(flowNetwork, accessNode);
  }

  public async authenticateWithWallet(request: WalletAuthRequest): Promise<AuthResult> {
    const { walletAddress, message, signatures } = request;

    // Validate wallet address format
    if (!this.flowWalletService.isValidFlowAddress(walletAddress)) {
      throw new Error('Invalid Flow wallet address format');
    }

    // Verify the signature
    const isValidSignature = await this.flowWalletService.verifySignature(
      message,
      signatures,
      walletAddress
    );

    if (!isValidSignature) {
      throw new Error('Invalid wallet signature');
    }

    // Verify the message contains expected content (timestamp, nonce, etc.)
    if (!this.isValidAuthMessage(message)) {
      throw new Error('Invalid authentication message');
    }

    // Find or create user
    let user = await this.db.users.findByWalletAddress(walletAddress);
    
    if (!user) {
      // Create new user
      user = await this.db.users.createUser(walletAddress);
    } else {
      // Update last active timestamp
      await this.db.users.updateLastActive(user.id);
    }

    // Load full user details
    const fullUser = await this.db.users.getUserWithDetails(user.id);
    if (!fullUser) {
      throw new Error('Failed to load user details');
    }

    // Generate tokens
    const accessToken = this.jwtService.generateToken(fullUser);
    const refreshToken = this.jwtService.generateRefreshToken(fullUser);

    return {
      user: fullUser,
      accessToken,
      refreshToken,
    };
  }

  public async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verifyRefreshToken(refreshToken);

      // Get user from database
      const user = await this.db.users.getUserWithDetails(payload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Update last active
      await this.db.users.updateLastActive(user.id);

      // Generate new tokens
      const newAccessToken = this.jwtService.generateToken(user);
      const newRefreshToken = this.jwtService.generateRefreshToken(user);

      return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error}`);
    }
  }

  public async verifyToken(token: string): Promise<User> {
    try {
      const payload = this.jwtService.verifyToken(token);
      
      const user = await this.db.users.getUserWithDetails(payload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw new Error(`Token verification failed: ${error}`);
    }
  }

  public async logout(userId: string): Promise<void> {
    // Update last active timestamp
    await this.db.users.updateLastActive(userId);
    
    // In a production system, you might want to blacklist the token
    // For now, we'll just update the user's last active time
  }

  public async getWalletBalance(walletAddress: string): Promise<string> {
    try {
      return await this.flowWalletService.getAccountBalance(walletAddress);
    } catch (error) {
      throw new Error(`Failed to get wallet balance: ${error}`);
    }
  }

  public async getWalletInfo(walletAddress: string): Promise<any> {
    try {
      return await this.flowWalletService.getAccountInfo(walletAddress);
    } catch (error) {
      throw new Error(`Failed to get wallet info: ${error}`);
    }
  }

  public generateAuthMessage(): string {
    const timestamp = Date.now();
    const nonce = generateId();
    
    return `FastBreak Authentication
    
Please sign this message to authenticate with FastBreak.

Timestamp: ${timestamp}
Nonce: ${nonce}

This request will not trigger any blockchain transaction or cost any gas fees.`;
  }

  private isValidAuthMessage(message: string): boolean {
    // Check if message contains required components
    if (!message.includes('FastBreak Authentication')) {
      return false;
    }

    // Extract timestamp from message
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (!timestampMatch) {
      return false;
    }

    const timestamp = parseInt(timestampMatch[1]);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    // Check if message is not older than 5 minutes
    if (now - timestamp > fiveMinutes) {
      return false;
    }

    // Check if message has nonce
    const nonceMatch = message.match(/Nonce: ([a-f0-9-]+)/);
    if (!nonceMatch) {
      return false;
    }

    return true;
  }

  public async updateUserProfile(
    userId: string,
    updates: {
      notificationPreferences?: {
        email?: string;
        pushEnabled?: boolean;
        tradeNotifications?: boolean;
        budgetAlerts?: boolean;
        systemAlerts?: boolean;
      };
      budgetLimits?: {
        dailySpendingCap?: number;
        maxPricePerMoment?: number;
        totalBudgetLimit?: number;
        emergencyStopThreshold?: number;
      };
    }
  ): Promise<User> {
    return this.db.getConnection().transaction(async (client) => {
      // Update notification preferences if provided
      if (updates.notificationPreferences) {
        const prefs = updates.notificationPreferences;
        await client.query(`
          UPDATE notification_preferences 
          SET 
            email = COALESCE($2, email),
            push_enabled = COALESCE($3, push_enabled),
            trade_notifications = COALESCE($4, trade_notifications),
            budget_alerts = COALESCE($5, budget_alerts),
            system_alerts = COALESCE($6, system_alerts),
            updated_at = NOW()
          WHERE user_id = $1
        `, [
          userId,
          prefs.email,
          prefs.pushEnabled,
          prefs.tradeNotifications,
          prefs.budgetAlerts,
          prefs.systemAlerts,
        ]);
      }

      // Update budget limits if provided
      if (updates.budgetLimits) {
        const limits = updates.budgetLimits;
        await client.query(`
          UPDATE budget_limits 
          SET 
            daily_spending_cap = COALESCE($2, daily_spending_cap),
            max_price_per_moment = COALESCE($3, max_price_per_moment),
            total_budget_limit = COALESCE($4, total_budget_limit),
            emergency_stop_threshold = COALESCE($5, emergency_stop_threshold),
            updated_at = NOW()
          WHERE user_id = $1
        `, [
          userId,
          limits.dailySpendingCap,
          limits.maxPricePerMoment,
          limits.totalBudgetLimit,
          limits.emergencyStopThreshold,
        ]);
      }

      // Return updated user
      const updatedUser = await this.db.users.getUserWithDetails(userId);
      if (!updatedUser) {
        throw new Error('Failed to load updated user');
      }

      return updatedUser;
    });
  }
}