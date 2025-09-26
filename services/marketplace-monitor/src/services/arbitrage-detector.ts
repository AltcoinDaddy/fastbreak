import { EventEmitter } from 'eventemitter3';
import { Logger } from 'winston';
import { 
  ArbitrageOpportunity, 
  MarketplaceListing, 
  MomentPriceData,
  MarketplaceConfig 
} from '../types/marketplace';
import { TopShotClient } from '../clients/topshot-client';

export interface ArbitrageConfig {
  minProfitPercentage: number;
  minProfitAmount: number;
  maxRiskScore: number;
  scanIntervalMs: number;
  maxOpportunityAge: number; // in minutes
  marketplaces: string[];
}

export class ArbitrageDetector extends EventEmitter {
  private logger: Logger;
  private config: ArbitrageConfig;
  private marketplaceClients: Map<string, TopShotClient>;
  private activeOpportunities: Map<string, ArbitrageOpportunity>;
  private scanInterval?: NodeJS.Timeout;
  private isScanning: boolean = false;

  constructor(
    config: ArbitrageConfig,
    marketplaceClients: Map<string, TopShotClient>,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.marketplaceClients = marketplaceClients;
    this.logger = logger;
    this.activeOpportunities = new Map();
  }

  public start(): void {
    if (this.scanInterval) {
      this.stop();
    }

    this.logger.info('Starting arbitrage detector', {
      scanInterval: this.config.scanIntervalMs,
      marketplaces: this.config.marketplaces,
    });

    this.scanInterval = setInterval(() => {
      this.scanForOpportunities().catch(error => {
        this.logger.error('Error in arbitrage scan:', error);
      });
    }, this.config.scanIntervalMs);

    // Initial scan
    this.scanForOpportunities().catch(error => {
      this.logger.error('Error in initial arbitrage scan:', error);
    });
  }

