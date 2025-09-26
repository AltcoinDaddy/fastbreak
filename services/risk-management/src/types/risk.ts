export interface BudgetLimits {
  id: string;
  userId: string;
  dailySpendingCap: number;
  weeklySpendingCap: number;
  monthlySpendingCap: number;
  maxPricePerMoment: number;
  totalBudgetLimit: number;
  emergencyStopThreshold: number;
  reserveAmount: number; // Amount to keep in reserve
  autoRebalance: boolean;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpendingTracker {
  id: string;
  userId: string;
  date: Date;
  dailySpent: number;
  weeklySpent: number;
  monthlySpent: number;
  totalSpent: number;
  transactionCount: number;
  averageTransactionSize: number;
  largestTransaction: number;
  updatedAt: Date;
}

export interface RiskProfile {
  id: string;
  userId: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxDrawdownTolerance: number;
  maxVolatilityTolerance: number;
  diversificationRequirement: number;
  concentrationLimits: ConcentrationLimits;
  stopLossRules: StopLossRule[];
  riskMetrics: RiskMetrics;
  lastAssessment: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConcentrationLimits {
  maxPercentagePerPlayer: number;
  maxPercentagePerTeam: number;
  maxPercentagePerMomentType: number;
  maxPercentagePerSeries: number;
  maxMomentsPerPlayer: number;
  maxSimilarMoments: number;
}

export interface StopLossRule {
  id: string;
  type: 'percentage' | 'absolute' | 'trailing' | 'time_based';
  threshold: number;
  timeframe?: number; // in hours
  isActive: boolean;
  applyTo: 'individual' | 'portfolio' | 'strategy';
  conditions: StopLossCondition[];
}

export interface StopLossCondition {
  metric: 'loss_percentage' | 'loss_amount' | 'time_held' | 'market_volatility';
  operator: 'greater_than' | 'less_than' | 'equal_to';
  value: number;
}

export interface RiskMetrics {
  portfolioValue: number;
  totalExposure: number;
  availableCash: number;
  utilizationRate: number;
  diversificationScore: number;
  concentrationRisk: number;
  volatilityScore: number;
  sharpeRatio: number;
  maxDrawdown: number;
  valueAtRisk: number; // VaR at 95% confidence
  expectedShortfall: number; // CVaR
  betaToMarket: number;
  correlationMatrix: Record<string, number>;
}

export interface RiskAlert {
  id: string;
  userId: string;
  type: RiskAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  threshold: number;
  currentValue: number;
  triggered: boolean;
  triggeredAt?: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  autoResolve: boolean;
  resolutionAction?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export type RiskAlertType = 
  | 'budget_exceeded'
  | 'daily_limit_reached'
  | 'concentration_risk'
  | 'drawdown_exceeded'
  | 'volatility_spike'
  | 'correlation_increase'
  | 'liquidity_risk'
  | 'stop_loss_triggered'
  | 'emergency_stop'
  | 'suspicious_activity';

export interface TransactionApproval {
  id: string;
  userId: string;
  transactionId: string;
  momentId: string;
  amount: number;
  type: 'buy' | 'sell';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  riskScore: number;
  riskFactors: RiskFactor[];
  autoApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface RiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: number; // 0-100
  mitigation?: string;
}

export interface PortfolioRisk {
  userId: string;
  totalValue: number;
  totalRisk: number;
  riskByCategory: Record<string, number>;
  concentrationRisks: ConcentrationRisk[];
  correlationRisks: CorrelationRisk[];
  liquidityRisks: LiquidityRisk[];
  recommendations: RiskRecommendation[];
  lastCalculated: Date;
}

export interface ConcentrationRisk {
  type: 'player' | 'team' | 'moment_type' | 'series';
  identifier: string;
  name: string;
  percentage: number;
  limit: number;
  exceeded: boolean;
  riskScore: number;
}

export interface CorrelationRisk {
  asset1: string;
  asset2: string;
  correlation: number;
  threshold: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface LiquidityRisk {
  momentId: string;
  playerName: string;
  liquidityScore: number;
  averageDailyVolume: number;
  timeToSell: number; // estimated days
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RiskRecommendation {
  type: 'rebalance' | 'reduce_exposure' | 'diversify' | 'hedge' | 'stop_loss';
  priority: 'low' | 'medium' | 'high';
  description: string;
  expectedImpact: string;
  actionRequired: boolean;
  suggestedActions: string[];
}

export interface EmergencyStop {
  id: string;
  userId: string;
  triggeredBy: string; // system, user, or external
  reason: string;
  triggerConditions: EmergencyStopCondition[];
  isActive: boolean;
  triggeredAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  impact: EmergencyStopImpact;
}

export interface EmergencyStopCondition {
  type: 'loss_threshold' | 'drawdown_limit' | 'volatility_spike' | 'liquidity_crisis' | 'external_signal';
  threshold: number;
  currentValue: number;
  breached: boolean;
}

export interface EmergencyStopImpact {
  strategiesPaused: string[];
  transactionsCancelled: string[];
  ordersModified: string[];
  estimatedLossPrevented: number;
}

export interface RiskAssessment {
  userId: string;
  overallRiskScore: number;
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  riskFactors: AssessmentFactor[];
  recommendations: string[];
  nextReviewDate: Date;
  assessmentDate: Date;
}

export interface AssessmentFactor {
  category: 'portfolio' | 'strategy' | 'market' | 'behavioral';
  factor: string;
  score: number;
  weight: number;
  description: string;
  trend: 'improving' | 'stable' | 'deteriorating';
}

export interface BudgetAllocation {
  userId: string;
  totalBudget: number;
  allocations: AllocationItem[];
  unallocated: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'monthly' | 'manual';
  lastRebalance: Date;
  nextRebalance: Date;
}

export interface AllocationItem {
  strategyId: string;
  strategyName: string;
  allocatedAmount: number;
  allocatedPercentage: number;
  currentValue: number;
  utilization: number;
  performance: number;
  riskContribution: number;
}

export interface RiskLimit {
  id: string;
  userId: string;
  type: 'position_size' | 'daily_loss' | 'drawdown' | 'concentration' | 'volatility';
  limit: number;
  currentValue: number;
  utilizationPercentage: number;
  breached: boolean;
  lastBreach?: Date;
  breachCount: number;
  isActive: boolean;
  autoEnforce: boolean;
  warningThreshold: number;
}

export interface RiskEvent {
  id: string;
  userId: string;
  type: 'limit_breach' | 'stop_loss' | 'emergency_stop' | 'concentration_warning' | 'volatility_spike';
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  data: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  type: 'regulatory' | 'internal' | 'strategy';
  conditions: ComplianceCondition[];
  actions: ComplianceAction[];
  isActive: boolean;
  priority: number;
}

export interface ComplianceCondition {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'not_equals';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface ComplianceAction {
  type: 'block' | 'warn' | 'log' | 'notify' | 'modify';
  parameters: Record<string, any>;
  message?: string;
}

export interface RiskReport {
  userId: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'ad_hoc';
  period: {
    start: Date;
    end: Date;
  };
  summary: RiskSummary;
  details: RiskReportSection[];
  recommendations: string[];
  generatedAt: Date;
}

export interface RiskSummary {
  totalPortfolioValue: number;
  totalRiskExposure: number;
  riskScore: number;
  performanceMetrics: {
    return: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
  alertsTriggered: number;
  limitsBreached: number;
}

export interface RiskReportSection {
  title: string;
  type: 'chart' | 'table' | 'text' | 'metrics';
  data: any;
  insights: string[];
}