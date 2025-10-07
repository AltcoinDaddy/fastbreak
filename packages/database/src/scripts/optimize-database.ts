import { Pool } from 'pg';
import { IndexManager } from '../optimization/index-manager';
import { QueryOptimizer } from '../optimization/query-optimizer';
import { createLogger } from '../utils/logger';

const logger = createLogger({ serviceName: 'database-optimizer' });

async function optimizeDatabase() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'fastbreak',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  });

  try {
    logger.info('Starting database optimization');

    const indexManager = new IndexManager(pool);
    const queryOptimizer = new QueryOptimizer(pool);

    // Create performance indexes
    logger.info('Creating performance indexes...');
    await indexManager.createPerformanceIndexes();

    // Analyze all main tables
    const tables = ['users', 'moments', 'trades', 'ai_analysis', 'strategies', 'portfolio'];
    
    for (const table of tables) {
      logger.info(`Optimizing table: ${table}`);
      
      // Get optimization suggestions
      const suggestions = await queryOptimizer.suggestOptimizations(table);
      
      if (suggestions.length > 0) {
        logger.info(`Found ${suggestions.length} optimization suggestions for ${table}:`);
        suggestions.forEach(suggestion => {
          logger.info(`  - ${suggestion.type}: ${suggestion.description}`);
          if (suggestion.sql) {
            logger.info(`    SQL: ${suggestion.sql}`);
          }
        });
      }

      // Analyze table statistics
      await indexManager.analyzeTable(table);
    }

    // Check for unused indexes
    logger.info('Checking for unused indexes...');
    const unusedIndexes = await indexManager.findUnusedIndexes(5); // Less than 5 scans
    
    if (unusedIndexes.length > 0) {
      logger.warn(`Found ${unusedIndexes.length} potentially unused indexes:`);
      unusedIndexes.forEach(index => {
        logger.warn(`  - ${index.indexName} on ${index.tableName} (${index.scans} scans)`);
      });
      
      // Optionally drop unused indexes (dry run by default)
      const droppedIndexes = await indexManager.dropUnusedIndexes(5, true);
      logger.info(`Would drop ${droppedIndexes.length} unused indexes`);
    }

    // Get index usage statistics
    const indexStats = await indexManager.getIndexUsageStats();
    logger.info(`Total indexes: ${indexStats.length}`);
    
    const wellUsedIndexes = indexStats.filter(idx => idx.scans > 100);
    logger.info(`Well-used indexes (>100 scans): ${wellUsedIndexes.length}`);

    logger.info('Database optimization completed successfully');

  } catch (error) {
    logger.error('Database optimization failed', { error: (error as Error).message });
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  optimizeDatabase().catch(error => {
    console.error('Optimization failed:', error);
    process.exit(1);
  });
}

export { optimizeDatabase };