import { Trade } from '@fastbreak/types';
import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';

export interface TradeRow {
  id: string;
  user_id: string;
  moment_id: string;
  action: string;
  price: number;
  reasoning: string;
  strategy_used: string;
  profit_loss: number | null;
  transaction_hash: string;
  created_at: Date;
}

export class TradeRepository extends BaseRepository<Trade> {
  constructor(db: DatabaseConnection) {
    super(db, 'trades');
  }

  protected mapRowToEntity(row: TradeRow): Trade {
    return {
      id: row.id,
      userId: row.user_id,
      momentId: row.moment_id,
      action: row.action as 'buy' | 'sell',
      price: parseFloat(row.price?.toString() || '0'),
      timestamp: row.created_at,
      reasoning: row.reasoning,
      strategyUsed: row.strategy_used,
      profitLoss: row.profit_loss !== null && row.profit_loss !== undefined ? parseFloat(row.profit_loss.toString()) : undefined,
      transactionHash: row.transaction_hash,
    };
  }

  public async createTrade(tradeData: Omit<Trade, 'id' | 'timestamp'>): Promise<Trade> {
    const result = await this.db.query(`
      INSERT INTO trades (
        user_id, moment_id, action, price, reasoning, 
        strategy_used, profit_loss, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tradeData.userId,
      tradeData.momentId,
      tradeData.action,
      tradeData.price,
      tradeData.reasoning,
      tradeData.strategyUsed,
      tradeData.profitLoss,
      tradeData.transactionHash,
    ]);

    return this.mapRowToEntity(result.rows[0]);
  }

  public async getTradesByUser(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ trades: Trade[]; total: number }> {
    const [tradesResult, countResult] = await Promise.all([
      this.db.query(`
        SELECT t.*, m.player_name, m.moment_type, m.serial_number
        FROM trades t
        JOIN moments m ON t.moment_id = m.id
        WHERE t.user_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, limit, offset]),
      this.count('user_id = $1', [userId])
    ]);

    const trades = tradesResult.rows.map((row: any) => ({
      ...this.mapRowToEntity(row),
      momentDetails: {
        playerName: row.player_name,
        momentType: row.moment_type,
        serialNumber: row.serial_number,
      },
    }));

    return { trades, total: countResult };
  }

  public async getTradesByMoment(momentId: string): Promise<Trade[]> {
    const result = await this.findByCondition(
      'moment_id = $1 ORDER BY created_at DESC',
      [momentId]
    );
    return result;
  }

  public async getTradesByStrategy(strategyId: string, limit = 100): Promise<Trade[]> {
    const result = await this.findByCondition(
      'strategy_used = $1 ORDER BY created_at DESC LIMIT $2',
      [strategyId, limit]
    );
    return result;
  }

  public async updateTradeProfit(tradeId: string, profitLoss: number): Promise<Trade | null> {
    const result = await this.db.query(`
      UPDATE trades 
      SET profit_loss = $1
      WHERE id = $2
      RETURNING *
    `, [profitLoss, tradeId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async getUserTradingStats(userId: string, days = 30): Promise<any> {
    const result = await this.db.query(`
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN action = 'buy' THEN 1 END) as total_buys,
        COUNT(CASE WHEN action = 'sell' THEN 1 END) as total_sells,
        COUNT(CASE WHEN profit_loss > 0 THEN 1 END) as profitable_trades,
        COALESCE(SUM(CASE WHEN action = 'buy' THEN price ELSE 0 END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN action = 'sell' THEN price ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(profit_loss), 0) as total_profit,
        COALESCE(AVG(profit_loss), 0) as average_profit,
        COUNT(DISTINCT moment_id) as unique_moments
      FROM trades 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '$2 days'
    `, [userId, days]);

    const stats = result.rows[0];
    return {
      totalTrades: parseInt(stats.total_trades),
      totalBuys: parseInt(stats.total_buys),
      totalSells: parseInt(stats.total_sells),
      profitableTrades: parseInt(stats.profitable_trades),
      successRate: stats.total_trades > 0 ? (stats.profitable_trades / stats.total_trades) * 100 : 0,
      totalSpent: parseFloat(stats.total_spent),
      totalEarned: parseFloat(stats.total_earned),
      totalProfit: parseFloat(stats.total_profit),
      averageProfit: parseFloat(stats.average_profit),
      uniqueMoments: parseInt(stats.unique_moments),
    };
  }

  public async getRecentTrades(limit = 20): Promise<Trade[]> {
    const result = await this.db.query(`
      SELECT t.*, m.player_name, m.moment_type, m.serial_number, u.wallet_address
      FROM trades t
      JOIN moments m ON t.moment_id = m.id
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map((row: any) => ({
      ...this.mapRowToEntity(row),
      momentDetails: {
        playerName: row.player_name,
        momentType: row.moment_type,
        serialNumber: row.serial_number,
      },
      userWallet: row.wallet_address,
    }));
  }

  public async getDailySpending(userId: string, date?: Date): Promise<number> {
    const targetDate = date || new Date();
    const result = await this.db.query(`
      SELECT COALESCE(SUM(price), 0) as daily_spending
      FROM trades 
      WHERE user_id = $1 
        AND action = 'buy'
        AND DATE(created_at) = DATE($2)
    `, [userId, targetDate]);

    return parseFloat(result.rows[0].daily_spending);
  }
}