export interface StrategyTemplate {
  id: string;
  name: string;
  type: StrategyType;
  description: string;
  category: StrategyCategory;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  defaultParameters: StrategyParameters;
  parameterSchema: ParameterSchema;
  riskLevel: 'low' | 'medium' | 'high';
  expectedReturn: {
    min: number;
    max: number;
    timeframe: string;
  };
  tags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

import { StrategyParameters, StrategyPerformance } from '@fastbreak/types';

export interface StrategyConfiguration {
  id: string;
  userId: string;
  templateId: string;
  name: string;
  description?: string;
  parameters: StrategyParameters;
  isActive: boolean;
  priority: number;
  budgetAllocation: {
    percentage: number;
    maxAmount: number;
    dailyLimit: number;
  };
  riskControls: RiskControls;
  schedule?: ScheduleConfig;
  notifications: NotificationConfig;
  performance: StrategyPerformance;
  createdAt: Date;
  updatedAt: Date;
  lastExecuted?: Date;
}

export type StrategyType = 'rookie_risers' | 'post_game_spikes' | 'arbitrage_mode' | 'value_investing' | 'momentum_trading' | 'contrarian';

export type StrategyCategory = 'performance_based' | 'market_based' | 'time_based' | 'hybrid';

// Using shared StrategyParameters from @fastbreak/types
// export interface StrategyParameters {
//   rookieRisers?: RookieRisersParams;
//   postGameSpikes?: PostGameSpikesParams;
//   arbitrageMode?: ArbitrageModeParams;
//   valueInvesting?: ValueInvestingParams;
//   momentumTrading?: MomentumTradingParams;
//   contrarian?: ContrarianParams;
// }

export interface RookieRisersParams {
  performanceThreshold: number;
  priceLimit: number;
  minGamesPlayed: number;
  maxYearsExperience: number;
  targetPositions: string[];
  excludeTeams?: string[];
  minMinutesPerGame: number;
  efficiencyRatingMin: number;
  usageRateMin: number;
  projectedGrowthRate: number;
}

export interface PostGameSpikesParams {
  performanceMetrics: PerformanceMetric[];
  timeWindow: number; // hours after game
  priceChangeThreshold: number;
  volumeThreshold: number;
  gameTypes: GameType[];
  playerTiers: PlayerTier[];
  momentTypes: string[];
  maxPriceMultiplier: number;
  socialSentimentWeight: number;
}

export interface ArbitrageModeParams {
  priceDifferenceThreshold: number;
  maxExecutionTime: number; // seconds
  marketplaces: string[];
  maxRiskScore: number;
  minConfidenceLevel: number;
  slippageTolerance: number;
  maxPositionSize: number;
  excludeHighVolatility: boolean;
}

export interface ValueInvestingParams {
  maxPriceToValue: number;
  minAIConfidence: number;
  holdingPeriod: number; // days
  targetPlayers: string[];
  momentRarityMin: number;
  historicalPerformanceWeight: number;
  marketSentimentWeight: number;
  fundamentalAnalysisWeight: number;
}

export interface MomentumTradingParams {
  priceVelocityThreshold: number;
  volumeVelocityThreshold: number;
  trendDuration: number; // hours
  momentumIndicators: MomentumIndicator[];
  stopLossPercentage: number;
  takeProfitPercentage: number;
  maxHoldingTime: number; // hours
}

export interface ContrarianParams {
  oversoldThreshold: number;
  overboughtThreshold: number;
  reversalConfirmationPeriod: number; // hours
  maxDrawdownTolerance: number;
  contraryIndicators: string[];
  marketSentimentInversion: boolean;
}

export interface RiskControls {
  maxDailyLoss: number;
  maxPositionSize: number;
  maxConcurrentTrades: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  cooldownPeriod: number; // minutes between trades
  blacklistedPlayers: string[];
  blacklistedMoments: string[];
  maxPricePerMoment: number;
  requireManualApproval: boolean;
  emergencyStop: {
    enabled: boolean;
    triggerConditions: EmergencyStopCondition[];
  };
}

export interface EmergencyStopCondition {
  type: 'loss_threshold' | 'consecutive_losses' | 'market_volatility' | 'external_signal';
  threshold: number;
  timeframe?: number; // minutes
  isActive: boolean;
}

export interface ScheduleConfig {
  enabled: boolean;
  timezone: string;
  activeHours: {
    start: string; // HH:MM format
    end: string;
  };
  activeDays: number[]; // 0-6, Sunday = 0
  pauseDuringGames: boolean;
  pauseBeforeGames: number; // minutes
  pauseAfterGames: number; // minutes
}

export interface NotificationConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  events: NotificationEvent[];
  frequency: 'immediate' | 'batched' | 'daily_summary';
  quietHours?: {
    start: string;
    end: string;
  };
}

