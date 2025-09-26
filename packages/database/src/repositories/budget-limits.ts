import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export interface BudgetLimits {
  id: string;
  userId: string;
  dailySpendingCap: number;
  weeklySpendingCap: number;
  monthlySpendingCap: number;
  maxPricePerMoment: number;
  totalBudgetLimit: number;
  emergencyStopThreshold: number;
  reserveAmount: number;
  autoRebalance: boolean;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export class BudgetLimitsRepository extends BaseRepository<BudgetLimits> {
  constructor(db: DatabaseConnection) {
    super(db, 'budget_limits');
  }

  public async findByUserId(userId: string, client?: PoolClient): Promise<BudgetLimits | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE user_id = $1`;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async createBudgetLimits(budgetLimits: Omit<BudgetLimits, 'createdAt' | 'updatedAt'>, client?: PoolClient): Promise<BudgetLimits> {
    const data = this.toSnakeCaseObject(budgetLimits);
    data.created_at = new Date();
    data.updated_at = new Date();
    
    return this.create(data, client);
  }

  public async updateBudgetLimits(id: string, updates: Partial<BudgetLimits>, client?: PoolClient): Promise<BudgetLimits | null> {
    const data = this.toSnakeCaseObject(updates);
    data.updated_at = new Date();
    
    return this.update(id, data, client);
  }

  public async findActiveByUserId(userId: string, client?: PoolClient): Promise<BudgetLimits | null> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 1
    `;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  protected mapRowToEntity(row: any): BudgetLimits {
    return {
      id: row.id,
      userId: row.user_id,
      dailySpendingCap: parseFloat(row.daily_spending_cap),
      weeklySpendingCap: parseFloat(row.weekly_spending_cap),
      monthlySpendingCap: parseFloat(row.monthly_spending_cap),
      maxPricePerMoment: parseFloat(row.max_price_per_moment),
      totalBudgetLimit: parseFloat(row.total_budget_limit),
      emergencyStopThreshold: parseFloat(row.emergency_stop_threshold),
      reserveAmount: parseFloat(row.reserve_amount),
      autoRebalance: row.auto_rebalance,
      currency: row.currency,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}