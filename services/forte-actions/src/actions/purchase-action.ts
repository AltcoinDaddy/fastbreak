import { BaseAction, ActionConfig, ActionContext, TransactionStep, ActionResult } from '../types/action';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import Joi from 'joi';

export interface PurchaseActionInput {
  momentId: string;
  listingId: string;
  maxPrice: number;
  sellerAddress: string;
  buyerAddress: string;
  marketplaceId: string;
  strategyId?: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface PurchaseActionConfig extends ActionConfig {
  slippageTolerance: number; // Percentage (e.g., 0.05 for 5%)
  priceValidityWindow: number; // Milliseconds
  marketplaceTimeouts: Record<string, number>;
}

export class PurchaseAction extends BaseAction {
  protected config: PurchaseActionConfig;

  constructor(
    config: PurchaseActionConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('PurchaseAction', 'purchase', config, db, redisClient, logger);
    this.config = config;
  }

  protected async validateInput(context: ActionContext, input: PurchaseActionInput): Promise<boolean> {
    try {
      // Joi schema validation
      const schema = Joi.object({
        momentId: Joi.string().required(),
        listingId: Joi.string().required(),
        maxPrice: Joi.number().positive().required(),
        sellerAddress: Joi.string().required(),
        buyerAddress: Joi.string().required(),
        marketplaceId: Joi.string().valid('topshot', 'othermarkets').required(),
        strategyId: Joi.string().optional(),
        urgency: Joi.string().valid('low', 'medium', 'high').required(),
      });

      const { error } = schema.validate(input);
      if (error) {
        this.logger.error('Input validation failed', { error: error.message });
        return false;
      }

      // Business logic validation
      const validations = await Promise.all([
        this.validateUserBudget(context.userId, input.maxPrice),
        this.validateListingAvailability(input.listingId, input.marketplaceId),
        this.validatePriceRange(input.momentId, input.maxPrice),
        this.validateUserWallet(input.buyerAddress, context.userId),
      ]);

      return validations.every(v => v);

    } catch (error) {
      this.logger.error('Validation error', { error });
      return false;
    }
  }

  protected async buildTransactionSteps(
    context: ActionContext, 
    input: PurchaseActionInput
  ): Promise<TransactionStep[]> {
    const steps: TransactionStep[] = [];

    // Step 1: Validate current listing price
    steps.push({
      id: 'validate_price',
      type: 'api_call',
      description: 'Validate current listing price',
      apiEndpoint: `/api/marketplace/${input.marketplaceId}/listings/${input.listingId}`,
      apiMethod: 'GET',
      validationFunction: async (ctx, data) => {
        const currentPrice = data?.price || 0;
        const maxAllowedPrice = input.maxPrice * (1 + this.config.slippageTolerance);
        return currentPrice <= maxAllowedPrice;
      },
    });

    // Step 2: Reserve budget
    steps.push({
      id: 'reserve_budget',
      type: 'api_call',
      description: 'Reserve budget for purchase',
      apiEndpoint: '/api/budget/reserve',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        amount: input.maxPrice,
        purpose: 'moment_purchase',
        momentId: input.momentId,
        requestId: context.requestId,
      },
    });

    // Step 3: Pre-authorize wallet transaction
    steps.push({
      id: 'preauth_wallet',
      type: 'cadence_script',
      description: 'Pre-authorize wallet for transaction',
      cadenceCode: `
        import FlowToken from 0x1654653399040a61
        import FungibleToken from 0xf233dcee88fe0abe
        
        pub fun main(address: Address, amount: UFix64): Bool {
          let account = getAccount(address)
          let vaultRef = account.getCapability(/public/flowTokenBalance)
            .borrow<&FlowToken.Vault{FungibleToken.Balance}>()
            ?? panic("Could not borrow Balance reference to the Vault")
          
          return vaultRef.balance >= amount
        }
      `,
      arguments: [input.buyerAddress, input.maxPrice],
    });

