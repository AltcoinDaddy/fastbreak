import { BaseAgent, AgentConfig, TriggerCondition } from './base-agent';
import { DatabaseManager } from '@fastbreak/database';
import { Logger } from 'winston';
import Redis from 'redis';
import axios, { AxiosInstance } from 'axios';

export interface DailyScanAgentConfig extends AgentConfig {
  scanTime: string; // HH:MM format
  timezone: string;
  scanCategories: string[];
  reportRecipients: string[];
  enableDetailedAnalysis: boolean;
  includeRecommendations: boolean;
}

export interface MarketOverview {
  totalVolume24h: number;
  totalTransactions24h: number;
  averagePrice: number;
  priceChange24h: number;
  topGainers: Array<{ momentId: string; priceChange: number }>;
  topLosers: Array<{ momentId: string; priceChange: number }>;
  volumeLeaders: Array<{ momentId: string; volume: number }>;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface PortfolioAnalysis {
  userId: string;
  totalValue: number;
  totalReturn: number;
  returnPercentage: number;
  bestPerformer: { momentId: string; return: number };
  worstPerformer: { momentId: string; return: number };
  riskScore: number;
  diversificationScore: number;
  recommendations: string[];
}

export interface StrategyPerformance {
  strategyType: string;
  totalUsers: number;
  averageReturn: number;
  successRate: number;
  totalTrades: number;
  bestPerformingUser: string;
  worstPerformingUser: string;
  recommendations: string[];
}

export interface DailyReport {
  date: Date;
  marketOverview: MarketOverview;
  portfolioAnalyses: PortfolioAnalysis[];
  strategyPerformances: StrategyPerformance[];
  keyInsights: string[];
  recommendations: string[];
  riskAlerts: string[];
}

export class DailyScanAgent extends BaseAgent {
  protected config: DailyScanAgentConfig;
  private tradingServiceAPI: AxiosInstance;
  private aiScoutingAPI: AxiosInstance;
  private topShotAPI: AxiosInstance;
  private lastScanDate: Date | null = null;

