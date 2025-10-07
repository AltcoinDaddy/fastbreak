import { DatabaseConnection } from './connection';
import { UserRepository } from './repositories/user';
import { MomentRepository } from './repositories/moment';
import { TradeRepository } from './repositories/trade';
import { NotificationRepository } from './repositories/notification';
import { StrategyRepository } from './repositories/strategy';
import { BudgetLimitsRepository } from './repositories/budget-limits';
import { SpendingTrackerRepository } from './repositories/spending-tracker';
import { EmergencyStopRepository } from './repositories/emergency-stop';
import { RiskAlertRepository } from './repositories/risk-alert';
import { PoolConfig } from 'pg';

export class DatabaseManager {
  private connection: DatabaseConnection;
  
  // Repository instances
  public readonly users: UserRepository;
  public readonly moments: MomentRepository;
  public readonly trades: TradeRepository;
  public readonly notifications: NotificationRepository;
  public readonly strategies: StrategyRepository;
  public readonly budgetLimits: BudgetLimitsRepository;
  public readonly spendingTracker: SpendingTrackerRepository;
  public readonly emergencyStops: EmergencyStopRepository;
  public readonly riskAlerts: RiskAlertRepository;

  constructor(databaseUrl: string);
  constructor(config: PoolConfig);
  constructor(configOrUrl: string | PoolConfig) {
    if (typeof configOrUrl === 'string') {
      this.connection = DatabaseConnection.fromUrl(configOrUrl);
    } else {
      this.connection = DatabaseConnection.getInstance(configOrUrl);
    }

    // Initialize repositories
    this.users = new UserRepository(this.connection);
    this.moments = new MomentRepository(this.connection);
    this.trades = new TradeRepository(this.connection);
    this.notifications = new NotificationRepository(this.connection);
    this.strategies = new StrategyRepository(this.connection);
    this.budgetLimits = new BudgetLimitsRepository(this.connection);
    this.spendingTracker = new SpendingTrackerRepository(this.connection);
    this.emergencyStops = new EmergencyStopRepository(this.connection);
    this.riskAlerts = new RiskAlertRepository(this.connection);
  }

  public async initialize(): Promise<void> {
    // Test database connection
    const isHealthy = await this.connection.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed health check');
    }

    // Run any initialization logic here
    // For now, we'll just ensure the connection is working
    console.log('Database manager initialized successfully');
  }

  public getConnection(): DatabaseConnection {
    return this.connection;
  }

  public async close(): Promise<void> {
    await this.connection.close();
  }

  public async healthCheck(): Promise<boolean> {
    return this.connection.healthCheck();
  }

  // Repository access methods for backward compatibility
  public getBudgetLimitsRepository(): BudgetLimitsRepository {
    return this.budgetLimits;
  }

  public getSpendingTrackerRepository(): SpendingTrackerRepository {
    return this.spendingTracker;
  }

  public getStrategyRepository(): StrategyRepository {
    return this.strategies;
  }

  public getEmergencyStopRepository(): EmergencyStopRepository {
    return this.emergencyStops;
  }

  public getRiskAlertRepository(): RiskAlertRepository {
    return this.riskAlerts;
  }

  public getUserRepository(): UserRepository {
    return this.users;
  }

  public getMomentRepository(): MomentRepository {
    return this.moments;
  }

  public getTradeRepository(): TradeRepository {
    return this.trades;
  }

  public getNotificationRepository(): NotificationRepository {
    return this.notifications;
  }

  // Transaction helper
  public async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    return this.connection.transaction(async (client) => {
      return callback(this.connection);
    });
  }
}