    // Step 4: Execute purchase transaction
    steps.push({
      id: 'execute_purchase',
      type: 'cadence_transaction',
      description: 'Execute atomic purchase transaction',
      cadenceCode: this.buildPurchaseTransaction(input),
      arguments: [
        input.listingId,
        input.momentId,
        input.maxPrice,
        input.sellerAddress,
      ],
      gasLimit: this.config.gasLimit,
      authorizers: [input.buyerAddress],
      proposer: input.buyerAddress,
      payer: input.buyerAddress,
    });

    // Step 5: Verify moment transfer
    steps.push({
      id: 'verify_transfer',
      type: 'cadence_script',
      description: 'Verify moment was transferred to buyer',
      cadenceCode: `
        import TopShot from 0x0b2a3299cc857e29
        
        pub fun main(address: Address, momentId: UInt64): Bool {
          let account = getAccount(address)
          let collectionRef = account.getCapability(/public/MomentCollection)
            .borrow<&{TopShot.MomentCollectionPublic}>()
            ?? panic("Could not borrow collection reference")
          
          return collectionRef.borrowMoment(id: momentId) != nil
        }
      `,
      arguments: [input.buyerAddress, input.momentId],
    });

    // Step 6: Update portfolio and analytics
    steps.push({
      id: 'update_portfolio',
      type: 'api_call',
      description: 'Update user portfolio and analytics',
      apiEndpoint: '/api/portfolio/add-moment',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        momentId: input.momentId,
        purchasePrice: input.maxPrice,
        transactionId: '${transactionId}', // Will be replaced with actual transaction ID
        strategyId: input.strategyId,
        timestamp: new Date().toISOString(),
      },
    });

