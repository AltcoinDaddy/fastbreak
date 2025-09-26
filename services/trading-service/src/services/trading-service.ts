import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { DatabaseManager } from '@fastbreak/database';
import { FlowService } from './flow-service';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface TradingServiceConfig {
  maxConcurrentTrades: number;
  tradeTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  slippageTolerance: number;
  gasLimit: number;
  enableDryRun: boolean;
  topShotAPI: {
    baseUrl: string;
    apiKey?: string;
    rateLimitPerSecond: number;
  };
  marketplaceConfig: {
    marketplaceFee: number;
    minBidIncrement: number;
    maxBidDuration: number;
  };
}

export interface TradeRequest {
  id: string;
  userId: string;
  momentId: string;
  action: 'buy' | 'sell' | 'bid';
  targetPrice: number;
  maxPrice?: number;
  minPrice?: number;
  strategyId?: string;
  reasoning?: string;
  timeoutMs?: number;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}

export interface TradeExecution {
  id: string;
  tradeRequestId: string;
  userId: string;
  momentId: string;
  action: 'buy' | 'sell' | 'bid';
  executedPrice: number;
  quantity: number;
  fees: number;
  transactionHash?: string;
  status: 'pending' | 'executed' | 'failed' | 'cancelled';
  error?: string;
  executedAt?: Date;
  createdAt: Date;
}

export interface MarketData {
  momentId: string;
  currentPrice: number;
  bidPrice?: number;
  askPrice?: number;
  lastSalePrice?: number;
  volume24h: number;
  priceChange24h: number;
  marketCap?: number;
  liquidity: number;
  timestamp: Date;
}

export interface OrderBook {
  momentId: string;
  bids: Array<{ price: number; quantity: number; userId?: string }>;
  asks: Array<{ price: number; quantity: number; userId?: string }>;
  spread: number;
  timestamp: Date;
}

export class TradingService extends EventEmitter {
  private config: TradingServiceConfig;
  private flowService: FlowService;
  private db: DatabaseManager;
  private logger: Logger;
  private topShotAPI: AxiosInstance;
  private activeTrades: Map<string, TradeExecution>;
  private tradeQueue: TradeRequest[];
  private isProcessing: boolean = false;
  private rateLimitTokens: number;
  private lastRateLimitReset: number;

