export interface MarketplaceListing {
  id: string;
  momentId: string;
  playerId: string;
  playerName: string;
  momentType: string;
  serialNumber: number;
  price: number;
  currency: string;
  marketplaceId: string;
  sellerId: string;
  listedAt: Date;
  updatedAt: Date;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  metadata?: Record<string, any>;
}

export interface MarketplaceSale {
  id: string;
  momentId: string;
  playerId: string;
  price: number;
  currency: string;
  marketplaceId: string;
  buyerId: string;
  sellerId: string;
  soldAt: Date;
  transactionHash?: string;
  fees?: {
    marketplaceFee: number;
    royaltyFee: number;
    totalFees: number;
  };
}

export interface PriceAlert {
  id: string;
  userId: string;
  momentId?: string;
  playerId?: string;
  alertType: 'price_drop' | 'price_increase' | 'volume_spike' | 'new_listing' | 'arbitrage';
  threshold: number;
  currentValue: number;
  triggered: boolean;
  triggeredAt?: Date;
  createdAt: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface ArbitrageOpportunity {
  id: string;
  momentId: string;
  sourceMarketplace: string;
  targetMarketplace: string;
  sourcePrice: number;
  targetPrice: number;
  profitAmount: number;
  profitPercentage: number;
  confidence: number;
  riskScore: number;
  detectedAt: Date;
  expiresAt: Date;
  status: 'active' | 'executed' | 'expired' | 'invalid';
  executionRisk: {
    liquidityRisk: number;
    priceMovementRisk: number;
    executionTimeRisk: number;
  };
}

export interface MarketplaceMetrics {
  marketplaceId: string;
  timestamp: Date;
  totalListings: number;
  totalVolume24h: number;
  averagePrice: number;
  medianPrice: number;
  floorPrice: number;
  ceilingPrice: number;
  uniqueSellers: number;
  uniqueBuyers: number;
  salesCount24h: number;
  priceChange24h: number;
  volumeChange24h: number;
}

export interface MomentPriceData {
  momentId: string;
  playerId: string;
  currentPrice: number;
  floorPrice: number;
  averagePrice: number;
  lastSalePrice: number;
  priceHistory: PricePoint[];
  volume24h: number;
  salesCount24h: number;
  listingsCount: number;
  priceChange24h: number;
  volatility: number;
  lastUpdated: Date;
}

export interface PricePoint {
  timestamp: Date;
  price: number;
  volume: number;
  marketplaceId: string;
  type: 'sale' | 'listing' | 'bid';
}

export interface MarketplaceConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  rateLimits: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  endpoints: {
    listings: string;
    sales: string;
    moments: string;
    players: string;
  };
  websocket?: {
    url: string;
    channels: string[];
  };
  isActive: boolean;
  priority: number;
}

export interface MonitoringJob {
  id: string;
  type: 'price_monitor' | 'arbitrage_scanner' | 'volume_tracker' | 'new_listings';
  config: Record<string, any>;
  schedule: string; // cron expression
  isActive: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  errorCount: number;
  averageExecutionTime: number;
}

export interface WebSocketMessage {
  type: 'listing_update' | 'sale' | 'price_change' | 'volume_update';
  data: any;
  timestamp: Date;
  marketplaceId: string;
}

export interface MarketDepth {
  momentId: string;
  marketplaceId: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  midPrice: number;
  timestamp: Date;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
}

export interface LiquidityMetrics {
  momentId: string;
  marketplaceId: string;
  bidAskSpread: number;
  marketDepth: number;
  averageDailyVolume: number;
  timeToSell: number; // estimated in hours
  liquidityScore: number; // 0-100
  lastUpdated: Date;
}

export interface MarketAlert {
  id: string;
  type: 'price_anomaly' | 'volume_spike' | 'arbitrage_opportunity' | 'liquidity_change';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export interface MarketplaceStatus {
  marketplaceId: string;
  isOnline: boolean;
  lastPing: Date;
  responseTime: number;
  errorRate: number;
  dataQuality: number; // 0-100
  issues: string[];
}

export interface ScanResult {
  scanId: string;
  type: 'arbitrage' | 'undervalued' | 'overvalued' | 'trending';
  opportunities: any[];
  scanDuration: number;
  itemsScanned: number;
  opportunitiesFound: number;
  timestamp: Date;
  filters: Record<string, any>;
}