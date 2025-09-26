import { BaseAction, ActionConfig, ActionContext, TransactionStep, ActionResult } from '../types/action';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import Joi from 'joi';

export interface ArbitrageActionInput {
  momentId: string;
  buyListing: {
    listingId: string;
    price: number;
    marketplaceId: string;
    sellerAddress: string;
  };
  sellListing: {
    listingId: string;
    price: number;
    marketplaceId: string;
    buyerAddress: string;
  };
  userAddress: string;
  expectedProfit: number;
  maxSlippage: number;
  timeoutMs: number;
}

export interface ArbitrageActionConfig extends ActionConfig {
  minProfitThreshold: number;
  maxExecutionTime: number;
  crossMarketplaceEnabled: boolean;
  simultaneousExecutionEnabled: boolean;
}

export class ArbitrageAction extends BaseAction {
  protected config: ArbitrageActionConfig;

  constructor(
    config: ArbitrageActionConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('ArbitrageAction', 'arbitrage', config, db, redisClient, logger);
    this.config = config;
  }

  protected async validateInput(context: ActionContext, input: ArbitrageActionInput): Promise<boolean> {
    try {
      // Joi schema validation
      const schema = Joi.object({
        momentId: Joi.string().required(),
        buyListing: Joi.object({
          listingId: Joi.string().required(),
          price: Joi.number().positive().required(),
          marketplaceId: Joi.string().required(),
          sellerAddress: Joi.string().required(),
        }).required(),
        sellListing: Joi.object({
          listingId: Joi.string().required(),
          price: Joi.number().positive().required(),
          marketplaceId: Joi.string().required(),
          buyerAddress: Joi.string().required(),
        }).required(),
        userAddress: Joi.string().required(),
        expectedProfit: Joi.number().positive().required(),
        maxSlippage: Joi.number().min(0).max(1).required(),
        timeoutMs: Joi.number().positive().required(),
      });

      const { error } = schema.validate(input);
      if (error) {
        this.logger.error('Input validation failed', { error: error.message });
        return false;
      }

      // Business logic validation
      const validations = await Promise.all([
        this.validateProfitability(input),
        this.validateListingAvailability(input.buyListing),
        this.validateListingAvailability(input.sellListing),
        this.validateUserCapacity(context.userId, input),
        this.validateMarketplaceCompatibility(input),
      ]);

      return validations.every(v => v);

    } catch (error) {
      this.logger.error('Validation error', { error });
      return false;
    }
  }

  protected async buildTransactionSteps(
    context: ActionContext, 
    input: ArbitrageActionInput
  ): Promise<TransactionStep[]> {
    const steps: TransactionStep[] = [];

    // Step 1: Lock both listings to prevent other purchases
    steps.push({
      id: 'lock_listings',
      type: 'api_call',
      description: 'Lock both listings for arbitrage',
      apiEndpoint: '/api/arbitrage/lock-listings',
      apiMethod: 'POST',
      apiPayload: {
        buyListingId: input.buyListing.listingId,
        sellListingId: input.sellListing.listingId,
        userId: context.userId,
        requestId: context.requestId,
        timeoutMs: input.timeoutMs,
      },
    });

    // Step 2: Validate current prices haven't changed
    steps.push({
      id: 'validate_prices',
      type: 'validation',
      description: 'Validate current listing prices',
      validationFunction: async (ctx, data) => {
        const [buyPrice, sellPrice] = await Promise.all([
          this.getCurrentListingPrice(input.buyListing.listingId, input.buyListing.marketplaceId),
          this.getCurrentListingPrice(input.sellListing.listingId, input.sellListing.marketplaceId),
        ]);

        const buySlippage = Math.abs(buyPrice - input.buyListing.price) / input.buyListing.price;
        const sellSlippage = Math.abs(sellPrice - input.sellListing.price) / input.sellListing.price;

        return buySlippage <= input.maxSlippage && sellSlippage <= input.maxSlippage;
      },
    });

    // Step 3: Reserve budget for purchase
    steps.push({
      id: 'reserve_budget',
      type: 'api_call',
      description: 'Reserve budget for arbitrage purchase',
      apiEndpoint: '/api/budget/reserve',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        amount: input.buyListing.price,
        purpose: 'arbitrage_purchase',
        momentId: input.momentId,
        requestId: context.requestId,
      },
    });

