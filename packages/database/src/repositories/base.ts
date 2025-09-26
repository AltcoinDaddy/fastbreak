import { DatabaseConnection } from '../connection';
import { PoolClient } from 'pg';

export abstract class BaseRepository<T> {
  protected db: DatabaseConnection;
  protected tableName: string;

  constructor(db: DatabaseConnection, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  protected async findById(id: string, client?: PoolClient): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = client 
      ? await client.query(query, [id])
      : await this.db.query(query, [id]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  public async findAll(limit = 100, offset = 0, client?: PoolClient): Promise<T[]> {
    const query = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const result = client
      ? await client.query(query, [limit, offset])
      : await this.db.query(query, [limit, offset]);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  protected async findByCondition(
    condition: string, 
    params: any[], 
    client?: PoolClient
  ): Promise<T[]> {
    const query = `SELECT * FROM ${this.tableName} WHERE ${condition}`;
    const result = client
      ? await client.query(query, params)
      : await this.db.query(query, params);
    
    return result.rows.map((row: any) => this.mapRowToEntity(row));
  }

  protected async create(data: Partial<T>, client?: PoolClient): Promise<T> {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
    const values = Object.values(data);

    const query = `
      INSERT INTO ${this.tableName} (${columns}) 
      VALUES (${placeholders}) 
      RETURNING *
    `;
    
    const result = client
      ? await client.query(query, values)
      : await this.db.query(query, values);
    
    return this.mapRowToEntity(result.rows[0]);
  }

  protected async update(id: string, data: Record<string, any>, client?: PoolClient): Promise<T | null> {
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    const values = [id, ...Object.values(data)];

    const query = `
      UPDATE ${this.tableName} 
      SET ${setClause}, updated_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    
    const result = client
      ? await client.query(query, values)
      : await this.db.query(query, values);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  protected async delete(id: string, client?: PoolClient): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = client
      ? await client.query(query, [id])
      : await this.db.query(query, [id]);
    
    return result.rowCount > 0;
  }

  protected async count(condition?: string, params?: any[], client?: PoolClient): Promise<number> {
    const query = condition 
      ? `SELECT COUNT(*) FROM ${this.tableName} WHERE ${condition}`
      : `SELECT COUNT(*) FROM ${this.tableName}`;
    
    const result = client
      ? await client.query(query, params)
      : await this.db.query(query, params);
    
    return parseInt(result.rows[0].count);
  }

  // Abstract method to be implemented by concrete repositories
  protected abstract mapRowToEntity(row: any): T;

  // Helper method for camelCase to snake_case conversion
  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // Helper method for snake_case to camelCase conversion
  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // Convert object keys from camelCase to snake_case
  protected toSnakeCaseObject(obj: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[this.toSnakeCase(key)] = value;
    }
    return result;
  }

  // Convert object keys from snake_case to camelCase
  protected toCamelCaseObject(obj: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[this.toCamelCase(key)] = value;
    }
    return result;
  }
}