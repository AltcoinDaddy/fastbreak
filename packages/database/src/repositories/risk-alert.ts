import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export type RiskAlertType = 
  | 'budget_exceeded'
  | 'daily_limit_reached'
  | 'concentration_risk'
  | 'drawdown_exceeded'
  | 'volatility_spike'
  | 'correlation_increase'
  | 'liquidity_risk'
  | 'stop_loss_triggered'
  | 'emergency_stop'
  | 'suspicious_activity';

export interface RiskAlert {
  id: string;
  userId: string;
  type: RiskAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  threshold: number;
  currentValue: number;
  triggered: boolean;
  triggeredAt?: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  autoResolve: boolean;
  resolutionAction?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export class RiskAlertRepository extends BaseRepository<RiskAlert> {
  constructor(db: DatabaseConnection) {
    super(db, 'risk_alerts');
  }

  public async findByUserId(userId: string, limit = 50, offset = 0, client?: PoolClient): Promise<RiskAlert[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = client 
      ? await client.query(query, [userId, limit, offset])
      : await this.db.query(query, [userId, limit, offset]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async findActiveByUserId(userId: string, client?: PoolClient): Promise<RiskAlert[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 AND triggered = true AND acknowledged = false 
      ORDER BY created_at DESC
    `;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async findByType(userId: string, type: RiskAlertType, client?: PoolClient): Promise<RiskAlert[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 AND type = $2 
      ORDER BY created_at DESC
    `;
    const result = client 
      ? await client.query(query, [userId, type])
      : await this.db.query(query, [userId, type]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async createRiskAlert(alert: Omit<RiskAlert, 'createdAt'>, client?: PoolClient): Promise<RiskAlert> {
    const data = this.toSnakeCaseObject(alert);
    data.created_at = new Date();
    data.metadata = JSON.stringify(alert.metadata);
    
    return this.create(data, client);
  }

  public async acknowledgeAlert(id: string, client?: PoolClient): Promise<RiskAlert | null> {
    const updates = {
      acknowledged: true,
      acknowledged_at: new Date(),
    };
    
    return this.update(id, updates, client);
  }

  public async resolveAlert(id: string, resolutionAction: string, client?: PoolClient): Promise<RiskAlert | null> {
    const updates = {
      triggered: false,
      acknowledged: true,
      acknowledged_at: new Date(),
      resolution_action: resolutionAction,
    };
    
    return this.update(id, updates, client);
  }

  public async countActiveAlerts(userId: string, client?: PoolClient): Promise<number> {
    return this.count('user_id = $1 AND triggered = true AND acknowledged = false', [userId], client);
  }

  public async countAlertsByType(userId: string, type: RiskAlertType, client?: PoolClient): Promise<number> {
    return this.count('user_id = $1 AND type = $2', [userId, type], client);
  }

  protected mapRowToEntity(row: any): RiskAlert {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as RiskAlertType,
      severity: row.severity as 'low' | 'medium' | 'high' | 'critical',
      title: row.title,
      message: row.message,
      threshold: parseFloat(row.threshold),
      currentValue: parseFloat(row.current_value),
      triggered: row.triggered,
      triggeredAt: row.triggered_at ? new Date(row.triggered_at) : undefined,
      acknowledged: row.acknowledged,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      autoResolve: row.auto_resolve,
      resolutionAction: row.resolution_action,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      createdAt: new Date(row.created_at),
    };
  }
}