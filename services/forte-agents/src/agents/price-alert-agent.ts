import { BaseAgent, AgentConfig, TriggerCondition } from './base-agent';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import axios, { AxiosInstance } from 'axios';

export interface PriceAlertAgentConfig extends AgentConfig {
  priceChangeThresholds: {
    significant: number; // e.g., 0.1 for 10%
    major: number;       // e.g., 0.2 for 20%
    extreme: number;     // e.g., 0.5 for 50%
  };
  volumeThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  trackingCategories: string[];
  enableVolumeAlerts: boolean;
}

export interface PriceData {
  momentId: string;
  currentPrice: number;
  previousPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume24h: number;
  volumeChange: number;
  marketCap: number;
  timestamp: Date;
}

export interface VolumeSpike {
  momentId: string;
  currentVolume: number;
  averageVolume: number;
  volumeMultiplier: number;
  priceImpact: number;
  timestamp: Date;
}

export interface PriceAlert {
  momentId: string;
  alertType: 'price_increase' | 'price_decrease' | 'volume_spike' | 'unusual_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume24h: number;
  message: string;
  timestamp: Date;
}

export class PriceAlertAgent extends BaseAgent {
  protected config: PriceAlertAgentConfig;
  private topShotAPI: AxiosInstance;
  private tradingServiceAPI: AxiosInstance;
  private trackedMoments: Map<string, PriceData> = new Map();
  private priceHistory: Map<string, PriceData[]> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor(
    config: PriceAlertAgentConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('PriceAlertAgent', 'price_monitoring', config, db, redisClient, logger);
    this.config = config;

    // Initialize Top Shot API client
    this.topShotAPI = axios.create({
      baseURL: 'https://api.nbatopshot.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize Trading Service API client
    this.tradingServiceAPI = axios.create({
      baseURL: process.env.TRADING_SERVICE_URL || 'http://localhost:8003',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  protected async initializeTriggerConditions(): Promise<void> {
    try {
      this.logger.info('Initializing price alert trigger conditions');

      // Add trigger for significant price changes
      this.addTriggerCondition({
        type: 'significant_price_change',
        parameters: {
          threshold: this.config.priceChangeThresholds.significant,
        },
        isActive: true,
      });

      // Add trigger for major price changes
      this.addTriggerCondition({
        type: 'major_price_change',
        parameters: {
          threshold: this.config.priceChangeThresholds.major,
        },
        isActive: true,
      });

      // Add trigger for extreme price changes
      this.addTriggerCondition({
        type: 'extreme_price_change',
        parameters: {
          threshold: this.config.priceChangeThresholds.extreme,
        },
        isActive: true,
      });

      // Add trigger for volume spikes
      if (this.config.enableVolumeAlerts) {
        this.addTriggerCondition({
          type: 'volume_spike',
          parameters: {
            thresholds: this.config.volumeThresholds,
          },
          isActive: true,
        });
      }

      // Add trigger for unusual trading activity
      this.addTriggerCondition({
        type: 'unusual_activity',
        parameters: {
          categories: this.config.trackingCategories,
        },
        isActive: true,
      });

      // Load initial price data
      await this.loadTrackedMoments();

      this.logger.info('Price alert trigger conditions initialized');
    } catch (error) {
      this.logger.error('Failed to initialize trigger conditions:', error);
      throw error;
    }
  }

  protected async evaluateTriggerConditions(): Promise<TriggerCondition[]> {
    const activatedTriggers: TriggerCondition[] = [];

    try {
      // Update price data for all tracked moments
      await this.updatePriceData();

      for (const condition of this.getAllTriggerConditions()) {
        if (!condition.isActive) continue;

        let shouldTrigger = false;

        switch (condition.type) {
          case 'significant_price_change':
          case 'major_price_change':
          case 'extreme_price_change':
            shouldTrigger = await this.evaluatePriceChange(condition);
            break;
          case 'volume_spike':
            shouldTrigger = await this.evaluateVolumeSpike(condition);
            break;
          case 'unusual_activity':
            shouldTrigger = await this.evaluateUnusualActivity(condition);
            break;
        }

        if (shouldTrigger) {
          activatedTriggers.push(condition);
        }
      }
    } catch (error) {
      this.logger.error('Error evaluating trigger conditions:', error);
    }

    return activatedTriggers;
  }

  protected async executeTriggerActions(triggers: TriggerCondition[]): Promise<void> {
    for (const trigger of triggers) {
      try {
        switch (trigger.type) {
          case 'significant_price_change':
          case 'major_price_change':
          case 'extreme_price_change':
            await this.handlePriceChangeAlert(trigger);
            break;
          case 'volume_spike':
            await this.handleVolumeSpikeAlert(trigger);
            break;
          case 'unusual_activity':
            await this.handleUnusualActivityAlert(trigger);
            break;
        }
      } catch (error) {
        this.logger.error('Error executing trigger action:', { trigger: trigger.type, error });
      }
    }
  }

  // Trigger evaluation methods
  private async evaluatePriceChange(condition: TriggerCondition): Promise<boolean> {
    try {
      const threshold = condition.parameters.threshold;

      for (const priceData of this.trackedMoments.values()) {
        if (Math.abs(priceData.priceChangePercent) >= threshold) {
          // Check cooldown to avoid spam
          if (this.isInCooldown(priceData.momentId, condition.type)) {
            continue;
          }

          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating price change:', error);
      return false;
    }
  }

  private async evaluateVolumeSpike(condition: TriggerCondition): Promise<boolean> {
    try {
      const thresholds = condition.parameters.thresholds;

      for (const priceData of this.trackedMoments.values()) {
        const volumeSpike = await this.detectVolumeSpike(priceData);
        
        if (volumeSpike && volumeSpike.volumeMultiplier >= 3) { // 3x normal volume
          if (this.isInCooldown(priceData.momentId, 'volume_spike')) {
            continue;
          }

          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating volume spike:', error);
      return false;
    }
  }

  private async evaluateUnusualActivity(condition: TriggerCondition): Promise<boolean> {
    try {
      // Look for patterns that indicate unusual trading activity
      for (const priceData of this.trackedMoments.values()) {
        const isUnusual = await this.detectUnusualActivity(priceData);
        
        if (isUnusual) {
          if (this.isInCooldown(priceData.momentId, 'unusual_activity')) {
            continue;
          }

          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating unusual activity:', error);
      return false;
    }
  }

  // Trigger action handlers
  private async handlePriceChangeAlert(trigger: TriggerCondition): Promise<void> {
    try {
      const threshold = trigger.parameters.threshold;
      const alertType = trigger.type;

      for (const priceData of this.trackedMoments.values()) {
        if (Math.abs(priceData.priceChangePercent) >= threshold) {
          if (this.isInCooldown(priceData.momentId, alertType)) {
            continue;
          }

          const severity = this.calculateAlertSeverity(priceData.priceChangePercent);
          const direction = priceData.priceChangePercent > 0 ? 'increase' : 'decrease';

          // Generate price change alert
          this.generateAlert({
            type: `price_${direction}`,
            severity,
            title: `${severity.toUpperCase()} Price ${direction.toUpperCase()}`,
            message: `Moment ${priceData.momentId} price ${direction}d by ${(Math.abs(priceData.priceChangePercent) * 100).toFixed(1)}% to $${priceData.currentPrice}`,
            data: {
              momentId: priceData.momentId,
              currentPrice: priceData.currentPrice,
              previousPrice: priceData.previousPrice,
              priceChange: priceData.priceChange,
              priceChangePercent: priceData.priceChangePercent,
              volume24h: priceData.volume24h,
              timestamp: priceData.timestamp,
            },
          });

          // Generate opportunity if significant enough
          if (Math.abs(priceData.priceChangePercent) >= this.config.priceChangeThresholds.major) {
            const action = priceData.priceChangePercent > 0 ? 'sell' : 'buy';
            const confidence = this.calculateOpportunityConfidence(priceData);

            this.generateOpportunity({
              type: 'price_movement_opportunity',
              momentId: priceData.momentId,
              action,
              estimatedProfit: priceData.currentPrice * Math.abs(priceData.priceChangePercent) * 0.5,
              confidence,
              riskScore: 100 - confidence,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
              data: {
                priceData,
                triggerType: alertType,
                marketConditions: await this.getMarketConditions(priceData.momentId),
              },
            });
          }

          // Set cooldown
          this.setCooldown(priceData.momentId, alertType);
        }
      }
    } catch (error) {
      this.logger.error('Error handling price change alert:', error);
    }
  }

  private async handleVolumeSpikeAlert(trigger: TriggerCondition): Promise<void> {
    try {
      for (const priceData of this.trackedMoments.values()) {
        const volumeSpike = await this.detectVolumeSpike(priceData);
        
        if (volumeSpike && volumeSpike.volumeMultiplier >= 3) {
          if (this.isInCooldown(priceData.momentId, 'volume_spike')) {
            continue;
          }

          const severity = volumeSpike.volumeMultiplier >= 10 ? 'critical' : 
                          volumeSpike.volumeMultiplier >= 5 ? 'high' : 'medium';

          this.generateAlert({
            type: 'volume_spike',
            severity,
            title: `Volume Spike Detected`,
            message: `Moment ${priceData.momentId} volume spiked ${volumeSpike.volumeMultiplier.toFixed(1)}x normal levels`,
            data: {
              momentId: priceData.momentId,
              currentVolume: volumeSpike.currentVolume,
              averageVolume: volumeSpike.averageVolume,
              volumeMultiplier: volumeSpike.volumeMultiplier,
              priceImpact: volumeSpike.priceImpact,
              currentPrice: priceData.currentPrice,
              timestamp: volumeSpike.timestamp,
            },
          });

          // Generate opportunity for volume-driven trades
          if (volumeSpike.volumeMultiplier >= 5) {
            const action = volumeSpike.priceImpact > 0 ? 'buy' : 'sell';
            const confidence = Math.min(volumeSpike.volumeMultiplier * 10, 90);

            this.generateOpportunity({
              type: 'volume_spike_opportunity',
              momentId: priceData.momentId,
              action,
              estimatedProfit: priceData.currentPrice * 0.1, // Estimated 10% profit
              confidence,
              riskScore: 100 - confidence,
              expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
              data: {
                volumeSpike,
                priceData,
              },
            });
          }

          this.setCooldown(priceData.momentId, 'volume_spike');
        }
      }
    } catch (error) {
      this.logger.error('Error handling volume spike alert:', error);
    }
  }

  private async handleUnusualActivityAlert(trigger: TriggerCondition): Promise<void> {
    try {
      for (const priceData of this.trackedMoments.values()) {
        const isUnusual = await this.detectUnusualActivity(priceData);
        
        if (isUnusual) {
          if (this.isInCooldown(priceData.momentId, 'unusual_activity')) {
            continue;
          }

          this.generateAlert({
            type: 'unusual_activity',
            severity: 'medium',
            title: `Unusual Trading Activity`,
            message: `Moment ${priceData.momentId} showing unusual trading patterns`,
            data: {
              momentId: priceData.momentId,
              currentPrice: priceData.currentPrice,
              volume24h: priceData.volume24h,
              priceChangePercent: priceData.priceChangePercent,
              activityScore: await this.calculateActivityScore(priceData),
              timestamp: priceData.timestamp,
            },
          });

          this.setCooldown(priceData.momentId, 'unusual_activity');
        }
      }
    } catch (error) {
      this.logger.error('Error handling unusual activity alert:', error);
    }
  }

  // Data management methods
  private async loadTrackedMoments(): Promise<void> {
    try {
      // Load moments to track based on categories
      for (const category of this.config.trackingCategories) {
        await this.loadMomentsForCategory(category);
      }

      this.logger.info('Loaded tracked moments', { count: this.trackedMoments.size });
    } catch (error) {
      this.logger.error('Error loading tracked moments:', error);
    }
  }

  private async loadMomentsForCategory(category: string): Promise<void> {
    try {
      let moments: any[] = [];

      switch (category) {
        case 'all':
          // Load top moments by volume
          moments = await this.getTopMomentsByVolume(100);
          break;
        case 'user_portfolio':
          // Load moments from user portfolios
          moments = await this.getUserPortfolioMoments();
          break;
        case 'watchlist':
          // Load moments from watchlists
          moments = await this.getWatchlistMoments();
          break;
      }

      for (const moment of moments) {
        const priceData: PriceData = {
          momentId: moment.id,
          currentPrice: moment.price,
          previousPrice: moment.price,
          priceChange: 0,
          priceChangePercent: 0,
          volume24h: moment.volume24h || 0,
          volumeChange: 0,
          marketCap: moment.marketCap || 0,
          timestamp: new Date(),
        };

        this.trackedMoments.set(moment.id, priceData);
      }
    } catch (error) {
      this.logger.error('Error loading moments for category:', { category, error });
    }
  }

  private async updatePriceData(): Promise<void> {
    try {
      const momentIds = Array.from(this.trackedMoments.keys());
      
      // Batch update price data
      for (let i = 0; i < momentIds.length; i += 10) {
        const batch = momentIds.slice(i, i + 10);
        await this.updatePriceDataBatch(batch);
      }
    } catch (error) {
      this.logger.error('Error updating price data:', error);
    }
  }

  private async updatePriceDataBatch(momentIds: string[]): Promise<void> {
    try {
      for (const momentId of momentIds) {
        const currentData = this.trackedMoments.get(momentId);
        if (!currentData) continue;

        // Fetch latest price data
        const latestData = await this.fetchMomentPriceData(momentId);
        if (!latestData) continue;

        // Update price change calculations
        const priceChange = latestData.currentPrice - currentData.currentPrice;
        const priceChangePercent = currentData.currentPrice > 0 
          ? priceChange / currentData.currentPrice 
          : 0;

        const updatedData: PriceData = {
          ...latestData,
          previousPrice: currentData.currentPrice,
          priceChange,
          priceChangePercent,
          volumeChange: latestData.volume24h - currentData.volume24h,
        };

        // Store in history
        this.addToPriceHistory(momentId, updatedData);

        // Update current data
        this.trackedMoments.set(momentId, updatedData);
      }
    } catch (error) {
      this.logger.error('Error updating price data batch:', error);
    }
  }

  private async fetchMomentPriceData(momentId: string): Promise<PriceData | null> {
    try {
      const response = await this.topShotAPI.get(`/moments/${momentId}/market`);
      const data = response.data;

      return {
        momentId,
        currentPrice: data.price || 0,
        previousPrice: 0, // Will be set by caller
        priceChange: 0,   // Will be calculated by caller
        priceChangePercent: 0, // Will be calculated by caller
        volume24h: data.volume24h || 0,
        volumeChange: 0,  // Will be calculated by caller
        marketCap: data.marketCap || 0,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error fetching moment price data:', { momentId, error });
      return null;
    }
  }

  // Analysis methods
  private async detectVolumeSpike(priceData: PriceData): Promise<VolumeSpike | null> {
    try {
      const history = this.priceHistory.get(priceData.momentId) || [];
      if (history.length < 10) return null; // Need enough history

      // Calculate average volume over last 10 periods
      const recentHistory = history.slice(-10);
      const averageVolume = recentHistory.reduce((sum, data) => sum + data.volume24h, 0) / recentHistory.length;

      if (averageVolume === 0) return null;

      const volumeMultiplier = priceData.volume24h / averageVolume;

      if (volumeMultiplier >= 3) {
        return {
          momentId: priceData.momentId,
          currentVolume: priceData.volume24h,
          averageVolume,
          volumeMultiplier,
          priceImpact: priceData.priceChangePercent,
          timestamp: priceData.timestamp,
        };
      }

      return null;
    } catch (error) {
      this.logger.error('Error detecting volume spike:', error);
      return null;
    }
  }

  private async detectUnusualActivity(priceData: PriceData): Promise<boolean> {
    try {
      const history = this.priceHistory.get(priceData.momentId) || [];
      if (history.length < 20) return false;

      // Check for unusual patterns
      const recentHistory = history.slice(-20);
      
      // Calculate volatility
      const priceChanges = recentHistory.map(data => Math.abs(data.priceChangePercent));
      const averageVolatility = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
      const currentVolatility = Math.abs(priceData.priceChangePercent);

      // Check for volume anomalies
      const volumes = recentHistory.map(data => data.volume24h);
      const averageVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;

      // Unusual if current volatility is 3x average or volume is 5x average
      return (
        currentVolatility > averageVolatility * 3 ||
        priceData.volume24h > averageVolume * 5
      );
    } catch (error) {
      this.logger.error('Error detecting unusual activity:', error);
      return false;
    }
  }

  // Utility methods
  private calculateAlertSeverity(priceChangePercent: number): 'low' | 'medium' | 'high' | 'critical' {
    const absChange = Math.abs(priceChangePercent);
    
    if (absChange >= this.config.priceChangeThresholds.extreme) return 'critical';
    if (absChange >= this.config.priceChangeThresholds.major) return 'high';
    if (absChange >= this.config.priceChangeThresholds.significant) return 'medium';
    return 'low';
  }

  private calculateOpportunityConfidence(priceData: PriceData): number {
    let confidence = 50; // Base confidence

    // Higher confidence for larger price movements
    confidence += Math.min(Math.abs(priceData.priceChangePercent) * 100, 30);

    // Higher confidence for higher volume
    if (priceData.volume24h > 100) confidence += 10;
    if (priceData.volume24h > 500) confidence += 10;

    // Lower confidence for extreme movements (might be manipulation)
    if (Math.abs(priceData.priceChangePercent) > 0.5) confidence -= 20;

    return Math.max(0, Math.min(100, confidence));
  }

  private async calculateActivityScore(priceData: PriceData): Promise<number> {
    // Calculate a score representing how unusual the activity is
    let score = 0;

    score += Math.abs(priceData.priceChangePercent) * 100;
    score += Math.min(priceData.volume24h / 100, 50);
    score += Math.abs(priceData.volumeChange) / 10;

    return Math.min(100, score);
  }

  private isInCooldown(momentId: string, alertType: string): boolean {
    const key = `${momentId}:${alertType}`;
    const cooldownEnd = this.alertCooldowns.get(key);
    
    if (!cooldownEnd) return false;
    
    return new Date() < cooldownEnd;
  }

  private setCooldown(momentId: string, alertType: string): void {
    const key = `${momentId}:${alertType}`;
    const cooldownEnd = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    this.alertCooldowns.set(key, cooldownEnd);
  }

  private addToPriceHistory(momentId: string, priceData: PriceData): void {
    if (!this.priceHistory.has(momentId)) {
      this.priceHistory.set(momentId, []);
    }

    const history = this.priceHistory.get(momentId)!;
    history.push(priceData);

    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
  }

  // Data fetching methods (placeholders)
  private async getTopMomentsByVolume(limit: number): Promise<any[]> {
    // This would fetch top moments by volume from Top Shot API
    return [];
  }

  private async getUserPortfolioMoments(): Promise<any[]> {
    // This would fetch moments from user portfolios via trading service
    return [];
  }

  private async getWatchlistMoments(): Promise<any[]> {
    // This would fetch moments from user watchlists
    return [];
  }

  private async getMarketConditions(momentId: string): Promise<any> {
    // This would fetch broader market conditions
    return {
      marketTrend: 'neutral',
      overallVolume: 'normal',
      volatility: 'low',
    };
  }
}