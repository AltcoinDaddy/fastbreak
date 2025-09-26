import { EventEmitter } from 'eventemitter3';
import { Logger } from 'winston';
import Redis from 'redis';
import { 
  PriceAlert, 
  MomentPriceData, 
  MarketplaceListing,
  MarketplaceSale,
  PricePoint 
} from '../types/marketplace';
import { TopShotClient } from '../clients/topshot-client';

export interface PriceMonitorConfig {
  updateIntervalMs: number;
  priceHistoryDays: number;
  volatilityThreshold: number;
  volumeSpikeThreshold: number;
  significantPriceChangeThreshold: number;
}

export interface PriceChangeEvent {
  momentId: string;
  playerId: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercentage: number;
  marketplaceId: string;
  timestamp: Date;
}

export interface VolumeSpikeEvent {
  momentId: string;
  playerId: string;
  currentVolume: number;
  averageVolume: number;
  spikeMultiplier: number;
  marketplaceId: string;
  timestamp: Date;
}

export class PriceMonitor extends EventEmitter {
  private logger: Logger;
  private config: PriceMonitorConfig;
  private redisClient: Redis.RedisClientType;
  private marketplaceClients: Map<string, TopShotClient>;
  private activeAlerts: Map<string, PriceAlert>;
  private priceCache: Map<string, MomentPriceData>;
  private monitorInterval?: NodeJS.Timeout;
  private isMonitoring: boolean = false;

  constructor(
    config: PriceMonitorConfig,
    redisClient: Redis.RedisClientType,
    marketplaceClients: Map<string, TopShotClient>,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.redisClient = redisClient;
    this.marketplaceClients = marketplaceClients;
    this.logger = logger;
    this.activeAlerts = new Map();
    this.priceCache = new Map();
  }

  public async start(): Promise<void> {
    if (this.monitorInterval) {
      this.stop();
    }

    this.logger.info('Starting price monitor', {
      updateInterval: this.config.updateIntervalMs,
      marketplaces: Array.from(this.marketplaceClients.keys()),
    });

    // Load existing alerts from database/cache
    await this.loadActiveAlerts();

    // Setup WebSocket listeners for real-time updates
    this.setupWebSocketListeners();

    // Start periodic monitoring
    this.monitorInterval = setInterval(() => {
      this.performMonitoringCycle().catch(error => {
        this.logger.error('Error in monitoring cycle:', error);
      });
    }, this.config.updateIntervalMs);

    // Initial monitoring cycle
    await this.performMonitoringCycle();
  }

  public stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    // Remove WebSocket listeners
    for (const client of this.marketplaceClients.values()) {
      client.removeAllListeners('priceChange');
      client.removeAllListeners('sale');
      client.removeAllListeners('listingUpdate');
    }

