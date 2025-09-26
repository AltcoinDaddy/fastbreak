import { BaseAction, ActionConfig, ActionContext, TransactionStep, ActionResult } from '../types/action';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import Joi from 'joi';

export interface PortfolioRebalanceInput {
  userId: string;
  userAddress: string;
  rebalanceType: 'profit_taking' | 'loss_cutting' | 'diversification' | 'strategy_change';
  targetAllocations?: Record<string, number>; // category -> percentage
  sellCriteria: {
    minProfitPercentage?: number;
    maxLossPercentage?: number;
    holdingPeriodDays?: number;
    momentCategories?: string[];
    priceThresholds?: {
      above?: number;
      below?: number;
    };
  };
  maxMomentsToSell: number;
  urgency: 'low' | 'medium' | 'high';
  dryRun: boolean;
}

export interface MomentToSell {
  momentId: string;
  currentPrice: number;
  purchasePrice: number;
  profitLoss: number;
  profitLossPercentage: number;
  holdingDays: number;
  category: string;
  priority: number;
  reason: string;
}

export interface PortfolioRebalanceConfig extends ActionConfig {
  maxBatchSize: number;
  minProfitThreshold: number;
  maxLossThreshold: number;
  marketImpactLimit: number;
  priceValidityWindow: number;
}

export class PortfolioRebalanceAction extends BaseAction {
  protected config: PortfolioRebalanceConfig;

  constructor(
    config: PortfolioRebalanceConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('PortfolioRebalanceAction', 'portfolio_rebalance', config, db, redisClient, logger);
    this.config = config;
  }

  protected async validateInput(context: ActionContext, input: PortfolioRebalanceInput): Promise<boolean> {
    try {
      // Joi schema validation
      const schema = Joi.object({
        userId: Joi.string().required(),
        userAddress: Joi.string().required(),
        rebalanceType: Joi.string().valid('profit_taking', 'loss_cutting', 'diversification', 'strategy_change').required(),
        targetAllocations: Joi.object().pattern(Joi.string(), Joi.number().min(0).max(1)).optional(),
        sellCriteria: Joi.object({
          minProfitPercentage: Joi.number().min(0).optional(),
          maxLossPercentage: Joi.number().min(0).max(1).optional(),
          holdingPeriodDays: Joi.number().integer().min(0).optional(),
          momentCategories: Joi.array().items(Joi.string()).optional(),
          priceThresholds: Joi.object({
            above: Joi.number().positive().optional(),
            below: Joi.number().positive().optional(),
          }).optional(),
        }).required(),
        maxMomentsToSell: Joi.number().integer().min(1).max(this.config.maxBatchSize).required(),
        urgency: Joi.string().valid('low', 'medium', 'high').required(),
        dryRun: Joi.boolean().required(),
      });

      const { error } = schema.validate(input);
      if (error) {
        this.logger.error('Input validation failed', { error: error.message });
        return false;
      }

      // Business logic validation
      const validations = await Promise.all([
        this.validateUserPortfolio(input.userId),
        this.validateRebalanceCriteria(input),
        this.validateMarketConditions(),
      ]);

      return validations.every(v => v);

    } catch (error) {
      this.logger.error('Validation error', { error });
      return false;
    }
  }

