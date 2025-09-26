import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import Decimal from 'decimal.js';
import moment from 'moment';
import { DatabaseManager } from '@fastbreak/database';
import { 
  BudgetLimits, 
  SpendingTracker, 
  RiskAlert, 
  BudgetAllocation,
  AllocationItem,
  RiskEvent,
  EmergencyStop
} from '../types/risk';
import { SuspiciousActivityDetector, SuspiciousActivityConfig } from './suspicious-activity-detector';

export interface BudgetManagerConfig {
  defaultDailyLimit: number;
  defaultWeeklyLimit: number;
  defaultMonthlyLimit: number;
  defaultMaxPricePerMoment: number;
  defaultReservePercentage: number;
  warningThresholds: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  autoResetEnabled: boolean;
  complianceCheckEnabled: boolean;
  suspiciousActivityConfig: SuspiciousActivityConfig;
}

export interface SpendingRequest {
  userId: string;
  amount: number;
  momentId: string;
  strategyId: string;
  transactionType: 'buy' | 'sell' | 'bid';
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    geolocation?: string;
    sessionId?: string;
    [key: string]: any;
  };
}

export interface SpendingApproval {
  approved: boolean;
  reason?: string;
  adjustedAmount?: number;
  warnings: string[];
  riskScore: number;
  suspiciousActivity?: {
    detected: boolean;
    riskScore: number;
    reasons: string[];
    recommendedAction: string;
  };
}

export class BudgetManager extends EventEmitter {
  private logger: Logger;
  private config: BudgetManagerConfig;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private spendingCache: Map<string, SpendingTracker>;
  private budgetCache: Map<string, BudgetLimits>;
  private resetInterval?: NodeJS.Timeout;
  private suspiciousActivityDetector: SuspiciousActivityDetector;

