import { Pool } from 'pg';
import Redis from 'ioredis';
import { DashboardServer } from './dashboard-server';
import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'monitoring-dashboard' });

async function main() {
  try {
    // Initialize database connection
    const dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'fastbreak',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Initialize Redis connection
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    // Create and start dashboard server
    const dashboardServer = new DashboardServer(
      dbPool,
      redis,
      parseInt(process.env.PORT || '3001')
    );

    await dashboardServer.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await dashboardServer.stop();
      await dbPool.end();
      await redis.quit();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await dashboardServer.stop();
      await dbPool.end();
      await redis.quit();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start monitoring dashboard', { error: (error as Error).message });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}