  constructor(
    config: DailyScanAgentConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super('DailyScanAgent', 'daily_analysis', config, db, redisClient, logger);
    this.config = config;

    // Initialize API clients
    this.tradingServiceAPI = axios.create({
      baseURL: process.env.TRADING_SERVICE_URL || 'http://localhost:8003',
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.aiScoutingAPI = axios.create({
      baseURL: process.env.AI_SCOUTING_URL || 'http://localhost:8001',
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.topShotAPI = axios.create({
      baseURL: 'https://api.nbatopshot.com',
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  protected async initializeTriggerConditions(): Promise<void> {
    try {
      this.logger.info('Initializing daily scan trigger conditions');

      // Add trigger for daily scan time
      this.addTriggerCondition({
        type: 'daily_scan_time',
        parameters: {
          scanTime: this.config.scanTime,
          timezone: this.config.timezone,
        },
        isActive: true,
      });

      // Add trigger for market analysis
      this.addTriggerCondition({
        type: 'market_analysis',
        parameters: {
          categories: this.config.scanCategories,
        },
        isActive: this.config.scanCategories.includes('market_overview'),
      });

      // Add trigger for portfolio analysis
      this.addTriggerCondition({
        type: 'portfolio_analysis',
        parameters: {
          enableDetailed: this.config.enableDetailedAnalysis,
        },
        isActive: this.config.scanCategories.includes('portfolio_analysis'),
      });

      // Add trigger for strategy performance analysis
      this.addTriggerCondition({
        type: 'strategy_performance',
        parameters: {
          includeRecommendations: this.config.includeRecommendations,
        },
        isActive: this.config.scanCategories.includes('strategy_performance'),
      });

      this.logger.info('Daily scan trigger conditions initialized');
    } catch (error) {
      this.logger.error('Failed to initialize trigger conditions:', error);
      throw error;
    }
  }

  protected async evaluateTriggerConditions(): Promise<TriggerCondition[]> {
    const activatedTriggers: TriggerCondition[] = [];

    try {
      for (const condition of this.getAllTriggerConditions()) {
        if (!condition.isActive) continue;

        let shouldTrigger = false;

        switch (condition.type) {
          case 'daily_scan_time':
            shouldTrigger = await this.evaluateDailyScanTime(condition);
            break;
          case 'market_analysis':
          case 'portfolio_analysis':
          case 'strategy_performance':
            // These trigger when daily scan time is met
            shouldTrigger = await this.evaluateDailyScanTime(
              this.getTriggerCondition(this.getAllTriggerConditions()[0].id)!
            );
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
    try {
      // Check if we should run the daily scan
      const shouldRunScan = triggers.some(t => t.type === 'daily_scan_time');
      
      if (shouldRunScan && !this.hasRunTodaysScan()) {
        await this.performDailyScan(triggers);
        this.lastScanDate = new Date();
      }
    } catch (error) {
      this.logger.error('Error executing trigger actions:', error);
    }
  }

  // Trigger evaluation methods
  private async evaluateDailyScanTime(condition: TriggerCondition): Promise<boolean> {
    try {
      const now = new Date();
      const [hours, minutes] = condition.parameters.scanTime.split(':').map(Number);
      
      // Create target time for today
      const targetTime = new Date();
      targetTime.setHours(hours, minutes, 0, 0);
      
      // Check if current time is within 5 minutes of target time
      const timeDiff = Math.abs(now.getTime() - targetTime.getTime());
      const fiveMinutes = 5 * 60 * 1000;
      
      return timeDiff <= fiveMinutes && !this.hasRunTodaysScan();
    } catch (error) {
      this.logger.error('Error evaluating daily scan time:', error);
      return false;
    }
  }

  private hasRunTodaysScan(): boolean {
    if (!this.lastScanDate) return false;
    
    const today = new Date();
    const lastScan = this.lastScanDate;
    
    return (
      today.getFullYear() === lastScan.getFullYear() &&
      today.getMonth() === lastScan.getMonth() &&
      today.getDate() === lastScan.getDate()
    );
  }

  // Main scan execution
  private async performDailyScan(triggers: TriggerCondition[]): Promise<void> {
    try {
      this.logger.info('Starting daily scan');

      const report: DailyReport = {
        date: new Date(),
        marketOverview: {} as MarketOverview,
        portfolioAnalyses: [],
        strategyPerformances: [],
        keyInsights: [],
        recommendations: [],
        riskAlerts: [],
      };

      // Execute each analysis based on active triggers
      for (const trigger of triggers) {
        switch (trigger.type) {
          case 'market_analysis':
            report.marketOverview = await this.performMarketAnalysis();
            break;
          case 'portfolio_analysis':
            report.portfolioAnalyses = await this.performPortfolioAnalysis();
            break;
          case 'strategy_performance':
            report.strategyPerformances = await this.performStrategyAnalysis();
            break;
        }
      }

      // Generate insights and recommendations
      report.keyInsights = await this.generateKeyInsights(report);
      report.recommendations = await this.generateRecommendations(report);
      report.riskAlerts = await this.generateRiskAlerts(report);

      // Store and distribute report
      await this.storeReport(report);
      await this.distributeReport(report);

      // Generate summary alert
      this.generateAlert({
        type: 'daily_scan_completed',
        severity: 'low',
        title: 'Daily Scan Completed',
        message: `Daily market analysis completed. ${report.keyInsights.length} insights, ${report.recommendations.length} recommendations, ${report.riskAlerts.length} risk alerts generated.`,
        data: {
          scanDate: report.date,
          marketOverview: report.marketOverview,
          portfolioCount: report.portfolioAnalyses.length,
          strategyCount: report.strategyPerformances.length,
          insightCount: report.keyInsights.length,
          recommendationCount: report.recommendations.length,
          riskAlertCount: report.riskAlerts.length,
        },
      });

      this.logger.info('Daily scan completed successfully');
    } catch (error) {
      this.logger.error('Error performing daily scan:', error);
      
      this.generateAlert({
        type: 'daily_scan_failed',
        severity: 'medium',
        title: 'Daily Scan Failed',
        message: `Daily scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  }

  // Analysis methods
  private async performMarketAnalysis(): Promise<MarketOverview> {
    try {
      this.logger.info('Performing market analysis');

      // Fetch market data from multiple sources
      const [topShotData, tradingData] = await Promise.all([
        this.fetchTopShotMarketData(),
        this.fetchTradingServiceData(),
      ]);

      const marketOverview: MarketOverview = {
        totalVolume24h: topShotData.totalVolume || 0,
        totalTransactions24h: topShotData.totalTransactions || 0,
        averagePrice: topShotData.averagePrice || 0,
        priceChange24h: topShotData.priceChange24h || 0,
        topGainers: topShotData.topGainers || [],
        topLosers: topShotData.topLosers || [],
        volumeLeaders: topShotData.volumeLeaders || [],
        marketSentiment: this.calculateMarketSentiment(topShotData),
      };

      return marketOverview;
    } catch (error) {
      this.logger.error('Error performing market analysis:', error);
      return {} as MarketOverview;
    }
  }

  private async performPortfolioAnalysis(): Promise<PortfolioAnalysis[]> {
    try {
      this.logger.info('Performing portfolio analysis');

      // Get all active users
      const activeUsers = await this.getActiveUsers();
      const portfolioAnalyses: PortfolioAnalysis[] = [];

      for (const userId of activeUsers) {
        try {
          const analysis = await this.analyzeUserPortfolio(userId);
          if (analysis) {
            portfolioAnalyses.push(analysis);
          }
        } catch (error) {
          this.logger.error('Error analyzing user portfolio:', { userId, error });
        }
      }

      return portfolioAnalyses;
    } catch (error) {
      this.logger.error('Error performing portfolio analysis:', error);
      return [];
    }
  }

  private async performStrategyAnalysis(): Promise<StrategyPerformance[]> {
    try {
      this.logger.info('Performing strategy analysis');

      const strategyTypes = ['RookieRisers', 'PostGameSpikes', 'ArbitrageMode'];
      const strategyPerformances: StrategyPerformance[] = [];

      for (const strategyType of strategyTypes) {
        try {
          const performance = await this.analyzeStrategyPerformance(strategyType);
          if (performance) {
            strategyPerformances.push(performance);
          }
        } catch (error) {
          this.logger.error('Error analyzing strategy performance:', { strategyType, error });
        }
      }

      return strategyPerformances;
    } catch (error) {
      this.logger.error('Error performing strategy analysis:', error);
      return [];
    }
  }

  // Data fetching methods
  private async fetchTopShotMarketData(): Promise<any> {
    try {
      const response = await this.topShotAPI.get('/marketplace/overview');
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching Top Shot market data:', error);
      return {};
    }
  }

  private async fetchTradingServiceData(): Promise<any> {
    try {
      const response = await this.tradingServiceAPI.get('/api/market/overview');
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching trading service data:', error);
      return {};
    }
  }

  private async getActiveUsers(): Promise<string[]> {
    try {
      // This would query the database for active users
      // For now, returning a placeholder
      return ['user1', 'user2', 'user3'];
    } catch (error) {
      this.logger.error('Error getting active users:', error);
      return [];
    }
  }

  private async analyzeUserPortfolio(userId: string): Promise<PortfolioAnalysis | null> {
    try {
      const response = await this.tradingServiceAPI.get(`/api/portfolio/summary`, {
        headers: { 'X-User-ID': userId },
      });

      const portfolioData = response.data.data;
      
      const analysis: PortfolioAnalysis = {
        userId,
        totalValue: portfolioData.portfolio.totalValue,
        totalReturn: portfolioData.performance.totalReturn,
        returnPercentage: portfolioData.performance.totalReturnPercent,
        bestPerformer: portfolioData.performance.bestPerformer || { momentId: 'none', return: 0 },
        worstPerformer: portfolioData.performance.worstPerformer || { momentId: 'none', return: 0 },
        riskScore: this.calculatePortfolioRiskScore(portfolioData),
        diversificationScore: this.calculateDiversificationScore(portfolioData),
        recommendations: this.generatePortfolioRecommendations(portfolioData),
      };

      return analysis;
    } catch (error) {
      this.logger.error('Error analyzing user portfolio:', { userId, error });
      return null;
    }
  }

  private async analyzeStrategyPerformance(strategyType: string): Promise<StrategyPerformance | null> {
    try {
      // This would aggregate strategy performance across all users
      // For now, using placeholder data
      
      const performance: StrategyPerformance = {
        strategyType,
        totalUsers: 50,
        averageReturn: 12.5,
        successRate: 68.5,
        totalTrades: 1250,
        bestPerformingUser: 'user123',
        worstPerformingUser: 'user456',
        recommendations: this.generateStrategyRecommendations(strategyType),
      };

      return performance;
    } catch (error) {
      this.logger.error('Error analyzing strategy performance:', { strategyType, error });
      return null;
    }
  }

  // Analysis helper methods
  private calculateMarketSentiment(marketData: any): 'bullish' | 'bearish' | 'neutral' {
    const priceChange = marketData.priceChange24h || 0;
    const volumeChange = marketData.volumeChange24h || 0;

    if (priceChange > 5 && volumeChange > 20) return 'bullish';
    if (priceChange < -5 && volumeChange > 20) return 'bearish';
    return 'neutral';
  }

  private calculatePortfolioRiskScore(portfolioData: any): number {
    // Simplified risk score calculation
    let riskScore = 50; // Base score

    const returnVolatility = Math.abs(portfolioData.performance.totalReturnPercent || 0);
    riskScore += Math.min(returnVolatility, 30);

    const diversification = portfolioData.portfolio.moments?.length || 1;
    riskScore -= Math.min(diversification * 2, 20);

    return Math.max(0, Math.min(100, riskScore));
  }

  private calculateDiversificationScore(portfolioData: any): number {
    const moments = portfolioData.portfolio.moments || [];
    if (moments.length === 0) return 0;

    // Simple diversification based on number of different players/sets
    const uniquePlayers = new Set(moments.map((m: any) => m.playerId)).size;
    const uniqueSets = new Set(moments.map((m: any) => m.setId)).size;

    return Math.min(100, (uniquePlayers * 10) + (uniqueSets * 5));
  }

  private generatePortfolioRecommendations(portfolioData: any): string[] {
    const recommendations: string[] = [];

    const totalReturn = portfolioData.performance.totalReturnPercent || 0;
    const momentCount = portfolioData.portfolio.moments?.length || 0;

    if (totalReturn < -10) {
      recommendations.push('Consider reviewing your trading strategy - portfolio showing significant losses');
    }

    if (momentCount < 5) {
      recommendations.push('Consider diversifying your portfolio with more moments');
    }

    if (momentCount > 50) {
      recommendations.push('Portfolio may be over-diversified - consider focusing on higher-conviction plays');
    }

    return recommendations;
  }

  private generateStrategyRecommendations(strategyType: string): string[] {
    const recommendations: string[] = [];

    switch (strategyType) {
      case 'RookieRisers':
        recommendations.push('Focus on players with consistent performance trends');
        recommendations.push('Monitor rookie performance in clutch situations');
        break;
      case 'PostGameSpikes':
        recommendations.push('Set tighter time windows for post-game trades');
        recommendations.push('Consider player popularity and social media buzz');
        break;
      case 'ArbitrageMode':
        recommendations.push('Increase monitoring frequency during high-volume periods');
        recommendations.push('Consider cross-marketplace opportunities');
        break;
    }

    return recommendations;
  }

  // Insight and recommendation generation
  private async generateKeyInsights(report: DailyReport): Promise<string[]> {
    const insights: string[] = [];

    // Market insights
    if (report.marketOverview.priceChange24h > 10) {
      insights.push(`Strong market performance with ${report.marketOverview.priceChange24h.toFixed(1)}% price increase`);
    }

    if (report.marketOverview.totalVolume24h > 1000000) {
      insights.push(`High trading volume detected: $${(report.marketOverview.totalVolume24h / 1000000).toFixed(1)}M`);
    }

    // Portfolio insights
    const avgReturn = report.portfolioAnalyses.reduce((sum, p) => sum + p.returnPercentage, 0) / report.portfolioAnalyses.length;
    if (avgReturn > 15) {
      insights.push(`Strong portfolio performance with average return of ${avgReturn.toFixed(1)}%`);
    }

    // Strategy insights
    const bestStrategy = report.strategyPerformances.reduce((best, current) => 
      current.averageReturn > best.averageReturn ? current : best
    );
    if (bestStrategy) {
      insights.push(`${bestStrategy.strategyType} showing best performance with ${bestStrategy.averageReturn.toFixed(1)}% average return`);
    }

    return insights;
  }

  private async generateRecommendations(report: DailyReport): Promise<string[]> {
    const recommendations: string[] = [];

    // Market-based recommendations
    if (report.marketOverview.marketSentiment === 'bullish') {
      recommendations.push('Consider increasing position sizes in high-confidence trades');
    } else if (report.marketOverview.marketSentiment === 'bearish') {
      recommendations.push('Consider reducing risk exposure and focusing on defensive strategies');
    }

    // Portfolio-based recommendations
    const highRiskUsers = report.portfolioAnalyses.filter(p => p.riskScore > 80);
    if (highRiskUsers.length > 0) {
      recommendations.push(`${highRiskUsers.length} users showing high risk scores - consider portfolio rebalancing`);
    }

    return recommendations;
  }

  private async generateRiskAlerts(report: DailyReport): Promise<string[]> {
    const alerts: string[] = [];

    // Market risk alerts
    if (Math.abs(report.marketOverview.priceChange24h) > 20) {
      alerts.push(`Extreme market volatility detected: ${report.marketOverview.priceChange24h.toFixed(1)}% change`);
    }

    // Portfolio risk alerts
    const lossUsers = report.portfolioAnalyses.filter(p => p.returnPercentage < -20);
    if (lossUsers.length > 0) {
      alerts.push(`${lossUsers.length} users with significant losses (>20%)`);
    }

    return alerts;
  }

  // Report management
  private async storeReport(report: DailyReport): Promise<void> {
    try {
      // Store report in database and cache
      const reportKey = `daily_report:${report.date.toISOString().split('T')[0]}`;
      await this.cacheSet(reportKey, JSON.stringify(report), 86400 * 7); // 7 days

      this.logger.info('Daily report stored successfully');
    } catch (error) {
      this.logger.error('Error storing daily report:', error);
    }
  }

  private async distributeReport(report: DailyReport): Promise<void> {
    try {
      // Generate report summary for distribution
      const summary = this.generateReportSummary(report);

      // Send to configured recipients
      for (const recipient of this.config.reportRecipients) {
        await this.sendReportToRecipient(recipient, summary);
      }

      this.logger.info('Daily report distributed successfully', { 
        recipients: this.config.reportRecipients.length 
      });
    } catch (error) {
      this.logger.error('Error distributing daily report:', error);
    }
  }

  private generateReportSummary(report: DailyReport): string {
    const lines: string[] = [];
    
    lines.push(`# FastBreak Daily Report - ${report.date.toDateString()}`);
    lines.push('');
    
    // Market Overview
    lines.push('## Market Overview');
    lines.push(`- Total Volume: $${(report.marketOverview.totalVolume24h / 1000000).toFixed(1)}M`);
    lines.push(`- Price Change: ${report.marketOverview.priceChange24h.toFixed(1)}%`);
    lines.push(`- Market Sentiment: ${report.marketOverview.marketSentiment}`);
    lines.push('');
    
    // Key Insights
    if (report.keyInsights.length > 0) {
      lines.push('## Key Insights');
      report.keyInsights.forEach(insight => lines.push(`- ${insight}`));
      lines.push('');
    }
    
    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      report.recommendations.forEach(rec => lines.push(`- ${rec}`));
      lines.push('');
    }
    
    // Risk Alerts
    if (report.riskAlerts.length > 0) {
      lines.push('## Risk Alerts');
      report.riskAlerts.forEach(alert => lines.push(`- ⚠️ ${alert}`));
    }
    
    return lines.join('\n');
  }

  private async sendReportToRecipient(recipient: string, summary: string): Promise<void> {
    try {
      // This would send the report via email, Slack, etc.
      this.logger.info('Sending report to recipient', { recipient });
      
      // For now, just log the summary
      this.logger.debug('Report summary:', { recipient, summary });
    } catch (error) {
      this.logger.error('Error sending report to recipient:', { recipient, error });
    }
  }
}