  protected async buildTransactionSteps(
    context: ActionContext, 
    input: PortfolioRebalanceInput
  ): Promise<TransactionStep[]> {
    const steps: TransactionStep[] = [];

    // Step 1: Analyze current portfolio
    steps.push({
      id: 'analyze_portfolio',
      type: 'api_call',
      description: 'Analyze current portfolio composition',
      apiEndpoint: '/api/portfolio/analyze',
      apiMethod: 'POST',
      apiPayload: {
        userId: input.userId,
        includeMarketData: true,
        includeProfitLoss: true,
      },
    });

    // Step 2: Identify moments to sell
    steps.push({
      id: 'identify_sell_candidates',
      type: 'validation',
      description: 'Identify moments that meet sell criteria',
      validationFunction: async (ctx, data) => {
        const portfolio = data.portfolioAnalysis;
        const sellCandidates = await this.identifyMomentsToSell(portfolio, input);
        
        if (sellCandidates.length === 0) {
          throw new Error('No moments meet the sell criteria');
        }

        // Store candidates for next steps
        await this.redisClient.setEx(
          `rebalance_candidates:${ctx.requestId}`,
          3600,
          JSON.stringify(sellCandidates)
        );

        return true;
      },
    });

    if (input.dryRun) {
      // For dry run, just return analysis without executing trades
      steps.push({
        id: 'generate_dry_run_report',
        type: 'api_call',
        description: 'Generate dry run rebalance report',
        apiEndpoint: '/api/portfolio/dry-run-report',
        apiMethod: 'POST',
        apiPayload: {
          userId: input.userId,
          rebalanceType: input.rebalanceType,
          sellCandidates: '${sellCandidates}',
          requestId: context.requestId,
        },
      });
    } else {
      // Step 3: Validate current market prices
      steps.push({
        id: 'validate_market_prices',
        type: 'validation',
        description: 'Validate current market prices for sell candidates',
        validationFunction: async (ctx, data) => {
          const candidates = JSON.parse(
            await this.redisClient.get(`rebalance_candidates:${ctx.requestId}`) || '[]'
          );
          
          return await this.validateCurrentPrices(candidates);
        },
      });

      // Step 4: Execute batch sell transactions
      steps.push({
        id: 'execute_batch_sales',
        type: 'cadence_transaction',
        description: 'Execute batch sale of selected moments',
        cadenceCode: this.buildBatchSaleTransaction(),
        arguments: [], // Will be populated dynamically
        gasLimit: this.config.gasLimit * 3, // Higher gas limit for batch operations
        authorizers: [input.userAddress],
        proposer: input.userAddress,
        payer: input.userAddress,
      });

      // Step 5: Update portfolio allocations
      steps.push({
        id: 'update_allocations',
        type: 'api_call',
        description: 'Update portfolio allocations after rebalance',
        apiEndpoint: '/api/portfolio/update-allocations',
        apiMethod: 'POST',
        apiPayload: {
          userId: input.userId,
          rebalanceType: input.rebalanceType,
          soldMoments: '${soldMoments}',
          newAllocations: input.targetAllocations,
          timestamp: new Date().toISOString(),
        },
      });

      // Step 6: Generate rebalance report
      steps.push({
        id: 'generate_report',
        type: 'api_call',
        description: 'Generate portfolio rebalance report',
        apiEndpoint: '/api/portfolio/rebalance-report',
        apiMethod: 'POST',
        apiPayload: {
          userId: input.userId,
          rebalanceType: input.rebalanceType,
          executionSummary: '${executionSummary}',
          transactionIds: '${transactionIds}',
          timestamp: new Date().toISOString(),
        },
      });
    }

    return steps;
  }

  protected async buildRollbackSteps(
    context: ActionContext, 
    input: PortfolioRebalanceInput
  ): Promise<TransactionStep[]> {
    const rollbackSteps: TransactionStep[] = [];

    if (!input.dryRun) {
      // Rollback any partial sales
      rollbackSteps.push({
        id: 'rollback_partial_sales',
        type: 'api_call',
        description: 'Handle partial sale rollback',
        apiEndpoint: '/api/portfolio/rollback-sales',
        apiMethod: 'POST',
        apiPayload: {
          userId: input.userId,
          requestId: context.requestId,
        },
        rollbackFunction: async (ctx, data) => {
          this.logger.warn('Rolling back partial portfolio rebalance', {
            userId: input.userId,
            requestId: ctx.requestId,
          });
        },
      });

      // Restore original portfolio state
      rollbackSteps.push({
        id: 'restore_portfolio_state',
        type: 'api_call',
        description: 'Restore original portfolio state',
        apiEndpoint: '/api/portfolio/restore-state',
        apiMethod: 'POST',
        apiPayload: {
          userId: input.userId,
          requestId: context.requestId,
        },
      });
    }

    // Clean up temporary data
    rollbackSteps.push({
      id: 'cleanup_temp_data',
      type: 'validation',
      description: 'Clean up temporary rebalance data',
      validationFunction: async (ctx, data) => {
        await this.redisClient.del(`rebalance_candidates:${ctx.requestId}`);
        return true;
      },
    });

    return rollbackSteps;
  }

