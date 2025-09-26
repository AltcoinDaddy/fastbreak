import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EventEmitter } from 'eventemitter3';
import WebSocket from 'ws';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { Logger } from 'winston';
import { 
  MarketplaceListing, 
  MarketplaceSale, 
  MomentPriceData, 
  MarketplaceConfig,
  WebSocketMessage,
  MarketDepth
} from '../types/marketplace';

export class TopShotClient extends EventEmitter {
  private httpClient: AxiosInstance;
  private wsClient?: WebSocket;
  private requestQueue: PQueue;
  private config: MarketplaceConfig;
  private logger: Logger;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config: MarketplaceConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent': 'FastBreak-Monitor/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    // Add API key if provided
    if (config.apiKey) {
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`;
    }

    // Initialize request queue with rate limiting
    this.requestQueue = new PQueue({
      intervalCap: config.rateLimits.requestsPerSecond,
      interval: 1000,
      carryoverConcurrencyCount: true,
    });

    // Setup request/response interceptors
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.httpClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`Making request to ${config.url}`, {
          method: config.method,
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        this.logger.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`Response from ${response.config.url}`, {
          status: response.status,
          dataLength: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        this.logger.error('Response error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  public async connect(): Promise<void> {
    try {
      // Test HTTP connection
      await this.testConnection();
      
      // Connect WebSocket if configured
      if (this.config.websocket) {
        await this.connectWebSocket();
      }

      this.isConnected = true;
      this.emit('connected');
      this.logger.info('TopShot client connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect TopShot client:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.wsClient) {
      this.wsClient.close();
    }

    this.emit('disconnected');
    this.logger.info('TopShot client disconnected');
  }

  private async testConnection(): Promise<void> {
    try {
      const response = await this.httpClient.get('/health');
      if (response.status !== 200) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } catch (error) {
      // If no health endpoint, try a basic API call
      await this.getMarketplaceStats();
    }
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.config.websocket) return;

    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(this.config.websocket!.url);

      this.wsClient.on('open', () => {
        this.logger.info('WebSocket connected to TopShot');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        
        // Subscribe to channels
        this.config.websocket!.channels.forEach(channel => {
          this.subscribeToChannel(channel);
        });

        resolve();
      });

      this.wsClient.on('message', (data: WebSocket.Data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.logger.error('Error parsing WebSocket message:', error);
        }
      });

      this.wsClient.on('close', () => {
        this.logger.warn('WebSocket connection closed');
        this.stopHeartbeat();
        this.handleReconnect();
      });

      this.wsClient.on('error', (error) => {
        this.logger.error('WebSocket error:', error);
        reject(error);
      });
    });
  }

  private subscribeToChannel(channel: string): void {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        type: 'subscribe',
        channel: channel,
      };
      this.wsClient.send(JSON.stringify(subscribeMessage));
      this.logger.debug(`Subscribed to channel: ${channel}`);
    }
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    this.logger.debug('Received WebSocket message:', message.type);
    
    switch (message.type) {
      case 'listing_update':
        this.emit('listingUpdate', message.data);
        break;
      case 'sale':
        this.emit('sale', message.data);
        break;
      case 'price_change':
        this.emit('priceChange', message.data);
        break;
      case 'volume_update':
        this.emit('volumeUpdate', message.data);
        break;
      default:
        this.logger.warn('Unknown WebSocket message type:', message.type);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        this.wsClient.ping();
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

    this.logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.connectWebSocket();
        this.emit('reconnected');
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        this.handleReconnect();
      }
    }, delay);
  }

  public async getActiveListings(filters?: {
    playerId?: string;
    momentType?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }): Promise<MarketplaceListing[]> {
    return this.requestQueue.add(() => {
      return pRetry(async () => {
        const response = await this.httpClient.get(this.config.endpoints.listings, {
          params: filters,
        });

        return this.parseListings(response.data);
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Listing request failed, attempt ${error.attemptNumber}:`, error.message);
        },
      });
    }) as Promise<MarketplaceListing[]>;
  }

  public async getRecentSales(filters?: {
    playerId?: string;
    momentType?: string;
    hours?: number;
    limit?: number;
  }): Promise<MarketplaceSale[]> {
    return this.requestQueue.add(() => {
      return pRetry(async () => {
        const response = await this.httpClient.get(this.config.endpoints.sales, {
          params: filters,
        });

        return this.parseSales(response.data);
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Sales request failed, attempt ${error.attemptNumber}:`, error.message);
        },
      });
    }) as Promise<MarketplaceSale[]>;
  }

  public async getMomentPriceData(momentId: string): Promise<MomentPriceData | null> {
    return this.requestQueue.add(() => {
      return pRetry(async () => {
        const response = await this.httpClient.get(`${this.config.endpoints.moments}/${momentId}/price`);
        
        if (!response.data) {
          return null;
        }

        return this.parseMomentPriceData(response.data);
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Price data request failed, attempt ${error.attemptNumber}:`, error.message);
        },
      });
    }) as Promise<MomentPriceData | null>;
  }

  public async getMarketDepth(momentId: string): Promise<MarketDepth | null> {
    return this.requestQueue.add(() => {
      return pRetry(async () => {
        const response = await this.httpClient.get(`${this.config.endpoints.moments}/${momentId}/depth`);
        
        if (!response.data) {
          return null;
        }

        return this.parseMarketDepth(response.data);
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Market depth request failed, attempt ${error.attemptNumber}:`, error.message);
        },
      });
    }) as Promise<MarketDepth | null>;
  }

  public async getMarketplaceStats(): Promise<any> {
    return this.requestQueue.add(async () => {
      return pRetry(async () => {
        const response = await this.httpClient.get('/stats');
        return response.data;
      }, {
        retries: 3,
        onFailedAttempt: (error) => {
          this.logger.warn(`Stats request failed, attempt ${error.attemptNumber}:`, error.message);
        },
      });
    });
  }

  private parseListings(data: any[]): MarketplaceListing[] {
    return data.map(item => ({
      id: item.id || item.listing_id,
      momentId: item.moment_id || item.momentId,
      playerId: item.player_id || item.playerId,
      playerName: item.player_name || item.playerName,
      momentType: item.moment_type || item.momentType,
      serialNumber: parseInt(item.serial_number || item.serialNumber),
      price: parseFloat(item.price),
      currency: item.currency || 'USD',
      marketplaceId: this.config.id,
      sellerId: item.seller_id || item.sellerId,
      listedAt: new Date(item.listed_at || item.listedAt),
      updatedAt: new Date(item.updated_at || item.updatedAt || Date.now()),
      status: item.status || 'active',
      metadata: item.metadata || {},
    }));
  }

  private parseSales(data: any[]): MarketplaceSale[] {
    return data.map(item => ({
      id: item.id || item.sale_id,
      momentId: item.moment_id || item.momentId,
      playerId: item.player_id || item.playerId,
      price: parseFloat(item.price),
      currency: item.currency || 'USD',
      marketplaceId: this.config.id,
      buyerId: item.buyer_id || item.buyerId,
      sellerId: item.seller_id || item.sellerId,
      soldAt: new Date(item.sold_at || item.soldAt),
      transactionHash: item.transaction_hash || item.transactionHash,
      fees: item.fees ? {
        marketplaceFee: parseFloat(item.fees.marketplace_fee || 0),
        royaltyFee: parseFloat(item.fees.royalty_fee || 0),
        totalFees: parseFloat(item.fees.total_fees || 0),
      } : undefined,
    }));
  }

  private parseMomentPriceData(data: any): MomentPriceData {
    return {
      momentId: data.moment_id || data.momentId,
      playerId: data.player_id || data.playerId,
      currentPrice: parseFloat(data.current_price || data.currentPrice),
      floorPrice: parseFloat(data.floor_price || data.floorPrice),
      averagePrice: parseFloat(data.average_price || data.averagePrice),
      lastSalePrice: parseFloat(data.last_sale_price || data.lastSalePrice),
      priceHistory: (data.price_history || data.priceHistory || []).map((point: any) => ({
        timestamp: new Date(point.timestamp),
        price: parseFloat(point.price),
        volume: parseInt(point.volume || 0),
        marketplaceId: this.config.id,
        type: point.type || 'sale',
      })),
      volume24h: parseFloat(data.volume_24h || data.volume24h || 0),
      salesCount24h: parseInt(data.sales_count_24h || data.salesCount24h || 0),
      listingsCount: parseInt(data.listings_count || data.listingsCount || 0),
      priceChange24h: parseFloat(data.price_change_24h || data.priceChange24h || 0),
      volatility: parseFloat(data.volatility || 0),
      lastUpdated: new Date(data.last_updated || data.lastUpdated || Date.now()),
    };
  }

  private parseMarketDepth(data: any): MarketDepth {
    return {
      momentId: data.moment_id || data.momentId,
      marketplaceId: this.config.id,
      bids: (data.bids || []).map((bid: any) => ({
        price: parseFloat(bid.price),
        quantity: parseInt(bid.quantity),
        cumulativeQuantity: parseInt(bid.cumulative_quantity || bid.cumulativeQuantity),
      })),
      asks: (data.asks || []).map((ask: any) => ({
        price: parseFloat(ask.price),
        quantity: parseInt(ask.quantity),
        cumulativeQuantity: parseInt(ask.cumulative_quantity || ask.cumulativeQuantity),
      })),
      spread: parseFloat(data.spread || 0),
      midPrice: parseFloat(data.mid_price || data.midPrice || 0),
      timestamp: new Date(data.timestamp || Date.now()),
    };
  }

  public isHealthy(): boolean {
    return this.isConnected && this.requestQueue.size < 100;
  }

  public getQueueStats(): { size: number; pending: number } {
    return {
      size: this.requestQueue.size,
      pending: this.requestQueue.pending,
    };
  }
}