import { Moment } from '@fastbreak/types';
import { BaseRepository } from './base';
import { DatabaseConnection } from '../connection';

export interface MomentRow {
  id: string;
  player_id: string;
  player_name: string;
  game_date: Date;
  moment_type: string;
  serial_number: number;
  current_price: number;
  ai_valuation: number;
  confidence: number;
  marketplace_id: string;
  scarcity_rank: number;
  created_at: Date;
  updated_at: Date;
}

export class MomentRepository extends BaseRepository<Moment> {
  constructor(db: DatabaseConnection) {
    super(db, 'moments');
  }

  protected mapRowToEntity(row: MomentRow): Moment {
    return {
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      gameDate: row.game_date,
      momentType: row.moment_type,
      serialNumber: row.serial_number,
      currentPrice: parseFloat(row.current_price?.toString() || '0'),
      aiValuation: parseFloat(row.ai_valuation?.toString() || '0'),
      confidence: parseFloat(row.confidence?.toString() || '0'),
      marketplaceId: row.marketplace_id,
      scarcityRank: row.scarcity_rank,
    };
  }

  public async createOrUpdateMoment(momentData: Omit<Moment, 'id'>): Promise<Moment> {
    const result = await this.db.query(`
      INSERT INTO moments (
        id, player_id, player_name, game_date, moment_type, 
        serial_number, current_price, ai_valuation, confidence, 
        marketplace_id, scarcity_rank
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        ai_valuation = EXCLUDED.ai_valuation,
        confidence = EXCLUDED.confidence,
        updated_at = NOW()
      RETURNING *
    `, [
      `${momentData.playerId}_${momentData.serialNumber}`, // Generate ID
      momentData.playerId,
      momentData.playerName,
      momentData.gameDate,
      momentData.momentType,
      momentData.serialNumber,
      momentData.currentPrice,
      momentData.aiValuation,
      momentData.confidence,
      momentData.marketplaceId,
      momentData.scarcityRank,
    ]);

    return this.mapRowToEntity(result.rows[0]);
  }

  public async getMomentsByPlayer(playerId: string, limit = 50): Promise<Moment[]> {
    const result = await this.findByCondition(
      'player_id = $1 ORDER BY game_date DESC LIMIT $2',
      [playerId, limit]
    );
    return result;
  }

  public async getUndervaluedMoments(
    confidenceThreshold = 0.7,
    limit = 100
  ): Promise<Moment[]> {
    const result = await this.db.query(`
      SELECT * FROM moments 
      WHERE ai_valuation > current_price 
        AND confidence >= $1 
        AND current_price > 0
      ORDER BY (ai_valuation - current_price) DESC, confidence DESC
      LIMIT $2
    `, [confidenceThreshold, limit]);

    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async getMomentsByMarketplace(marketplaceId: string, limit = 100): Promise<Moment[]> {
    const result = await this.findByCondition(
      'marketplace_id = $1 ORDER BY updated_at DESC LIMIT $2',
      [marketplaceId, limit]
    );
    return result;
  }

  public async updateMomentPrice(momentId: string, newPrice: number): Promise<Moment | null> {
    const result = await this.db.query(`
      UPDATE moments 
      SET current_price = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newPrice, momentId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async updateMomentValuation(
    momentId: string,
    aiValuation: number,
    confidence: number
  ): Promise<Moment | null> {
    const result = await this.db.query(`
      UPDATE moments 
      SET ai_valuation = $1, confidence = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [aiValuation, confidence, momentId]);

    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async searchMoments(
    searchTerm: string,
    filters?: {
      minPrice?: number;
      maxPrice?: number;
      minConfidence?: number;
      marketplaceId?: string;
    },
    limit = 50
  ): Promise<Moment[]> {
    let query = `
      SELECT * FROM moments 
      WHERE (player_name ILIKE $1 OR moment_type ILIKE $1)
    `;
    const params: any[] = [`%${searchTerm}%`];
    let paramIndex = 2;

    if (filters?.minPrice !== undefined) {
      query += ` AND current_price >= $${paramIndex}`;
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters?.maxPrice !== undefined) {
      query += ` AND current_price <= $${paramIndex}`;
      params.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters?.minConfidence !== undefined) {
      query += ` AND confidence >= $${paramIndex}`;
      params.push(filters.minConfidence);
      paramIndex++;
    }

    if (filters?.marketplaceId) {
      query += ` AND marketplace_id = $${paramIndex}`;
      params.push(filters.marketplaceId);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  public async getMomentPriceHistory(momentId: string, days = 30): Promise<any[]> {
    // This would typically join with a price_history table
    // For now, we'll return the current moment data
    const moment = await this.findById(momentId);
    return moment ? [{ date: new Date(), price: moment.currentPrice }] : [];
  }
}