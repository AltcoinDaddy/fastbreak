import { Pool } from 'pg';
import { QueryOptimizer } from '../optimization/query-optimizer';
import { createLogger } from '../utils/logger';

const logger = createLogger({ serviceName: 'database-analyzer' });

async function analyzePerformance() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'fastbreak',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });

  try {
    logger.info('Starting database performance analysis');

    const queryOptimizer = new QueryOptimizer(pool);

    // Find slow queries
    logger.info('Analyzing slow queries...');
    const slowQueries = await queryOptimizer.findSlowQueries(100); // > 100ms average
    
    if (slowQueries.length > 0) {
      logger.warn(`Found ${slowQueries.length} slow queries:`);
      slowQueries.forEach((query, index) => {
        logger.warn(`\n--- Slow Query ${index + 1} ---`);
        logger.warn(`Query: ${query.query.substring(0, 200)}...`);
        logger.warn(`Calls: ${query.calls}`);
        logger.warn(`Mean time: ${query.mean_time.toFixed(2)}ms`);
        logger.warn(`Total time: ${query.total_time.toFixed(2)}ms`);
        logger.warn(`Hit rate: ${query.hit_percent?.toFixed(1) || 'N/A'}%`);
      });
    } else {
      logger.info('No slow queries found');
    }

    // Analyze common FastBreak queries
    const commonQueries = [
      {
        name: 'User Portfolio Query',
        sql: `
          SELECT m.*, p.purchase_price, p.purchase_date
          FROM portfolio p
          JOIN moments m ON p.moment_id = m.id
          WHERE p.user_id = $1
          ORDER BY p.purchase_date DESC
        `
      },
      {
        name: 'AI Analysis Lookup',
        sql: `
          SELECT *
          FROM ai_analysis
          WHERE moment_id = $1
          ORDER BY timestamp DESC
          LIMIT 1
        `
      },
      {
        name: 'Player Moments Search',
        sql: `
          SELECT *
          FROM moments
          WHERE player_id = $1
            AND current_price BETWEEN $2 AND $3
          ORDER BY current_price ASC
        `
      },
      {
        name: 'Recent Trades Query',
        sql: `
          SELECT t.*, m.player_name, m.moment_type
          FROM trades t
          JOIN moments m ON t.moment_id = m.id
          WHERE t.user_id = $1
            AND t.timestamp > NOW() - INTERVAL '30 days'
          ORDER BY t.timestamp DESC
        `
      }
    ];

    logger.info('Analyzing common query patterns...');
    for (const query of commonQueries) {
      try {
        logger.info(`\n--- Analyzing: ${query.name} ---`);
        
        // Create a test query with placeholder values
        const testQuery = query.sql
          .replace(/\$1/g, "'test-user-id'")
          .replace(/\$2/g, '0')
          .replace(/\$3/g, '1000');
        
        const plan = await queryOptimizer.analyzeQuery(testQuery);
        
        logger.info(`Execution time: ${plan.executionTime?.toFixed(2) || 'N/A'}ms`);
        logger.info(`Cost: ${plan.cost?.toFixed(2) || 'N/A'}`);
        logger.info(`Estimated rows: ${plan.rows || 'N/A'}`);
        
        // Check for sequential scans or other performance issues
        const hasSeqScan = plan.planNodes.some(node => 
          node['Node Type'] === 'Seq Scan'
        );
        
        if (hasSeqScan) {
          logger.warn('⚠️  Query uses sequential scan - consider adding indexes');
        }
        
        const hasSort = plan.planNodes.some(node => 
          node['Node Type'] === 'Sort'
        );
        
        if (hasSort) {
          logger.info('ℹ️  Query includes sorting - ensure appropriate indexes exist');
        }
        
      } catch (error) {
        logger.error(`Error analyzing query ${query.name}:`, (error as Error).message);
      }
    }

    // Analyze table statistics
    const tables = ['users', 'moments', 'trades', 'ai_analysis', 'strategies', 'portfolio'];
    
    logger.info('\n--- Table Statistics ---');
    for (const table of tables) {
      try {
        const stats = await queryOptimizer.getTableStats(table);
        
        if (stats.length > 0) {
          logger.info(`\n${table.toUpperCase()} table statistics:`);
          stats.forEach(stat => {
            logger.info(`  Column: ${stat.attname}`);
            logger.info(`    Distinct values: ${stat.n_distinct || 'N/A'}`);
            logger.info(`    Correlation: ${stat.correlation?.toFixed(3) || 'N/A'}`);
          });
        }
      } catch (error) {
        logger.error(`Error getting stats for ${table}:`, (error as Error).message);
      }
    }

    // Database size analysis
    logger.info('\n--- Database Size Analysis ---');
    const client = await pool.connect();
    
    try {
      const sizeResult = await client.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `);

      logger.info('Table sizes:');
      sizeResult.rows.forEach(row => {
        logger.info(`  ${row.tablename}: ${row.size}`);
      });

      // Check for tables that might need partitioning
      const largeTables = sizeResult.rows.filter(row => row.size_bytes > 100 * 1024 * 1024); // > 100MB
      if (largeTables.length > 0) {
        logger.warn('\nLarge tables that might benefit from partitioning:');
        largeTables.forEach(table => {
          logger.warn(`  ${table.tablename}: ${table.size}`);
        });
      }

    } finally {
      client.release();
    }

    logger.info('\nDatabase performance analysis completed');

  } catch (error) {
    logger.error('Database performance analysis failed', { error: (error as Error).message });
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  analyzePerformance().catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}

export { analyzePerformance };