import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { DatabaseManager } from '@fastbreak/database';
import { FlowService, MomentData } from './flow-service';

export interface PortfolioMoment {
  momentId: string;
  playerId: string;
  playerName: string;
  setId: string;
  serialNumber: number;
  purchasePrice: number;
  currentPrice: number;
  purchaseDate: Date;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface Portfolio {
  userId: string;
  moments: PortfolioMoment[];
  totalValue: number;
  totalCost: number;
  totalUnrealizedPnL: number;
  totalUnrealizedPnLPercent: number;
  momentCount: number;
  lastUpdated: Date;
}

export interface PortfolioPerformance {
  userId: string;
  totalReturn: number;
  totalReturnPercent: number;
  realizedPnL: number;
  unrealizedPnL: number;
  bestPerformer: PortfolioMoment | null;
  worstPerformer: PortfolioMoment | null;
  winRate: number;
  averageHoldingPeriod: number;
  sharpeRatio: number;
  maxDrawdown: number;
  period: string;
}

export class PortfolioService extends EventEmitter {
  private flowService: FlowService;
  private db: DatabaseManager;
  private logger: Logger;
  private portfolioCache: Map<string, Portfolio>;
  private updateInterval?: NodeJS.Timeout;

  constructor(
    flowService: FlowService,
    db: DatabaseManager,
    logger: Logger
  ) {
    super();
    this.flowService = flowService;
    this.db = db;
    this.logger = logger;
    this.portfolioCache = new Map();
  }

  public async initialize(): Promise<void> {
    try {
      // Start periodic portfolio updates
      this.startPeriodicUpdates();

      this.logger.info('Portfolio service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize portfolio service:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.portfolioCache.clear();
    this.logger.info('Portfolio service shutdown complete');
  }

  private startPeriodicUpdates(): void {
    // Update portfolios every 5 minutes
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateAllPortfolios();
      } catch (error) {
        this.logger.error('Error in periodic portfolio update:', error);
      }
    }, 5 * 60 * 1000);
  }

  public async getPortfolio(userId: string, forceRefresh: boolean = false): Promise<Portfolio> {
    // Check cache first
    if (!forceRefresh && this.portfolioCache.has(userId)) {
      const cached = this.portfolioCache.get(userId)!;
      const cacheAge = Date.now() - cached.lastUpdated.getTime();
      
      // Use cache if less than 2 minutes old
      if (cacheAge < 2 * 60 * 1000) {
        return cached;
      }
    }

    // Fetch fresh portfolio data
    const portfolio = await this.buildPortfolio(userId);
    this.portfolioCache.set(userId, portfolio);
    
    this.emit('portfolioUpdated', userId, portfolio);
    return portfolio;
  }

  private async buildPortfolio(userId: string): Promise<Portfolio> {
    try {
      // Get user's moments from Flow
      const userMoments = await this.flowService.getUserMoments(userId);
      
      // Get trade history to calculate purchase prices
      const tradeHistory = await this.flowService.getUserTradeHistory(userId);
      
      // Build portfolio moments
      const portfolioMoments: PortfolioMoment[] = [];
      let totalValue = 0;
      let totalCost = 0;

      for (const moment of userMoments) {
        const portfolioMoment = await this.buildPortfolioMoment(moment, tradeHistory);
        if (portfolioMoment) {
          portfolioMoments.push(portfolioMoment);
          totalValue += portfolioMoment.currentPrice;
          totalCost += portfolioMoment.purchasePrice;
        }
      }

      const totalUnrealizedPnL = totalValue - totalCost;
      const totalUnrealizedPnLPercent = totalCost > 0 ? (totalUnrealizedPnL / totalCost) * 100 : 0;

      return {
        userId,
        moments: portfolioMoments,
        totalValue,
        totalCost,
        totalUnrealizedPnL,
        totalUnrealizedPnLPercent,
        momentCount: portfolioMoments.length,
        lastUpdated: new Date(),
      };

    } catch (error) {
      this.logger.error('Error building portfolio:', error);
      throw error;
    }
  }

  private async buildPortfolioMoment(
    moment: MomentData, 
    tradeHistory: any[]
  ): Promise<PortfolioMoment | null> {
    try {
      // Find the purchase trade for this moment
      const purchaseTrade = tradeHistory
        .filter(trade => trade.momentId === moment.id && trade.action === 'buy')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

      if (!purchaseTrade) {
        this.logger.warn('No purchase trade found for moment', { momentId: moment.id });
        return null;
      }

      // Get current market price
      const currentPrice = moment.currentPrice || 0;
      const purchasePrice = purchaseTrade.price;
      const unrealizedPnL = currentPrice - purchasePrice;
      const unrealizedPnLPercent = purchasePrice > 0 ? (unrealizedPnL / purchasePrice) * 100 : 0;

      return {
        momentId: moment.id,
        playerId: moment.playerId,
        playerName: moment.playerName,
        setId: moment.setId || '',
        serialNumber: moment.serialNumber,
        purchasePrice,
        currentPrice,
        purchaseDate: new Date(purchaseTrade.timestamp),
        unrealizedPnL,
        unrealizedPnLPercent,
      };

    } catch (error) {
      this.logger.error('Error building portfolio moment:', error);
      return null;
    }
  }