  constructor(
    config: BudgetManagerConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger;
    this.spendingCache = new Map();
    this.budgetCache = new Map();
    this.suspiciousActivityDetector = new SuspiciousActivityDetector(
      config.suspiciousActivityConfig,
      db,
      redisClient,
      logger
    );
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Budget Manager');
      
      // Initialize suspicious activity detector
      await this.suspiciousActivityDetector.initialize();
      
      // Load budget limits and spending data
      await this.loadBudgetData();
      
      // Start daily reset scheduler
      if (this.config.autoResetEnabled) {
        this.startDailyResetScheduler();
      }
      
      this.logger.info('Budget Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Budget Manager:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
    this.logger.info('Budget Manager shutdown complete');
  }

  // Budget Limits Management
  public async setBudgetLimits(
    userId: string, 
    limits: Partial<BudgetLimits>, 
    requireConfirmation: boolean = true
  ): Promise<BudgetLimits> {
    try {
      // Validate limits
      this.validateBudgetLimits(limits);

      // Get existing limits or create new
      let existingLimits = await this.getBudgetLimits(userId);
      
      if (!existingLimits) {
        existingLimits = await this.createDefaultBudgetLimits(userId);
      }

      // Check if changes require user confirmation
      if (requireConfirmation && this.requiresConfirmation(limits, existingLimits)) {
        // Store pending changes for confirmation
        await this.storePendingBudgetChanges(userId, limits);
        
        this.emit('budgetChangesRequireConfirmation', {
          userId,
          pendingChanges: limits,
          currentLimits: existingLimits,
          riskAssessment: this.assessBudgetChangeRisk(limits, existingLimits),
        });

        throw new Error('Budget changes require user confirmation due to significant modifications');
      }

      // Update limits
      const updatedLimits: BudgetLimits = {
        ...existingLimits,
        ...limits,
        updatedAt: new Date(),
      };

      // Save to database
      await this.saveBudgetLimits(updatedLimits);

      // Update cache
      this.budgetCache.set(userId, updatedLimits);

      // Clear any pending changes
      await this.clearPendingBudgetChanges(userId);

      // Emit event
      this.emit('budgetLimitsUpdated', updatedLimits, existingLimits);

      this.logger.info('Budget limits updated', {
        userId,
        changes: Object.keys(limits),
      });

      return updatedLimits;

    } catch (error) {
      this.logger.error('Error setting budget limits:', error);
      throw error;
    }
  }

  public async confirmBudgetLimitChanges(userId: string, confirmed: boolean): Promise<BudgetLimits | null> {
    try {
      const pendingChanges = await this.getPendingBudgetChanges(userId);
      
      if (!pendingChanges) {
        throw new Error('No pending budget changes found');
      }

      if (!confirmed) {
        // User rejected changes, clear pending
        await this.clearPendingBudgetChanges(userId);
        this.emit('budgetChangesRejected', { userId, rejectedChanges: pendingChanges });
        return null;
      }

      // User confirmed, apply changes without confirmation check
      const updatedLimits = await this.setBudgetLimits(userId, pendingChanges, false);
      
      this.emit('budgetChangesConfirmed', { userId, appliedChanges: pendingChanges });
      
      return updatedLimits;

    } catch (error) {
      this.logger.error('Error confirming budget limit changes:', error);
      throw error;
    }
  }

  public async getBudgetLimits(userId: string): Promise<BudgetLimits | null> {
    try {
      // Check cache first
      const cached = this.budgetCache.get(userId);
      if (cached) {
        return cached;
      }

      // Load from database
      const limits = await this.loadBudgetLimitsFromDb(userId);
      if (limits) {
        this.budgetCache.set(userId, limits);
      }

      return limits;

    } catch (error) {
      this.logger.error('Error getting budget limits:', error);
      throw error;
    }
  }

  // Spending Approval and Tracking
  public async approveSpending(request: SpendingRequest): Promise<SpendingApproval> {
    try {
      const { userId, amount, momentId, strategyId, transactionType } = request;
      
      // Get budget limits and current spending
      const budgetLimits = await this.getBudgetLimits(userId);
      const currentSpending = await this.getCurrentSpending(userId);

      if (!budgetLimits) {
        throw new Error('Budget limits not found for user');
      }

      const approval: SpendingApproval = {
        approved: true,
        warnings: [],
        riskScore: 0,
      };

      // Check individual transaction limits
      if (amount > budgetLimits.maxPricePerMoment) {
        approval.approved = false;
        approval.reason = `Transaction amount $${amount} exceeds maximum price per moment $${budgetLimits.maxPricePerMoment}`;
        approval.riskScore = 100;
        return approval;
      }

      // Check daily spending limit
      const projectedDailySpent = new Decimal(currentSpending.dailySpent).plus(amount);
      if (projectedDailySpent.greaterThan(budgetLimits.dailySpendingCap)) {
        approval.approved = false;
        approval.reason = `Transaction would exceed daily spending limit. Current: $${currentSpending.dailySpent}, Limit: $${budgetLimits.dailySpendingCap}`;
        approval.riskScore = 90;
        return approval;
      }

      // Check weekly spending limit
      const projectedWeeklySpent = new Decimal(currentSpending.weeklySpent).plus(amount);
      if (projectedWeeklySpent.greaterThan(budgetLimits.weeklySpendingCap)) {
        approval.approved = false;
        approval.reason = `Transaction would exceed weekly spending limit. Current: $${currentSpending.weeklySpent}, Limit: $${budgetLimits.weeklySpendingCap}`;
        approval.riskScore = 85;
        return approval;
      }

      // Check monthly spending limit
      const projectedMonthlySpent = new Decimal(currentSpending.monthlySpent).plus(amount);
      if (projectedMonthlySpent.greaterThan(budgetLimits.monthlySpendingCap)) {
        approval.approved = false;
        approval.reason = `Transaction would exceed monthly spending limit. Current: $${currentSpending.monthlySpent}, Limit: $${budgetLimits.monthlySpendingCap}`;
        approval.riskScore = 80;
        return approval;
      }

      // Check total budget limit
      const projectedTotalSpent = new Decimal(currentSpending.totalSpent).plus(amount);
      if (projectedTotalSpent.greaterThan(budgetLimits.totalBudgetLimit)) {
        approval.approved = false;
        approval.reason = `Transaction would exceed total budget limit. Current: $${currentSpending.totalSpent}, Limit: $${budgetLimits.totalBudgetLimit}`;
        approval.riskScore = 95;
        return approval;
      }

      // Check emergency stop threshold
      if (projectedTotalSpent.greaterThan(budgetLimits.emergencyStopThreshold)) {
        approval.approved = false;
        approval.reason = `Transaction would trigger emergency stop threshold. Current: $${currentSpending.totalSpent}, Threshold: $${budgetLimits.emergencyStopThreshold}`;
        approval.riskScore = 100;
        
        // Trigger emergency stop
        await this.triggerEmergencyStop(userId, 'budget_threshold_exceeded', {
          currentSpending: currentSpending.totalSpent,
          threshold: budgetLimits.emergencyStopThreshold,
          attemptedAmount: amount,
        });
        
        return approval;
      }

      // Check for suspicious activity
      const suspiciousActivityResult = await this.suspiciousActivityDetector.analyzeTransaction(
        request,
        request.metadata || {}
      );

      // Calculate risk score and warnings
      approval.riskScore = this.calculateTransactionRiskScore(request, budgetLimits, currentSpending);
      approval.warnings = this.generateSpendingWarnings(request, budgetLimits, currentSpending);

      // Enhanced safety controls for suspicious activity
      if (suspiciousActivityResult.isSuspicious) {
        approval.suspiciousActivity = {
          detected: true,
          riskScore: suspiciousActivityResult.riskScore,
          reasons: suspiciousActivityResult.reasons,
          recommendedAction: suspiciousActivityResult.recommendedAction,
        };

        // Increase overall risk score
        approval.riskScore += suspiciousActivityResult.riskScore;

        // Add warnings
        approval.warnings.push(...suspiciousActivityResult.reasons);

        // Enhanced safety controls based on suspicious activity
        if (suspiciousActivityResult.recommendedAction === 'block') {
          approval.approved = false;
          approval.reason = `Transaction blocked due to suspicious activity: ${suspiciousActivityResult.reasons.join(', ')}`;
          approval.riskScore = 100;
          
          // Trigger automatic safety measures
          await this.triggerSuspiciousActivitySafetyMeasures(userId, suspiciousActivityResult, request);
          
          return approval;
        } else if (suspiciousActivityResult.recommendedAction === 'require_verification') {
          approval.approved = false;
          approval.reason = 'Transaction requires additional verification due to suspicious activity patterns';
          approval.riskScore = Math.max(approval.riskScore, 75);
          
          // Store transaction for manual review
          await this.storeTransactionForReview(userId, request, suspiciousActivityResult);
          
          return approval;
        } else if (suspiciousActivityResult.recommendedAction === 'flag') {
          approval.warnings.push('Transaction flagged for monitoring due to unusual patterns');
          
          // Log for monitoring but allow transaction
          await this.logFlaggedTransaction(userId, request, suspiciousActivityResult);
        }
      }

      // Additional safety controls for high-risk transactions
      if (approval.riskScore >= 70) {
        // Apply additional safety checks for high-risk transactions
        const additionalSafetyCheck = await this.performAdditionalSafetyChecks(request, budgetLimits, currentSpending);
        
        if (!additionalSafetyCheck.passed) {
          approval.approved = false;
          approval.reason = additionalSafetyCheck.reason;
          approval.warnings.push(...additionalSafetyCheck.warnings);
          return approval;
        }
      }

      // Check warning thresholds
      const dailyUtilization = projectedDailySpent.dividedBy(budgetLimits.dailySpendingCap).toNumber();
      const weeklyUtilization = projectedWeeklySpent.dividedBy(budgetLimits.weeklySpendingCap).toNumber();
      const monthlyUtilization = projectedMonthlySpent.dividedBy(budgetLimits.monthlySpendingCap).toNumber();

      if (dailyUtilization >= this.config.warningThresholds.daily) {
        approval.warnings.push(`Daily spending at ${(dailyUtilization * 100).toFixed(1)}% of limit`);
      }

      if (weeklyUtilization >= this.config.warningThresholds.weekly) {
        approval.warnings.push(`Weekly spending at ${(weeklyUtilization * 100).toFixed(1)}% of limit`);
      }

      if (monthlyUtilization >= this.config.warningThresholds.monthly) {
        approval.warnings.push(`Monthly spending at ${(monthlyUtilization * 100).toFixed(1)}% of limit`);
      }

      return approval;

    } catch (error) {
      this.logger.error('Error approving spending:', error);
      throw error;
    }
  }

  public async recordSpending(request: SpendingRequest): Promise<void> {
    try {
      const { userId, amount, transactionType } = request;

      // Only record actual spending (buys), not sales
      if (transactionType !== 'buy') {
        return;
      }

      // Get current spending tracker
      let spending = await this.getCurrentSpending(userId);

      // Update spending amounts
      spending.dailySpent = new Decimal(spending.dailySpent).plus(amount).toNumber();
      spending.weeklySpent = new Decimal(spending.weeklySpent).plus(amount).toNumber();
      spending.monthlySpent = new Decimal(spending.monthlySpent).plus(amount).toNumber();
      spending.totalSpent = new Decimal(spending.totalSpent).plus(amount).toNumber();
      spending.transactionCount += 1;
      spending.averageTransactionSize = spending.totalSpent / spending.transactionCount;
      spending.largestTransaction = Math.max(spending.largestTransaction, amount);
      spending.updatedAt = new Date();

      // Save to database and cache
      await this.saveSpendingTracker(spending);
      this.spendingCache.set(userId, spending);

      // Emit event
      this.emit('spendingRecorded', spending, request);

      this.logger.debug('Spending recorded', {
        userId,
        amount,
        dailyTotal: spending.dailySpent,
        totalSpent: spending.totalSpent,
      });

    } catch (error) {
      this.logger.error('Error recording spending:', error);
      throw error;
    }
  }

  public async getCurrentSpending(userId: string): Promise<SpendingTracker> {
    try {
      // Check cache first
      const cached = this.spendingCache.get(userId);
      if (cached && this.isSpendingDataCurrent(cached)) {
        return cached;
      }

      // Load from database or create new
      let spending = await this.loadSpendingTrackerFromDb(userId);
      
      if (!spending || !this.isSpendingDataCurrent(spending)) {
        spending = await this.createSpendingTracker(userId);
      }

      this.spendingCache.set(userId, spending);
      return spending;

    } catch (error) {
      this.logger.error('Error getting current spending:', error);
      throw error;
    }
  }

  // Risk Assessment
  private calculateTransactionRiskScore(
    request: SpendingRequest,
    budgetLimits: BudgetLimits,
    currentSpending: SpendingTracker
  ): number {
    let riskScore = 0;

    // Amount risk (higher amounts = higher risk)
    const amountRisk = (request.amount / budgetLimits.maxPricePerMoment) * 30;
    riskScore += Math.min(30, amountRisk);

    // Daily utilization risk
    const dailyUtilization = (currentSpending.dailySpent + request.amount) / budgetLimits.dailySpendingCap;
    riskScore += dailyUtilization * 25;

    // Total utilization risk
    const totalUtilization = (currentSpending.totalSpent + request.amount) / budgetLimits.totalBudgetLimit;
    riskScore += totalUtilization * 20;

    // Transaction frequency risk
    const transactionFrequency = currentSpending.transactionCount / Math.max(1, this.getDaysSinceStart(currentSpending));
    if (transactionFrequency > 10) { // More than 10 transactions per day
      riskScore += 15;
    } else if (transactionFrequency > 5) {
      riskScore += 10;
    }

    // Emergency threshold proximity
    const emergencyProximity = (currentSpending.totalSpent + request.amount) / budgetLimits.emergencyStopThreshold;
    if (emergencyProximity > 0.9) {
      riskScore += 20;
    } else if (emergencyProximity > 0.8) {
      riskScore += 10;
    }

    return Math.min(100, Math.max(0, riskScore));
  }

  private generateSpendingWarnings(
    request: SpendingRequest,
    budgetLimits: BudgetLimits,
    currentSpending: SpendingTracker
  ): string[] {
    const warnings: string[] = [];

    // Check if approaching limits
    const dailyUtilization = (currentSpending.dailySpent + request.amount) / budgetLimits.dailySpendingCap;
    const weeklyUtilization = (currentSpending.weeklySpent + request.amount) / budgetLimits.weeklySpendingCap;
    const monthlyUtilization = (currentSpending.monthlySpent + request.amount) / budgetLimits.monthlySpendingCap;

    if (dailyUtilization > 0.8) {
      warnings.push(`Approaching daily spending limit (${(dailyUtilization * 100).toFixed(1)}%)`);
    }

    if (weeklyUtilization > 0.8) {
      warnings.push(`Approaching weekly spending limit (${(weeklyUtilization * 100).toFixed(1)}%)`);
    }

    if (monthlyUtilization > 0.8) {
      warnings.push(`Approaching monthly spending limit (${(monthlyUtilization * 100).toFixed(1)}%)`);
    }

    // Check for large transaction
    if (request.amount > currentSpending.averageTransactionSize * 3) {
      warnings.push(`Transaction is ${(request.amount / currentSpending.averageTransactionSize).toFixed(1)}x larger than average`);
    }

    // Check transaction frequency
    const today = moment().startOf('day');
    const todayTransactions = currentSpending.transactionCount; // Simplified
    if (todayTransactions > 20) {
      warnings.push(`High transaction frequency today (${todayTransactions} transactions)`);
    }

    return warnings;
  }

  // Emergency Stop Management
  public async triggerEmergencyStop(
    userId: string,
    reason: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      this.logger.warn('Emergency stop triggered', {
        userId,
        reason,
        data,
      });

      // Create emergency stop record
      const emergencyStop = {
        id: `emergency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        triggeredBy: 'system',
        reason,
        triggerConditions: [],
        isActive: true,
        triggeredAt: new Date(),
        impact: {
          strategiesPaused: [],
          transactionsCancelled: [],
          ordersModified: [],
          estimatedLossPrevented: 0,
        },
      };

      // Store emergency stop
      await this.storeEmergencyStop(emergencyStop);

      // Create critical alert
      const alert: RiskAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type: 'emergency_stop',
        severity: 'critical',
        title: 'Emergency Stop Triggered',
        message: `Emergency stop activated: ${reason}`,
        threshold: 0,
        currentValue: 0,
        triggered: true,
        triggeredAt: new Date(),
        acknowledged: false,
        autoResolve: false,
        metadata: { emergencyStopId: emergencyStop.id, ...data },
        createdAt: new Date(),
      };

      await this.createRiskAlert(alert);

      // Emit events
      this.emit('emergencyStopTriggered', emergencyStop);
      this.emit('criticalAlert', alert);

    } catch (error) {
      this.logger.error('Error triggering emergency stop:', error);
      throw error;
    }
  }

  public async resolveEmergencyStop(
    userId: string,
    emergencyStopId: string,
    resolvedBy: string
  ): Promise<void> {
    try {
      // Load emergency stop
      const emergencyStop = await this.loadEmergencyStop(emergencyStopId);
      if (!emergencyStop || emergencyStop.userId !== userId) {
        throw new Error('Emergency stop not found');
      }

      // Update emergency stop
      emergencyStop.isActive = false;
      emergencyStop.resolvedAt = new Date();
      emergencyStop.resolvedBy = resolvedBy;

      // Save updated emergency stop
      await this.storeEmergencyStop(emergencyStop);

      // Emit event
      this.emit('emergencyStopResolved', emergencyStop);

      this.logger.info('Emergency stop resolved', {
        emergencyStopId,
        userId,
        resolvedBy,
      });

    } catch (error) {
      this.logger.error('Error resolving emergency stop:', error);
      throw error;
    }
  }

  // Budget Allocation Management
  public async createBudgetAllocation(
    userId: string,
    totalBudget: number,
    allocations: Omit<AllocationItem, 'currentValue' | 'utilization' | 'performance' | 'riskContribution'>[]
  ): Promise<BudgetAllocation> {
    try {
      // Validate allocations sum to 100%
      const totalPercentage = allocations.reduce((sum, alloc) => sum + alloc.allocatedPercentage, 0);
      if (Math.abs(totalPercentage - 1.0) > 0.01) {
        throw new Error('Allocation percentages must sum to 100%');
      }

      // Create full allocation items
      const fullAllocations: AllocationItem[] = allocations.map(alloc => ({
        ...alloc,
        currentValue: 0,
        utilization: 0,
        performance: 0,
        riskContribution: 0,
      }));

      const budgetAllocation: BudgetAllocation = {
        userId,
        totalBudget,
        allocations: fullAllocations,
        unallocated: 0,
        rebalanceFrequency: 'weekly',
        lastRebalance: new Date(),
        nextRebalance: moment().add(1, 'week').toDate(),
      };

      // Store allocation
      await this.storeBudgetAllocation(budgetAllocation);

      this.emit('budgetAllocationCreated', budgetAllocation);

      return budgetAllocation;

    } catch (error) {
      this.logger.error('Error creating budget allocation:', error);
      throw error;
    }
  }

  // Utility Methods
  private validateBudgetLimits(limits: Partial<BudgetLimits>): void {
    if (limits.dailySpendingCap !== undefined) {
      if (limits.dailySpendingCap <= 0) {
        throw new Error('Daily spending cap must be positive');
      }
      if (limits.dailySpendingCap > 100000) {
        throw new Error('Daily spending cap cannot exceed $100,000');
      }
    }

    if (limits.weeklySpendingCap !== undefined) {
      if (limits.weeklySpendingCap <= 0) {
        throw new Error('Weekly spending cap must be positive');
      }
      if (limits.weeklySpendingCap > 500000) {
        throw new Error('Weekly spending cap cannot exceed $500,000');
      }
    }

    if (limits.monthlySpendingCap !== undefined) {
      if (limits.monthlySpendingCap <= 0) {
        throw new Error('Monthly spending cap must be positive');
      }
      if (limits.monthlySpendingCap > 2000000) {
        throw new Error('Monthly spending cap cannot exceed $2,000,000');
      }
    }

    if (limits.maxPricePerMoment !== undefined) {
      if (limits.maxPricePerMoment <= 0) {
        throw new Error('Max price per moment must be positive');
      }
      if (limits.maxPricePerMoment > 50000) {
        throw new Error('Max price per moment cannot exceed $50,000');
      }
    }

    if (limits.totalBudgetLimit !== undefined) {
      if (limits.totalBudgetLimit <= 0) {
        throw new Error('Total budget limit must be positive');
      }
      if (limits.totalBudgetLimit > 10000000) {
        throw new Error('Total budget limit cannot exceed $10,000,000');
      }
    }

    if (limits.emergencyStopThreshold !== undefined) {
      if (limits.emergencyStopThreshold <= 0) {
        throw new Error('Emergency stop threshold must be positive');
      }
    }

    if (limits.reserveAmount !== undefined) {
      if (limits.reserveAmount < 0) {
        throw new Error('Reserve amount cannot be negative');
      }
    }

    // Cross-validation rules
    if (limits.dailySpendingCap && limits.weeklySpendingCap && 
        limits.dailySpendingCap * 7 > limits.weeklySpendingCap) {
      throw new Error('Weekly limit should be at least 7x daily limit');
    }

    if (limits.weeklySpendingCap && limits.monthlySpendingCap && 
        limits.weeklySpendingCap * 4 > limits.monthlySpendingCap) {
      throw new Error('Monthly limit should be at least 4x weekly limit');
    }

    if (limits.emergencyStopThreshold && limits.totalBudgetLimit &&
        limits.emergencyStopThreshold > limits.totalBudgetLimit) {
      throw new Error('Emergency stop threshold cannot exceed total budget limit');
    }

    if (limits.reserveAmount && limits.totalBudgetLimit &&
        limits.reserveAmount > limits.totalBudgetLimit * 0.5) {
      throw new Error('Reserve amount cannot exceed 50% of total budget');
    }

    if (limits.maxPricePerMoment && limits.dailySpendingCap &&
        limits.maxPricePerMoment > limits.dailySpendingCap) {
      throw new Error('Max price per moment cannot exceed daily spending cap');
    }
  }

  private requiresConfirmation(newLimits: Partial<BudgetLimits>, currentLimits: BudgetLimits): boolean {
    // Require confirmation for significant increases
    const significantIncreaseThreshold = 2.0; // 100% increase
    const significantDecreaseThreshold = 0.5; // 50% decrease

    // Check daily spending cap
    if (newLimits.dailySpendingCap !== undefined) {
      const ratio = newLimits.dailySpendingCap / currentLimits.dailySpendingCap;
      if (ratio >= significantIncreaseThreshold || ratio <= significantDecreaseThreshold) {
        return true;
      }
    }

    // Check total budget limit
    if (newLimits.totalBudgetLimit !== undefined) {
      const ratio = newLimits.totalBudgetLimit / currentLimits.totalBudgetLimit;
      if (ratio >= significantIncreaseThreshold || ratio <= significantDecreaseThreshold) {
        return true;
      }
    }

    // Check max price per moment
    if (newLimits.maxPricePerMoment !== undefined) {
      const ratio = newLimits.maxPricePerMoment / currentLimits.maxPricePerMoment;
      if (ratio >= significantIncreaseThreshold) {
        return true;
      }
    }

    // Check emergency stop threshold changes
    if (newLimits.emergencyStopThreshold !== undefined) {
      const ratio = newLimits.emergencyStopThreshold / currentLimits.emergencyStopThreshold;
      if (ratio >= significantIncreaseThreshold || ratio <= significantDecreaseThreshold) {
        return true;
      }
    }

    return false;
  }

  private assessBudgetChangeRisk(newLimits: Partial<BudgetLimits>, currentLimits: BudgetLimits): {
    riskLevel: 'low' | 'medium' | 'high';
    riskFactors: string[];
    recommendations: string[];
  } {
    const riskFactors: string[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // Assess daily limit changes
    if (newLimits.dailySpendingCap !== undefined) {
      const ratio = newLimits.dailySpendingCap / currentLimits.dailySpendingCap;
      if (ratio > 3) {
        riskFactors.push(`Daily limit increase of ${((ratio - 1) * 100).toFixed(0)}%`);
        recommendations.push('Consider gradual limit increases to monitor spending patterns');
        riskScore += 30;
      } else if (ratio < 0.3) {
        riskFactors.push(`Daily limit decrease of ${((1 - ratio) * 100).toFixed(0)}%`);
        recommendations.push('Ensure reduced limits align with your trading strategy');
        riskScore += 10;
      }
    }

    // Assess total budget changes
    if (newLimits.totalBudgetLimit !== undefined) {
      const ratio = newLimits.totalBudgetLimit / currentLimits.totalBudgetLimit;
      if (ratio > 2) {
        riskFactors.push(`Total budget increase of ${((ratio - 1) * 100).toFixed(0)}%`);
        recommendations.push('Ensure you have adequate risk management for increased exposure');
        riskScore += 25;
      }
    }

    // Assess max price per moment changes
    if (newLimits.maxPricePerMoment !== undefined) {
      const ratio = newLimits.maxPricePerMoment / currentLimits.maxPricePerMoment;
      if (ratio > 2) {
        riskFactors.push(`Max price per moment increase of ${((ratio - 1) * 100).toFixed(0)}%`);
        recommendations.push('Higher price limits increase exposure to individual moment risk');
        riskScore += 20;
      }
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high';
    if (riskScore >= 50) {
      riskLevel = 'high';
    } else if (riskScore >= 25) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return { riskLevel, riskFactors, recommendations };
  }

  private async storePendingBudgetChanges(userId: string, changes: Partial<BudgetLimits>): Promise<void> {
    try {
      const key = `pending_budget_changes:${userId}`;
      const data = {
        changes,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };
      
      await this.redisClient.setEx(key, 24 * 3600, JSON.stringify(data));
      this.logger.debug('Stored pending budget changes', { userId });
    } catch (error) {
      this.logger.error('Error storing pending budget changes:', error);
      throw error;
    }
  }

  private async getPendingBudgetChanges(userId: string): Promise<Partial<BudgetLimits> | null> {
    try {
      const key = `pending_budget_changes:${userId}`;
      const stored = await this.redisClient.get(key);
      
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);
      
      // Check if expired
      if (new Date() > new Date(data.expiresAt)) {
        await this.clearPendingBudgetChanges(userId);
        return null;
      }

      return data.changes;
    } catch (error) {
      this.logger.error('Error getting pending budget changes:', error);
      return null;
    }
  }

  private async clearPendingBudgetChanges(userId: string): Promise<void> {
    try {
      const key = `pending_budget_changes:${userId}`;
      await this.redisClient.del(key);
      this.logger.debug('Cleared pending budget changes', { userId });
    } catch (error) {
      this.logger.error('Error clearing pending budget changes:', error);
    }
  }

  private async createDefaultBudgetLimits(userId: string): Promise<BudgetLimits> {
    const defaultLimits: BudgetLimits = {
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      dailySpendingCap: this.config.defaultDailyLimit,
      weeklySpendingCap: this.config.defaultWeeklyLimit,
      monthlySpendingCap: this.config.defaultMonthlyLimit,
      maxPricePerMoment: this.config.defaultMaxPricePerMoment,
      totalBudgetLimit: this.config.defaultMonthlyLimit * 12,
      emergencyStopThreshold: this.config.defaultMonthlyLimit * 6,
      reserveAmount: this.config.defaultMonthlyLimit * this.config.defaultReservePercentage,
      autoRebalance: true,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveBudgetLimits(defaultLimits);
    return defaultLimits;
  }

  private async createSpendingTracker(userId: string): Promise<SpendingTracker> {
    const tracker: SpendingTracker = {
      id: `spending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      date: new Date(),
      dailySpent: 0,
      weeklySpent: 0,
      monthlySpent: 0,
      totalSpent: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
      largestTransaction: 0,
      updatedAt: new Date(),
    };

    await this.saveSpendingTracker(tracker);
    return tracker;
  }

  private isSpendingDataCurrent(spending: SpendingTracker): boolean {
    const today = moment().startOf('day');
    const spendingDate = moment(spending.date).startOf('day');
    return today.isSame(spendingDate);
  }

  private getDaysSinceStart(spending: SpendingTracker): number {
    return moment().diff(moment(spending.date), 'days') + 1;
  }

  private startDailyResetScheduler(): void {
    // Reset daily spending at midnight
    this.resetInterval = setInterval(async () => {
      try {
        await this.performDailyReset();
      } catch (error) {
        this.logger.error('Error in daily reset:', error);
      }
    }, 60000); // Check every minute

    this.logger.info('Daily reset scheduler started');
  }

  private async performDailyReset(): Promise<void> {
    const now = moment();
    
    // Check if it's midnight (within 1 minute)
    if (now.hour() === 0 && now.minute() === 0) {
      this.logger.info('Performing daily spending reset');

      try {
        // Reset daily spending for all users in cache
        const resetPromises: Promise<void>[] = [];
        
        for (const [userId, spending] of this.spendingCache) {
          resetPromises.push(this.resetDailySpendingForUser(userId, spending));
        }

        // Also reset for users not in cache but in database
        const allUserSpending = await this.getAllUserSpendingTrackers();
        for (const spending of allUserSpending) {
          if (!this.spendingCache.has(spending.userId)) {
            resetPromises.push(this.resetDailySpendingForUser(spending.userId, spending));
          }
        }

        await Promise.all(resetPromises);

        // Reset hourly transaction counters
        await this.resetHourlyTransactionCounters();

        // Also reset weekly/monthly if needed
        if (now.day() === 0) { // Sunday
          await this.performWeeklyReset();
        }

        if (now.date() === 1) { // First day of month
          await this.performMonthlyReset();
        }

        this.logger.info('Daily spending reset completed successfully');

      } catch (error) {
        this.logger.error('Error during daily spending reset:', error);
      }
    }
  }

  private async resetDailySpendingForUser(userId: string, spending: SpendingTracker): Promise<void> {
    try {
      const previousDailySpent = spending.dailySpent;
      
      spending.dailySpent = 0;
      spending.date = new Date();
      spending.updatedAt = new Date();
      
      await this.saveSpendingTracker(spending);
      this.spendingCache.set(userId, spending);
      
      this.emit('dailySpendingReset', userId, spending);
      
      this.logger.debug('Daily spending reset for user', {
        userId,
        previousDailySpent,
        resetDate: spending.date,
      });

    } catch (error) {
      this.logger.error('Error resetting daily spending for user:', error);
    }
  }

  private async resetHourlyTransactionCounters(): Promise<void> {
    try {
      // Get all hourly transaction counter keys
      const pattern = 'hourly_transactions:*';
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        this.logger.debug('Reset hourly transaction counters', { count: keys.length });
      }
    } catch (error) {
      this.logger.error('Error resetting hourly transaction counters:', error);
    }
  }