export type NotificationChannel = 'email' | 'push' | 'sms' | 'webhook';

export type NotificationEvent = 
  | 'trade_executed' 
  | 'opportunity_found' 
  | 'risk_threshold_reached' 
  | 'strategy_paused' 
  | 'performance_milestone' 
  | 'error_occurred';

export interface PerformanceMetric {
  name: string;
  threshold: number;
  comparison: 'greater_than' | 'less_than' | 'equal_to' | 'percentage_change';
  weight: number;
}

export type GameType = 'regular_season' | 'playoffs' | 'finals' | 'all_star' | 'preseason';

export type PlayerTier = 'superstar' | 'all_star' | 'starter' | 'role_player' | 'rookie';

export type MomentumIndicator = 'price_rsi' | 'volume_rsi' | 'macd' | 'bollinger_bands' | 'moving_average';

export interface ParameterSchema {
  [key: string]: {
    type: 'number' | 'string' | 'boolean' | 'array' | 'object';
    required: boolean;
    min?: number;
    max?: number;
    options?: string[];
    description: string;
    validation?: ValidationRule[];
  };
}

export interface ValidationRule {
  type: 'range' | 'enum' | 'custom';
  params: any;
  message: string;
}

// Using shared StrategyPerformance from @fastbreak/types
// export interface StrategyPerformance {
//   totalTrades: number;
//   successfulTrades: number;
//   totalProfit: number;
//   totalLoss: number;
//   averageReturn: number;
//   maxDrawdown: number;
//   sharpeRatio: number;
//   winRate: number;
//   averageHoldingTime: number; // hours
//   lastExecuted?: Date;
//   performanceHistory: PerformanceSnapshot[];
// }

export interface PerformanceSnapshot {
  date: Date;
  profit: number;
  trades: number;
  winRate: number;
  portfolioValue: number;
}

export interface StrategyExecution {
  id: string;
  strategyId: string;
  userId: string;
  momentId: string;
  action: 'buy' | 'sell' | 'hold';
  price: number;
  quantity: number;
  reasoning: string;
  confidence: number;
  executedAt: Date;
  result?: {
    profit: number;
    profitPercentage: number;
    holdingTime: number;
    exitReason: string;
  };
}

export interface StrategyBacktest {
  id: string;
  strategyId: string;
  userId: string;
  parameters: StrategyParameters;
  period: {
    start: Date;
    end: Date;
  };
  results: BacktestResults;
  createdAt: Date;
}

export interface BacktestResults {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  averageHoldingTime: number;
  profitFactor: number;
  calmarRatio: number;
  trades: BacktestTrade[];
  performanceChart: PerformancePoint[];
}

export interface BacktestTrade {
  date: Date;
  momentId: string;
  action: 'buy' | 'sell';
  price: number;
  quantity: number;
  profit?: number;
  reasoning: string;
}

export interface PerformancePoint {
  date: Date;
  portfolioValue: number;
  benchmark?: number;
}

export interface StrategyOptimization {
  id: string;
  strategyId: string;
  userId: string;
  optimizationTarget: 'return' | 'sharpe_ratio' | 'win_rate' | 'max_drawdown';
  parameterRanges: Record<string, { min: number; max: number; step: number }>;
  results: OptimizationResult[];
  bestParameters: StrategyParameters;
  createdAt: Date;
  completedAt?: Date;
}

export interface OptimizationResult {
  parameters: StrategyParameters;
  performance: {
    return: number;
    sharpeRatio: number;
    winRate: number;
    maxDrawdown: number;
  };
  score: number;
}

export interface StrategyAlert {
  id: string;
  strategyId: string;
  userId: string;
  type: 'performance' | 'risk' | 'execution' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  acknowledged: boolean;
  createdAt: Date;
  acknowledgedAt?: Date;
}

export interface StrategyRecommendation {
  id: string;
  userId: string;
  type: 'new_strategy' | 'parameter_adjustment' | 'risk_reduction' | 'opportunity';
  title: string;
  description: string;
  suggestedAction: string;
  confidence: number;
  potentialImpact: {
    returnImprovement: number;
    riskReduction: number;
  };
  data: Record<string, any>;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt?: Date;
}