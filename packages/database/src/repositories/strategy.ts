import { Strategy, StrategyParameters, StrategyPerformance } from '@fastbreak/types';
import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export interface StrategyRow {
  id: string;
  user_id: string;
  type: string;
  parameters: any;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class StrategyRepository extends BaseRepository<Strategy> {
  constructor(db: DatabaseConnection) {
    super(db, 'strategies');
  }

  protected mapRowToEntity(row: StrategyRow): Strategy {
    return {
      id: row.id,
      type: row.type as 'rookie_risers' | 'post_game_spikes' | 'arbitrage_mode',
      parameters: row.parameters,
      isActive: row.is_active,
      performance: {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        averageReturn: 0,
      },
    };
  }

  public async createStrategy(
    userId: string,
    type: string,
    parameters: StrategyParameters
  ): Promise<Strategy> {
    return this.db.transaction(async (client) => {
      // Create strategy
      const strategyResult = await client.query(`
        INSERT INTO strategies (user_id, type, parameters)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userId, type, JSON.stringify(parameters)]);

      const strategy = this.mapRowToEntity(strategyResult.rows[0]);

      // Initialize performance tracking
      await client.query(`
        INSERT INTO strategy_performance (strategy_id)
        VALUES ($1)
      `, [strategy.id]);

      return strategy;
    });
  }

  public async getStrategiesByUser(userId: string): Promise<Strategy[]> {
    const result = await this.db.query(`
      SELECT s.*, sp.total_trades, sp.successful_trades, sp.total_profit, sp.average_return, sp.last_executed
      FROM strategies s
      LEFT JOIN strategy_performance sp ON s.id = sp.strategy_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `, [userId]);

    return result.rows.map((row: any) => ({
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
  }

  public async getActiveStrategiesByUser(userId: string): Promise<Strategy[]> {
    const result = await this.db.query(`
      SELECT s.*, sp.total_trades, sp.successful_trades, sp.total_profit, sp.average_return, sp.last_executed
      FROM strategies s
      LEFT JOIN strategy_performance sp ON s.id = sp.strategy_id
      WHERE s.user_id = $1 AND s.is_active = true
      ORDER BY s.created_at DESC
    `, [userId]);

    return result.rows.map((row: any) => ({
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
  }

  public async updateStrategy(
    strategyId: string,
    parameters: StrategyParameters
  ): Promise<Strategy | null> {
    const result = await this.db.query(`
      UPDATE strategies 
      SET parameters = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(parameters), strategyId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async toggleStrategy(strategyId: string, isActive: boolean): Promise<Strategy | null> {
    const result = await this.db.query(`
      UPDATE strategies 
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [isActive, strategyId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async updateStrategyPerformance(
    strategyId: string,
    tradeSuccessful: boolean,
    profit: number
  ): Promise<void> {
    await this.db.query(`
      UPDATE strategy_performance 
      SET 
        total_trades = total_trades + 1,
        successful_trades = successful_trades + CASE WHEN $2 THEN 1 ELSE 0 END,
        total_profit = total_profit + $3,
        average_return = (total_profit + $3) / (total_trades + 1),
        last_executed = NOW(),
        updated_at = NOW()
      WHERE strategy_id = $1
    `, [strategyId, tradeSuccessful, profit]);
  }

  public async getStrategyPerformance(strategyId: string): Promise<StrategyPerformance | null> {
    const result = await this.db.query(`
      SELECT * FROM strategy_performance WHERE strategy_id = $1
    `, [strategyId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      totalTrades: row.total_trades,
      successfulTrades: row.successful_trades,
      totalProfit: parseFloat(row.total_profit),
      averageReturn: parseFloat(row.average_return),
      lastExecuted: row.last_executed,
    };
  }

  public async deleteStrategy(strategyId: string): Promise<boolean> {
    return this.db.transaction(async (client) => {
      // Delete performance record first
      await client.query('DELETE FROM strategy_performance WHERE strategy_id = $1', [strategyId]);
      
      // Delete strategy
      const result = await client.query('DELETE FROM strategies WHERE id = $1', [strategyId]);
      
      return (result.rowCount || 0) > 0;
    });
  }
}