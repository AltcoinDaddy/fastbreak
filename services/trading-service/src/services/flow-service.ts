import { EventEmitter } from 'events';
import { Logger } from 'winston';
import * as fcl from '@onflow/fcl';
import * as t from '@onflow/types';
import { ec as EC } from 'elliptic';
import { SHA3 } from 'sha3';

export interface FlowConfig {
  network: string;
  accessNodeAPI: string;
  privateKey: string;
  accountAddress: string;
  contracts: {
    FastBreakController: string;
    SafetyControls: string;
    TradeAnalytics: string;
    TopShot: string;
  };
}

export interface TransactionResult {
  transactionId: string;
  status: number;
  statusCode: number;
  errorMessage?: string;
  events: any[];
  gasUsed: number;
}

export interface MomentData {
  id: string;
  playerId: string;
  playerName: string;
  setId: string;
  serialNumber: number;
  currentPrice?: number;
  owner?: string;
}

export class FlowService extends EventEmitter {
  private config: FlowConfig;
  private logger: Logger;
  private ec: EC;
  private connected: boolean = false;

  constructor(config: FlowConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.ec = new EC('p256');
  }

  public async initialize(): Promise<void> {
    try {
      // Configure FCL
      fcl.config({
        'accessNode.api': this.config.accessNodeAPI,
        'discovery.wallet': this.getWalletDiscovery(),
        'app.detail.title': 'FastBreak Trading Service',
        'app.detail.icon': 'https://fastbreak.com/icon.png',
      });

      // Test connection
      await this.testConnection();
      this.connected = true;

      this.logger.info('Flow service initialized successfully', {
        network: this.config.network,
        accessNode: this.config.accessNodeAPI,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Flow service:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    this.connected = false;
    this.logger.info('Flow service shutdown complete');
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private getWalletDiscovery(): string {
    switch (this.config.network) {
      case 'emulator':
        return 'http://127.0.0.1:8701/fcl/authn';
      case 'testnet':
        return 'https://fcl-discovery.onflow.org/testnet/authn';
      case 'mainnet':
        return 'https://fcl-discovery.onflow.org/authn';
      default:
        throw new Error(`Unknown network: ${this.config.network}`);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      const account = await fcl.account(this.config.accountAddress);
      this.logger.debug('Flow connection test successful', {
        address: account.address,
        balance: account.balance,
      });
    } catch (error) {
      throw new Error(`Flow connection test failed: ${error}`);
    }
  }

  // Authentication and signing
  private getAuthz(): any {
    return {
      addr: fcl.sansPrefix(this.config.accountAddress),
      keyId: 0,
      signingFunction: (signable: any) => {
        return {
          addr: fcl.withPrefix(this.config.accountAddress),
          keyId: 0,
          signature: this.signWithKey(this.config.privateKey, signable.message),
        };
      },
    };
  }

  private signWithKey(privateKey: string, message: string): string {
    const key = this.ec.keyFromPrivate(Buffer.from(privateKey, 'hex'));
    const sha = new SHA3(256);
    sha.update(Buffer.from(message, 'hex'));
    const hash = sha.digest();
    const sig = key.sign(hash);
    const n = 32;
    const r = sig.r.toArrayLike(Buffer, 'be', n);
    const s = sig.s.toArrayLike(Buffer, 'be', n);
    return Buffer.concat([r, s]).toString('hex');
  }

  // Smart contract interactions
  public async createUserAccount(
    userAddress: string,
    budgetLimits: any
  ): Promise<TransactionResult> {
    const transaction = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      transaction(budgetLimits: FastBreakController.BudgetLimits) {
        prepare(signer: AuthAccount) {
          let userAccount <- FastBreakController.createUserAccount(budgetLimits: budgetLimits)
          signer.save(<-userAccount, to: FastBreakController.UserStoragePath)
          signer.link<&{FastBreakController.UserAccountPublic}>(
            FastBreakController.UserPublicPath,
            target: FastBreakController.UserStoragePath
          )
        }
      }
    `;

    return this.executeTransaction(transaction, [
      fcl.arg(budgetLimits, (t as any).Struct),
    ]);
  }

  public async validateSpending(
    userAddress: string,
    amount: number
  ): Promise<boolean> {
    const script = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      pub fun main(userAddress: Address, amount: UFix64): Bool {
        let userAccount = getAccount(userAddress)
          .getCapability(FastBreakController.UserPublicPath)
          .borrow<&{FastBreakController.UserAccountPublic}>()
          ?? panic("User account not found")

        let budgetLimits = userAccount.getBudgetLimits()
        let spendingTracker = userAccount.getSpendingTracker()

        if amount > budgetLimits.maxPricePerMoment {
          return false
        }

        if spendingTracker.dailySpent + amount > budgetLimits.dailySpendingCap {
          return false
        }

        if spendingTracker.totalSpent + amount > budgetLimits.totalBudgetLimit {
          return false
        }

        return true
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [
          arg(userAddress, t.Address),
          arg(amount.toFixed(8), t.UFix64),
        ],
      });

      return result as boolean;
    } catch (error) {
      this.logger.error('Error validating spending:', error);
      return false;
    }
  }

  public async recordTrade(
    userAddress: string,
    momentId: string,
    action: 'buy' | 'sell',
    price: number,
    strategyId?: string,
    reasoning?: string
  ): Promise<TransactionResult> {
    const transaction = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      transaction(
        momentId: UInt64,
        action: FastBreakController.TradeAction,
        price: UFix64,
        strategyId: UInt64?,
        reasoning: String?
      ) {
        prepare(signer: AuthAccount) {
          let userAccount = signer.borrow<&FastBreakController.UserAccount>(
            from: FastBreakController.UserStoragePath
          ) ?? panic("User account not found")

          userAccount.recordTrade(
            momentId: momentId,
            action: action,
            price: price,
            strategyId: strategyId,
            reasoning: reasoning,
            transactionHash: nil
          )
        }
      }
    `;

    const tradeAction = action === 'buy' ? 0 : 1; // Enum values

    return this.executeTransaction(transaction, [
      fcl.arg(momentId, t.UInt64),
      fcl.arg(tradeAction, t.UInt8),
      fcl.arg(price.toFixed(8), t.UFix64),
      fcl.arg(strategyId ? parseInt(strategyId) : null, t.Optional(t.UInt64)),
      fcl.arg(reasoning || null, t.Optional(t.String)),
    ]);
  }

  public async getUserStrategies(userAddress: string): Promise<any[]> {
    const script = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      pub fun main(userAddress: Address): {UInt64: FastBreakController.StrategyConfig} {
        let userAccount = getAccount(userAddress)
          .getCapability(FastBreakController.UserPublicPath)
          .borrow<&{FastBreakController.UserAccountPublic}>()
          ?? panic("User account not found")

        return userAccount.getStrategies()
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [arg(userAddress, t.Address)],
      });

      return Object.values(result || {});
    } catch (error) {
      this.logger.error('Error getting user strategies:', error);
      return [];
    }
  }

  public async getUserBudgetLimits(userAddress: string): Promise<any | null> {
    const script = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      pub fun main(userAddress: Address): FastBreakController.BudgetLimits? {
        let userAccount = getAccount(userAddress)
          .getCapability(FastBreakController.UserPublicPath)
          .borrow<&{FastBreakController.UserAccountPublic}>()

        return userAccount?.getBudgetLimits()
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [arg(userAddress, t.Address)],
      });

      return result;
    } catch (error) {
      this.logger.error('Error getting user budget limits:', error);
      return null;
    }
  }

