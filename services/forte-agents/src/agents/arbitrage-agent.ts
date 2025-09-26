import { BaseAgent, AgentConfig, TriggerCondition } from './base-agent';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import axios, { AxiosInstance } from 'axios';

export interface ArbitrageAgentConfig extends AgentConfig {
  minProfitPercentage: number;
  minProfitAmount: number;
  maxRiskScore: number;
  marketplaces: string[];
  maxOpportunityAge: number; // milliseconds
  enableAutoExecution: boolean;
}

export interface MarketplaceListing {
  marketplaceId: string;
  momentId: string;
  price: number;
  quantity: number;
  sellerId: string;
  listingId: string;
  timestamp: Date;
  fees: number;
}

export interface ArbitrageOpportunity {
  momentId: string;
  buyListing: MarketplaceListing;
  sellListing: MarketplaceListing;
  grossProfit: number;
  netProfit: number;
  profitPercentage: number;
  riskScore: number;
  confidence: number;
  executionTimeEstimate: number;
  expiresAt: Date;
}

export class ArbitrageAgent extends BaseAgent {
  protected config: ArbitrageAgentConfig;
  private marketplaceAPIs: Map<string, AxiosInstance> = new Map();
  private tradingServiceAPI: AxiosInstance;
  private activeListings: Map<string, MarketplaceListing[]> = new Map();
  private detectedOpportunities: Map<string, ArbitrageOpportunity> = new Map();