  private async getAllUserSpendingTrackers(): Promise<SpendingTracker[]> {
    try {
      // This would query the database for all spending trackers
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      this.logger.error('Error getting all user spending trackers:', error);
      return [];
    }
  }

  private async performWeeklyReset(): Promise<void> {
    this.logger.info('Performing weekly spending reset');
    
    for (const [userId, spending] of this.spendingCache) {
      spending.weeklySpent = 0;
      spending.updatedAt = new Date();
      
      await this.saveSpendingTracker(spending);
      this.emit('weeklySpendingReset', userId, spending);
    }
  }

  private async performMonthlyReset(): Promise<void> {
    this.logger.info('Performing monthly spending reset');
    
    for (const [userId, spending] of this.spendingCache) {
      spending.monthlySpent = 0;
      spending.updatedAt = new Date();
      
      await this.saveSpendingTracker(spending);
      this.emit('monthlySpendingReset', userId, spending);
    }
  }

  // Database operations
  private async loadBudgetData(): Promise<void> {
    // Load budget limits and spending trackers from database
    this.logger.debug('Loading budget data from database');
    // Data will be loaded on-demand when requested
  }

  private async loadBudgetLimitsFromDb(userId: string): Promise<BudgetLimits | null> {
    try {
      return await this.db.budgetLimits.findByUserId(userId);
    } catch (error) {
      this.logger.error('Error loading budget limits from database:', error);
      return null;
    }
  }

