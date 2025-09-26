import { User, Strategy, BudgetLimits, NotificationSettings } from '@fastbreak/types';
import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export interface UserRow {
  id: string;
  wallet_address: string;
  created_at: Date;
  last_active: Date;
  updated_at: Date;
}

export class UserRepository extends BaseRepository<User> {
  constructor(db: DatabaseConnection) {
    super(db, 'users');
  }

  protected mapRowToEntity(row: UserRow): User {
    return {
      id: row.id,
      walletAddress: row.wallet_address,
      strategies: [], // Will be loaded separately
      budgetLimits: {} as BudgetLimits, // Will be loaded separately
      notificationPreferences: {} as NotificationSettings, // Will be loaded separately
      createdAt: row.created_at,
      lastActive: row.last_active,
    };
  }

  public async findByWalletAddress(walletAddress: string): Promise<User | null> {
    const result = await this.findByCondition('wallet_address = $1', [walletAddress]);
    return result.length > 0 ? result[0] : null;
  }

  public async createUser(walletAddress: string): Promise<User> {
    return this.db.transaction(async (client) => {
      // Create user
      const userResult = await client.query(
        'INSERT INTO users (wallet_address) VALUES ($1) RETURNING *',
        [walletAddress]
      );
      const user = this.mapRowToEntity(userResult.rows[0]);

      // Create default budget limits
      await client.query(`
        INSERT INTO budget_limits (user_id, daily_spending_cap, max_price_per_moment, total_budget_limit, emergency_stop_threshold)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, 1000.00, 500.00, 10000.00, 5000.00]);

      // Create default notification preferences
      await client.query(`
        INSERT INTO notification_preferences (user_id, push_enabled, trade_notifications, budget_alerts, system_alerts)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, true, true, true, true]);

      return user;
    });
  }

  public async getUserWithDetails(userId: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) return null;

    // Load strategies
    const strategiesResult = await this.db.query(`
      SELECT s.*, sp.total_trades, sp.successful_trades, sp.total_profit, sp.average_return, sp.last_executed
      FROM strategies s
      LEFT JOIN strategy_performance sp ON s.id = sp.strategy_id
      WHERE s.user_id = $1 AND s.is_active = true
    `, [userId]);

    user.strategies = strategiesResult.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      parameters: row.parameters,
      isActive: row.is_active,
      performance: {
        totalTrades: row.total_trades || 0,
        successfulTrades: row.successful_trades || 0,
        totalProfit: parseFloat(row.total_profit) || 0,
        averageReturn: parseFloat(row.average_return) || 0,
        lastExecuted: row.last_executed,
      },
    }));

    // Load budget limits
    const budgetResult = await this.db.query(
      'SELECT * FROM budget_limits WHERE user_id = $1',
      [userId]
    );
    if (budgetResult.rows.length > 0) {
      const budget = budgetResult.rows[0];
      user.budgetLimits = {
        dailySpendingCap: parseFloat(budget.daily_spending_cap),
        maxPricePerMoment: parseFloat(budget.max_price_per_moment),
        totalBudgetLimit: parseFloat(budget.total_budget_limit),
        emergencyStopThreshold: parseFloat(budget.emergency_stop_threshold),
      };
    }

    // Load notification preferences
    const notificationResult = await this.db.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    if (notificationResult.rows.length > 0) {
      const prefs = notificationResult.rows[0];
      user.notificationPreferences = {
        email: prefs.email,
        pushEnabled: prefs.push_enabled,
        tradeNotifications: prefs.trade_notifications,
        budgetAlerts: prefs.budget_alerts,
        systemAlerts: prefs.system_alerts,
      };
    }

    return user;
  }

  public async updateLastActive(userId: string): Promise<void> {
    await this.db.query(
      'UPDATE users SET last_active = NOW() WHERE id = $1',
      [userId]
    );
  }

  public async getUserStats(userId: string): Promise<any> {
    const result = await this.db.query(`
      SELECT 
        COUNT(t.id) as total_trades,
        COUNT(CASE WHEN t.profit_loss > 0 THEN 1 END) as profitable_trades,
        COALESCE(SUM(t.profit_loss), 0) as total_profit,
        COALESCE(AVG(t.profit_loss), 0) as average_profit,
        COUNT(CASE WHEN t.created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as trades_today,
        COALESCE(SUM(CASE WHEN t.created_at >= NOW() - INTERVAL '24 hours' THEN t.price ELSE 0 END), 0) as spent_today
      FROM trades t
      WHERE t.user_id = $1 AND t.action = 'buy'
    `, [userId]);

    return result.rows[0];
  }
}