import { Pool } from 'pg';
import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'index-manager' });

export interface IndexInfo {
  indexName: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  size: string;
  scans: number;
  tuplesRead: number;
  tuplesInserted: number;
}

export class IndexManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createPerformanceIndexes(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Core performance indexes for FastBreak
      const indexes = [
        // Users table
        {
          name: 'idx_users_wallet_address',
          table: 'users',
          columns: ['wallet_address'],
          unique: true
        },
        {
          name: 'idx_users_created_at',
          table: 'users',
          columns: ['created_at']
        },
        
        // Moments table
        {
          name: 'idx_moments_player_id',
          table: 'moments',
          columns: ['player_id']
        },
        {
          name: 'idx_moments_current_price',
          table: 'moments',
          columns: ['current_price']
        },
        {
          name: 'idx_moments_game_date',
          table: 'moments',
          columns: ['game_date']
        },
        {
          name: 'idx_moments_marketplace_id',
          table: 'moments',
          columns: ['marketplace_id']
        },
        {
          name: 'idx_moments_composite_search',
          table: 'moments',
          columns: ['player_id', 'current_price', 'game_date']
        },
        
        // Trades table
        {
          name: 'idx_trades_user_id',
          table: 'trades',
          columns: ['user_id']
        },
        {
          name: 'idx_trades_moment_id',
          table: 'trades',
          columns: ['moment_id']
        },
        {
          name: 'idx_trades_timestamp',
          table: 'trades',
          columns: ['timestamp']
        },
        {
          name: 'idx_trades_user_timestamp',
          table: 'trades',
          columns: ['user_id', 'timestamp']
        },
        
        // AI Analysis table
        {
          name: 'idx_ai_analysis_moment_id',
          table: 'ai_analysis',
          columns: ['moment_id']
        },
        {
          name: 'idx_ai_analysis_timestamp',
          table: 'ai_analysis',
          columns: ['timestamp']
        },
        {
          name: 'idx_ai_analysis_confidence',
          table: 'ai_analysis',
          columns: ['confidence']
        },
        
        // Strategies table
        {
          name: 'idx_strategies_user_id',
          table: 'strategies',
          columns: ['user_id']
        },
        {
          name: 'idx_strategies_type_active',
          table: 'strategies',
          columns: ['type', 'is_active']
        },
        
        // Portfolio table
        {
          name: 'idx_portfolio_user_id',
          table: 'portfolio',
          columns: ['user_id']
        },
        {
          name: 'idx_portfolio_moment_id',
          table: 'portfolio',
          columns: ['moment_id']
        },
        {
          name: 'idx_portfolio_user_moment',
          table: 'portfolio',
          columns: ['user_id', 'moment_id'],
          unique: true
        }
      ];

      for (const index of indexes) {
        await this.createIndexIfNotExists(index);
      }

      logger.info('Performance indexes creation completed');
    } finally {
      client.release();
    }
  }

  private async createIndexIfNotExists(indexConfig: {
    name: string;
    table: string;
    columns: string[];
    unique?: boolean;
  }): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Check if index exists
      const existsResult = await client.query(`
        SELECT 1 FROM pg_indexes 
        WHERE indexname = $1
      `, [indexConfig.name]);

      if (existsResult.rows.length === 0) {
        const uniqueClause = indexConfig.unique ? 'UNIQUE' : '';
        const columnsClause = indexConfig.columns.join(', ');
        
        const sql = `CREATE ${uniqueClause} INDEX ${indexConfig.name} ON ${indexConfig.table} (${columnsClause})`;
        
        await client.query(sql);
        logger.info('Created index', { 
          name: indexConfig.name, 
          table: indexConfig.table, 
          columns: indexConfig.columns 
        });
      } else {
        logger.debug('Index already exists', { name: indexConfig.name });
      }
    } catch (error) {
      logger.error('Failed to create index', { 
        name: indexConfig.name, 
        error: (error as Error).message 
      });
    } finally {
      client.release();
    }
  }

  async getIndexUsageStats(): Promise<IndexInfo[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          i.indexrelname as index_name,
          t.relname as table_name,
          array_agg(a.attname ORDER BY a.attnum) as columns,
          i.indisunique as is_unique,
          pg_size_pretty(pg_relation_size(i.indexrelid)) as size,
          s.idx_scan as scans,
          s.idx_tup_read as tuples_read,
          s.idx_tup_fetch as tuples_inserted
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
        WHERE t.relkind = 'r'
          AND NOT i.indisprimary
        GROUP BY i.indexrelname, t.relname, i.indisunique, i.indexrelid, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch
        ORDER BY s.idx_scan DESC NULLS LAST
      `);

      return result.rows.map(row => ({
        indexName: row.index_name,
        tableName: row.table_name,
        columns: row.columns,
        isUnique: row.is_unique,
        size: row.size,
        scans: row.scans || 0,
        tuplesRead: row.tuples_read || 0,
        tuplesInserted: row.tuples_inserted || 0
      }));
    } finally {
      client.release();
    }
  }

  async findUnusedIndexes(minScans: number = 10): Promise<IndexInfo[]> {
    const allIndexes = await this.getIndexUsageStats();
    return allIndexes.filter(index => index.scans < minScans);
  }

  async dropUnusedIndexes(minScans: number = 10, dryRun: boolean = true): Promise<string[]> {
    const unusedIndexes = await this.findUnusedIndexes(minScans);
    const droppedIndexes: string[] = [];
    
    if (unusedIndexes.length === 0) {
      logger.info('No unused indexes found');
      return droppedIndexes;
    }

    const client = await this.pool.connect();
    
    try {
      for (const index of unusedIndexes) {
        const sql = `DROP INDEX ${index.indexName}`;
        
        if (dryRun) {
          logger.info('Would drop unused index', { 
            name: index.indexName, 
            table: index.tableName,
            scans: index.scans,
            sql 
          });
          droppedIndexes.push(sql);
        } else {
          await client.query(sql);
          logger.info('Dropped unused index', { 
            name: index.indexName, 
            table: index.tableName,
            scans: index.scans 
          });
          droppedIndexes.push(index.indexName);
        }
      }
    } finally {
      client.release();
    }

    return droppedIndexes;
  }

  async reindexTable(tableName: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`REINDEX TABLE ${tableName}`);
      logger.info('Reindexed table', { table: tableName });
    } catch (error) {
      logger.error('Failed to reindex table', { 
        table: tableName, 
        error: (error as Error).message 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async analyzeTable(tableName: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`ANALYZE ${tableName}`);
      logger.info('Analyzed table', { table: tableName });
    } catch (error) {
      logger.error('Failed to analyze table', { 
        table: tableName, 
        error: (error as Error).message 
      });
      throw error;
    } finally {
      client.release();
    }
  }
}