  private async saveBudgetLimits(limits: BudgetLimits): Promise<void> {
    try {
      const existing = await this.db.budgetLimits.findByUserId(limits.userId);
      if (existing) {
        await this.db.budgetLimits.updateBudgetLimits(existing.id, limits);
      } else {
        await this.db.budgetLimits.createBudgetLimits(limits);
      }
      this.logger.debug('Saved budget limits', { userId: limits.userId });
    } catch (error) {
      this.logger.error('Error saving budget limits:', error);
      throw error;
    }
  }

  private async loadSpendingTrackerFromDb(userId: string): Promise<SpendingTracker | null> {
    try {
      return await this.db.spendingTracker.findByUserId(userId);
    } catch (error) {
      this.logger.error('Error loading spending tracker from database:', error);
      return null;
    }
  }

  private async saveSpendingTracker(tracker: SpendingTracker): Promise<void> {
    try {
      const existing = await this.db.spendingTracker.findByUserIdAndDate(tracker.userId, tracker.date);
      if (existing) {
        await this.db.spendingTracker.updateSpendingTracker(existing.id, tracker);
      } else {
        await this.db.spendingTracker.createSpendingTracker(tracker);
      }
      this.logger.debug('Saved spending tracker', { userId: tracker.userId });
    } catch (error) {
      this.logger.error('Error saving spending tracker:', error);
      throw error;
    }
  }