  protected async processResult(context: ActionContext, result: ActionResult): Promise<void> {
    try {
      if (result.success) {
        // Generate success notification with rebalance summary
        await this.generateRebalanceSuccessNotification(context, result);
        
        // Update portfolio strategy metrics
        await this.updatePortfolioMetrics(context, result, true);
        
        this.logger.info('Portfolio rebalance completed successfully', {
          userId: context.userId,
          transactionId: result.transactionId,
          executionTime: result.executionTime,
        });
      } else {
        // Generate failure notification
        await this.generateRebalanceFailureNotification(context, result);
        
        // Update portfolio strategy metrics
        await this.updatePortfolioMetrics(context, result, false);
        
        this.logger.error('Portfolio rebalance failed', {
          userId: context.userId,
          error: result.error,
          executionTime: result.executionTime,
        });
      }
    } catch (error) {
      this.logger.error('Error processing rebalance result', { error });
    }
  }

  // Private helper methods
  private async validateUserPortfolio(userId: string): Promise<boolean> {
    try {
      // Check if user has a portfolio with moments to rebalance
      this.logger.debug('Validating user portfolio', { userId });
      return true;
    } catch (error) {
      this.logger.error('Portfolio validation error', { error });
      return false;
    }
  }

  private async validateRebalanceCriteria(input: PortfolioRebalanceInput): Promise<boolean> {
    try {
      // Validate that the rebalance criteria make sense
      const { sellCriteria } = input;
      
      if (sellCriteria.minProfitPercentage && sellCriteria.minProfitPercentage < this.config.minProfitThreshold) {
        this.logger.warn('Minimum profit percentage below threshold', {
          provided: sellCriteria.minProfitPercentage,
          threshold: this.config.minProfitThreshold,
        });
        return false;
      }

      if (sellCriteria.maxLossPercentage && sellCriteria.maxLossPercentage > this.config.maxLossThreshold) {
        this.logger.warn('Maximum loss percentage above threshold', {
          provided: sellCriteria.maxLossPercentage,
          threshold: this.config.maxLossThreshold,
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Rebalance criteria validation error', { error });
      return false;
    }
  }

  private async validateMarketConditions(): Promise<boolean> {
    try {
      // Check if market conditions are suitable for rebalancing
      this.logger.debug('Validating market conditions for rebalancing');
      return true;
    } catch (error) {
      this.logger.error('Market conditions validation error', { error });
      return false;
    }
  }

  private async identifyMomentsToSell(
    portfolio: any, 
    input: PortfolioRebalanceInput
  ): Promise<MomentToSell[]> {
    const candidates: MomentToSell[] = [];
    const { sellCriteria } = input;

    for (const moment of portfolio.moments || []) {
      const profitLoss = moment.currentPrice - moment.purchasePrice;
      const profitLossPercentage = profitLoss / moment.purchasePrice;
      const holdingDays = Math.floor(
        (Date.now() - new Date(moment.purchaseDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      let shouldSell = false;
      let reason = '';
      let priority = 0;

      // Check profit criteria
      if (sellCriteria.minProfitPercentage && profitLossPercentage >= sellCriteria.minProfitPercentage) {
        shouldSell = true;
        reason = 'profit_target_met';
        priority = profitLossPercentage * 100; // Higher profit = higher priority
      }

      // Check loss criteria
      if (sellCriteria.maxLossPercentage && Math.abs(profitLossPercentage) >= sellCriteria.maxLossPercentage && profitLoss < 0) {
        shouldSell = true;
        reason = 'loss_limit_reached';
        priority = Math.abs(profitLossPercentage) * 100; // Higher loss = higher priority
      }

      // Check holding period
      if (sellCriteria.holdingPeriodDays && holdingDays >= sellCriteria.holdingPeriodDays) {
        shouldSell = true;
        reason = 'holding_period_exceeded';
        priority = holdingDays;
      }

      // Check price thresholds
      if (sellCriteria.priceThresholds?.above && moment.currentPrice >= sellCriteria.priceThresholds.above) {
        shouldSell = true;
        reason = 'price_threshold_above';
        priority = moment.currentPrice;
      }

      if (sellCriteria.priceThresholds?.below && moment.currentPrice <= sellCriteria.priceThresholds.below) {
        shouldSell = true;
        reason = 'price_threshold_below';
        priority = 1000 - moment.currentPrice; // Lower price = higher priority for selling
      }

      // Check category filters
      if (sellCriteria.momentCategories && !sellCriteria.momentCategories.includes(moment.category)) {
        shouldSell = false;
      }

      if (shouldSell) {
        candidates.push({
          momentId: moment.id,
          currentPrice: moment.currentPrice,
          purchasePrice: moment.purchasePrice,
          profitLoss,
          profitLossPercentage,
          holdingDays,
          category: moment.category,
          priority,
          reason,
        });
      }
    }

    // Sort by priority (descending) and limit to maxMomentsToSell
    return candidates
      .sort((a, b) => b.priority - a.priority)
      .slice(0, input.maxMomentsToSell);
  }

  private async validateCurrentPrices(candidates: MomentToSell[]): Promise<boolean> {
    try {
      // Validate that current market prices haven't changed significantly
      for (const candidate of candidates) {
        const currentMarketPrice = await this.getCurrentMarketPrice(candidate.momentId);
        const priceChange = Math.abs(currentMarketPrice - candidate.currentPrice) / candidate.currentPrice;
        
        if (priceChange > 0.05) { // 5% price change threshold
          this.logger.warn('Significant price change detected', {
            momentId: candidate.momentId,
            expectedPrice: candidate.currentPrice,
            currentPrice: currentMarketPrice,
            change: priceChange,
          });
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.logger.error('Price validation error', { error });
      return false;
    }
  }

  private async getCurrentMarketPrice(momentId: string): Promise<number> {
    // This would fetch the current market price for the moment
    // For now, returning a mock price
    return Math.random() * 1000;
  }

  private buildBatchSaleTransaction(): string {
    return `
      import TopShot from 0x0b2a3299cc857e29
      import Market from 0xc1e4f4f4c4257510
      import FlowToken from 0x1654653399040a61
      import FungibleToken from 0xf233dcee88fe0abe

      transaction(momentIDs: [UInt64], salePrices: [UFix64]) {
        let topShotCollection: &TopShot.Collection
        let saleCollection: &Market.Collection
        let flowReceiver: &{FungibleToken.Receiver}

        prepare(seller: AuthAccount) {
          // Get the seller's TopShot collection
          self.topShotCollection = seller.borrow<&TopShot.Collection>(from: /storage/MomentCollection)
            ?? panic("Cannot borrow TopShot collection from seller")

          // Get the seller's sale collection
          self.saleCollection = seller.borrow<&Market.Collection>(from: /storage/topshotSaleCollection)
            ?? panic("Cannot borrow sale collection from seller")

          // Get the seller's Flow token receiver
          self.flowReceiver = seller.getCapability<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            .borrow() ?? panic("Cannot borrow Flow token receiver")
        }

        execute {
          // Batch list moments for sale
          var i = 0
          while i < momentIDs.length {
            let momentID = momentIDs[i]
            let salePrice = salePrices[i]

            // Withdraw the moment from collection
            let moment <- self.topShotCollection.withdraw(withdrawID: momentID) as! @TopShot.NFT

            // Create sale cut (100% to seller)
            let saleCut = Market.SaleCut(
              receiver: self.flowReceiver,
              amount: salePrice
            )

            // List the moment for sale
            self.saleCollection.listForSale(
              token: <-moment,
              price: salePrice,
              saleCuts: [saleCut]
            )

            i = i + 1
          }
        }

        post {
          // Verify all moments are listed for sale
          var j = 0
          while j < momentIDs.length {
            self.saleCollection.borrowSaleItem(id: momentIDs[j]) != nil: 
              "Moment was not successfully listed for sale"
            j = j + 1
          }
        }
      }
    `;
  }

  private async generateRebalanceSuccessNotification(context: ActionContext, result: ActionResult): Promise<void> {
    this.logger.info('Generating rebalance success notification', {
      userId: context.userId,
      transactionId: result.transactionId,
    });
  }

  private async generateRebalanceFailureNotification(context: ActionContext, result: ActionResult): Promise<void> {
    this.logger.info('Generating rebalance failure notification', {
      userId: context.userId,
      error: result.error,
    });
  }

  private async updatePortfolioMetrics(
    context: ActionContext, 
    result: ActionResult, 
    success: boolean
  ): Promise<void> {
    this.logger.debug('Updating portfolio rebalance metrics', {
      userId: context.userId,
      success,
      executionTime: result.executionTime,
    });
  }
}