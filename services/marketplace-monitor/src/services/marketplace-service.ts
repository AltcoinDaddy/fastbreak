import { EventEmitter } from 'eventemitter3';
import { Logger } from 'winston';
import Redis from 'redis';
import cron from 'node-cron';
import { 
  MarketplaceConfig, 
  MonitoringJob, 
  MarketplaceStatus,
  MarketAlert,
  ScanResult,
  ArbitrageOpportunity,
  PriceAlert
} from '../types/marketplace';
import { TopShotClient } from '../clients/topshot-client';
import { ArbitrageDetector, ArbitrageConfig } from './arbitrage-detector';
import { PriceMonitor, PriceMonitorConfig } from './price-monitor';

export interface MarketplaceServiceConfig {
  marketplaces: MarketplaceConfig[];
  arbitrage: ArbitrageConfig;
  priceMonitor: PriceMonitorConfig;
  healthCheckIntervalMs: number;
  alertRetentionDays: number;
}

export class MarketplaceService extends EventEmitter {
  private logger: Logger;
  private config: MarketplaceServiceConfig;
  private redisClient: Redis.RedisClientType;
  private marketplaceClients: Map<string, TopShotClient>;
  private arbitrageDetector!: ArbitrageDetector;
  private priceMonitor!: PriceMonitor;
  private monitoringJobs: Map<string, MonitoringJob>;
  private marketplaceStatuses: Map<string, MarketplaceStatus>;
  private alerts: Map<string, MarketAlert>;
  private healthCheckInterval?: NodeJS.Timeout;
  private cronJobs: Map<string, cron.ScheduledTask>;

  constructor(
    config: MarketplaceServiceConfig,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.redisClient = redisClient;
    this.logger = logger;
    this.marketplaceClients = new Map();
    this.monitoringJobs = new Map();
    this.marketplaceStatuses = new Map();
    this.alerts = new Map();
    this.cronJobs = new Map();

    this.initializeMarketplaceClients();
    this.initializeServices();
    this.setupEventListeners();
  }

  private initializeMarketplaceClients(): void {
    for (const marketplaceConfig of this.config.marketplaces) {
      if (marketplaceConfig.isActive) {
        const client = new TopShotClient(marketplaceConfig, this.logger);
        this.marketplaceClients.set(marketplaceConfig.id, client);
        
        // Initialize status
        this.marketplaceStatuses.set(marketplaceConfig.id, {
          marketplaceId: marketplaceConfig.id,
          isOnline: false,
          lastPing: new Date(),
          responseTime: 0,
          errorRate: 0,
          dataQuality: 100,
          issues: [],
        });
      }
    }
  }

  private initializeServices(): void {
    // Initialize arbitrage detector
    this.arbitrageDetector = new ArbitrageDetector(
      this.config.arbitrage,
      this.marketplaceClients,
      this.logger
    );

    // Initialize price monitor
    this.priceMonitor = new PriceMonitor(
      this.config.priceMonitor,
      this.redisClient,
      this.marketplaceClients,
      this.logger
    );
  }

  private setupEventListeners(): void {
    // Arbitrage detector events
    this.arbitrageDetector.on('opportunityDetected', (opportunity: ArbitrageOpportunity) => {
      this.handleArbitrageOpportunity(opportunity);
    });

    this.arbitrageDetector.on('opportunityExpired', (opportunity: ArbitrageOpportunity) => {
      this.logger.debug('Arbitrage opportunity expired', { opportunityId: opportunity.id });
    });

    // Price monitor events
    this.priceMonitor.on('significantPriceChange', (event) => {
      this.handleSignificantPriceChange(event);
    });

    this.priceMonitor.on('volumeSpike', (event) => {
      this.handleVolumeSpike(event);
    });

    this.priceMonitor.on('alertTriggered', (alert: PriceAlert) => {
      this.handlePriceAlertTriggered(alert);
    });

    // Marketplace client events
    for (const [marketplaceId, client] of this.marketplaceClients) {
      client.on('connected', () => {
        this.updateMarketplaceStatus(marketplaceId, { isOnline: true });
      });

      client.on('disconnected', () => {
        this.updateMarketplaceStatus(marketplaceId, { isOnline: false });
      });

      client.on('error', (error) => {
        this.handleMarketplaceError(marketplaceId, error);
      });
    }
  }

