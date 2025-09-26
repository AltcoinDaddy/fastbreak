import { DatabaseConnection } from './connection';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface Migration {
  id: string;
  name: string;
  sql: string;
  timestamp: Date;
}

export class MigrationManager {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  public async initialize(): Promise<void> {
    // Create migrations table if it doesn't exist
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  }

  public async getExecutedMigrations(): Promise<string[]> {
    const result = await this.db.query('SELECT id FROM migrations ORDER BY executed_at');
    return result.rows.map((row: any) => row.id);
  }

  public async executeMigration(migration: Migration): Promise<void> {
    await this.db.transaction(async (client) => {
      // Execute the migration SQL
      await client.query(migration.sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (id, name) VALUES ($1, $2)',
        [migration.id, migration.name]
      );
    });
  }

  public async runMigrations(migrationsDir: string): Promise<void> {
    await this.initialize();
    
    const executedMigrations = await this.getExecutedMigrations();
    
    // Load initial schema if no migrations have been run
    if (executedMigrations.length === 0) {
      const initSqlPath = join(migrationsDir, '..', 'init.sql');
      try {
        const initSql = readFileSync(initSqlPath, 'utf8');
        const initMigration: Migration = {
          id: '001_initial_schema',
          name: 'Initial database schema',
          sql: initSql,
          timestamp: new Date(),
        };
        
        console.log('Running initial schema migration...');
        await this.executeMigration(initMigration);
        console.log('Initial schema migration completed');
      } catch (error) {
        console.error('Failed to run initial migration:', error);
        throw error;
      }
    }
    
    console.log('All migrations completed successfully');
  }

  public async rollbackMigration(migrationId: string): Promise<void> {
    await this.db.transaction(async (client) => {
      // Remove migration record
      await client.query('DELETE FROM migrations WHERE id = $1', [migrationId]);
    });
  }
}