  public async getPortfolioPerformance(
    userId: string, 
    period: string = 'all'
  ): Promise<PortfolioPerformance> {
    try {
      const portfolio = await this.getPortfolio(userId);
      const tradeHistory = await this.flowService.getUserTradeHistory(userId);

      // Filter trades by period
      const filteredTrades = this.filterTradesByPeriod(tradeHistory, period);
      
      // Calculate realized P&L from completed trades
      const realizedPnL = this.calculateRealizedPnL(filteredTrades);
      
      // Calculate performance metrics
      const totalReturn = realizedPnL + portfolio.totalUnrealizedPnL;
      const totalReturnPercent = portfolio.totalCost > 0 
        ? (totalReturn / portfolio.totalCost) * 100 
        : 0;

      // Find best and worst performers
      const bestPerformer = portfolio.moments.reduce((best, moment) => 
        !best || moment.unrealizedPnLPercent > best.unrealizedPnLPercent ? moment : best
      , null as PortfolioMoment | null);

      const worstPerformer = portfolio.moments.reduce((worst, moment) => 
        !worst || moment.unrealizedPnLPercent < worst.unrealizedPnLPercent ? moment : worst
      , null as PortfolioMoment | null);

      // Calculate win rate
      const profitableTrades = filteredTrades.filter(trade => 
        trade.action === 'sell' && this.getTradeProfitLoss(trade, filteredTrades) > 0
      );
      const totalSellTrades = filteredTrades.filter(trade => trade.action === 'sell');
      const winRate = totalSellTrades.length > 0 
        ? (profitableTrades.length / totalSellTrades.length) * 100 
        : 0;

      // Calculate average holding period
      const averageHoldingPeriod = this.calculateAverageHoldingPeriod(filteredTrades);

      // Calculate advanced metrics
      const returns = this.calculateDailyReturns(filteredTrades);
      const sharpeRatio = this.calculateSharpeRatio(returns);
      const maxDrawdown = this.calculateMaxDrawdown(returns);

      return {
        userId,
        totalReturn,
        totalReturnPercent,
        realizedPnL,
        unrealizedPnL: portfolio.totalUnrealizedPnL,
        bestPerformer,
        worstPerformer,
        winRate,
        averageHoldingPeriod,
        sharpeRatio,
        maxDrawdown,
        period,
      };

    } catch (error) {
      this.logger.error('Error calculating portfolio performance:', error);
      throw error;
    }
  }

  private filterTradesByPeriod(trades: any[], period: string): any[] {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        return trades; // 'all' period
    }