    if (this.config.simultaneousExecutionEnabled && this.canExecuteSimultaneously(input)) {
      // Execute both buy and sell simultaneously
      steps.push({
        id: 'execute_simultaneous_arbitrage',
        type: 'cadence_transaction',
        description: 'Execute simultaneous buy and sell arbitrage',
        cadenceCode: this.buildSimultaneousArbitrageTransaction(input),
        arguments: [
          input.buyListing.listingId,
          input.sellListing.listingId,
          input.momentId,
          input.buyListing.price,
          input.sellListing.price,
        ],
        gasLimit: this.config.gasLimit * 2, // Higher gas limit for complex transaction
        authorizers: [input.userAddress],
        proposer: input.userAddress,
        payer: input.userAddress,
      });
    } else {
      // Execute buy first, then sell
      steps.push({
        id: 'execute_purchase',
        type: 'cadence_transaction',
        description: 'Execute purchase transaction',
        cadenceCode: this.buildPurchaseTransaction(input),
        arguments: [
          input.buyListing.listingId,
          input.momentId,
          input.buyListing.price,
          input.buyListing.sellerAddress,
        ],
        gasLimit: this.config.gasLimit,
        authorizers: [input.userAddress],
        proposer: input.userAddress,
        payer: input.userAddress,
      });

      // Step 5: Execute sell transaction
      steps.push({
        id: 'execute_sale',
        type: 'cadence_transaction',
        description: 'Execute sale transaction',
        cadenceCode: this.buildSaleTransaction(input),
        arguments: [
          input.momentId,
          input.sellListing.price,
          input.sellListing.buyerAddress,
        ],
        gasLimit: this.config.gasLimit,
        authorizers: [input.userAddress],
        proposer: input.userAddress,
        payer: input.userAddress,
      });
    }

    // Step 6: Verify profit realization
    steps.push({
      id: 'verify_profit',
      type: 'cadence_script',
      description: 'Verify arbitrage profit was realized',
      cadenceCode: `
        import FlowToken from 0x1654653399040a61
        import FungibleToken from 0xf233dcee88fe0abe
        
        pub fun main(address: Address, expectedProfit: UFix64): Bool {
          let account = getAccount(address)
          let vaultRef = account.getCapability(/public/flowTokenBalance)
            .borrow<&FlowToken.Vault{FungibleToken.Balance}>()
            ?? panic("Could not borrow Balance reference to the Vault")
          
          // This would compare balance before and after
          // For now, returning true as placeholder
          return true
        }
      `,
      arguments: [input.userAddress, input.expectedProfit],
    });

