import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export interface EmergencyStopCondition {
  type: 'loss_threshold' | 'drawdown_limit' | 'volatility_spike' | 'liquidity_crisis' | 'external_signal';
  threshold: number;
  currentValue: number;
  breached: boolean;
}

export interface EmergencyStopImpact {
  strategiesPaused: string[];
  transactionsCancelled: string[];
  ordersModified: string[];
  estimatedLossPrevented: number;
}

export interface EmergencyStop {
  id: string;
  userId: string;
  triggeredBy: string; // system, user, or external
  reason: string;
  triggerConditions: EmergencyStopCondition[];
  isActive: boolean;
  triggeredAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  impact: EmergencyStopImpact;
}

export interface EmergencyStopUpdateData {
  isActive?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  reason?: string;
  triggerConditions?: EmergencyStopCondition[];
  impact?: EmergencyStopImpact;
}

export class EmergencyStopRepository extends BaseRepository<EmergencyStop> {
  constructor(db: DatabaseConnection) {
    super(db, 'emergency_stops');
  }

  public async findByUserId(userId: string, client?: PoolClient): Promise<EmergencyStop[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 
      ORDER BY triggered_at DESC
    `;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async findActiveByUserId(userId: string, client?: PoolClient): Promise<EmergencyStop[]> {
    const query = `
      SELECT * FROM ${this.tableName} 
      WHERE user_id = $1 AND is_active = true 
      ORDER BY triggered_at DESC
    `;
    const result = client 
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async createEmergencyStop(emergencyStop: EmergencyStop, client?: PoolClient): Promise<EmergencyStop> {
    const data = this.toSnakeCaseObject(emergencyStop);
    data.trigger_conditions = JSON.stringify(emergencyStop.triggerConditions);
    data.impact = JSON.stringify(emergencyStop.impact);
    
    return this.create(data, client);
  }

  public async resolveEmergencyStop(
    id: string, 
    resolvedBy: string, 
    client?: PoolClient
  ): Promise<EmergencyStop | null> {
    const updates: EmergencyStopUpdateData = {
      isActive: false,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy,
    };
    
    return this.update(id, this.toSnakeCaseObject(updates), client);
  }

  public async countActiveStops(userId: string, client?: PoolClient): Promise<number> {
    return this.count('user_id = $1 AND is_active = true', [userId], client);
  }

  public async updateEmergencyStop(
    id: string,
    updates: EmergencyStopUpdateData,
    client?: PoolClient
  ): Promise<EmergencyStop | null> {
    // Handle JSON fields that need special serialization
    const updateData = { ...updates };
    if (updateData.triggerConditions) {
      (updateData as any).trigger_conditions = JSON.stringify(updateData.triggerConditions);
      delete updateData.triggerConditions;
    }
    if (updateData.impact) {
      (updateData as any).impact = JSON.stringify(updateData.impact);
      delete (updateData as any).impact;
    }
    
    return this.update(id, this.toSnakeCaseObject(updateData), client);
  }

  public async findById(id: string, client?: PoolClient): Promise<EmergencyStop | null> {
    return super.findById(id, client);
  }

  protected mapRowToEntity(row: any): EmergencyStop {
    return {
      id: row.id,
      userId: row.user_id,
      triggeredBy: row.triggered_by,
      reason: row.reason,
      triggerConditions: row.trigger_conditions ? JSON.parse(row.trigger_conditions) : [],
      isActive: row.is_active,
      triggeredAt: new Date(row.triggered_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolvedBy: row.resolved_by,
      impact: row.impact ? JSON.parse(row.impact) : {
        strategiesPaused: [],
        transactionsCancelled: [],
        ordersModified: [],
        estimatedLossPrevented: 0,
      },
    };
  }
}