    return trades.filter(trade => new Date(trade.timestamp) >= startDate);
  }

  private calculateRealizedPnL(trades: any[]): number {
    let realizedPnL = 0;

    // Group trades by moment ID
    const tradesByMoment = new Map<string, any[]>();
    for (const trade of trades) {
      if (!tradesByMoment.has(trade.momentId)) {
        tradesByMoment.set(trade.momentId, []);
      }
      tradesByMoment.get(trade.momentId)!.push(trade);
    }

    // Calculate P&L for each moment
    for (const [momentId, momentTrades] of tradesByMoment) {
      const sortedTrades = momentTrades.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let position = 0;
      let totalCost = 0;

      for (const trade of sortedTrades) {
        if (trade.action === 'buy') {
          position += 1;
          totalCost += trade.price;
        } else if (trade.action === 'sell' && position > 0) {
          const avgCost = totalCost / position;
          const profit = trade.price - avgCost;
          realizedPnL += profit;
          
          position -= 1;
          totalCost -= avgCost;
        }
      }
    }

    return realizedPnL;
  }

  private getTradeProfitLoss(sellTrade: any, allTrades: any[]): number {
    // Find corresponding buy trade
    const buyTrade = allTrades
      .filter(trade => 
        trade.momentId === sellTrade.momentId && 
        trade.action === 'buy' && 
        new Date(trade.timestamp) < new Date(sellTrade.timestamp)
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    if (!buyTrade) return 0;

    return sellTrade.price - buyTrade.price;
  }

  private calculateAverageHoldingPeriod(trades: any[]): number {
    const holdingPeriods: number[] = [];

    // Group trades by moment ID
    const tradesByMoment = new Map<string, any[]>();
    for (const trade of trades) {
      if (!tradesByMoment.has(trade.momentId)) {
        tradesByMoment.set(trade.momentId, []);
      }
      tradesByMoment.get(trade.momentId)!.push(trade);
    }

    // Calculate holding periods
    for (const [momentId, momentTrades] of tradesByMoment) {
      const sortedTrades = momentTrades.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (let i = 0; i < sortedTrades.length - 1; i++) {
        const buyTrade = sortedTrades[i];
        const sellTrade = sortedTrades[i + 1];

        if (buyTrade.action === 'buy' && sellTrade.action === 'sell') {
          const holdingPeriod = new Date(sellTrade.timestamp).getTime() - 
                               new Date(buyTrade.timestamp).getTime();
          holdingPeriods.push(holdingPeriod / (1000 * 60 * 60 * 24)); // Convert to days
        }
      }
    }

    return holdingPeriods.length > 0 
      ? holdingPeriods.reduce((sum, period) => sum + period, 0) / holdingPeriods.length
      : 0;
  }

  private calculateDailyReturns(trades: any[]): number[] {
    // This is a simplified implementation
    // In practice, you'd calculate daily portfolio value changes
    const returns: number[] = [];
    
    for (let i = 1; i < trades.length; i++) {
      const prevTrade = trades[i - 1];
      const currentTrade = trades[i];
      
      if (prevTrade.price > 0) {
        const dailyReturn = (currentTrade.price - prevTrade.price) / prevTrade.price;
        returns.push(dailyReturn);
      }
    }

    return returns;
  }

  private calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (avgReturn - riskFreeRate / 365) / stdDev : 0;
  }

  private calculateMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let cumulativeReturn = 0;

    for (const dailyReturn of returns) {
      cumulativeReturn += dailyReturn;
      
      if (cumulativeReturn > peak) {
        peak = cumulativeReturn;
      }
      
      const drawdown = peak - cumulativeReturn;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private async updateAllPortfolios(): Promise<void> {
    const userIds = Array.from(this.portfolioCache.keys());
    
    for (const userId of userIds) {
      try {
        await this.getPortfolio(userId, true);
      } catch (error) {
        this.logger.error('Error updating portfolio:', { userId, error });
      }
    }
  }

  // Public API methods
  public async getPortfolioSummary(userId: string): Promise<{
    portfolio: Portfolio;
    performance: PortfolioPerformance;
  }> {
    const [portfolio, performance] = await Promise.all([
      this.getPortfolio(userId),
      this.getPortfolioPerformance(userId),
    ]);

    return { portfolio, performance };
  }

  public async getTopPerformers(userId: string, limit: number = 5): Promise<PortfolioMoment[]> {
    const portfolio = await this.getPortfolio(userId);
    
    return portfolio.moments
      .sort((a, b) => b.unrealizedPnLPercent - a.unrealizedPnLPercent)
      .slice(0, limit);
  }

  public async getWorstPerformers(userId: string, limit: number = 5): Promise<PortfolioMoment[]> {
    const portfolio = await this.getPortfolio(userId);
    
    return portfolio.moments
      .sort((a, b) => a.unrealizedPnLPercent - b.unrealizedPnLPercent)
      .slice(0, limit);
  }

  public async getPortfolioAllocation(userId: string): Promise<{
    byPlayer: Array<{ playerId: string; playerName: string; value: number; percentage: number }>;
    bySet: Array<{ setId: string; value: number; percentage: number }>;
  }> {
    const portfolio = await this.getPortfolio(userId);
    
    // Group by player
    const playerMap = new Map<string, { playerName: string; value: number }>();
    const setMap = new Map<string, number>();

    for (const moment of portfolio.moments) {
      // By player
      const playerKey = moment.playerId;
      if (!playerMap.has(playerKey)) {
        playerMap.set(playerKey, { playerName: moment.playerName, value: 0 });
      }
      playerMap.get(playerKey)!.value += moment.currentPrice;

      // By set
      if (!setMap.has(moment.setId)) {
        setMap.set(moment.setId, 0);
      }
      setMap.set(moment.setId, setMap.get(moment.setId)! + moment.currentPrice);
    }

    // Convert to arrays with percentages
    const byPlayer = Array.from(playerMap.entries()).map(([playerId, data]) => ({
      playerId,
      playerName: data.playerName,
      value: data.value,
      percentage: portfolio.totalValue > 0 ? (data.value / portfolio.totalValue) * 100 : 0,
    }));

    const bySet = Array.from(setMap.entries()).map(([setId, value]) => ({
      setId,
      value,
      percentage: portfolio.totalValue > 0 ? (value / portfolio.totalValue) * 100 : 0,
    }));

    return { byPlayer, bySet };
  }
}