  constructor(
    config: ArbitrageAgentConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('ArbitrageAgent', 'arbitrage_monitoring', config, db, redisClient, logger);
    this.config = config;

    // Initialize marketplace API clients
    this.initializeMarketplaceAPIs();

    // Initialize Trading Service API client
    this.tradingServiceAPI = axios.create({
      baseURL: process.env.TRADING_SERVICE_URL || 'http://localhost:8003',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private initializeMarketplaceAPIs(): void {
    for (const marketplace of this.config.marketplaces) {
      let baseURL: string;
      let headers: any = { 'Content-Type': 'application/json' };

      switch (marketplace) {
        case 'topshot':
          baseURL = 'https://api.nbatopshot.com';
          break;
        case 'othermarkets':
          baseURL = 'https://api.othermarkets.com';
          break;
        default:
          this.logger.warn('Unknown marketplace:', marketplace);
          continue;
      }

      const apiClient = axios.create({
        baseURL,
        timeout: 30000,
        headers,
      });

      this.marketplaceAPIs.set(marketplace, apiClient);
    }
  }

  protected async initializeTriggerConditions(): Promise<void> {
    try {
      this.logger.info('Initializing arbitrage trigger conditions');

      // Add trigger for price discrepancies
      this.addTriggerCondition({
        type: 'price_discrepancy',
        parameters: {
          minProfitPercentage: this.config.minProfitPercentage,
          minProfitAmount: this.config.minProfitAmount,
        },
        isActive: true,
      });

      // Add trigger for cross-marketplace opportunities
      this.addTriggerCondition({
        type: 'cross_marketplace_opportunity',
        parameters: {
          marketplaces: this.config.marketplaces,
          maxRiskScore: this.config.maxRiskScore,
        },
        isActive: true,
      });

      // Add trigger for expired opportunities cleanup
      this.addTriggerCondition({
        type: 'opportunity_cleanup',
        parameters: {
          maxAge: this.config.maxOpportunityAge,
        },
        isActive: true,
      });

      this.logger.info('Arbitrage trigger conditions initialized');
    } catch (error) {
      this.logger.error('Failed to initialize trigger conditions:', error);
      throw error;
    }
  }

  protected async evaluateTriggerConditions(): Promise<TriggerCondition[]> {
    const activatedTriggers: TriggerCondition[] = [];

    try {
      // Update marketplace listings
      await this.updateMarketplaceListings();

      for (const condition of this.getAllTriggerConditions()) {
        if (!condition.isActive) continue;

        let shouldTrigger = false;

        switch (condition.type) {
          case 'price_discrepancy':
            shouldTrigger = await this.evaluatePriceDiscrepancies(condition);
            break;
          case 'cross_marketplace_opportunity':
            shouldTrigger = await this.evaluateCrossMarketplaceOpportunities(condition);
            break;
          case 'opportunity_cleanup':
            shouldTrigger = await this.evaluateOpportunityCleanup(condition);
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
          case 'price_discrepancy':
            await this.handlePriceDiscrepancies(trigger);
            break;
          case 'cross_marketplace_opportunity':
            await this.handleCrossMarketplaceOpportunities(trigger);
            break;
          case 'opportunity_cleanup':
            await this.handleOpportunityCleanup(trigger);
            break;
        }
      } catch (error) {
        this.logger.error('Error executing trigger action:', { trigger: trigger.type, error });
      }
    }
  }

  // Trigger evaluation methods
  private async evaluatePriceDiscrepancies(condition: TriggerCondition): Promise<boolean> {
    try {
      const opportunities = await this.findArbitrageOpportunities();
      
      for (const opportunity of opportunities) {
        if (opportunity.profitPercentage >= condition.parameters.minProfitPercentage &&
            opportunity.netProfit >= condition.parameters.minProfitAmount) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating price discrepancies:', error);
      return false;
    }
  }

  private async evaluateCrossMarketplaceOpportunities(condition: TriggerCondition): Promise<boolean> {
    try {
      const opportunities = await this.findArbitrageOpportunities();
      
      for (const opportunity of opportunities) {
        if (opportunity.buyListing.marketplaceId !== opportunity.sellListing.marketplaceId &&
            opportunity.riskScore <= condition.parameters.maxRiskScore) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating cross-marketplace opportunities:', error);
      return false;
    }
  }

  private async evaluateOpportunityCleanup(condition: TriggerCondition): Promise<boolean> {
    try {
      const now = Date.now();
      const maxAge = condition.parameters.maxAge;

      for (const opportunity of this.detectedOpportunities.values()) {
        const age = now - opportunity.expiresAt.getTime();
        if (age > maxAge) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error evaluating opportunity cleanup:', error);
      return false;
    }
  }

  // Trigger action handlers
  private async handlePriceDiscrepancies(trigger: TriggerCondition): Promise<void> {
    try {
      const opportunities = await this.findArbitrageOpportunities();
      
      for (const opportunity of opportunities) {
        if (opportunity.profitPercentage >= trigger.parameters.minProfitPercentage &&
            opportunity.netProfit >= trigger.parameters.minProfitAmount) {
          
          await this.processArbitrageOpportunity(opportunity);
        }
      }
    } catch (error) {
      this.logger.error('Error handling price discrepancies:', error);
    }
  }

  private async handleCrossMarketplaceOpportunities(trigger: TriggerCondition): Promise<void> {
    try {
      const opportunities = await this.findArbitrageOpportunities();
      
      for (const opportunity of opportunities) {
        if (opportunity.buyListing.marketplaceId !== opportunity.sellListing.marketplaceId &&
            opportunity.riskScore <= trigger.parameters.maxRiskScore) {
          
          await this.processCrossMarketplaceOpportunity(opportunity);
        }
      }
    } catch (error) {
      this.logger.error('Error handling cross-marketplace opportunities:', error);
    }
  }

  private async handleOpportunityCleanup(trigger: TriggerCondition): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = trigger.parameters.maxAge;
      const expiredOpportunities: string[] = [];

      for (const [id, opportunity] of this.detectedOpportunities) {
        const age = now - opportunity.expiresAt.getTime();
        if (age > maxAge) {
          expiredOpportunities.push(id);
        }
      }

      for (const id of expiredOpportunities) {
        this.detectedOpportunities.delete(id);
      }

      if (expiredOpportunities.length > 0) {
        this.logger.info('Cleaned up expired opportunities', { count: expiredOpportunities.length });
      }
    } catch (error) {
      this.logger.error('Error handling opportunity cleanup:', error);
    }
  }

  // Core arbitrage logic
  private async findArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    try {
      // Group listings by moment ID
      const momentListings = new Map<string, MarketplaceListing[]>();

      for (const [marketplaceId, listings] of this.activeListings) {
        for (const listing of listings) {
          if (!momentListings.has(listing.momentId)) {
            momentListings.set(listing.momentId, []);
          }
          momentListings.get(listing.momentId)!.push(listing);
        }
      }

      // Find arbitrage opportunities for each moment
      for (const [momentId, listings] of momentListings) {
        if (listings.length < 2) continue; // Need at least 2 listings

        // Sort by price (ascending for buy opportunities, descending for sell)
        const sortedListings = listings.sort((a, b) => a.price - b.price);
        
        // Find best buy and sell opportunities
        for (let i = 0; i < sortedListings.length - 1; i++) {
          const buyListing = sortedListings[i];
          
          for (let j = i + 1; j < sortedListings.length; j++) {
            const sellListing = sortedListings[j];
            
            // Skip if same marketplace (unless internal arbitrage is allowed)
            if (buyListing.marketplaceId === sellListing.marketplaceId) continue;

            const opportunity = await this.calculateArbitrageOpportunity(buyListing, sellListing);
            
            if (opportunity && this.isViableOpportunity(opportunity)) {
              opportunities.push(opportunity);
            }
          }
        }
      }

      return opportunities;
    } catch (error) {
      this.logger.error('Error finding arbitrage opportunities:', error);
      return [];
    }
  }

  private async calculateArbitrageOpportunity(
    buyListing: MarketplaceListing,
    sellListing: MarketplaceListing
  ): Promise<ArbitrageOpportunity | null> {
    try {
      if (buyListing.price >= sellListing.price) {
        return null; // No profit opportunity
      }

      const grossProfit = sellListing.price - buyListing.price;
      const totalFees = buyListing.fees + sellListing.fees;
      const netProfit = grossProfit - totalFees;
      const profitPercentage = netProfit / buyListing.price;

      if (netProfit <= 0) {
        return null; // No profit after fees
      }

      const riskScore = await this.calculateRiskScore(buyListing, sellListing);
      const confidence = await this.calculateConfidence(buyListing, sellListing, netProfit);
      const executionTimeEstimate = await this.estimateExecutionTime(buyListing, sellListing);

      return {
        momentId: buyListing.momentId,
        buyListing,
        sellListing,
        grossProfit,
        netProfit,
        profitPercentage,
        riskScore,
        confidence,
        executionTimeEstimate,
        expiresAt: new Date(Date.now() + this.config.maxOpportunityAge),
      };
    } catch (error) {
      this.logger.error('Error calculating arbitrage opportunity:', error);
      return null;
    }
  }

  private async calculateRiskScore(
    buyListing: MarketplaceListing,
    sellListing: MarketplaceListing
  ): Promise<number> {
    let riskScore = 0;

    // Price volatility risk
    const priceSpread = Math.abs(sellListing.price - buyListing.price) / buyListing.price;
    riskScore += Math.min(priceSpread * 100, 30);

    // Marketplace risk
    if (buyListing.marketplaceId !== 'topshot') riskScore += 10;
    if (sellListing.marketplaceId !== 'topshot') riskScore += 10;

    // Timing risk (age of listings)
    const now = Date.now();
    const buyAge = now - buyListing.timestamp.getTime();
    const sellAge = now - sellListing.timestamp.getTime();
    
    if (buyAge > 60000) riskScore += 5; // > 1 minute old
    if (sellAge > 60000) riskScore += 5;

    // Execution complexity risk
    if (buyListing.marketplaceId !== sellListing.marketplaceId) riskScore += 15;

    return Math.min(riskScore, 100);
  }

  private async calculateConfidence(
    buyListing: MarketplaceListing,
    sellListing: MarketplaceListing,
    netProfit: number
  ): Promise<number> {
    let confidence = 50; // Base confidence

    // Higher profit = higher confidence
    confidence += Math.min(netProfit / 100 * 20, 30);

    // Same marketplace = higher confidence
    if (buyListing.marketplaceId === sellListing.marketplaceId) {
      confidence += 15;
    }

    // Recent listings = higher confidence
    const now = Date.now();
    const avgAge = ((now - buyListing.timestamp.getTime()) + (now - sellListing.timestamp.getTime())) / 2;
    if (avgAge < 30000) confidence += 10; // < 30 seconds

    // TopShot marketplace = higher confidence
    if (buyListing.marketplaceId === 'topshot' && sellListing.marketplaceId === 'topshot') {
      confidence += 10;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  private async estimateExecutionTime(
    buyListing: MarketplaceListing,
    sellListing: MarketplaceListing
  ): Promise<number> {
    let executionTime = 30; // Base 30 seconds

    // Cross-marketplace adds time
    if (buyListing.marketplaceId !== sellListing.marketplaceId) {
      executionTime += 60;
    }

    // Different marketplaces have different execution times
    const marketplaceTimes = {
      'topshot': 15,
      'othermarkets': 45,
    };

    executionTime += marketplaceTimes[buyListing.marketplaceId as keyof typeof marketplaceTimes] || 60;
    executionTime += marketplaceTimes[sellListing.marketplaceId as keyof typeof marketplaceTimes] || 60;

    return executionTime;
  }

  private isViableOpportunity(opportunity: ArbitrageOpportunity): boolean {
    return (
      opportunity.netProfit >= this.config.minProfitAmount &&
      opportunity.profitPercentage >= this.config.minProfitPercentage &&
      opportunity.riskScore <= this.config.maxRiskScore &&
      opportunity.confidence >= 60
    );
  }

  // Opportunity processing
  private async processArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      const opportunityId = `${opportunity.momentId}_${Date.now()}`;
      this.detectedOpportunities.set(opportunityId, opportunity);

      // Generate opportunity alert
      this.generateOpportunity({
        type: 'arbitrage_opportunity',
        momentId: opportunity.momentId,
        action: 'arbitrage',
        estimatedProfit: opportunity.netProfit,
        confidence: opportunity.confidence,
        riskScore: opportunity.riskScore,
        expiresAt: opportunity.expiresAt,
        data: {
          buyListing: opportunity.buyListing,
          sellListing: opportunity.sellListing,
          grossProfit: opportunity.grossProfit,
          netProfit: opportunity.netProfit,
          profitPercentage: opportunity.profitPercentage,
          executionTimeEstimate: opportunity.executionTimeEstimate,
        },
      });

      // Generate high-priority alert
      this.generateAlert({
        type: 'arbitrage_opportunity',
        severity: opportunity.netProfit > 100 ? 'high' : 'medium',
        title: `Arbitrage Opportunity Detected`,
        message: `Potential profit of $${opportunity.netProfit.toFixed(2)} (${(opportunity.profitPercentage * 100).toFixed(1)}%) on moment ${opportunity.momentId}`,
        data: {
          opportunityId,
          momentId: opportunity.momentId,
          netProfit: opportunity.netProfit,
          profitPercentage: opportunity.profitPercentage,
          riskScore: opportunity.riskScore,
          confidence: opportunity.confidence,
          buyMarketplace: opportunity.buyListing.marketplaceId,
          sellMarketplace: opportunity.sellListing.marketplaceId,
          buyPrice: opportunity.buyListing.price,
          sellPrice: opportunity.sellListing.price,
        },
      });

      // Auto-execute if enabled and conditions are met
      if (this.config.enableAutoExecution && this.shouldAutoExecute(opportunity)) {
        await this.executeArbitrageOpportunity(opportunity);
      }

    } catch (error) {
      this.logger.error('Error processing arbitrage opportunity:', error);
    }
  }

  private async processCrossMarketplaceOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      // Similar to processArbitrageOpportunity but with cross-marketplace specific logic
      await this.processArbitrageOpportunity(opportunity);

      // Additional cross-marketplace specific alerts
      this.generateAlert({
        type: 'cross_marketplace_arbitrage',
        severity: 'high',
        title: `Cross-Marketplace Arbitrage`,
        message: `Cross-marketplace arbitrage opportunity: Buy on ${opportunity.buyListing.marketplaceId} for $${opportunity.buyListing.price}, sell on ${opportunity.sellListing.marketplaceId} for $${opportunity.sellListing.price}`,
        data: {
          momentId: opportunity.momentId,
          buyMarketplace: opportunity.buyListing.marketplaceId,
          sellMarketplace: opportunity.sellListing.marketplaceId,
          netProfit: opportunity.netProfit,
          executionComplexity: 'high',
        },
      });

    } catch (error) {
      this.logger.error('Error processing cross-marketplace opportunity:', error);
    }
  }

  private shouldAutoExecute(opportunity: ArbitrageOpportunity): boolean {
    return (
      opportunity.confidence >= 80 &&
      opportunity.riskScore <= 30 &&
      opportunity.netProfit >= 50 &&
      opportunity.executionTimeEstimate <= 120 // 2 minutes
    );
  }

  private async executeArbitrageOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      this.logger.info('Auto-executing arbitrage opportunity', {
        momentId: opportunity.momentId,
        netProfit: opportunity.netProfit,
      });

      // Execute buy order
      const buyResult = await this.executeBuyOrder(opportunity.buyListing);
      if (!buyResult.success) {
        throw new Error(`Buy order failed: ${buyResult.error}`);
      }

      // Execute sell order
      const sellResult = await this.executeSellOrder(opportunity.sellListing);
      if (!sellResult.success) {
        // Try to cancel buy order if sell fails
        if (buyResult.orderId) {
          await this.cancelOrder(buyResult.orderId);
        }
        throw new Error(`Sell order failed: ${sellResult.error}`);
      }

      // Generate success alert
      this.generateAlert({
        type: 'arbitrage_executed',
        severity: 'high',
        title: `Arbitrage Executed Successfully`,
        message: `Successfully executed arbitrage for moment ${opportunity.momentId}. Profit: $${opportunity.netProfit.toFixed(2)}`,
        data: {
          momentId: opportunity.momentId,
          netProfit: opportunity.netProfit,
          buyOrderId: buyResult.orderId,
          sellOrderId: sellResult.orderId,
          executionTime: Date.now() - opportunity.expiresAt.getTime() + this.config.maxOpportunityAge,
        },
      });

    } catch (error) {
      this.logger.error('Error executing arbitrage opportunity:', error);
      
      this.generateAlert({
        type: 'arbitrage_execution_failed',
        severity: 'medium',
        title: `Arbitrage Execution Failed`,
        message: `Failed to execute arbitrage for moment ${opportunity.momentId}: ${error}`,
        data: {
          momentId: opportunity.momentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // Data management methods
  private async updateMarketplaceListings(): Promise<void> {
    try {
      for (const [marketplaceId, apiClient] of this.marketplaceAPIs) {
        await this.updateListingsForMarketplace(marketplaceId, apiClient);
      }
    } catch (error) {
      this.logger.error('Error updating marketplace listings:', error);
    }
  }

  private async updateListingsForMarketplace(marketplaceId: string, apiClient: AxiosInstance): Promise<void> {
    try {
      const response = await apiClient.get('/marketplace/listings');
      const listings = response.data.listings || [];

      const marketplaceListings: MarketplaceListing[] = listings.map((listing: any) => ({
        marketplaceId,
        momentId: listing.momentId,
        price: listing.price,
        quantity: listing.quantity || 1,
        sellerId: listing.sellerId,
        listingId: listing.id,
        timestamp: new Date(listing.createdAt),
        fees: this.calculateMarketplaceFees(marketplaceId, listing.price),
      }));

      this.activeListings.set(marketplaceId, marketplaceListings);

    } catch (error) {
      this.logger.error('Error updating listings for marketplace:', { marketplaceId, error });
    }
  }

  private calculateMarketplaceFees(marketplaceId: string, price: number): number {
    const feeRates = {
      'topshot': 0.05,      // 5%
      'othermarkets': 0.025, // 2.5%
    };

    const feeRate = feeRates[marketplaceId as keyof typeof feeRates] || 0.05;
    return price * feeRate;
  }

  // Trading execution methods (placeholders)
  private async executeBuyOrder(listing: MarketplaceListing): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      // This would execute the actual buy order via trading service
      this.logger.info('Executing buy order', { listingId: listing.listingId, price: listing.price });
      
      return {
        success: true,
        orderId: `buy_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async executeSellOrder(listing: MarketplaceListing): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      // This would execute the actual sell order via trading service
      this.logger.info('Executing sell order', { listingId: listing.listingId, price: listing.price });
      
      return {
        success: true,
        orderId: `sell_${Date.now()}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async cancelOrder(orderId: string): Promise<void> {
    try {
      // This would cancel the order via trading service
      this.logger.info('Cancelling order', { orderId });
    } catch (error) {
      this.logger.error('Error cancelling order:', { orderId, error });
    }
  }
}