  public async getUserTradeHistory(userAddress: string, limit?: number): Promise<any[]> {
    const script = `
      import FastBreakController from 0x${this.config.contracts.FastBreakController}

      pub fun main(userAddress: Address, limit: Int?): [FastBreakController.TradeRecord] {
        let userAccount = getAccount(userAddress)
          .getCapability(FastBreakController.UserPublicPath)
          .borrow<&{FastBreakController.UserAccountPublic}>()
          ?? panic("User account not found")

        if let limitValue = limit {
          return userAccount.getRecentTrades(limit: limitValue)
        } else {
          return userAccount.getTradeHistory()
        }
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [
          arg(userAddress, t.Address),
          arg(limit || null, t.Optional(t.Int)),
        ],
      });

      return result || [];
    } catch (error) {
      this.logger.error('Error getting user trade history:', error);
      return [];
    }
  }

  // Top Shot moment interactions
  public async getMomentData(momentId: string): Promise<MomentData | null> {
    const script = `
      import TopShot from 0x${this.config.contracts.TopShot}
      import MetadataViews from 0x1d7e57aa55817448

      pub fun main(momentId: UInt64): {String: AnyStruct}? {
        let moment = TopShot.borrowMoment(id: momentId)
        if moment == nil {
          return nil
        }

        let metadata = moment!.resolveView(Type<MetadataViews.Display>()) as! MetadataViews.Display?
        
        return {
          "id": momentId,
          "playerId": moment!.data.playID,
          "setId": moment!.data.setID,
          "serialNumber": moment!.data.serialNumber,
          "name": metadata?.name ?? "",
          "description": metadata?.description ?? ""
        }
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [arg(momentId, t.UInt64)],
      });

      if (!result) return null;