    this.logger.info('Price monitor stopped');
  }

  private setupWebSocketListeners(): void {
    for (const [marketplaceId, client] of this.marketplaceClients) {
      client.on('priceChange', (data) => {
        this.handleRealTimePriceChange(data, marketplaceId);
      });

      client.on('sale', (data) => {
        this.handleRealTimeSale(data, marketplaceId);
      });

      client.on('listingUpdate', (data) => {
        this.handleRealTimeListingUpdate(data, marketplaceId);
      });
    }
  }

  private async performMonitoringCycle(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.debug('Monitoring cycle already in progress, skipping');
      return;
    }

    this.isMonitoring = true;
    const cycleStartTime = Date.now();

    try {
      this.logger.debug('Starting price monitoring cycle');

      // Get all moments that need monitoring
      const momentsToMonitor = await this.getMomentsToMonitor();

      // Update price data for each moment
      const updatePromises = momentsToMonitor.map(momentId => 
        this.updateMomentPriceData(momentId)
      );

      await Promise.allSettled(updatePromises);

      // Check for triggered alerts
      await this.checkTriggeredAlerts();

      // Detect volume spikes
      await this.detectVolumeSpikes();

      // Clean up old price data
      await this.cleanupOldPriceData();

      const cycleDuration = Date.now() - cycleStartTime;
      this.logger.debug('Price monitoring cycle completed', {
        duration: cycleDuration,
        momentsMonitored: momentsToMonitor.length,
        activeAlerts: this.activeAlerts.size,
      });

    } catch (error) {
      this.logger.error('Error during price monitoring cycle:', error);
    } finally {
      this.isMonitoring = false;
    }
  }

  private async getMomentsToMonitor(): Promise<string[]> {
    // Get moments from active alerts
    const alertMoments = Array.from(this.activeAlerts.values())
      .filter(alert => alert.momentId)
      .map(alert => alert.momentId!);

    // Get trending moments from cache/database
    const trendingMoments = await this.getTrendingMoments();

    // Combine and deduplicate
    const allMoments = [...new Set([...alertMoments, ...trendingMoments])];

    return allMoments;
  }

  private async getTrendingMoments(): Promise<string[]> {
    try {
      // Get trending moments from Redis cache
      const trendingKey = 'trending_moments';
      const trendingData = await this.redisClient.get(trendingKey);
      
      if (trendingData) {
        return JSON.parse(trendingData);
      }

      // Fallback: get from marketplace APIs
      const trendingMoments: string[] = [];
      
      for (const [marketplaceId, client] of this.marketplaceClients) {
        try {
          const recentSales = await client.getRecentSales({ hours: 24, limit: 100 });
          const momentIds = recentSales.map(sale => sale.momentId);
          trendingMoments.push(...momentIds);
        } catch (error) {
          this.logger.warn(`Error getting trending moments from ${marketplaceId}:`, error);
        }
      }

      // Cache the result
      await this.redisClient.setEx(trendingKey, 300, JSON.stringify(trendingMoments)); // 5 minutes

      return [...new Set(trendingMoments)];
    } catch (error) {
      this.logger.error('Error getting trending moments:', error);
      return [];
    }
  }

  private async updateMomentPriceData(momentId: string): Promise<void> {
    try {
      const previousData = this.priceCache.get(momentId);
      let latestData: MomentPriceData | null = null;

      // Get price data from all marketplaces
      for (const [marketplaceId, client] of this.marketplaceClients) {
        try {
          const priceData = await client.getMomentPriceData(momentId);
          if (priceData) {
            // Use the most recent data or combine data from multiple marketplaces
            if (!latestData || priceData.lastUpdated > latestData.lastUpdated) {
              latestData = priceData;
            }
          }
        } catch (error) {
          this.logger.warn(`Error getting price data for ${momentId} from ${marketplaceId}:`, error);
        }
      }

      if (latestData) {
        // Update cache
        this.priceCache.set(momentId, latestData);

        // Store in Redis for persistence
        await this.storePriceData(latestData);

        // Check for significant price changes
        if (previousData) {
          await this.checkPriceChange(previousData, latestData);
        }
      }
    } catch (error) {
      this.logger.error(`Error updating price data for moment ${momentId}:`, error);
    }
  }

  private async storePriceData(priceData: MomentPriceData): Promise<void> {
    try {
      const key = `price_data:${priceData.momentId}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(priceData)); // 1 hour TTL

      // Store price point in history
      const historyKey = `price_history:${priceData.momentId}`;
      const pricePoint: PricePoint = {
        timestamp: new Date(),
        price: priceData.currentPrice,
        volume: priceData.volume24h,
        marketplaceId: 'aggregated',
        type: 'listing',
      };

      await this.redisClient.lPush(historyKey, JSON.stringify(pricePoint));
      await this.redisClient.lTrim(historyKey, 0, 1000); // Keep last 1000 points
      await this.redisClient.expire(historyKey, 86400 * this.config.priceHistoryDays);
    } catch (error) {
      this.logger.error('Error storing price data:', error);
    }
  }

  private async checkPriceChange(
    previousData: MomentPriceData, 
    currentData: MomentPriceData
  ): Promise<void> {
    const changeAmount = currentData.currentPrice - previousData.currentPrice;
    const changePercentage = (changeAmount / previousData.currentPrice) * 100;

    // Check if change is significant
    if (Math.abs(changePercentage) >= this.config.significantPriceChangeThreshold) {
      const priceChangeEvent: PriceChangeEvent = {
        momentId: currentData.momentId,
        playerId: currentData.playerId,
        oldPrice: previousData.currentPrice,
        newPrice: currentData.currentPrice,
        changeAmount,
        changePercentage,
        marketplaceId: 'aggregated',
        timestamp: new Date(),
      };

      this.emit('significantPriceChange', priceChangeEvent);
      
      this.logger.info('Significant price change detected', {
        momentId: currentData.momentId,
        oldPrice: previousData.currentPrice,
        newPrice: currentData.currentPrice,
        changePercentage: changePercentage.toFixed(2),
      });
    }
  }

  private async checkTriggeredAlerts(): Promise<void> {
    for (const [alertId, alert] of this.activeAlerts) {
      if (!alert.isActive || alert.triggered) continue;

      try {
        const shouldTrigger = await this.evaluateAlert(alert);
        
        if (shouldTrigger) {
          alert.triggered = true;
          alert.triggeredAt = new Date();
          this.activeAlerts.set(alertId, alert);

          this.emit('alertTriggered', alert);
          
          this.logger.info('Price alert triggered', {
            alertId,
            type: alert.alertType,
            momentId: alert.momentId,
            playerId: alert.playerId,
            threshold: alert.threshold,
            currentValue: alert.currentValue,
          });
        }
      } catch (error) {
        this.logger.error(`Error evaluating alert ${alertId}:`, error);
      }
    }
  }

  private async evaluateAlert(alert: PriceAlert): Promise<boolean> {
    let currentValue: number;

    switch (alert.alertType) {
      case 'price_drop':
      case 'price_increase':
        if (!alert.momentId) return false;
        const priceData = this.priceCache.get(alert.momentId);
        if (!priceData) return false;
        
        currentValue = priceData.currentPrice;
        alert.currentValue = currentValue;

        if (alert.alertType === 'price_drop') {
          return currentValue <= alert.threshold;
        } else {
          return currentValue >= alert.threshold;
        }

      case 'volume_spike':
        if (!alert.momentId) return false;
        const volumeData = this.priceCache.get(alert.momentId);
        if (!volumeData) return false;

        // Calculate average volume over past days
        const avgVolume = await this.getAverageVolume(alert.momentId, 7);
        currentValue = volumeData.volume24h;
        alert.currentValue = currentValue;

        return currentValue >= avgVolume * alert.threshold;

      default:
        return false;
    }
  }

  private async getAverageVolume(momentId: string, days: number): Promise<number> {
    try {
      const historyKey = `price_history:${momentId}`;
      const historyData = await this.redisClient.lRange(historyKey, 0, -1);
      
      if (historyData.length === 0) return 0;

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const recentPoints = historyData
        .map(data => JSON.parse(data) as PricePoint)
        .filter(point => new Date(point.timestamp) >= cutoffDate);

      if (recentPoints.length === 0) return 0;

      const totalVolume = recentPoints.reduce((sum, point) => sum + point.volume, 0);
      return totalVolume / recentPoints.length;
    } catch (error) {
      this.logger.error(`Error calculating average volume for ${momentId}:`, error);
      return 0;
    }
  }

  private async detectVolumeSpikes(): Promise<void> {
    for (const [momentId, priceData] of this.priceCache) {
      try {
        const avgVolume = await this.getAverageVolume(momentId, 7);
        
        if (avgVolume > 0 && priceData.volume24h > 0) {
          const spikeMultiplier = priceData.volume24h / avgVolume;
          
          if (spikeMultiplier >= this.config.volumeSpikeThreshold) {
            const volumeSpikeEvent: VolumeSpikeEvent = {
              momentId,
              playerId: priceData.playerId,
              currentVolume: priceData.volume24h,
              averageVolume: avgVolume,
              spikeMultiplier,
              marketplaceId: 'aggregated',
              timestamp: new Date(),
            };

            this.emit('volumeSpike', volumeSpikeEvent);
            
            this.logger.info('Volume spike detected', {
              momentId,
              currentVolume: priceData.volume24h,
              averageVolume: avgVolume.toFixed(2),
              spikeMultiplier: spikeMultiplier.toFixed(2),
            });
          }
        }
      } catch (error) {
        this.logger.error(`Error detecting volume spike for ${momentId}:`, error);
      }
    }
  }

  private async handleRealTimePriceChange(data: any, marketplaceId: string): Promise<void> {
    try {
      // Update cache immediately
      const momentId = data.momentId || data.moment_id;
      if (momentId) {
        await this.updateMomentPriceData(momentId);
      }
    } catch (error) {
      this.logger.error('Error handling real-time price change:', error);
    }
  }

  private async handleRealTimeSale(data: any, marketplaceId: string): Promise<void> {
    try {
      const momentId = data.momentId || data.moment_id;
      if (momentId) {
        // Update price data and check for alerts
        await this.updateMomentPriceData(momentId);
        
        this.emit('realTimeSale', {
          momentId,
          price: data.price,
          marketplaceId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Error handling real-time sale:', error);
    }
  }

  private async handleRealTimeListingUpdate(data: any, marketplaceId: string): Promise<void> {
    try {
      const momentId = data.momentId || data.moment_id;
      if (momentId) {
        await this.updateMomentPriceData(momentId);
      }
    } catch (error) {
      this.logger.error('Error handling real-time listing update:', error);
    }
  }

  private async loadActiveAlerts(): Promise<void> {
    try {
      // In a real implementation, this would load from database
      // For now, we'll use Redis as a simple storage
      const alertsKey = 'active_price_alerts';
      const alertsData = await this.redisClient.get(alertsKey);
      
      if (alertsData) {
        const alerts: PriceAlert[] = JSON.parse(alertsData);
        for (const alert of alerts) {
          if (alert.isActive && !alert.triggered) {
            this.activeAlerts.set(alert.id, alert);
          }
        }
      }

      this.logger.info(`Loaded ${this.activeAlerts.size} active price alerts`);
    } catch (error) {
      this.logger.error('Error loading active alerts:', error);
    }
  }

  private async cleanupOldPriceData(): Promise<void> {
    try {
      // Remove price data older than configured days
      const cutoffTime = Date.now() - (this.config.priceHistoryDays * 24 * 60 * 60 * 1000);
      
      for (const momentId of this.priceCache.keys()) {
        const historyKey = `price_history:${momentId}`;
        
        // This is a simplified cleanup - in production you'd want more efficient cleanup
        const historyData = await this.redisClient.lRange(historyKey, 0, -1);
        const validPoints = historyData
          .map(data => JSON.parse(data) as PricePoint)
          .filter(point => new Date(point.timestamp).getTime() > cutoffTime);

        if (validPoints.length !== historyData.length) {
          await this.redisClient.del(historyKey);
          for (const point of validPoints) {
            await this.redisClient.lPush(historyKey, JSON.stringify(point));
          }
          await this.redisClient.expire(historyKey, 86400 * this.config.priceHistoryDays);
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up old price data:', error);
    }
  }

  // Public API methods
  public async addPriceAlert(alert: Omit<PriceAlert, 'id' | 'createdAt'>): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullAlert: PriceAlert = {
      ...alert,
      id: alertId,
      createdAt: new Date(),
    };

    this.activeAlerts.set(alertId, fullAlert);
    await this.saveActiveAlerts();

    this.logger.info('Price alert added', {
      alertId,
      type: alert.alertType,
      momentId: alert.momentId,
      playerId: alert.playerId,
      threshold: alert.threshold,
    });

    return alertId;
  }

  public async removePriceAlert(alertId: string): Promise<boolean> {
    const removed = this.activeAlerts.delete(alertId);
    if (removed) {
      await this.saveActiveAlerts();
      this.logger.info('Price alert removed', { alertId });
    }
    return removed;
  }

  public getActiveAlerts(): PriceAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  public getMomentPriceData(momentId: string): MomentPriceData | undefined {
    return this.priceCache.get(momentId);
  }

  private async saveActiveAlerts(): Promise<void> {
    try {
      const alertsKey = 'active_price_alerts';
      const alerts = Array.from(this.activeAlerts.values());
      await this.redisClient.setEx(alertsKey, 86400, JSON.stringify(alerts)); // 24 hours
    } catch (error) {
      this.logger.error('Error saving active alerts:', error);
    }
  }

  public getStats(): {
    activeAlerts: number;
    cachedMoments: number;
    averagePrice: number;
    totalVolume24h: number;
  } {
    const priceData = Array.from(this.priceCache.values());
    
    return {
      activeAlerts: this.activeAlerts.size,
      cachedMoments: this.priceCache.size,
      averagePrice: priceData.length > 0 
        ? priceData.reduce((sum, data) => sum + data.currentPrice, 0) / priceData.length 
        : 0,
      totalVolume24h: priceData.reduce((sum, data) => sum + data.volume24h, 0),
    };
  }
}