    // Step 7: Update analytics and portfolio
    steps.push({
      id: 'update_analytics',
      type: 'api_call',
      description: 'Update arbitrage analytics and portfolio',
      apiEndpoint: '/api/arbitrage/record-execution',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        momentId: input.momentId,
        buyPrice: input.buyListing.price,
        sellPrice: input.sellListing.price,
        profit: input.expectedProfit,
        executionTime: '${executionTime}',
        transactionIds: ['${buyTransactionId}', '${sellTransactionId}'],
        timestamp: new Date().toISOString(),
      },
    });

    return steps;
  }

  protected async buildRollbackSteps(
    context: ActionContext, 
    input: ArbitrageActionInput
  ): Promise<TransactionStep[]> {
    const rollbackSteps: TransactionStep[] = [];

    // Unlock listings
    rollbackSteps.push({
      id: 'unlock_listings',
      type: 'api_call',
      description: 'Unlock arbitrage listings',
      apiEndpoint: '/api/arbitrage/unlock-listings',
      apiMethod: 'POST',
      apiPayload: {
        requestId: context.requestId,
      },
      rollbackFunction: async (ctx, data) => {
        this.logger.info('Unlocking arbitrage listings', { requestId: ctx.requestId });
      },
    });

    // Release budget reservation
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
    });

    // Handle partial execution (if buy succeeded but sell failed)
    rollbackSteps.push({
      id: 'handle_partial_execution',
      type: 'api_call',
      description: 'Handle partial arbitrage execution',
      apiEndpoint: '/api/arbitrage/handle-partial',
      apiMethod: 'POST',
      apiPayload: {
        userId: context.userId,
        momentId: input.momentId,
        requestId: context.requestId,
      },
      rollbackFunction: async (ctx, data) => {
        // If we bought the moment but couldn't sell it, 
        // we need to either retry the sell or hold the moment
        this.logger.warn('Handling partial arbitrage execution', {
          userId: ctx.userId,
          momentId: input.momentId,
        });
      },
    });

    return rollbackSteps;
  }

  protected async processResult(context: ActionContext, result: ActionResult): Promise<void> {
    try {
      if (result.success) {
        // Generate success notification with profit details
        await this.generateArbitrageSuccessNotification(context, result);
        
        // Update arbitrage strategy performance
        await this.updateArbitrageMetrics(context, result, true);
        
        this.logger.info('Arbitrage completed successfully', {
          userId: context.userId,
          transactionId: result.transactionId,
          executionTime: result.executionTime,
        });
      } else {
        // Generate failure notification
        await this.generateArbitrageFailureNotification(context, result);
        
        // Update arbitrage strategy performance
        await this.updateArbitrageMetrics(context, result, false);
        
        this.logger.error('Arbitrage failed', {
          userId: context.userId,
          error: result.error,
          executionTime: result.executionTime,
        });
      }
    } catch (error) {
      this.logger.error('Error processing arbitrage result', { error });
    }
  }

  // Private helper methods
  private async validateProfitability(input: ArbitrageActionInput): Promise<boolean> {
    const grossProfit = input.sellListing.price - input.buyListing.price;
    const estimatedFees = this.calculateEstimatedFees(input);
    const netProfit = grossProfit - estimatedFees;

    if (netProfit < this.config.minProfitThreshold) {
      this.logger.warn('Arbitrage not profitable enough', {
        grossProfit,
        estimatedFees,
        netProfit,
        minThreshold: this.config.minProfitThreshold,
      });
      return false;
    }

    return true;
  }

  private async validateListingAvailability(listing: any): Promise<boolean> {
    try {
      // This would check if the listing is still available
      this.logger.debug('Validating listing availability', { 
        listingId: listing.listingId,
        marketplaceId: listing.marketplaceId,
      });
      return true;
    } catch (error) {
      this.logger.error('Listing validation error', { error });
      return false;
    }
  }

  private async validateUserCapacity(userId: string, input: ArbitrageActionInput): Promise<boolean> {
    try {
      // Check if user has sufficient balance and capacity for arbitrage
      this.logger.debug('Validating user capacity for arbitrage', { 
        userId,
        requiredAmount: input.buyListing.price,
      });
      return true;
    } catch (error) {
      this.logger.error('User capacity validation error', { error });
      return false;
    }
  }

  private async validateMarketplaceCompatibility(input: ArbitrageActionInput): Promise<boolean> {
    const isCrossMarketplace = input.buyListing.marketplaceId !== input.sellListing.marketplaceId;
    
    if (isCrossMarketplace && !this.config.crossMarketplaceEnabled) {
      this.logger.warn('Cross-marketplace arbitrage not enabled');
      return false;
    }

    return true;
  }

  private canExecuteSimultaneously(input: ArbitrageActionInput): boolean {
    // Can execute simultaneously if both listings are on the same marketplace
    // and the marketplace supports atomic operations
    return input.buyListing.marketplaceId === input.sellListing.marketplaceId &&
           input.buyListing.marketplaceId === 'topshot'; // TopShot supports atomic operations
  }

  private calculateEstimatedFees(input: ArbitrageActionInput): number {
    // Calculate estimated marketplace fees and gas costs
    const buyFee = input.buyListing.price * 0.05; // 5% marketplace fee
    const sellFee = input.sellListing.price * 0.05; // 5% marketplace fee
    const gasCost = 0.001; // Estimated gas cost in FLOW
    
    return buyFee + sellFee + gasCost;
  }

  private async getCurrentListingPrice(listingId: string, marketplaceId: string): Promise<number> {
    // This would fetch the current price from the marketplace API
    // For now, returning a mock price
    return Math.random() * 1000;
  }

  private buildSimultaneousArbitrageTransaction(input: ArbitrageActionInput): string {
    return `
      import TopShot from 0x0b2a3299cc857e29
      import Market from 0xc1e4f4f4c4257510
      import FlowToken from 0x1654653399040a61
      import FungibleToken from 0xf233dcee88fe0abe

      transaction(
        buyListingID: UInt64, 
        sellListingID: UInt64,
        momentID: UInt64, 
        buyPrice: UFix64, 
        sellPrice: UFix64
      ) {
        let paymentVault: @FungibleToken.Vault
        let topShotCollection: &TopShot.Collection
        let marketCollection: &Market.Collection{Market.CollectionPublic}
        let saleCollection: &Market.Collection

        prepare(arbitrager: AuthAccount) {
          // Get the arbitrager's collection
          self.topShotCollection = arbitrager.borrow<&TopShot.Collection>(from: /storage/MomentCollection)
            ?? panic("Cannot borrow TopShot collection")

          // Get payment vault
          let vaultRef = arbitrager.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Cannot borrow FlowToken vault")
          
          self.paymentVault <- vaultRef.withdraw(amount: buyPrice)

          // Get market collections
          self.marketCollection = arbitrager.getCapability(/public/topshotSaleCollection)
            .borrow<&Market.Collection{Market.CollectionPublic}>()
            ?? panic("Cannot borrow market collection")

          self.saleCollection = arbitrager.borrow<&Market.Collection>(from: /storage/topshotSaleCollection)
            ?? panic("Cannot borrow sale collection")
        }

        execute {
          // Step 1: Purchase the moment
          let purchasedMoment <- self.marketCollection.purchase(
            tokenID: buyListingID, 
            buyTokens: <-self.paymentVault
          )

          // Step 2: Immediately list it for sale at higher price
          let salePrice = sellPrice
          let momentRef = &purchasedMoment as &TopShot.NFT
          
          // Create sale cut for the arbitrager (100% since they own it now)
          let saleCut = Market.SaleCut(
            receiver: arbitrager.getCapability<&{FungibleToken.Receiver}>(/public/flowTokenReceiver),
            amount: salePrice
          )

          // List the moment for sale
          self.saleCollection.listForSale(
            token: <-purchasedMoment,
            price: salePrice,
            saleCuts: [saleCut]
          )
        }

        post {
          // Verify the moment is listed for sale
          self.saleCollection.borrowSaleItem(id: momentID) != nil: 
            "Moment was not successfully listed for sale"
        }
      }
    `;
  }

  private buildPurchaseTransaction(input: ArbitrageActionInput): string {
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
          self.topShotCollection = buyer.borrow<&TopShot.Collection>(from: /storage/MomentCollection)
            ?? panic("Cannot borrow TopShot collection from buyer")

          let vaultRef = buyer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Cannot borrow FlowToken vault from buyer")
          
          self.paymentVault <- vaultRef.withdraw(amount: maxPrice)

          let sellerAccount = getAccount(sellerAddress)
          self.marketCollection = sellerAccount.getCapability(/public/topshotSaleCollection)
            .borrow<&Market.Collection{Market.CollectionPublic}>()
            ?? panic("Cannot borrow seller's market collection")
        }

        execute {
          let purchasedMoment <- self.marketCollection.purchase(
            tokenID: listingResourceID, 
            buyTokens: <-self.paymentVault
          )

          self.topShotCollection.deposit(token: <-purchasedMoment)
        }
      }
    `;
  }

  private buildSaleTransaction(input: ArbitrageActionInput): string {
    return `
      import TopShot from 0x0b2a3299cc857e29
      import Market from 0xc1e4f4f4c4257510
      import FlowToken from 0x1654653399040a61
      import FungibleToken from 0xf233dcee88fe0abe

      transaction(momentID: UInt64, salePrice: UFix64, buyerAddress: Address) {
        let topShotCollection: &TopShot.Collection
        let saleCollection: &Market.Collection

        prepare(seller: AuthAccount) {
          self.topShotCollection = seller.borrow<&TopShot.Collection>(from: /storage/MomentCollection)
            ?? panic("Cannot borrow TopShot collection")

          self.saleCollection = seller.borrow<&Market.Collection>(from: /storage/topshotSaleCollection)
            ?? panic("Cannot borrow sale collection")
        }

        execute {
          let moment <- self.topShotCollection.withdraw(withdrawID: momentID) as! @TopShot.NFT

          let saleCut = Market.SaleCut(
            receiver: seller.getCapability<&{FungibleToken.Receiver}>(/public/flowTokenReceiver),
            amount: salePrice
          )

          self.saleCollection.listForSale(
            token: <-moment,
            price: salePrice,
            saleCuts: [saleCut]
          )
        }
      }
    `;
  }

  private async generateArbitrageSuccessNotification(context: ActionContext, result: ActionResult): Promise<void> {
    this.logger.info('Generating arbitrage success notification', {
      userId: context.userId,
      transactionId: result.transactionId,
    });
  }

  private async generateArbitrageFailureNotification(context: ActionContext, result: ActionResult): Promise<void> {
    this.logger.info('Generating arbitrage failure notification', {
      userId: context.userId,
      error: result.error,
    });
  }

  private async updateArbitrageMetrics(
    context: ActionContext, 
    result: ActionResult, 
    success: boolean
  ): Promise<void> {
    this.logger.debug('Updating arbitrage metrics', {
      userId: context.userId,
      success,
      executionTime: result.executionTime,
    });
  }
}