  public stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }
    this.logger.info('Arbitrage detector stopped');
  }

  private async scanForOpportunities(): Promise<void> {
    if (this.isScanning) {
      this.logger.debug('Arbitrage scan already in progress, skipping');
      return;
    }

    this.isScanning = true;
    const scanStartTime = Date.now();

    try {
      this.logger.debug('Starting arbitrage scan');

      // Clean up expired opportunities
      this.cleanupExpiredOpportunities();

      // Get listings from all marketplaces
      const allListings = await this.getAllMarketplaceListings();
      
      // Group listings by moment ID
      const listingsByMoment = this.groupListingsByMoment(allListings);

      // Scan for arbitrage opportunities
      const opportunities = await this.findArbitrageOpportunities(listingsByMoment);

      // Process new opportunities
      for (const opportunity of opportunities) {
        await this.processOpportunity(opportunity);
      }

      const scanDuration = Date.now() - scanStartTime;
      this.logger.info('Arbitrage scan completed', {
        duration: scanDuration,
        momentsScanned: Object.keys(listingsByMoment).length,
        opportunitiesFound: opportunities.length,
        activeOpportunities: this.activeOpportunities.size,
      });

    } catch (error) {
      this.logger.error('Error during arbitrage scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async getAllMarketplaceListings(): Promise<MarketplaceListing[]> {
    const allListings: MarketplaceListing[] = [];

    for (const marketplaceId of this.config.marketplaces) {
      const client = this.marketplaceClients.get(marketplaceId);
      if (!client || !client.isHealthy()) {
        this.logger.warn(`Marketplace client ${marketplaceId} not available`);
        continue;
      }

      try {
        const listings = await client.getActiveListings({
          limit: 1000, // Adjust based on API limits
        });
        allListings.push(...listings);
      } catch (error) {
        this.logger.error(`Error fetching listings from ${marketplaceId}:`, error);
      }
    }

    return allListings;
  }

  private groupListingsByMoment(listings: MarketplaceListing[]): Map<string, MarketplaceListing[]> {
    const grouped = new Map<string, MarketplaceListing[]>();

    for (const listing of listings) {
      if (!grouped.has(listing.momentId)) {
        grouped.set(listing.momentId, []);
      }
      grouped.get(listing.momentId)!.push(listing);
    }

    return grouped;
  }

  private async findArbitrageOpportunities(
    listingsByMoment: Map<string, MarketplaceListing[]>
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const [momentId, listings] of listingsByMoment) {
      if (listings.length < 2) continue; // Need at least 2 listings for arbitrage

      // Group by marketplace
      const listingsByMarketplace = new Map<string, MarketplaceListing[]>();
      for (const listing of listings) {
        if (!listingsByMarketplace.has(listing.marketplaceId)) {
          listingsByMarketplace.set(listing.marketplaceId, []);
        }
        listingsByMarketplace.get(listing.marketplaceId)!.push(listing);
      }

      // Find opportunities between marketplaces
      const marketplaces = Array.from(listingsByMarketplace.keys());
      for (let i = 0; i < marketplaces.length; i++) {
        for (let j = i + 1; j < marketplaces.length; j++) {
          const sourceMarketplace = marketplaces[i];
          const targetMarketplace = marketplaces[j];

          const sourceListings = listingsByMarketplace.get(sourceMarketplace)!;
          const targetListings = listingsByMarketplace.get(targetMarketplace)!;

          // Find best buy (lowest price) in source and best sell (highest price) in target
          const bestBuy = sourceListings.reduce((min, listing) => 
            listing.price < min.price ? listing : min
          );
          const bestSell = targetListings.reduce((max, listing) => 
            listing.price > max.price ? listing : max
          );

          // Check if there's an arbitrage opportunity
          const opportunity = this.evaluateArbitrageOpportunity(
            momentId,
            bestBuy,
            bestSell,
            sourceMarketplace,
            targetMarketplace
          );

          if (opportunity) {
            opportunities.push(opportunity);
          }

          // Also check the reverse direction
          const reverseOpportunity = this.evaluateArbitrageOpportunity(
            momentId,
            bestSell,
            bestBuy,
            targetMarketplace,
            sourceMarketplace
          );

          if (reverseOpportunity) {
            opportunities.push(reverseOpportunity);
          }
        }
      }
    }

    return opportunities;
  }

  private evaluateArbitrageOpportunity(
    momentId: string,
    buyListing: MarketplaceListing,
    sellListing: MarketplaceListing,
    sourceMarketplace: string,
    targetMarketplace: string
  ): ArbitrageOpportunity | null {
    const buyPrice = buyListing.price;
    const sellPrice = sellListing.price;
    const profitAmount = sellPrice - buyPrice;
    const profitPercentage = (profitAmount / buyPrice) * 100;

    // Check if opportunity meets minimum criteria
    if (profitAmount < this.config.minProfitAmount || 
        profitPercentage < this.config.minProfitPercentage) {
      return null;
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(buyListing, sellListing);
    
    if (riskScore > this.config.maxRiskScore) {
      return null;
    }

    // Calculate confidence based on various factors
    const confidence = this.calculateConfidence(buyListing, sellListing, profitPercentage);

    const opportunity: ArbitrageOpportunity = {
      id: `${momentId}_${sourceMarketplace}_${targetMarketplace}_${Date.now()}`,
      momentId,
      sourceMarketplace,
      targetMarketplace,
      sourcePrice: buyPrice,
      targetPrice: sellPrice,
      profitAmount,
      profitPercentage,
      confidence,
      riskScore,
      detectedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.maxOpportunityAge * 60 * 1000),
      status: 'active',
      executionRisk: {
        liquidityRisk: this.calculateLiquidityRisk(buyListing, sellListing),
        priceMovementRisk: this.calculatePriceMovementRisk(profitPercentage),
        executionTimeRisk: this.calculateExecutionTimeRisk(sourceMarketplace, targetMarketplace),
      },
    };

    return opportunity;
  }

  private calculateRiskScore(buyListing: MarketplaceListing, sellListing: MarketplaceListing): number {
    let riskScore = 0;

    // Age of listings (older listings are riskier)
    const buyAge = Date.now() - buyListing.listedAt.getTime();
    const sellAge = Date.now() - sellListing.listedAt.getTime();
    const maxAge = Math.max(buyAge, sellAge);
    riskScore += Math.min(30, maxAge / (1000 * 60 * 60)); // Max 30 points for age

    // Price volatility (higher prices are riskier)
    const avgPrice = (buyListing.price + sellListing.price) / 2;
    if (avgPrice > 1000) riskScore += 20;
    else if (avgPrice > 500) riskScore += 10;
    else if (avgPrice > 100) riskScore += 5;

    // Serial number rarity (lower serials are riskier due to higher attention)
    if (buyListing.serialNumber <= 10) riskScore += 15;
    else if (buyListing.serialNumber <= 100) riskScore += 10;
    else if (buyListing.serialNumber <= 1000) riskScore += 5;

    return Math.min(100, riskScore);
  }

  private calculateConfidence(
    buyListing: MarketplaceListing, 
    sellListing: MarketplaceListing, 
    profitPercentage: number
  ): number {
    let confidence = 50; // Base confidence

    // Higher profit percentage increases confidence
    confidence += Math.min(30, profitPercentage * 2);

    // Recent listings are more reliable
    const buyAge = Date.now() - buyListing.listedAt.getTime();
    const sellAge = Date.now() - sellListing.listedAt.getTime();
    const avgAge = (buyAge + sellAge) / 2;
    const ageHours = avgAge / (1000 * 60 * 60);
    
    if (ageHours < 1) confidence += 15;
    else if (ageHours < 6) confidence += 10;
    else if (ageHours < 24) confidence += 5;
    else confidence -= 10;

    // Same serial numbers increase confidence
    if (buyListing.serialNumber === sellListing.serialNumber) {
      confidence += 20;
    }

    return Math.max(0, Math.min(100, confidence)) / 100;
  }

  private calculateLiquidityRisk(buyListing: MarketplaceListing, sellListing: MarketplaceListing): number {
    // Simplified liquidity risk calculation
    // In a real implementation, this would consider market depth, volume, etc.
    let risk = 20; // Base risk

    // Higher priced items have higher liquidity risk
    const avgPrice = (buyListing.price + sellListing.price) / 2;
    if (avgPrice > 1000) risk += 30;
    else if (avgPrice > 500) risk += 20;
    else if (avgPrice > 100) risk += 10;

    return Math.min(100, risk);
  }

  private calculatePriceMovementRisk(profitPercentage: number): number {
    // Higher profit margins suggest higher price movement risk
    if (profitPercentage > 50) return 80;
    if (profitPercentage > 30) return 60;
    if (profitPercentage > 20) return 40;
    if (profitPercentage > 10) return 20;
    return 10;
  }

  private calculateExecutionTimeRisk(sourceMarketplace: string, targetMarketplace: string): number {
    // Risk based on marketplace execution speeds
    // This would be configured based on actual marketplace performance
    const marketplaceRisk: Record<string, number> = {
      'topshot': 10,
      'othermarket': 20,
    };

    const sourceRisk = marketplaceRisk[sourceMarketplace] || 30;
    const targetRisk = marketplaceRisk[targetMarketplace] || 30;

    return Math.max(sourceRisk, targetRisk);
  }

  private async processOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    const existingOpportunity = this.activeOpportunities.get(opportunity.id);
    
    if (existingOpportunity) {
      // Update existing opportunity
      this.activeOpportunities.set(opportunity.id, opportunity);
      this.emit('opportunityUpdated', opportunity);
    } else {
      // New opportunity
      this.activeOpportunities.set(opportunity.id, opportunity);
      this.emit('opportunityDetected', opportunity);
      
      this.logger.info('New arbitrage opportunity detected', {
        momentId: opportunity.momentId,
        sourceMarketplace: opportunity.sourceMarketplace,
        targetMarketplace: opportunity.targetMarketplace,
        profitAmount: opportunity.profitAmount,
        profitPercentage: opportunity.profitPercentage,
        confidence: opportunity.confidence,
        riskScore: opportunity.riskScore,
      });
    }
  }

  private cleanupExpiredOpportunities(): void {
    const now = new Date();
    const expiredIds: string[] = [];

    for (const [id, opportunity] of this.activeOpportunities) {
      if (opportunity.expiresAt < now || opportunity.status !== 'active') {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const opportunity = this.activeOpportunities.get(id)!;
      this.activeOpportunities.delete(id);
      this.emit('opportunityExpired', opportunity);
    }

    if (expiredIds.length > 0) {
      this.logger.debug(`Cleaned up ${expiredIds.length} expired opportunities`);
    }
  }

  public getActiveOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.activeOpportunities.values());
  }

  public getOpportunityById(id: string): ArbitrageOpportunity | undefined {
    return this.activeOpportunities.get(id);
  }

  public markOpportunityExecuted(id: string): void {
    const opportunity = this.activeOpportunities.get(id);
    if (opportunity) {
      opportunity.status = 'executed';
      this.activeOpportunities.set(id, opportunity);
      this.emit('opportunityExecuted', opportunity);
    }
  }

  public markOpportunityInvalid(id: string): void {
    const opportunity = this.activeOpportunities.get(id);
    if (opportunity) {
      opportunity.status = 'invalid';
      this.activeOpportunities.set(id, opportunity);
      this.emit('opportunityInvalid', opportunity);
    }
  }

  public getStats(): {
    activeOpportunities: number;
    totalDetected: number;
    averageProfit: number;
    averageRisk: number;
  } {
    const active = this.getActiveOpportunities();
    
    return {
      activeOpportunities: active.length,
      totalDetected: this.activeOpportunities.size,
      averageProfit: active.length > 0 
        ? active.reduce((sum, opp) => sum + opp.profitPercentage, 0) / active.length 
        : 0,
      averageRisk: active.length > 0 
        ? active.reduce((sum, opp) => sum + opp.riskScore, 0) / active.length 
        : 0,
    };
  }
}