      return {
        id: result.id.toString(),
        playerId: result.playerId.toString(),
        playerName: result.name || 'Unknown Player',
        setId: result.setId.toString(),
        serialNumber: result.serialNumber,
      };
    } catch (error) {
      this.logger.error('Error getting moment data:', error);
      return null;
    }
  }

  public async getUserMoments(userAddress: string): Promise<MomentData[]> {
    const script = `
      import TopShot from 0x${this.config.contracts.TopShot}
      import NonFungibleToken from 0x1d7e57aa55817448

      pub fun main(userAddress: Address): [UInt64] {
        let account = getAccount(userAddress)
        let collectionRef = account.getCapability(TopShot.CollectionPublicPath)
          .borrow<&{TopShot.MomentCollectionPublic}>()

        if collectionRef == nil {
          return []
        }

        return collectionRef!.getIDs()
      }
    `;

    try {
      const momentIds = await fcl.query({
        cadence: script,
        args: (arg, t) => [arg(userAddress, t.Address)],
      });

      if (!momentIds || momentIds.length === 0) {
        return [];
      }

      // Get detailed data for each moment
      const moments: MomentData[] = [];
      for (const momentId of momentIds) {
        const momentData = await this.getMomentData(momentId.toString());
        if (momentData) {
          moments.push({ ...momentData, owner: userAddress });
        }
      }

      return moments;
    } catch (error) {
      this.logger.error('Error getting user moments:', error);
      return [];
    }
  }

  // Safety controls integration
  public async canUserTrade(userAddress: string): Promise<boolean> {
    const script = `
      import SafetyControls from 0x${this.config.contracts.SafetyControls}

      pub fun main(userAddress: Address): Bool {
        return SafetyControls.canUserTrade(userAddress: userAddress)
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [arg(userAddress, t.Address)],
      });

      return result as boolean;
    } catch (error) {
      this.logger.error('Error checking if user can trade:', error);
      return false;
    }
  }

  public async validateTransaction(
    userAddress: string,
    amount: number
  ): Promise<boolean> {
    const script = `
      import SafetyControls from 0x${this.config.contracts.SafetyControls}

      pub fun main(userAddress: Address, amount: UFix64): Bool {
        return SafetyControls.validateTransaction(userAddress: userAddress, amount: amount)
      }
    `;

    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg, t) => [
          arg(userAddress, t.Address),
          arg(amount.toFixed(8), t.UFix64),
        ],
      });

      return result as boolean;
    } catch (error) {
      this.logger.error('Error validating transaction:', error);
      return false;
    }
  }

  // Analytics integration
  public async recordAnalyticsTrade(
    userAddress: string,
    strategyId: string,
    strategyType: string,
    profit: number,
    volume: number,
    holdingPeriod: number
  ): Promise<TransactionResult> {
    const transaction = `
      import TradeAnalytics from 0x${this.config.contracts.TradeAnalytics}

      transaction(
        strategyId: UInt64,
        strategyType: String,
        profit: Fix64,
        volume: UFix64,
        holdingPeriod: UFix64
      ) {
        prepare(signer: AuthAccount) {
          let analyticsResource = signer.borrow<&TradeAnalytics.UserAnalyticsResource>(
            from: TradeAnalytics.AnalyticsStoragePath
          ) ?? panic("Analytics resource not found")

          analyticsResource.recordTrade(
            strategyId: strategyId,
            strategyType: strategyType,
            profit: profit,
            volume: volume,
            holdingPeriod: holdingPeriod
          )
        }
      }
    `;

    return this.executeTransaction(transaction, [
      fcl.arg(parseInt(strategyId), t.UInt64),
      fcl.arg(strategyType, t.String),
      fcl.arg(profit.toFixed(8), t.Fix64),
      fcl.arg(volume.toFixed(8), t.UFix64),
      fcl.arg(holdingPeriod.toFixed(8), t.UFix64),
    ]);
  }

  // Generic transaction execution
  private async executeTransaction(
    cadence: string,
    args: any[] = []
  ): Promise<TransactionResult> {
    try {
      const transactionId = await (fcl as any).mutate({
        cadence,
        args: (arg: any, t: any) => args,
        proposer: this.getAuthz(),
        payer: this.getAuthz(),
        authorizations: [this.getAuthz()],
        limit: 9999,
      });

      this.logger.debug('Transaction submitted', { transactionId });

      // Wait for transaction to be sealed
      const result = await fcl.tx(transactionId).onceSealed();

      const transactionResult: TransactionResult = {
        transactionId,
        status: result.status,
        statusCode: result.statusCode,
        errorMessage: result.errorMessage,
        events: result.events || [],
        gasUsed: (result as any).gasUsed || 0,
      };

      if (result.status === 4) {
        // Transaction sealed successfully
        this.emit('transactionSealed', transactionId, transactionResult);
      } else {
        // Transaction failed
        this.emit('transactionFailed', transactionId, new Error(result.errorMessage || 'Transaction failed'));
      }

      return transactionResult;
    } catch (error) {
      this.logger.error('Transaction execution failed:', error);
      this.emit('transactionFailed', 'unknown', error);
      throw error;
    }
  }

  // Event monitoring
  public async subscribeToEvents(eventTypes: string[], callback: (event: any) => void): Promise<void> {
    // This would implement event subscription in a real Flow integration
    // For now, this is a placeholder
    this.logger.info('Event subscription setup', { eventTypes });
  }
}