import { Pool } from 'pg';
import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'query-optimizer' });

export interface QueryPlan {
  query: string;
  executionTime: number;
  cost: number;
  rows: number;
  planNodes: any[];
}

export interface OptimizationSuggestion {
  type: 'index' | 'query_rewrite' | 'partition' | 'vacuum';
  table: string;
  columns?: string[];
  description: string;
  estimatedImprovement: string;
  sql?: string;
}

export class QueryOptimizer {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async analyzeQuery(query: string): Promise<QueryPlan> {
    const client = await this.pool.connect();
    
    try {
      // Get query execution plan
      const explainResult = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
      const plan = explainResult.rows[0]['QUERY PLAN'][0];

      return {
        query,
        executionTime: plan['Execution Time'],
        cost: plan['Plan']['Total Cost'],
        rows: plan['Plan']['Actual Rows'],
        planNodes: this.extractPlanNodes(plan['Plan'])
      };
    } finally {
      client.release();
    }
  }

  async findSlowQueries(minDuration: number = 1000): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      // Enable pg_stat_statements if available
      const result = await client.query(`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements 
        WHERE mean_time > $1
        ORDER BY mean_time DESC
        LIMIT 20
      `, [minDuration]);

      return result.rows;
    } catch (error) {
      logger.warn('pg_stat_statements not available, using alternative method');
      return [];
    } finally {
      client.release();
    }
  }

  async suggestOptimizations(tableName: string): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const client = await this.pool.connect();

    try {
      // Check for missing indexes on foreign keys
      const fkResult = await client.query(`
        SELECT 
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
      `, [tableName]);

      for (const fk of fkResult.rows) {
        const indexExists = await this.checkIndexExists(tableName, fk.column_name);
        if (!indexExists) {
          suggestions.push({
            type: 'index',
            table: tableName,
            columns: [fk.column_name],
            description: `Missing index on foreign key column ${fk.column_name}`,
            estimatedImprovement: 'High - Foreign key lookups will be much faster',
            sql: `CREATE INDEX idx_${tableName}_${fk.column_name} ON ${tableName} (${fk.column_name});`
          });
        }
      }

      // Check table statistics and suggest vacuum/analyze
      const statsResult = await client.query(`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins,
          n_tup_upd,
          n_tup_del,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        WHERE tablename = $1
      `, [tableName]);

      if (statsResult.rows.length > 0) {
        const stats = statsResult.rows[0];
        const totalChanges = stats.n_tup_ins + stats.n_tup_upd + stats.n_tup_del;
        const lastAnalyze = stats.last_analyze || stats.last_autoanalyze;
        
        if (totalChanges > 1000 && (!lastAnalyze || Date.now() - new Date(lastAnalyze).getTime() > 24 * 60 * 60 * 1000)) {
          suggestions.push({
            type: 'vacuum',
            table: tableName,
            description: 'Table statistics are outdated, affecting query planning',
            estimatedImprovement: 'Medium - Better query plans with updated statistics',
            sql: `ANALYZE ${tableName};`
          });
        }
      }

      // Check for large tables that might benefit from partitioning
      const sizeResult = await client.query(`
        SELECT 
          pg_size_pretty(pg_total_relation_size($1)) as size,
          pg_total_relation_size($1) as size_bytes
      `, [tableName]);

      if (sizeResult.rows[0].size_bytes > 100 * 1024 * 1024) { // > 100MB
        suggestions.push({
          type: 'partition',
          table: tableName,
          description: `Large table (${sizeResult.rows[0].size}) may benefit from partitioning`,
          estimatedImprovement: 'High - Faster queries on partitioned data',
          sql: `-- Consider partitioning by date or other logical column`
        });
      }

    } finally {
      client.release();
    }

    return suggestions;
  }

  async createOptimalIndexes(tableName: string): Promise<string[]> {
    const suggestions = await this.suggestOptimizations(tableName);
    const indexSuggestions = suggestions.filter(s => s.type === 'index' && s.sql);
    const client = await this.pool.connect();
    const createdIndexes: string[] = [];

    try {
      for (const suggestion of indexSuggestions) {
        if (suggestion.sql) {
          await client.query(suggestion.sql);
          createdIndexes.push(suggestion.sql);
          logger.info('Created index', { table: tableName, sql: suggestion.sql });
        }
      }
    } catch (error) {
      logger.error('Error creating indexes', { error: (error as Error).message });
    } finally {
      client.release();
    }

    return createdIndexes;
  }

  private async checkIndexExists(tableName: string, columnName: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 1
        FROM pg_indexes
        WHERE tablename = $1
          AND indexdef LIKE $2
      `, [tableName, `%${columnName}%`]);

      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  private extractPlanNodes(plan: any): any[] {
    const nodes = [plan];
    
    if (plan.Plans) {
      for (const subPlan of plan.Plans) {
        nodes.push(...this.extractPlanNodes(subPlan));
      }
    }
    
    return nodes;
  }

  async getTableStats(tableName: string) {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation,
          most_common_vals,
          most_common_freqs
        FROM pg_stats
        WHERE tablename = $1
        ORDER BY attname
      `, [tableName]);

      return result.rows;
    } finally {
      client.release();
    }
  }
}