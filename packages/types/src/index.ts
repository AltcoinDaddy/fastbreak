// User Types
export interface User {
  id: string;
  walletAddress: string;
  strategies: Strategy[];
  budgetLimits: BudgetLimits;
  notificationPreferences: NotificationSettings;
  createdAt: Date;
  lastActive: Date;
}

export interface Strategy {
  id: string;
  type: 'rookie_risers' | 'post_game_spikes' | 'arbitrage_mode';
  parameters: StrategyParameters;
  isActive: boolean;
  performance: StrategyPerformance;
}

export interface BudgetLimits {
  dailySpendingCap: number;
  maxPricePerMoment: number;
  totalBudgetLimit: number;
  emergencyStopThreshold: number;
}

export interface NotificationSettings {
  email?: string;
  pushEnabled: boolean;
  tradeNotifications: boolean;
  budgetAlerts: boolean;
  systemAlerts: boolean;
}

// Strategy Types
export interface StrategyParameters {
  rookieRisers?: RookieRisersParams;
  postGameSpikes?: PostGameSpikesParams;
  arbitrageMode?: ArbitrageModeParams;
  valueInvesting?: ValueInvestingParams;
  momentumTrading?: MomentumTradingParams;
  contrarian?: ContrarianParams;
}

export interface PerformanceMetric {
  name: string;
  threshold: number;
  comparison: 'greater_than' | 'less_than' | 'equal_to' | 'percentage_change';
  weight: number;
}

export type GameType = 'regular_season' | 'playoffs' | 'finals' | 'all_star' | 'preseason';

export type PlayerTier = 'superstar' | 'all_star' | 'starter' | 'role_player' | 'rookie';

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

export type MomentumIndicator = 'price_rsi' | 'volume_rsi' | 'macd' | 'bollinger_bands' | 'moving_average';

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
  timeWindow: number; // hours
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

export interface StrategyPerformance {
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  averageReturn: number;
  lastExecuted?: Date;
  totalLoss?: number;
  maxDrawdown?: number;
  sharpeRatio?: number;
  winRate?: number;
  averageHoldingTime?: number; // hours
}

// Moment Types
export interface Moment {
  id: string;
  playerId: string;
  playerName: string;
  gameDate: Date;
  momentType: string;
  serialNumber: number;
  currentPrice: number;
  aiValuation: number;
  confidence: number;
  marketplaceId: string;
  scarcityRank: number;
}

export interface Trade {
  id: string;
  userId: string;
  momentId: string;
  action: 'buy' | 'sell';
  price: number;
  timestamp: Date;
  reasoning: string;
  strategyUsed: string;
  profitLoss?: number;
  transactionHash: string;
}

// AI Analysis Types
export interface AIAnalysis {
  momentId: string;
  fairValue: number;
  confidence: number;
  factors: AnalysisFactor[];
  recommendation: 'buy' | 'hold' | 'sell' | 'skip';
  riskScore: number;
  timestamp: Date;
}

export interface AnalysisFactor {
  type: 'player_performance' | 'market_trend' | 'scarcity' | 'social_sentiment';
  weight: number;
  value: number;
  description: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  type: 'trade' | 'budget' | 'system' | 'opportunity';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  read: boolean;
  createdAt: Date;
}

// Leaderboard Types
export interface LeaderboardEntry {
  rank: number;
  userId: string; // anonymized
  totalReturn: number;
  successRate: number;
  totalTrades: number;
  isCurrentUser?: boolean;
}

// WebSocket Types
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload: any;
  timestamp: Date;
  userId?: string;
}

export type WebSocketMessageType = 
  | 'price_update'
  | 'portfolio_update'
  | 'trade_notification'
  | 'trade_status'
  | 'market_alert'
  | 'system_notification'
  | 'connection_status'
  | 'heartbeat';

export interface PriceUpdate {
  momentId: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  volume24h: number;
  timestamp: Date;
}

export interface PortfolioUpdate {
  userId: string;
  totalValue: number;
  totalChange: number;
  changePercent: number;
  moments: PortfolioMoment[];
  lastUpdated: Date;
}

export interface PortfolioMoment {
  momentId: string;
  playerName: string;
  currentValue: number;
  purchasePrice: number;
  profitLoss: number;
  profitLossPercent: number;
}

export interface TradeNotification {
  tradeId: string;
  userId: string;
  type: 'buy' | 'sell';
  momentId: string;
  playerName: string;
  price: number;
  reasoning: string;
  timestamp: Date;
}

export interface TradeStatus {
  tradeId: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  transactionHash?: string;
  error?: string;
  timestamp: Date;
}

export interface MarketAlert {
  type: 'arbitrage' | 'price_spike' | 'volume_surge' | 'rare_listing';
  momentId: string;
  playerName: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnectAttempts?: number;
  lastHeartbeat?: Date;
}

// Error Handling Types
export interface ErrorContext {
  correlationId: string;
  userId?: string;
  service: string;
  operation: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface FastBreakError {
  code: string;
  message: string;
  userMessage: string;
  context: ErrorContext;
  originalError?: Error;
  stack?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: ErrorCategory;
  retryable: boolean;
  troubleshootingGuide?: string;
}

export type ErrorCategory = 
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'blockchain'
  | 'database'
  | 'external_api'
  | 'business_logic'
  | 'system'
  | 'configuration';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  correlationId: string;
  service: string;
  operation?: string;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  error?: FastBreakError;
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  threshold: {
    errorRate: number; // errors per minute
    criticalErrors: number; // immediate alert
  };
  cooldown: number; // minutes between similar alerts
}

export type AlertChannel = 'email' | 'slack' | 'webhook' | 'dashboard';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime: number;
  dependencies: DependencyHealth[];
  metadata?: Record<string, any>;
}

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
}