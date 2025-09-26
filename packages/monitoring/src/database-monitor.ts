import { Pool } from 'pg';
import { databaseQueryDuration, databaseConnectionsActive } from './metrics';
import { createLogger } from './logger';

const logger = createLogger({ serviceName: 'database-monitor' });

export interface DatabaseMonitorOptions {
  serviceName: string;
  pool: Pool;
  enableQueryLogging?: boolean;
  slowQueryThreshold?: number; // in milliseconds
}

export class DatabaseMonitor {
  private serviceName: string;
  private pool: Pool;
  private enableQueryLogging: boolean;
  private slowQueryThreshold: number;

  constructor(options: DatabaseMonitorOptions) {
    this.serviceName = options.serviceName;
    this.pool = options.pool;
    this.enableQueryLogging = options.enableQueryLogging ?? true;
    this.slowQueryThreshold = options.slowQueryThreshold ?? 1000;

    this.setupPoolMonitoring();
  }

  private setupPoolMonitoring() {
    // Monitor connection pool metrics
    setInterval(() => {
      databaseConnectionsActive
        .labels(this.serviceName)
        .set(this.pool.totalCount - this.pool.idleCount);
    }, 5000);

    // Log pool events
    this.pool.on('connect', () => {
      logger.debug('Database connection established');
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error', { error: err.message });
    });
  }

  async query(text: string, params?: any[], queryType?: string): Promise<any> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      const result = await client.query(text, params);
      const duration = Date.now() - startTime;

      // Record metrics
      const table = this.extractTableName(text);
      const type = queryType || this.detectQueryType(text);
      
      databaseQueryDuration
        .labels(type, table, this.serviceName)
        .observe(duration / 1000);

      // Log slow queries
      if (duration > this.slowQueryThreshold) {
        logger.warn('Slow query detected', {
          query: text,
          duration_ms: duration,
          params: this.enableQueryLogging ? params : '[REDACTED]'
        });
      }

      if (this.enableQueryLogging && duration > 100) {
        logger.debug('Database query executed', {
          query_type: type,
          table,
          duration_ms: duration,
          rows_affected: result.rowCount
        });
      }

      return result;
    } finally {
      client.release();
    }
  }

  private extractTableName(query: string): string {
    const match = query.match(/(?:FROM|INTO|UPDATE|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    return match ? match[1] : 'unknown';
  }

  private detectQueryType(query: string): string {
    const trimmed = query.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    return 'OTHER';
  }

  async getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}