  public async start(): Promise<void> {
    try {
      this.logger.info('Starting marketplace service');

      // Connect to all marketplaces
      await this.connectMarketplaces();

      // Start monitoring services
      await this.startMonitoringServices();

      // Start health checks
      this.startHealthChecks();

      // Load and start monitoring jobs
      await this.loadMonitoringJobs();

      this.logger.info('Marketplace service started successfully');
      this.emit('started');

    } catch (error) {
      this.logger.error('Failed to start marketplace service:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      this.logger.info('Stopping marketplace service');

      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Stop cron jobs
      for (const [jobId, task] of this.cronJobs) {
        task.stop();
        this.cronJobs.delete(jobId);
      }

      // Stop monitoring services
      this.arbitrageDetector.stop();
      this.priceMonitor.stop();

      // Disconnect from marketplaces
      await this.disconnectMarketplaces();

      this.logger.info('Marketplace service stopped');
      this.emit('stopped');

    } catch (error) {
      this.logger.error('Error stopping marketplace service:', error);
      throw error;
    }
  }

  private async connectMarketplaces(): Promise<void> {
    const connectionPromises = Array.from(this.marketplaceClients.entries()).map(
      async ([marketplaceId, client]) => {
        try {
          await client.connect();
          this.logger.info(`Connected to marketplace: ${marketplaceId}`);
        } catch (error) {
          this.logger.error(`Failed to connect to marketplace ${marketplaceId}:`, error);
          this.updateMarketplaceStatus(marketplaceId, { 
            isOnline: false, 
            issues: [`Connection failed: ${error}`] 
          });
        }
      }
    );

    await Promise.allSettled(connectionPromises);
  }

  private async disconnectMarketplaces(): Promise<void> {
    const disconnectionPromises = Array.from(this.marketplaceClients.values()).map(
      client => client.disconnect()
    );

    await Promise.allSettled(disconnectionPromises);
  }

  private async startMonitoringServices(): Promise<void> {
    // Start arbitrage detector
    this.arbitrageDetector.start();

    // Start price monitor
    await this.priceMonitor.start();
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        this.logger.error('Error in health checks:', error);
      });
    }, this.config.healthCheckIntervalMs);

    // Initial health check
    this.performHealthChecks().catch(error => {
      this.logger.error('Error in initial health check:', error);
    });
  }

  private async performHealthChecks(): Promise<void> {
    for (const [marketplaceId, client] of this.marketplaceClients) {
      try {
        const startTime = Date.now();
        const isHealthy = client.isHealthy();
        const responseTime = Date.now() - startTime;

        this.updateMarketplaceStatus(marketplaceId, {
          lastPing: new Date(),
          responseTime,
          isOnline: isHealthy,
        });

      } catch (error) {
        this.logger.warn(`Health check failed for ${marketplaceId}:`, error);
        this.updateMarketplaceStatus(marketplaceId, {
          isOnline: false,
          issues: [`Health check failed: ${error}`],
        });
      }
    }
  }

  private updateMarketplaceStatus(
    marketplaceId: string, 
    updates: Partial<MarketplaceStatus>
  ): void {
    const currentStatus = this.marketplaceStatuses.get(marketplaceId);
    if (currentStatus) {
      const updatedStatus = { ...currentStatus, ...updates };
      this.marketplaceStatuses.set(marketplaceId, updatedStatus);
      this.emit('marketplaceStatusUpdated', updatedStatus);
    }
  }

  private handleMarketplaceError(marketplaceId: string, error: any): void {
    this.logger.error(`Marketplace error from ${marketplaceId}:`, error);
    
    const status = this.marketplaceStatuses.get(marketplaceId);
    if (status) {
      status.errorRate += 1;
      status.issues.push(`Error: ${error.message || error}`);
      
      // Keep only recent issues
      if (status.issues.length > 10) {
        status.issues = status.issues.slice(-10);
      }
      
      this.marketplaceStatuses.set(marketplaceId, status);
    }

    // Create alert for critical errors
    this.createAlert({
      type: 'price_anomaly',
      severity: 'high',
      message: `Marketplace ${marketplaceId} error: ${error.message || error}`,
      data: { marketplaceId, error: error.toString() },
    });
  }

  private async handleArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    this.logger.info('New arbitrage opportunity', {
      opportunityId: opportunity.id,
      momentId: opportunity.momentId,
      profitPercentage: opportunity.profitPercentage,
      confidence: opportunity.confidence,
    });

    // Store opportunity in Redis
    await this.storeArbitrageOpportunity(opportunity);

    // Create alert for high-value opportunities
    if (opportunity.profitPercentage > 20 && opportunity.confidence > 0.8) {
      this.createAlert({
        type: 'arbitrage_opportunity',
        severity: 'high',
        message: `High-value arbitrage opportunity: ${opportunity.profitPercentage.toFixed(2)}% profit`,
        data: { opportunity },
      });
    }

    this.emit('arbitrageOpportunity', opportunity);
  }

  private handleSignificantPriceChange(event: any): void {
    this.logger.info('Significant price change detected', event);

    this.createAlert({
      type: 'price_anomaly',
      severity: Math.abs(event.changePercentage) > 50 ? 'critical' : 'medium',
      message: `Price changed ${event.changePercentage.toFixed(2)}% for moment ${event.momentId}`,
      data: { priceChange: event },
    });

    this.emit('significantPriceChange', event);
  }

  private handleVolumeSpike(event: any): void {
    this.logger.info('Volume spike detected', event);

    this.createAlert({
      type: 'volume_spike',
      severity: event.spikeMultiplier > 10 ? 'high' : 'medium',
      message: `Volume spike ${event.spikeMultiplier.toFixed(2)}x for moment ${event.momentId}`,
      data: { volumeSpike: event },
    });

    this.emit('volumeSpike', event);
  }

  private handlePriceAlertTriggered(alert: PriceAlert): void {
    this.logger.info('Price alert triggered', {
      alertId: alert.id,
      type: alert.alertType,
      momentId: alert.momentId,
    });

    this.createAlert({
      type: 'price_anomaly',
      severity: 'medium',
      message: `Price alert triggered: ${alert.alertType} for ${alert.momentId || alert.playerId}`,
      data: { priceAlert: alert },
    });

    this.emit('priceAlertTriggered', alert);
  }

  private createAlert(alertData: Omit<MarketAlert, 'id' | 'createdAt' | 'acknowledged'>): void {
    const alert: MarketAlert = {
      ...alertData,
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      acknowledged: false,
    };

    this.alerts.set(alert.id, alert);
    this.emit('alertCreated', alert);

    // Store in Redis
    this.storeAlert(alert).catch(error => {
      this.logger.error('Error storing alert:', error);
    });
  }

  private async storeAlert(alert: MarketAlert): Promise<void> {
    try {
      const key = `alert:${alert.id}`;
      await this.redisClient.setEx(key, 86400 * this.config.alertRetentionDays, JSON.stringify(alert));
      
      // Add to alerts list
      await this.redisClient.lPush('alerts_list', alert.id);
      await this.redisClient.lTrim('alerts_list', 0, 1000); // Keep last 1000 alerts
    } catch (error) {
      this.logger.error('Error storing alert:', error);
    }
  }

  private async storeArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      const key = `arbitrage:${opportunity.id}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(opportunity)); // 1 hour TTL
      
      // Add to opportunities list
      await this.redisClient.lPush('arbitrage_opportunities', opportunity.id);
      await this.redisClient.lTrim('arbitrage_opportunities', 0, 100); // Keep last 100
    } catch (error) {
      this.logger.error('Error storing arbitrage opportunity:', error);
    }
  }

  private async loadMonitoringJobs(): Promise<void> {
    try {
      // Load jobs from Redis or database
      const jobsKey = 'monitoring_jobs';
      const jobsData = await this.redisClient.get(jobsKey);
      
      if (jobsData) {
        const jobs: MonitoringJob[] = JSON.parse(jobsData);
        for (const job of jobs) {
          if (job.isActive) {
            await this.startMonitoringJob(job);
          }
        }
      }

      this.logger.info(`Loaded ${this.monitoringJobs.size} monitoring jobs`);
    } catch (error) {
      this.logger.error('Error loading monitoring jobs:', error);
    }
  }

  private async startMonitoringJob(job: MonitoringJob): Promise<void> {
    try {
      const task = cron.schedule(job.schedule, async () => {
        await this.executeMonitoringJob(job);
      }, { scheduled: false });

      task.start();
      this.cronJobs.set(job.id, task);
      this.monitoringJobs.set(job.id, job);

      this.logger.info(`Started monitoring job: ${job.id} (${job.type})`);
    } catch (error) {
      this.logger.error(`Error starting monitoring job ${job.id}:`, error);
    }
  }

  private async executeMonitoringJob(job: MonitoringJob): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Executing monitoring job: ${job.id}`);

      switch (job.type) {
        case 'price_monitor':
          await this.executePriceMonitorJob(job);
          break;
        case 'arbitrage_scanner':
          await this.executeArbitrageScanJob(job);
          break;
        case 'volume_tracker':
          await this.executeVolumeTrackerJob(job);
          break;
        case 'new_listings':
          await this.executeNewListingsJob(job);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.type}`);
      }

      // Update job statistics
      job.lastRun = new Date();
      job.runCount += 1;
      job.averageExecutionTime = (job.averageExecutionTime * (job.runCount - 1) + (Date.now() - startTime)) / job.runCount;
      
      this.monitoringJobs.set(job.id, job);

    } catch (error) {
      this.logger.error(`Error executing monitoring job ${job.id}:`, error);
      job.errorCount += 1;
      this.monitoringJobs.set(job.id, job);
    }
  }

  private async executePriceMonitorJob(job: MonitoringJob): Promise<void> {
    // Custom price monitoring logic based on job config
    const config = job.config;
    // Implementation would depend on specific requirements
  }

  private async executeArbitrageScanJob(job: MonitoringJob): Promise<void> {
    // Force arbitrage scan
    // The arbitrage detector runs continuously, but this could trigger additional scans
  }

  private async executeVolumeTrackerJob(job: MonitoringJob): Promise<void> {
    // Volume tracking logic
    const config = job.config;
    // Implementation would track volume changes and create alerts
  }

  private async executeNewListingsJob(job: MonitoringJob): Promise<void> {
    // New listings monitoring
    const config = job.config;
    // Implementation would check for new listings and alert users
  }

  // Public API methods
  public async addPriceAlert(alert: Omit<PriceAlert, 'id' | 'createdAt'>): Promise<string> {
    return this.priceMonitor.addPriceAlert(alert);
  }

  public async removePriceAlert(alertId: string): Promise<boolean> {
    return this.priceMonitor.removePriceAlert(alertId);
  }

  public getActiveArbitrageOpportunities(): ArbitrageOpportunity[] {
    return this.arbitrageDetector.getActiveOpportunities();
  }

  public getMarketplaceStatuses(): MarketplaceStatus[] {
    return Array.from(this.marketplaceStatuses.values());
  }

  public getActiveAlerts(): MarketAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  public async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      this.alerts.set(alertId, alert);
      await this.storeAlert(alert);
      return true;
    }
    return false;
  }

  public getServiceStats(): {
    marketplaces: number;
    activeOpportunities: number;
    activeAlerts: number;
    monitoringJobs: number;
    totalAlerts: number;
  } {
    return {
      marketplaces: this.marketplaceClients.size,
      activeOpportunities: this.arbitrageDetector.getActiveOpportunities().length,
      activeAlerts: this.getActiveAlerts().length,
      monitoringJobs: this.monitoringJobs.size,
      totalAlerts: this.alerts.size,
    };
  }

  public async performScan(scanType: string, filters: any = {}): Promise<ScanResult> {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      let opportunities: any[] = [];
      let itemsScanned = 0;

      switch (scanType) {
        case 'arbitrage':
          opportunities = this.getActiveArbitrageOpportunities();
          itemsScanned = opportunities.length;
          break;
        
        case 'undervalued':
          // Implementation would scan for undervalued moments
          break;
        
        case 'trending':
          // Implementation would scan for trending moments
          break;
        
        default:
          throw new Error(`Unknown scan type: ${scanType}`);
      }

      const scanResult: ScanResult = {
        scanId,
        type: scanType as any,
        opportunities,
        scanDuration: Date.now() - startTime,
        itemsScanned,
        opportunitiesFound: opportunities.length,
        timestamp: new Date(),
        filters,
      };

      return scanResult;

    } catch (error) {
      this.logger.error(`Error performing ${scanType} scan:`, error);
      throw error;
    }
  }
}