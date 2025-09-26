import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export interface SpendingTracker {
  id: string;
  userId: string;
  date: Date;
  dailySpent: number;
  weeklySpent: number;
  monthlySpent: number;
  totalSpent: number;
  transactionCount: number;
  averageTransactionSize: number;
  largestTransaction: number;
  updatedAt: Date;
}

export class SpendingTrackerRepository extends BaseRepository<SpendingTracker> {
  constructor(db: DatabaseConnection) {
    super(db, 'spending_tracker');
  }

  public async findByUserId(userId: string, client?: PoolClient): Promise<SpendingTracker | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE user_id = $1 ORDER BY date DESC LIMIT 1`;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async findByUserIdAndDate(userId: string, date: Date, client?: PoolClient): Promise<SpendingTracker | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND date::date = $2::date`;
    const result = client 
      ? await client.query(query, [userId, date])
      : await this.db.query(query, [userId, date]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async createSpendingTracker(tracker: Omit<SpendingTracker, 'updatedAt'>, client?: PoolClient): Promise<SpendingTracker> {
    const data = this.toSnakeCaseObject(tracker);
    data.updated_at = new Date();
    
    return this.create(data, client);
  }

  public async updateSpendingTracker(id: string, updates: Partial<SpendingTracker>, client?: PoolClient): Promise<SpendingTracker | null> {
    const data = this.toSnakeCaseObject(updates);
    data.updated_at = new Date();
    
    return this.update(id, data, client);
  }

  public async resetDailySpending(userId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE ${this.tableName} 
      SET daily_spent = 0, updated_at = NOW() 
      WHERE user_id = $1 AND date::date = CURRENT_DATE
    `;
    
    if (client) {
      await client.query(query, [userId]);
    } else {
      await this.db.query(query, [userId]);
    }
  }

  public async resetWeeklySpending(userId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE ${this.tableName} 
      SET weekly_spent = 0, updated_at = NOW() 
      WHERE user_id = $1 AND date >= date_trunc('week', CURRENT_DATE)
    `;
    
    if (client) {
      await client.query(query, [userId]);
    } else {
      await this.db.query(query, [userId]);
    }
  }

  public async resetMonthlySpending(userId: string, client?: PoolClient): Promise<void> {
    const query = `
      UPDATE ${this.tableName} 
      SET monthly_spent = 0, updated_at = NOW() 
      WHERE user_id = $1 AND date >= date_trunc('month', CURRENT_DATE)
    `;
    
    if (client) {
      await client.query(query, [userId]);
    } else {
      await this.db.query(query, [userId]);
    }
  }

  public async getSpendingHistory(
    userId: string, 
    startDate: Date, 
    endDate: Date, 
    client?: PoolClient
  ): Promise<SpendingTracker[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 AND date BETWEEN $2 AND $3 
      ORDER BY date DESC
    `;
    const result = client 
      ? await client.query(query, [userId, startDate, endDate])
      : await this.db.query(query, [userId, startDate, endDate]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  protected mapRowToEntity(row: any): SpendingTracker {
    return {
      id: row.id,
      userId: row.user_id,
      date: new Date(row.date),
      dailySpent: parseFloat(row.daily_spent),
      weeklySpent: parseFloat(row.weekly_spent),
      monthlySpent: parseFloat(row.monthly_spent),
      totalSpent: parseFloat(row.total_spent),
      transactionCount: parseInt(row.transaction_count),
      averageTransactionSize: parseFloat(row.average_transaction_size),
      largestTransaction: parseFloat(row.largest_transaction),
      updatedAt: new Date(row.updated_at),
    };
  }
}