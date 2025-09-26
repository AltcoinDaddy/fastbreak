import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import { DatabaseManager } from '@fastbreak/database';
import { SpendingRequest } from './budget-manager';
import { RiskAlert, SpendingTracker } from '../types/risk';

export interface SuspiciousActivityConfig {
  maxTransactionsPerHour: number;
  maxTransactionsPerDay: number;
  unusualAmountThreshold: number; // Multiplier of average transaction size
  rapidFireThreshold: number; // Seconds between transactions
  geolocationCheckEnabled: boolean;
  deviceFingerprintingEnabled: boolean;
  behaviorAnalysisEnabled: boolean;
}

export interface SuspiciousActivityResult {
  isSuspicious: boolean;
  riskScore: number;
  reasons: string[];
  recommendedAction: 'allow' | 'flag' | 'block' | 'require_verification';
  metadata: Record<string, any>;
}

export interface ActivityPattern {
  userId: string;
  transactionTimes: Date[];
  transactionAmounts: number[];
  averageAmount: number;
  typicalHours: number[];
  deviceFingerprints: string[];
  ipAddresses: string[];
  geolocationHistory: string[];
}

export class SuspiciousActivityDetector extends EventEmitter {
  private logger: Logger;
  private config: SuspiciousActivityConfig;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private activityPatterns: Map<string, ActivityPattern>;