  private async storeEmergencyStop(emergencyStop: any): Promise<void> {
    try {
      await this.db.emergencyStops.createEmergencyStop(emergencyStop);
      this.logger.debug('Stored emergency stop', { id: emergencyStop.id });
    } catch (error) {
      this.logger.error('Error storing emergency stop:', error);
      throw error;
    }
  }

  private async loadEmergencyStop(id: string): Promise<any> {
    try {
      return await this.db.emergencyStops.findById(id);
    } catch (error) {
      this.logger.error('Error loading emergency stop:', error);
      return null;
    }
  }

  private async storeBudgetAllocation(allocation: BudgetAllocation): Promise<void> {
    // For now, we'll store this in Redis cache since we don't have a dedicated table
    try {
      const key = `budget_allocation:${allocation.userId}`;
      await this.redisClient.setEx(key, 86400, JSON.stringify(allocation)); // 24 hours TTL
      this.logger.debug('Stored budget allocation', { userId: allocation.userId });
    } catch (error) {
      this.logger.error('Error storing budget allocation:', error);
      throw error;
    }
  }

  private async createRiskAlert(alert: RiskAlert): Promise<void> {
    try {
      await this.db.riskAlerts.createRiskAlert(alert);
      this.logger.debug('Created risk alert', { alertId: alert.id, type: alert.type });
    } catch (error) {
      this.logger.error('Error creating risk alert:', error);
      throw error;
    }
  }