  constructor(
    config: TradingServiceConfig,
    flowService: FlowService,
    db: DatabaseManager,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.flowService = flowService;
    this.db = db;
    this.logger = logger;
    this.activeTrades = new Map();
    this.tradeQueue = [];
    this.rateLimitTokens = config.topShotAPI.rateLimitPerSecond;
    this.lastRateLimitReset = Date.now();

    // Initialize Top Shot API client
    this.topShotAPI = axios.create({
      baseURL: config.topShotAPI.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.topShotAPI.apiKey && {
          'Authorization': `Bearer ${config.topShotAPI.apiKey}`
        }),
      },
    });

    this.setupAPIInterceptors();
  }

  public async initialize(): Promise<void> {
    try {
      // Start trade processing
      this.startTradeProcessing();

      // Start rate limit reset timer
      this.startRateLimitTimer();

      this.logger.info('Trading service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize trading service:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    this.isProcessing = false;
    
    // Cancel all pending trades
    for (const [tradeId, trade] of this.activeTrades) {
      trade.status = 'cancelled';
      this.emit('tradeCancelled', trade);
    }

    this.activeTrades.clear();
    this.tradeQueue = [];

    this.logger.info('Trading service shutdown complete');
  }

  private setupAPIInterceptors(): void {
    // Request interceptor for rate limiting
    this.topShotAPI.interceptors.request.use(async (config) => {
      await this.waitForRateLimit();
      return config;
    });

    // Response interceptor for error handling
    this.topShotAPI.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Top Shot API error:', {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset tokens if a second has passed
    if (now - this.lastRateLimitReset >= 1000) {
      this.rateLimitTokens = this.config.topShotAPI.rateLimitPerSecond;
      this.lastRateLimitReset = now;
    }

    // Wait if no tokens available
    if (this.rateLimitTokens <= 0) {
      const waitTime = 1000 - (now - this.lastRateLimitReset);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitTokens = this.config.topShotAPI.rateLimitPerSecond;
      this.lastRateLimitReset = Date.now();
    }

    this.rateLimitTokens--;
  }

  private startRateLimitTimer(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastRateLimitReset >= 1000) {
        this.rateLimitTokens = this.config.topShotAPI.rateLimitPerSecond;
        this.lastRateLimitReset = now;
      }
    }, 100);
  }

  // Trade execution methods
  public async submitTrade(tradeRequest: Omit<TradeRequest, 'id' | 'createdAt'>): Promise<string> {
    const trade: TradeRequest = {
      ...tradeRequest,
      id: uuidv4(),
      createdAt: new Date(),
    };

    // Validate trade request
    await this.validateTradeRequest(trade);

    // Add to queue
    this.tradeQueue.push(trade);
    this.sortTradeQueue();

    this.logger.info('Trade request submitted', {
      tradeId: trade.id,
      userId: trade.userId,
      momentId: trade.momentId,
      action: trade.action,
      targetPrice: trade.targetPrice,
    });

    this.emit('tradeSubmitted', trade);
    return trade.id;
  }

  private async validateTradeRequest(trade: TradeRequest): Promise<void> {
    // Check if user can trade
    const canTrade = await this.flowService.canUserTrade(trade.userId);
    if (!canTrade) {
      throw new Error('User is not allowed to trade');
    }

    // Validate spending for buy orders
    if (trade.action === 'buy' || trade.action === 'bid') {
      const maxSpend = trade.maxPrice || trade.targetPrice;
      const canSpend = await this.flowService.validateSpending(trade.userId, maxSpend);
      if (!canSpend) {
        throw new Error('Trade would exceed budget limits');
      }

      // Additional safety validation
      const safetyValid = await this.flowService.validateTransaction(trade.userId, maxSpend);
      if (!safetyValid) {
        throw new Error('Trade blocked by safety controls');
      }
    }

    // Validate moment exists and get current market data
    const marketData = await this.getMarketData(trade.momentId);
    if (!marketData) {
      throw new Error('Moment not found or no market data available');
    }

    // Check price reasonableness
    const priceDeviation = Math.abs(trade.targetPrice - marketData.currentPrice) / marketData.currentPrice;
    if (priceDeviation > this.config.slippageTolerance) {
      this.logger.warn('Trade price deviates significantly from market price', {
        tradeId: trade.id,
        targetPrice: trade.targetPrice,
        marketPrice: marketData.currentPrice,
        deviation: priceDeviation,
      });
    }
  }

  private sortTradeQueue(): void {
    this.tradeQueue.sort((a, b) => {
      // Sort by priority first
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation time (FIFO)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private startTradeProcessing(): void {
    this.isProcessing = true;
    this.processTradeQueue();
  }

  private async processTradeQueue(): Promise<void> {
    while (this.isProcessing) {
      try {
        // Check if we can process more trades
        if (this.activeTrades.size >= this.config.maxConcurrentTrades) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Get next trade from queue
        const tradeRequest = this.tradeQueue.shift();
        if (!tradeRequest) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        // Process the trade
        this.processTrade(tradeRequest).catch(error => {
          this.logger.error('Error processing trade:', error);
        });

      } catch (error) {
        this.logger.error('Error in trade queue processing:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async processTrade(tradeRequest: TradeRequest): Promise<void> {
    const execution: TradeExecution = {
      id: uuidv4(),
      tradeRequestId: tradeRequest.id,
      userId: tradeRequest.userId,
      momentId: tradeRequest.momentId,
      action: tradeRequest.action,
      executedPrice: 0,
      quantity: 1, // Top Shot moments are typically quantity 1
      fees: 0,
      status: 'pending',
      createdAt: new Date(),
    };

    this.activeTrades.set(execution.id, execution);

    try {
      this.logger.info('Processing trade', {
        executionId: execution.id,
        tradeRequestId: tradeRequest.id,
        action: tradeRequest.action,
        momentId: tradeRequest.momentId,
      });

      // Execute the trade based on action
      switch (tradeRequest.action) {
        case 'buy':
          await this.executeBuyOrder(tradeRequest, execution);
          break;
        case 'sell':
          await this.executeSellOrder(tradeRequest, execution);
          break;
        case 'bid':
          await this.executeBidOrder(tradeRequest, execution);
          break;
        default:
          throw new Error(`Unknown trade action: ${tradeRequest.action}`);
      }

      // Record successful execution
      execution.status = 'executed';
      execution.executedAt = new Date();

      // Record trade on blockchain
      if (!this.config.enableDryRun && (execution.action === 'buy' || execution.action === 'sell')) {
        const flowResult = await this.flowService.recordTrade(
          execution.userId,
          execution.momentId,
          execution.action,
          execution.executedPrice,
          tradeRequest.strategyId,
          tradeRequest.reasoning
        );

        execution.transactionHash = flowResult.transactionId;
      }

      // Store in database
      await this.storeTradeExecution(execution);

      this.emit('tradeExecuted', execution);
      this.logger.info('Trade executed successfully', {
        executionId: execution.id,
        price: execution.executedPrice,
        transactionHash: execution.transactionHash,
      });

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('tradeFailed', execution, error);
      this.logger.error('Trade execution failed', {
        executionId: execution.id,
        error: execution.error,
      });

      // Store failed execution
      await this.storeTradeExecution(execution);
    } finally {
      this.activeTrades.delete(execution.id);
    }
  }

  private async executeBuyOrder(tradeRequest: TradeRequest, execution: TradeExecution): Promise<void> {
    // Get current market data
    const marketData = await this.getMarketData(tradeRequest.momentId);
    if (!marketData) {
      throw new Error('No market data available');
    }

    // Check if there's a suitable ask
    const orderBook = await this.getOrderBook(tradeRequest.momentId);
    const bestAsk = orderBook.asks[0];

    if (!bestAsk) {
      throw new Error('No asks available');
    }

    const maxPrice = tradeRequest.maxPrice || tradeRequest.targetPrice;
    if (bestAsk.price > maxPrice) {
      throw new Error(`Best ask price ${bestAsk.price} exceeds max price ${maxPrice}`);
    }

    // Calculate fees
    const fees = bestAsk.price * this.config.marketplaceConfig.marketplaceFee;
    const totalCost = bestAsk.price + fees;

    // Execute the purchase
    if (this.config.enableDryRun) {
      this.logger.info('DRY RUN: Would execute buy order', {
        momentId: tradeRequest.momentId,
        price: bestAsk.price,
        fees,
        totalCost,
      });
    } else {
      // This would integrate with Top Shot marketplace API
      await this.executeMarketplaceBuy(tradeRequest.momentId, bestAsk.price);
    }

    execution.executedPrice = bestAsk.price;
    execution.fees = fees;
  }

  private async executeSellOrder(tradeRequest: TradeRequest, execution: TradeExecution): Promise<void> {
    // Get current market data
    const marketData = await this.getMarketData(tradeRequest.momentId);
    if (!marketData) {
      throw new Error('No market data available');
    }

    // Check if there's a suitable bid
    const orderBook = await this.getOrderBook(tradeRequest.momentId);
    const bestBid = orderBook.bids[0];

    if (!bestBid) {
      throw new Error('No bids available');
    }

    const minPrice = tradeRequest.minPrice || tradeRequest.targetPrice;
    if (bestBid.price < minPrice) {
      throw new Error(`Best bid price ${bestBid.price} below min price ${minPrice}`);
    }

    // Calculate fees
    const fees = bestBid.price * this.config.marketplaceConfig.marketplaceFee;
    const netReceived = bestBid.price - fees;

    // Execute the sale
    if (this.config.enableDryRun) {
      this.logger.info('DRY RUN: Would execute sell order', {
        momentId: tradeRequest.momentId,
        price: bestBid.price,
        fees,
        netReceived,
      });
    } else {
      // This would integrate with Top Shot marketplace API
      await this.executeMarketplaceSell(tradeRequest.momentId, bestBid.price);
    }

    execution.executedPrice = bestBid.price;
    execution.fees = fees;
  }

  private async executeBidOrder(tradeRequest: TradeRequest, execution: TradeExecution): Promise<void> {
    // Place a bid on the marketplace
    const bidPrice = tradeRequest.targetPrice;
    const duration = this.config.marketplaceConfig.maxBidDuration;

    if (this.config.enableDryRun) {
      this.logger.info('DRY RUN: Would place bid', {
        momentId: tradeRequest.momentId,
        bidPrice,
        duration,
      });
    } else {
      // This would integrate with Top Shot marketplace API
      await this.placeMarketplaceBid(tradeRequest.momentId, bidPrice, duration);
    }

    execution.executedPrice = bidPrice;
    execution.fees = 0; // Fees are charged when bid is accepted
  }

  // Market data methods
  public async getMarketData(momentId: string): Promise<MarketData | null> {
    try {
      const response = await this.topShotAPI.get(`/marketplace/moments/${momentId}`);
      const data = response.data;

      return {
        momentId,
        currentPrice: data.price || 0,
        bidPrice: data.highestBid?.price,
        askPrice: data.lowestAsk?.price,
        lastSalePrice: data.lastSale?.price,
        volume24h: data.volume24h || 0,
        priceChange24h: data.priceChange24h || 0,
        marketCap: data.marketCap,
        liquidity: data.liquidity || 0,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error fetching market data:', error);
      return null;
    }
  }

  public async getOrderBook(momentId: string): Promise<OrderBook> {
    try {
      const response = await this.topShotAPI.get(`/marketplace/moments/${momentId}/orderbook`);
      const data = response.data;

      const bids = (data.bids || []).map((bid: any) => ({
        price: bid.price,
        quantity: bid.quantity || 1,
        userId: bid.userId,
      }));

      const asks = (data.asks || []).map((ask: any) => ({
        price: ask.price,
        quantity: ask.quantity || 1,
        userId: ask.userId,
      }));

      const spread = asks.length > 0 && bids.length > 0 
        ? asks[0].price - bids[0].price 
        : 0;

      return {
        momentId,
        bids,
        asks,
        spread,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error fetching order book:', error);
      return {
        momentId,
        bids: [],
        asks: [],
        spread: 0,
        timestamp: new Date(),
      };
    }
  }

  // Marketplace integration methods (placeholders)
  private async executeMarketplaceBuy(momentId: string, price: number): Promise<void> {
    // This would integrate with Top Shot marketplace API
    this.logger.info('Executing marketplace buy', { momentId, price });
  }

  private async executeMarketplaceSell(momentId: string, price: number): Promise<void> {
    // This would integrate with Top Shot marketplace API
    this.logger.info('Executing marketplace sell', { momentId, price });
  }

  private async placeMarketplaceBid(momentId: string, price: number, duration: number): Promise<void> {
    // This would integrate with Top Shot marketplace API
    this.logger.info('Placing marketplace bid', { momentId, price, duration });
  }

  // Database operations
  private async storeTradeExecution(execution: TradeExecution): Promise<void> {
    try {
      // This would store the trade execution in the database
      this.logger.debug('Storing trade execution', {
        executionId: execution.id,
        status: execution.status,
      });
    } catch (error) {
      this.logger.error('Error storing trade execution:', error);
    }
  }

  // Public API methods
  public async getActiveTrades(userId?: string): Promise<TradeExecution[]> {
    const trades = Array.from(this.activeTrades.values());
    return userId ? trades.filter(trade => trade.userId === userId) : trades;
  }

  public async getTradeHistory(userId: string, limit: number = 50): Promise<TradeExecution[]> {
    // This would query the database for trade history
    return [];
  }

  public async cancelTrade(tradeId: string, userId: string): Promise<boolean> {
    const trade = this.activeTrades.get(tradeId);
    if (!trade || trade.userId !== userId) {
      return false;
    }

    trade.status = 'cancelled';
    this.activeTrades.delete(tradeId);
    this.emit('tradeCancelled', trade);

    return true;
  }

  public getTradeQueueStatus(): { queueLength: number; activeTrades: number; processing: boolean } {
    return {
      queueLength: this.tradeQueue.length,
      activeTrades: this.activeTrades.size,
      processing: this.isProcessing,
    };
  }
}