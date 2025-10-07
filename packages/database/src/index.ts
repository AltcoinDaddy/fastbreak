// Core database exports
export { DatabaseManager } from './database-manager';
export { DatabaseConnection } from './connection';

// Repository exports
export { BaseRepository } from './repositories/base';
export { UserRepository } from './repositories/user';
export { MomentRepository } from './repositories/moment';
export { TradeRepository } from './repositories/trade';
export { NotificationRepository } from './repositories/notification';
export { StrategyRepository } from './repositories/strategy';
export { BudgetLimitsRepository } from './repositories/budget-limits';
export { SpendingTrackerRepository } from './repositories/spending-tracker';
export { EmergencyStopRepository } from './repositories/emergency-stop';
export { RiskAlertRepository } from './repositories/risk-alert';

// Type definitions and interfaces
export type { BudgetLimits } from './repositories/budget-limits';
export type { SpendingTracker } from './repositories/spending-tracker';
export type { EmergencyStop, EmergencyStopCondition, EmergencyStopImpact, EmergencyStopUpdateData } from './repositories/emergency-stop';
export type { RiskAlert, RiskAlertType } from './repositories/risk-alert';
export type { UserRow } from './repositories/user';
export type { MomentRow } from './repositories/moment';
export type { TradeRow } from './repositories/trade';
export type { NotificationRow } from './repositories/notification';
export type { StrategyRow } from './repositories/strategy';

// Utility exports
export { DataSeeder } from './seed';

// Optimization exports
export * from './optimization/query-optimizer';
export * from './optimization/index-manager';

// Utility exports
export { createLogger } from './utils/logger';