    return steps;
  }

  protected async buildRollbackSteps(
    context: ActionContext, 
    input: PurchaseActionInput
  ): Promise<TransactionStep[]> {
    const rollbackSteps: TransactionStep[] = [];

    // Rollback budget reservation
    rollbackSteps.push({
      id: 'rollback_budget',
      type: 'api_call',
      description: 'Release reserved budget',
      apiEndpoint: '/api/budget/release',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        requestId: context.requestId,
      },
      rollbackFunction: async (ctx, data) => {
        // Release budget reservation
        this.logger.info('Releasing budget reservation', { 
          userId: ctx.userId, 
          requestId: ctx.requestId 
        });
      },
    });

    // Log failed purchase attempt
    rollbackSteps.push({
      id: 'log_failure',
      type: 'api_call',
      description: 'Log failed purchase attempt',
      apiEndpoint: '/api/analytics/log-failed-purchase',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        momentId: input.momentId,
        listingId: input.listingId,
        maxPrice: input.maxPrice,
        reason: 'transaction_failed',
        timestamp: new Date().toISOString(),
      },
    });

    return rollbackSteps;
  }

  protected async processResult(context: ActionContext, result: ActionResult): Promise<void> {
    try {
      if (result.success) {
        // Generate success notification
        await this.generateSuccessNotification(context, result);
        
        // Update strategy performance metrics
        await this.updateStrategyMetrics(context, result, true);
        
        this.logger.info('Purchase completed successfully', {
          userId: context.userId,
          transactionId: result.transactionId,
          executionTime: result.executionTime,
        });
      } else {
        // Generate failure notification
        await this.generateFailureNotification(context, result);
        
        // Update strategy performance metrics
        await this.updateStrategyMetrics(context, result, false);
        
        this.logger.error('Purchase failed', {
          userId: context.userId,
          error: result.error,
          executionTime: result.executionTime,
        });
      }
    } catch (error) {
      this.logger.error('Error processing purchase result', { error });
    }
  }

  // Private helper methods
  private async validateUserBudget(userId: string, amount: number): Promise<boolean> {
    try {
      // This would check user's available budget
      // For now, returning true as a placeholder
      this.logger.debug('Validating user budget', { userId, amount });
      return true;
    } catch (error) {
      this.logger.error('Budget validation error', { error });
      return false;
    }
  }

  private async validateListingAvailability(listingId: string, marketplaceId: string): Promise<boolean> {
    try {
      // This would check if the listing is still available
      this.logger.debug('Validating listing availability', { listingId, marketplaceId });
      return true;
    } catch (error) {
      this.logger.error('Listing validation error', { error });
      return false;
    }
  }

  private async validatePriceRange(momentId: string, maxPrice: number): Promise<boolean> {
    try {
      // This would check if the price is within reasonable range
      this.logger.debug('Validating price range', { momentId, maxPrice });
      return true;
    } catch (error) {
      this.logger.error('Price validation error', { error });
      return false;
    }
  }

  private async validateUserWallet(walletAddress: string, userId: string): Promise<boolean> {
    try {
      // This would verify the wallet belongs to the user
      this.logger.debug('Validating user wallet', { walletAddress, userId });
      return true;
    } catch (error) {
      this.logger.error('Wallet validation error', { error });
      return false;
    }
  }

  private buildPurchaseTransaction(input: PurchaseActionInput): string {
    return `
      import TopShot from 0x0b2a3299cc857e29
      import Market from 0xc1e4f4f4c4257510
      import FlowToken from 0x1654653399040a61
      import FungibleToken from 0xf233dcee88fe0abe

      transaction(listingResourceID: UInt64, momentID: UInt64, maxPrice: UFix64, sellerAddress: Address) {
        let paymentVault: @FungibleToken.Vault
        let topShotCollection: &TopShot.Collection
        let marketCollection: &Market.Collection{Market.CollectionPublic}

        prepare(buyer: AuthAccount) {
          // Get the buyer's collection
          self.topShotCollection = buyer.borrow<&TopShot.Collection>(from: /storage/MomentCollection)
            ?? panic("Cannot borrow TopShot collection from buyer")

          // Get payment vault
          let vaultRef = buyer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Cannot borrow FlowToken vault from buyer")
          
          self.paymentVault <- vaultRef.withdraw(amount: maxPrice)

          // Get seller's market collection
          let sellerAccount = getAccount(sellerAddress)
          self.marketCollection = sellerAccount.getCapability(/public/topshotSaleCollection)
            .borrow<&Market.Collection{Market.CollectionPublic}>()
            ?? panic("Cannot borrow seller's market collection")
        }

        execute {
          // Purchase the moment atomically
          let purchasedMoment <- self.marketCollection.purchase(
            tokenID: listingResourceID, 
            buyTokens: <-self.paymentVault
          )

          // Deposit the moment into buyer's collection
          self.topShotCollection.deposit(token: <-purchasedMoment)
        }

        post {
          // Verify the moment is now in buyer's collection
          self.topShotCollection.borrowMoment(id: momentID) != nil: 
            "Moment was not successfully transferred to buyer"
        }
      }
    `;
  }

  private async generateSuccessNotification(context: ActionContext, result: ActionResult): Promise<void> {
    try {
      // This would send a success notification to the user
      this.logger.info('Generating success notification', {
        userId: context.userId,
        transactionId: result.transactionId,
      });
    } catch (error) {
      this.logger.error('Error generating success notification', { error });
    }
  }

  private async generateFailureNotification(context: ActionContext, result: ActionResult): Promise<void> {
    try {
      // This would send a failure notification to the user
      this.logger.info('Generating failure notification', {
        userId: context.userId,
        error: result.error,
      });
    } catch (error) {
      this.logger.error('Error generating failure notification', { error });
    }
  }

  private async updateStrategyMetrics(
    context: ActionContext, 
    result: ActionResult, 
    success: boolean
  ): Promise<void> {
    try {
      // This would update strategy performance metrics
      this.logger.debug('Updating strategy metrics', {
        userId: context.userId,
        success,
        executionTime: result.executionTime,
      });
    } catch (error) {
      this.logger.error('Error updating strategy metrics', { error });
    }
  }
}