  constructor(
    config: SuspiciousActivityConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger;
    this.activityPatterns = new Map();
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Suspicious Activity Detector');
      
      // Load historical activity patterns
      await this.loadActivityPatterns();
      
      this.logger.info('Suspicious Activity Detector initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Suspicious Activity Detector:', error);
      throw error;
    }
  }

  public async analyzeTransaction(
    request: SpendingRequest,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      deviceFingerprint?: string;
      geolocation?: string;
      sessionId?: string;
    } = {}
  ): Promise<SuspiciousActivityResult> {
    try {
      const { userId, amount } = request;
      
      // Get user's activity pattern
      let pattern = await this.getActivityPattern(userId);
      
      const result: SuspiciousActivityResult = {
        isSuspicious: false,
        riskScore: 0,
        reasons: [],
        recommendedAction: 'allow',
        metadata: {},
      };

      // Check transaction frequency
      const frequencyCheck = await this.checkTransactionFrequency(userId, pattern);
      if (frequencyCheck.isSuspicious) {
        result.isSuspicious = true;
        result.riskScore += frequencyCheck.riskScore;
        result.reasons.push(...frequencyCheck.reasons);
      }

      // Check unusual amount
      const amountCheck = this.checkUnusualAmount(amount, pattern);
      if (amountCheck.isSuspicious) {
        result.isSuspicious = true;
        result.riskScore += amountCheck.riskScore;
        result.reasons.push(...amountCheck.reasons);
      }

      // Check rapid-fire transactions
      const rapidFireCheck = await this.checkRapidFireTransactions(userId);
      if (rapidFireCheck.isSuspicious) {
        result.isSuspicious = true;
        result.riskScore += rapidFireCheck.riskScore;
        result.reasons.push(...rapidFireCheck.reasons);
      }

      // Check time-based patterns
      const timePatternCheck = this.checkTimePatterns(pattern);
      if (timePatternCheck.isSuspicious) {
        result.isSuspicious = true;
        result.riskScore += timePatternCheck.riskScore;
        result.reasons.push(...timePatternCheck.reasons);
      }

      // Check geolocation if enabled
      if (this.config.geolocationCheckEnabled && metadata.geolocation) {
        const geoCheck = this.checkGeolocation(metadata.geolocation, pattern);
        if (geoCheck.isSuspicious) {
          result.isSuspicious = true;
          result.riskScore += geoCheck.riskScore;
          result.reasons.push(...geoCheck.reasons);
        }
      }

      // Check device fingerprint if enabled
      if (this.config.deviceFingerprintingEnabled && metadata.deviceFingerprint) {
        const deviceCheck = this.checkDeviceFingerprint(metadata.deviceFingerprint, pattern);
        if (deviceCheck.isSuspicious) {
          result.isSuspicious = true;
          result.riskScore += deviceCheck.riskScore;
          result.reasons.push(...deviceCheck.reasons);
        }
      }

      // Determine recommended action based on risk score
      result.recommendedAction = this.determineRecommendedAction(result.riskScore);
      
      // Store metadata
      result.metadata = {
        analysisTimestamp: new Date(),
        patternDataPoints: pattern.transactionTimes.length,
        ...metadata,
      };

      // Update activity pattern
      await this.updateActivityPattern(userId, request, metadata);

      // Log suspicious activity
      if (result.isSuspicious) {
        this.logger.warn('Suspicious activity detected', {
          userId,
          riskScore: result.riskScore,
          reasons: result.reasons,
          recommendedAction: result.recommendedAction,
        });

        // Emit event for further processing
        this.emit('suspiciousActivityDetected', {
          userId,
          request,
          result,
          metadata,
        });
      }

      return result;

    } catch (error) {
      this.logger.error('Error analyzing transaction for suspicious activity:', error);
      return {
        isSuspicious: false,
        riskScore: 0,
        reasons: ['Analysis error occurred'],
        recommendedAction: 'allow',
        metadata: { error: error.message },
      };
    }
  }

  private async checkTransactionFrequency(
    userId: string, 
    pattern: ActivityPattern
  ): Promise<{ isSuspicious: boolean; riskScore: number; reasons: string[] }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count recent transactions
    const hourlyTransactions = pattern.transactionTimes.filter(time => time > oneHourAgo).length;
    const dailyTransactions = pattern.transactionTimes.filter(time => time > oneDayAgo).length;

    const reasons: string[] = [];
    let riskScore = 0;

    if (hourlyTransactions >= this.config.maxTransactionsPerHour) {
      reasons.push(`Exceeded hourly transaction limit: ${hourlyTransactions}/${this.config.maxTransactionsPerHour}`);
      riskScore += 30;
    }

    if (dailyTransactions >= this.config.maxTransactionsPerDay) {
      reasons.push(`Exceeded daily transaction limit: ${dailyTransactions}/${this.config.maxTransactionsPerDay}`);
      riskScore += 40;
    }

    return {
      isSuspicious: reasons.length > 0,
      riskScore,
      reasons,
    };
  }

  private checkUnusualAmount(
    amount: number, 
    pattern: ActivityPattern
  ): { isSuspicious: boolean; riskScore: number; reasons: string[] } {
    const reasons: string[] = [];
    let riskScore = 0;

    if (pattern.averageAmount > 0) {
      const amountRatio = amount / pattern.averageAmount;
      
      if (amountRatio > this.config.unusualAmountThreshold) {
        reasons.push(`Transaction amount ${amountRatio.toFixed(1)}x larger than average`);
        riskScore += Math.min(25, amountRatio * 5);
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      riskScore,
      reasons,
    };
  }

  private async checkRapidFireTransactions(
    userId: string
  ): Promise<{ isSuspicious: boolean; riskScore: number; reasons: string[] }> {
    try {
      const key = `last_transaction:${userId}`;
      const lastTransactionTime = await this.redisClient.get(key);
      
      if (lastTransactionTime) {
        const timeDiff = Date.now() - parseInt(lastTransactionTime);
        const secondsDiff = timeDiff / 1000;
        
        if (secondsDiff < this.config.rapidFireThreshold) {
          return {
            isSuspicious: true,
            riskScore: 20,
            reasons: [`Rapid-fire transaction: ${secondsDiff.toFixed(1)}s since last transaction`],
          };
        }
      }

      // Update last transaction time
      await this.redisClient.setEx(key, 3600, Date.now().toString()); // 1 hour TTL

      return {
        isSuspicious: false,
        riskScore: 0,
        reasons: [],
      };

    } catch (error) {
      this.logger.error('Error checking rapid-fire transactions:', error);
      return {
        isSuspicious: false,
        riskScore: 0,
        reasons: [],
      };
    }
  }

  private checkTimePatterns(
    pattern: ActivityPattern
  ): { isSuspicious: boolean; riskScore: number; reasons: string[] } {
    const currentHour = new Date().getHours();
    const reasons: string[] = [];
    let riskScore = 0;

    // Check if current transaction is outside typical hours
    if (pattern.typicalHours.length > 0) {
      const isTypicalHour = pattern.typicalHours.includes(currentHour);
      
      if (!isTypicalHour) {
        // Check how far outside typical hours
        const hourDistances = pattern.typicalHours.map(hour => {
          const distance = Math.min(
            Math.abs(currentHour - hour),
            24 - Math.abs(currentHour - hour)
          );
          return distance;
        });
        
        const minDistance = Math.min(...hourDistances);
        
        if (minDistance > 3) { // More than 3 hours outside typical pattern
          reasons.push(`Transaction outside typical hours (${currentHour}:00)`);
          riskScore += Math.min(15, minDistance * 2);
        }
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      riskScore,
      reasons,
    };
  }

  private checkGeolocation(
    currentLocation: string, 
    pattern: ActivityPattern
  ): { isSuspicious: boolean; riskScore: number; reasons: string[] } {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check if location is completely new
    if (!pattern.geolocationHistory.includes(currentLocation)) {
      reasons.push(`New geolocation detected: ${currentLocation}`);
      riskScore += 10;
      
      // If user has established location history, this is more suspicious
      if (pattern.geolocationHistory.length > 5) {
        reasons.push('Transaction from completely new location');
        riskScore += 15;
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      riskScore,
      reasons,
    };
  }

  private checkDeviceFingerprint(
    currentFingerprint: string, 
    pattern: ActivityPattern
  ): { isSuspicious: boolean; riskScore: number; reasons: string[] } {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check if device is completely new
    if (!pattern.deviceFingerprints.includes(currentFingerprint)) {
      reasons.push('New device fingerprint detected');
      riskScore += 10;
      
      // If user has established device history, this is more suspicious
      if (pattern.deviceFingerprints.length > 2) {
        reasons.push('Transaction from completely new device');
        riskScore += 15;
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      riskScore,
      reasons,
    };
  }

  private determineRecommendedAction(riskScore: number): 'allow' | 'flag' | 'block' | 'require_verification' {
    if (riskScore >= 80) {
      return 'block';
    } else if (riskScore >= 60) {
      return 'require_verification';
    } else if (riskScore >= 30) {
      return 'flag';
    } else {
      return 'allow';
    }
  }

  private async getActivityPattern(userId: string): Promise<ActivityPattern> {
    // Check cache first
    const cached = this.activityPatterns.get(userId);
    if (cached) {
      return cached;
    }

    // Load from database/Redis
    try {
      const key = `activity_pattern:${userId}`;
      const stored = await this.redisClient.get(key);
      
      if (stored) {
        const pattern = JSON.parse(stored);
        // Convert date strings back to Date objects
        pattern.transactionTimes = pattern.transactionTimes.map((time: string) => new Date(time));
        this.activityPatterns.set(userId, pattern);
        return pattern;
      }
    } catch (error) {
      this.logger.error('Error loading activity pattern from Redis:', error);
    }

    // Create new pattern
    const newPattern: ActivityPattern = {
      userId,
      transactionTimes: [],
      transactionAmounts: [],
      averageAmount: 0,
      typicalHours: [],
      deviceFingerprints: [],
      ipAddresses: [],
      geolocationHistory: [],
    };

    this.activityPatterns.set(userId, newPattern);
    return newPattern;
  }

  private async updateActivityPattern(
    userId: string, 
    request: SpendingRequest, 
    metadata: any
  ): Promise<void> {
    try {
      const pattern = await this.getActivityPattern(userId);
      const now = new Date();

      // Update transaction data
      pattern.transactionTimes.push(now);
      pattern.transactionAmounts.push(request.amount);

      // Keep only last 100 transactions for performance
      if (pattern.transactionTimes.length > 100) {
        pattern.transactionTimes = pattern.transactionTimes.slice(-100);
        pattern.transactionAmounts = pattern.transactionAmounts.slice(-100);
      }

      // Update average amount
      pattern.averageAmount = pattern.transactionAmounts.reduce((sum, amount) => sum + amount, 0) / pattern.transactionAmounts.length;

      // Update typical hours
      const currentHour = now.getHours();
      if (!pattern.typicalHours.includes(currentHour)) {
        pattern.typicalHours.push(currentHour);
      }

      // Update device fingerprints
      if (metadata.deviceFingerprint && !pattern.deviceFingerprints.includes(metadata.deviceFingerprint)) {
        pattern.deviceFingerprints.push(metadata.deviceFingerprint);
        // Keep only last 5 devices
        if (pattern.deviceFingerprints.length > 5) {
          pattern.deviceFingerprints = pattern.deviceFingerprints.slice(-5);
        }
      }

      // Update IP addresses
      if (metadata.ipAddress && !pattern.ipAddresses.includes(metadata.ipAddress)) {
        pattern.ipAddresses.push(metadata.ipAddress);
        // Keep only last 10 IPs
        if (pattern.ipAddresses.length > 10) {
          pattern.ipAddresses = pattern.ipAddresses.slice(-10);
        }
      }

      // Update geolocation history
      if (metadata.geolocation && !pattern.geolocationHistory.includes(metadata.geolocation)) {
        pattern.geolocationHistory.push(metadata.geolocation);
        // Keep only last 10 locations
        if (pattern.geolocationHistory.length > 10) {
          pattern.geolocationHistory = pattern.geolocationHistory.slice(-10);
        }
      }

      // Update cache
      this.activityPatterns.set(userId, pattern);

      // Store in Redis with 7 days TTL
      const key = `activity_pattern:${userId}`;
      await this.redisClient.setEx(key, 7 * 24 * 3600, JSON.stringify(pattern));

    } catch (error) {
      this.logger.error('Error updating activity pattern:', error);
    }
  }

  private async loadActivityPatterns(): Promise<void> {
    // Load activity patterns from Redis on startup
    // This is a simplified implementation - in production you might want to load from database
    this.logger.debug('Activity patterns will be loaded on-demand');
  }

  public async createSuspiciousActivityAlert(
    userId: string,
    result: SuspiciousActivityResult,
    request: SpendingRequest
  ): Promise<void> {
    try {
      const alert: RiskAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type: 'suspicious_activity',
        severity: result.riskScore >= 80 ? 'critical' : result.riskScore >= 60 ? 'high' : 'medium',
        title: 'Suspicious Activity Detected',
        message: `Suspicious transaction detected: ${result.reasons.join(', ')}`,
        threshold: 30, // Minimum risk score threshold
        currentValue: result.riskScore,
        triggered: true,
        triggeredAt: new Date(),
        acknowledged: false,
        autoResolve: false,
        metadata: {
          ...result.metadata,
          transactionAmount: request.amount,
          momentId: request.momentId,
          strategyId: request.strategyId,
          reasons: result.reasons,
          recommendedAction: result.recommendedAction,
        },
        createdAt: new Date(),
      };

      await this.db.riskAlerts.createRiskAlert(alert);

      this.emit('suspiciousActivityAlert', alert);

    } catch (error) {
      this.logger.error('Error creating suspicious activity alert:', error);
    }
  }

  public getStats(): {
    totalPatternsTracked: number;
    averageTransactionsPerPattern: number;
    suspiciousActivitiesDetected: number;
  } {
    const patterns = Array.from(this.activityPatterns.values());
    
    return {
      totalPatternsTracked: patterns.length,
      averageTransactionsPerPattern: patterns.length > 0 
        ? patterns.reduce((sum, pattern) => sum + pattern.transactionTimes.length, 0) / patterns.length 
        : 0,
      suspiciousActivitiesDetected: 0, // Would come from database/metrics
    };
  }
}