  // Safety Control Methods
  private async triggerSuspiciousActivitySafetyMeasures(
    userId: string,
    suspiciousActivityResult: any,
    request: SpendingRequest
  ): Promise<void> {
    try {
      // Create suspicious activity alert
      await this.suspiciousActivityDetector.createSuspiciousActivityAlert(
        userId,
        suspiciousActivityResult,
        request
      );

      // Temporarily reduce spending limits if high risk
      if (suspiciousActivityResult.riskScore >= 80) {
        await this.temporarilyReduceSpendingLimits(userId, 'suspicious_activity');
      }

      // Log security event
      await this.logSecurityEvent(userId, 'suspicious_activity_blocked', {
        riskScore: suspiciousActivityResult.riskScore,
        reasons: suspiciousActivityResult.reasons,
        transactionAmount: request.amount,
        momentId: request.momentId,
      });

      this.emit('suspiciousActivityBlocked', {
        userId,
        request,
        suspiciousActivityResult,
      });

    } catch (error) {
      this.logger.error('Error triggering suspicious activity safety measures:', error);
    }
  }

  private async storeTransactionForReview(
    userId: string,
    request: SpendingRequest,
    suspiciousActivityResult: any
  ): Promise<void> {
    try {
      const reviewItem = {
        id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        transactionRequest: request,
        suspiciousActivityResult,
        status: 'pending_review',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      // Store in Redis for manual review
      const key = `transaction_review:${reviewItem.id}`;
      await this.redisClient.setEx(key, 24 * 3600, JSON.stringify(reviewItem));

      // Also store user's pending reviews list
      const userReviewsKey = `user_reviews:${userId}`;
      const existingReviews = await this.redisClient.get(userReviewsKey);
      const reviews = existingReviews ? JSON.parse(existingReviews) : [];
      reviews.push(reviewItem.id);
      await this.redisClient.setEx(userReviewsKey, 24 * 3600, JSON.stringify(reviews));

      this.emit('transactionRequiresReview', {
        userId,
        reviewId: reviewItem.id,
        request,
        suspiciousActivityResult,
      });

    } catch (error) {
      this.logger.error('Error storing transaction for review:', error);
    }
  }

  private async logFlaggedTransaction(
    userId: string,
    request: SpendingRequest,
    suspiciousActivityResult: any
  ): Promise<void> {
    try {
      await this.logSecurityEvent(userId, 'transaction_flagged', {
        riskScore: suspiciousActivityResult.riskScore,
        reasons: suspiciousActivityResult.reasons,
        transactionAmount: request.amount,
        momentId: request.momentId,
        strategyId: request.strategyId,
      });

      this.emit('transactionFlagged', {
        userId,
        request,
        suspiciousActivityResult,
      });

    } catch (error) {
      this.logger.error('Error logging flagged transaction:', error);
    }
  }

  private async performAdditionalSafetyChecks(
    request: SpendingRequest,
    budgetLimits: BudgetLimits,
    currentSpending: SpendingTracker
  ): Promise<{ passed: boolean; reason?: string; warnings: string[] }> {
    const warnings: string[] = [];

    // Check if transaction would consume more than 50% of remaining daily budget
    const remainingDaily = budgetLimits.dailySpendingCap - currentSpending.dailySpent;
    if (request.amount > remainingDaily * 0.5) {
      return {
        passed: false,
        reason: 'Transaction would consume more than 50% of remaining daily budget',
        warnings: ['High budget utilization detected'],
      };
    }

    // Check if transaction is significantly larger than recent average
    if (currentSpending.averageTransactionSize > 0) {
      const sizeRatio = request.amount / currentSpending.averageTransactionSize;
      if (sizeRatio > 5) {
        warnings.push(`Transaction is ${sizeRatio.toFixed(1)}x larger than recent average`);
      }
    }

    // Check transaction frequency in last hour
    const hourlyTransactionCount = await this.getHourlyTransactionCount(request.userId);
    if (hourlyTransactionCount > 10) {
      return {
        passed: false,
        reason: 'Too many transactions in the last hour',
        warnings: [`${hourlyTransactionCount} transactions in last hour`],
      };
    }

    return { passed: true, warnings };
  }

  private async temporarilyReduceSpendingLimits(userId: string, reason: string): Promise<void> {
    try {
      const currentLimits = await this.getBudgetLimits(userId);
      if (!currentLimits) return;

      // Reduce limits by 50% temporarily
      const reducedLimits = {
        dailySpendingCap: currentLimits.dailySpendingCap * 0.5,
        maxPricePerMoment: currentLimits.maxPricePerMoment * 0.5,
      };

      // Store original limits for restoration
      const key = `original_limits:${userId}`;
      await this.redisClient.setEx(key, 24 * 3600, JSON.stringify({
        originalLimits: currentLimits,
        reason,
        reducedAt: new Date(),
      }));

      // Apply reduced limits
      await this.setBudgetLimits(userId, reducedLimits, false);

      this.emit('spendingLimitsTemporarilyReduced', {
        userId,
        reason,
        originalLimits: currentLimits,
        reducedLimits,
      });

    } catch (error) {
      this.logger.error('Error temporarily reducing spending limits:', error);
    }
  }

  private async getHourlyTransactionCount(userId: string): Promise<number> {
    try {
      const key = `hourly_transactions:${userId}`;
      const count = await this.redisClient.get(key);
      return count ? parseInt(count) : 0;
    } catch (error) {
      this.logger.error('Error getting hourly transaction count:', error);
      return 0;
    }
  }

  private async logSecurityEvent(userId: string, eventType: string, data: Record<string, any>): Promise<void> {
    try {
      const securityEvent = {
        id: `security_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        eventType,
        data,
        timestamp: new Date(),
        severity: this.getSecurityEventSeverity(eventType),
      };

      // Store in database if available, otherwise log
      try {
        await this.db.securityEvents?.createSecurityEvent(securityEvent);
      } catch (dbError) {
        this.logger.warn('Could not store security event in database, logging instead', {
          securityEvent,
          error: dbError,
        });
      }

      this.emit('securityEvent', securityEvent);

    } catch (error) {
      this.logger.error('Error logging security event:', error);
    }
  }

  private getSecurityEventSeverity(eventType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (eventType) {
      case 'suspicious_activity_blocked':
        return 'high';
      case 'transaction_flagged':
        return 'medium';
      case 'emergency_stop_triggered':
        return 'critical';
      case 'spending_limits_reduced':
        return 'medium';
      default:
        return 'low';
    }
  }

  // Public API methods
  public async getBudgetStatus(userId: string): Promise<{
    limits: BudgetLimits;
    spending: SpendingTracker;
    utilization: {
      daily: number;
      weekly: number;
      monthly: number;
      total: number;
    };
    warnings: string[];
    safetyStatus: {
      emergencyStopActive: boolean;
      limitsTemporarilyReduced: boolean;
      pendingReviews: number;
      recentSecurityEvents: number;
    };
  }> {
    const limits = await this.getBudgetLimits(userId);

    if (!limits) {
      throw new Error('Budget limits not found');
    }

    const spending = await this.getCurrentSpending(userId);

    const utilization = {
      daily: spending.dailySpent / limits.dailySpendingCap,
      weekly: spending.weeklySpent / limits.weeklySpendingCap,
      monthly: spending.monthlySpent / limits.monthlySpendingCap,
      total: spending.totalSpent / limits.totalBudgetLimit,
    };

    const warnings: string[] = [];
    if (utilization.daily > 0.9) warnings.push('Daily spending near limit');
    if (utilization.weekly > 0.9) warnings.push('Weekly spending near limit');
    if (utilization.monthly > 0.9) warnings.push('Monthly spending near limit');
    if (utilization.total > 0.8) warnings.push('Total budget utilization high');

    // Get safety status
    const safetyStatus = await this.getSafetyStatus(userId);

    return {
      limits,
      spending,
      utilization,
      warnings,
      safetyStatus,
    };
  }

  private async getSafetyStatus(userId: string): Promise<{
    emergencyStopActive: boolean;
    limitsTemporarilyReduced: boolean;
    pendingReviews: number;
    recentSecurityEvents: number;
  }> {
    try {
      // Check for active emergency stops
      const emergencyStopActive = await this.hasActiveEmergencyStop(userId);

      // Check for temporarily reduced limits
      const limitsTemporarilyReduced = await this.hasTemporarilyReducedLimits(userId);

      // Count pending reviews
      const pendingReviews = await this.getPendingReviewsCount(userId);

      // Count recent security events (last 24 hours)
      const recentSecurityEvents = await this.getRecentSecurityEventsCount(userId);

      return {
        emergencyStopActive,
        limitsTemporarilyReduced,
        pendingReviews,
        recentSecurityEvents,
      };
    } catch (error) {
      this.logger.error('Error getting safety status:', error);
      return {
        emergencyStopActive: false,
        limitsTemporarilyReduced: false,
        pendingReviews: 0,
        recentSecurityEvents: 0,
      };
    }
  }

  private async hasActiveEmergencyStop(userId: string): Promise<boolean> {
    try {
      // This would query the database for active emergency stops
      // For now, return false as a placeholder
      return false;
    } catch (error) {
      return false;
    }
  }

  private async hasTemporarilyReducedLimits(userId: string): Promise<boolean> {
    try {
      const key = `original_limits:${userId}`;
      const stored = await this.redisClient.get(key);
      return !!stored;
    } catch (error) {
      return false;
    }
  }

  private async getPendingReviewsCount(userId: string): Promise<number> {
    try {
      const key = `user_reviews:${userId}`;
      const stored = await this.redisClient.get(key);
      return stored ? JSON.parse(stored).length : 0;
    } catch (error) {
      return 0;
    }
  }

  private async getRecentSecurityEventsCount(userId: string): Promise<number> {
    try {
      // This would query the database for recent security events
      // For now, return 0 as a placeholder
      return 0;
    } catch (error) {
      return 0;
    }
  }

  public getStats(): {
    totalUsersTracked: number;
    totalSpendingTracked: number;
    averageDailySpending: number;
    emergencyStopsTriggered: number;
    suspiciousActivitiesDetected: number;
    budgetLimitViolations: number;
  } {
    const spendingTrackers = Array.from(this.spendingCache.values());
    
    return {
      totalUsersTracked: this.budgetCache.size,
      totalSpendingTracked: spendingTrackers.reduce((sum, tracker) => sum + tracker.totalSpent, 0),
      averageDailySpending: spendingTrackers.length > 0 
        ? spendingTrackers.reduce((sum, tracker) => sum + tracker.dailySpent, 0) / spendingTrackers.length 
        : 0,
      emergencyStopsTriggered: 0, // Would come from database/metrics
      suspiciousActivitiesDetected: this.suspiciousActivityDetector.getStats().suspiciousActivitiesDetected,
      budgetLimitViolations: 0, // Would come from database/metrics
    };
  }
}