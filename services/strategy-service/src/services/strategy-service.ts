import { EventEmitter } from 'events';
import { Logger } from 'winston';
import Redis from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseManager, StrategyRepository } from '@fastbreak/database';
import { StrategyParameters, StrategyPerformance } from '@fastbreak/types';
import {
  StrategyConfiguration,
  StrategyTemplate,
  StrategyExecution,
  StrategyAlert,
  StrategyRecommendation,
  StrategyBacktest,
  BacktestResults
} from '../types/strategy';
import { STRATEGY_TEMPLATES, getTemplateById } from '../templates/strategy-templates';
import { StrategyValidator } from '../validators/strategy-validator';

export interface StrategyServiceConfig {
  maxStrategiesPerUser: number;
  defaultRiskControls: any;
  performanceUpdateInterval: number;
  backtestHistoryDays: number;
  recommendationCooldown: number;
}

export class StrategyService extends EventEmitter {
  private logger: Logger;
  private config: StrategyServiceConfig;
  private db: DatabaseManager;
  private redisClient: Redis.RedisClientType;
  private strategyRepository: StrategyRepository;
  private performanceUpdateInterval?: NodeJS.Timeout;

  constructor(
    config: StrategyServiceConfig,
    db: DatabaseManager,
    redisClient: Redis.RedisClientType,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.db = db;
    this.redisClient = redisClient;
    this.logger = logger;
    this.strategyRepository = new StrategyRepository(db.getConnection());
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Strategy Service');

      // Start performance monitoring
      this.startPerformanceMonitoring();

      this.logger.info('Strategy Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Strategy Service:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.performanceUpdateInterval) {
      clearInterval(this.performanceUpdateInterval);
    }
    this.logger.info('Strategy Service shutdown complete');
  }

  // Template Management
  public getAvailableTemplates(): StrategyTemplate[] {
    return STRATEGY_TEMPLATES.filter(template => template.isActive);
  }

  public getTemplateById(templateId: string): StrategyTemplate | null {
    return getTemplateById(templateId) || null;
  }

  public searchTemplates(query: string, filters?: {
    type?: string;
    difficulty?: string;
    riskLevel?: string;
    category?: string;
  }): StrategyTemplate[] {
    let templates = STRATEGY_TEMPLATES.filter(template => template.isActive);

    // Apply text search
    if (query) {
      const lowerQuery = query.toLowerCase();
      templates = templates.filter(template =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // Apply filters
    if (filters) {
      if (filters.type) {
        templates = templates.filter(t => t.type === filters.type);
      }
      if (filters.difficulty) {
        templates = templates.filter(t => t.difficulty === filters.difficulty);
      }
      if (filters.riskLevel) {
        templates = templates.filter(t => t.riskLevel === filters.riskLevel);
      }
      if (filters.category) {
        templates = templates.filter(t => t.category === filters.category);
      }
    }

    return templates;
  }

  // Strategy Configuration Management
  public async createStrategy(
    userId: string,
    strategyData: Omit<StrategyConfiguration, 'id' | 'userId' | 'performance' | 'createdAt' | 'updatedAt'>
  ): Promise<StrategyConfiguration> {
    try {
      // Validate user doesn't exceed max strategies
      const userStrategies = await this.getUserStrategies(userId);
      if (userStrategies.length >= this.config.maxStrategiesPerUser) {
        throw new Error(`Maximum number of strategies (${this.config.maxStrategiesPerUser}) reached`);
      }

      // Validate template exists
      const template = getTemplateById(strategyData.templateId);
      if (!template) {
        throw new Error('Invalid template ID');
      }

      // Validate strategy configuration
      const validation = StrategyValidator.validateStrategyConfiguration({
        ...strategyData,
        userId,
      });

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Check compatibility with existing strategies
      const compatibility = StrategyValidator.validateCompatibility([...userStrategies, strategyData as any]);
      if (!compatibility.isValid) {
        throw new Error(`Compatibility check failed: ${compatibility.errors.join(', ')}`);
      }

      // Create strategy in database
      const strategy = await this.strategyRepository.createStrategy(
        userId,
        strategyData.templateId,
        strategyData.parameters
      );

      // Initialize performance tracking
      const fullStrategy: StrategyConfiguration = {
        id: strategy.id,
        userId,
        templateId: strategyData.templateId,
        name: strategyData.name,
        description: strategyData.description,
        parameters: strategyData.parameters,
        isActive: strategyData.isActive,
        priority: strategyData.priority,
        budgetAllocation: strategyData.budgetAllocation,
        riskControls: strategyData.riskControls,
        schedule: strategyData.schedule,
        notifications: strategyData.notifications,
        performance: {
          totalTrades: 0,
          successfulTrades: 0,
          totalProfit: 0,
          averageReturn: 0,
          totalLoss: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          winRate: 0,
          averageHoldingTime: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Cache strategy
      await this.cacheStrategy(fullStrategy);

      // Emit event
      this.emit('strategyCreated', fullStrategy);

      this.logger.info('Strategy created successfully', {
        strategyId: fullStrategy.id,
        userId,
        templateId: strategyData.templateId,
      });

      return fullStrategy;

    } catch (error) {
      this.logger.error('Error creating strategy:', error);
      throw error;
    }
  }

  public async updateStrategy(
    userId: string,
    strategyId: string,
    updates: Partial<StrategyConfiguration>
  ): Promise<StrategyConfiguration> {
    try {
      // Get existing strategy
      const existingStrategy = await this.getStrategy(userId, strategyId);
      if (!existingStrategy) {
        throw new Error('Strategy not found');
      }

      // Validate parameter updates if provided
      if (updates.parameters) {
        const validation = StrategyValidator.validateParameterUpdate(
          existingStrategy.parameters,
          updates.parameters,
          existingStrategy.templateId
        );

        if (!validation.isValid) {
          throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
        }

        if (validation.warnings.length > 0) {
          this.logger.warn('Strategy update warnings:', validation.warnings);
        }
      }

      // Update strategy
      const updatedStrategy = { ...existingStrategy, ...updates, updatedAt: new Date() };

      // Validate full configuration
      const configValidation = StrategyValidator.validateStrategyConfiguration(updatedStrategy);
      if (!configValidation.isValid) {
        throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
      }

      // Update in database
      if (updates.parameters) {
        await this.strategyRepository.updateStrategy(strategyId, updates.parameters);
      }

      // Update cache
      await this.cacheStrategy(updatedStrategy);

      // Emit event
      this.emit('strategyUpdated', updatedStrategy, existingStrategy);

      this.logger.info('Strategy updated successfully', {
        strategyId,
        userId,
        updates: Object.keys(updates),
      });

      return updatedStrategy;

    } catch (error) {
      this.logger.error('Error updating strategy:', error);
      throw error;
    }
  }

  public async deleteStrategy(userId: string, strategyId: string): Promise<boolean> {
    try {
      // Get strategy to verify ownership
      const strategy = await this.getStrategy(userId, strategyId);
      if (!strategy) {
        throw new Error('Strategy not found');
      }

      // Delete from database
      const deleted = await this.strategyRepository.deleteStrategy(strategyId);

      if (deleted) {
        // Remove from cache
        await this.removeCachedStrategy(strategyId);

        // Emit event
        this.emit('strategyDeleted', strategy);

        this.logger.info('Strategy deleted successfully', {
          strategyId,
          userId,
        });
      }

      return deleted;

    } catch (error) {
      this.logger.error('Error deleting strategy:', error);
      throw error;
    }
  }

  public async getStrategy(userId: string, strategyId: string): Promise<StrategyConfiguration | null> {
    try {
      // Try cache first
      const cached = await this.getCachedStrategy(strategyId);
      if (cached && cached.userId === userId) {
        return cached;
      }

      // Get from database
      const strategies = await this.strategyRepository.getStrategiesByUser(userId);
      const strategy = strategies.find(s => s.id === strategyId);

      if (strategy) {
        const fullStrategy = await this.mapToStrategyConfiguration(strategy, userId);
        await this.cacheStrategy(fullStrategy);
        return fullStrategy;
      }

      return null;

    } catch (error) {
      this.logger.error('Error getting strategy:', error);
      throw error;
    }
  }

  public async getUserStrategies(userId: string): Promise<StrategyConfiguration[]> {
    try {
      const strategies = await this.strategyRepository.getStrategiesByUser(userId);

      const fullStrategies = await Promise.all(
        strategies.map(strategy => this.mapToStrategyConfiguration(strategy, userId))
      );

      return fullStrategies;

    } catch (error) {
      this.logger.error('Error getting user strategies:', error);
      throw error;
    }
  }

  public async getActiveStrategies(userId: string): Promise<StrategyConfiguration[]> {
    try {
      const strategies = await this.strategyRepository.getActiveStrategiesByUser(userId);

      const fullStrategies = await Promise.all(
        strategies.map(strategy => this.mapToStrategyConfiguration(strategy, userId))
      );

      return fullStrategies;

    } catch (error) {
      this.logger.error('Error getting active strategies:', error);
      throw error;
    }
  }

  public async toggleStrategy(userId: string, strategyId: string, isActive: boolean): Promise<StrategyConfiguration> {
    try {
      const strategy = await this.getStrategy(userId, strategyId);
      if (!strategy) {
        throw new Error('Strategy not found');
      }

      // Update in database
      await this.strategyRepository.toggleStrategy(strategyId, isActive);

      // Update strategy object
      strategy.isActive = isActive;
      strategy.updatedAt = new Date();

      // Update cache
      await this.cacheStrategy(strategy);

      // Emit event
      this.emit('strategyToggled', strategy, isActive);

      this.logger.info('Strategy toggled', {
        strategyId,
        userId,
        isActive,
      });

      return strategy;

    } catch (error) {
      this.logger.error('Error toggling strategy:', error);
      throw error;
    }
  }

  // Performance Management
  public async updateStrategyPerformance(
    strategyId: string,
    execution: StrategyExecution
  ): Promise<void> {
    try {
      const isSuccessful = execution.result ? execution.result.profit > 0 : false;
      const profit = execution.result ? execution.result.profit : 0;

      // Update in database
      await this.strategyRepository.updateStrategyPerformance(
        strategyId,
        isSuccessful,
        profit
      );

      // Update cached strategy
      const cached = await this.getCachedStrategy(strategyId);
      if (cached) {
        cached.performance.totalTrades += 1;
        if (isSuccessful) {
          cached.performance.successfulTrades += 1;
          cached.performance.totalProfit += profit;
        } else {
          cached.performance.totalLoss = (cached.performance.totalLoss || 0) + Math.abs(profit);
        }

        cached.performance.winRate = cached.performance.successfulTrades / cached.performance.totalTrades;
        cached.performance.averageReturn =
          (cached.performance.totalProfit - (cached.performance.totalLoss || 0)) / cached.performance.totalTrades;

        cached.lastExecuted = execution.executedAt;

        await this.cacheStrategy(cached);
      }

      this.emit('performanceUpdated', strategyId, execution);

    } catch (error) {
      this.logger.error('Error updating strategy performance:', error);
      throw error;
    }
  }

  public async getStrategyPerformance(strategyId: string): Promise<StrategyPerformance | null> {
    try {
      return await this.strategyRepository.getStrategyPerformance(strategyId);
    } catch (error) {
      this.logger.error('Error getting strategy performance:', error);
      throw error;
    }
  }

  // Backtesting
  public async runBacktest(
    userId: string,
    strategyId: string,
    period: { start: Date; end: Date }
  ): Promise<StrategyBacktest> {
    try {
      const strategy = await this.getStrategy(userId, strategyId);
      if (!strategy) {
        throw new Error('Strategy not found');
      }

      // This is a simplified backtest implementation
      // In a real system, this would run the strategy against historical data
      const backtestId = uuidv4();

      const results: BacktestResults = {
        totalReturn: 0.15, // 15% return (mock)
        annualizedReturn: 0.18,
        volatility: 0.12,
        sharpeRatio: 1.5,
        maxDrawdown: 0.08,
        winRate: 0.65,
        totalTrades: 45,
        averageHoldingTime: 72, // hours
        profitFactor: 1.8,
        calmarRatio: 2.25,
        trades: [], // Would be populated with actual backtest trades
        performanceChart: [], // Would be populated with performance data
      };

      const backtest: StrategyBacktest = {
        id: backtestId,
        strategyId,
        userId,
        parameters: strategy.parameters,
        period,
        results,
        createdAt: new Date(),
      };

      // Store backtest results
      await this.storeBacktest(backtest);

      this.emit('backtestCompleted', backtest);

      return backtest;

    } catch (error) {
      this.logger.error('Error running backtest:', error);
      throw error;
    }
  }

  // Recommendations
  public async generateRecommendations(userId: string): Promise<StrategyRecommendation[]> {
    try {
      const strategies = await this.getUserStrategies(userId);
      const recommendations: StrategyRecommendation[] = [];

      // Analyze strategies and generate recommendations
      for (const strategy of strategies) {
        // Check for underperforming strategies
        if ((strategy.performance.winRate || 0) < 0.4 && strategy.performance.totalTrades > 10) {
          recommendations.push({
            id: uuidv4(),
            userId,
            type: 'parameter_adjustment',
            title: 'Underperforming Strategy Detected',
            description: `Strategy "${strategy.name}" has a low win rate of ${((strategy.performance.winRate || 0) * 100).toFixed(1)}%`,
            suggestedAction: 'Consider adjusting risk parameters or pausing the strategy',
            confidence: 0.8,
            potentialImpact: {
              returnImprovement: 0.05,
              riskReduction: 0.1,
            },
            data: { strategyId: strategy.id },
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          });
        }

        // Check for high-risk strategies
        if ((strategy.performance.maxDrawdown || 0) > 0.15) {
          recommendations.push({
            id: uuidv4(),
            userId,
            type: 'risk_reduction',
            title: 'High Risk Strategy',
            description: `Strategy "${strategy.name}" has experienced a maximum drawdown of ${((strategy.performance.maxDrawdown || 0) * 100).toFixed(1)}%`,
            suggestedAction: 'Consider reducing position sizes or implementing stricter stop losses',
            confidence: 0.9,
            potentialImpact: {
              returnImprovement: 0,
              riskReduction: 0.2,
            },
            data: { strategyId: strategy.id },
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
        }
      }

      // Check for missing strategy types
      const strategyTypes = strategies.map(s => {
        const template = getTemplateById(s.templateId);
        return template?.type;
      });

      if (!strategyTypes.includes('arbitrage_mode')) {
        recommendations.push({
          id: uuidv4(),
          userId,
          type: 'new_strategy',
          title: 'Consider Adding Arbitrage Strategy',
          description: 'Arbitrage strategies can provide low-risk returns and portfolio diversification',
          suggestedAction: 'Add a conservative arbitrage strategy to your portfolio',
          confidence: 0.7,
          potentialImpact: {
            returnImprovement: 0.03,
            riskReduction: 0.05,
          },
          data: { suggestedTemplate: 'arbitrage_conservative' },
          status: 'pending',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        });
      }

      return recommendations;

    } catch (error) {
      this.logger.error('Error generating recommendations:', error);
      throw error;
    }
  }

  // Private helper methods
  private async mapToStrategyConfiguration(
    strategy: any,
    userId: string
  ): Promise<StrategyConfiguration> {
    // This would map database strategy to full StrategyConfiguration
    // For now, returning a mock implementation
    return {
      id: strategy.id,
      userId,
      templateId: 'rookie_risers_basic', // Would come from database
      name: 'Strategy Name', // Would come from database
      description: 'Strategy Description',
      parameters: strategy.parameters,
      isActive: strategy.isActive,
      priority: 5,
      budgetAllocation: {
        percentage: 0.2,
        maxAmount: 1000,
        dailyLimit: 100,
      },
      riskControls: this.config.defaultRiskControls,
      notifications: {
        enabled: true,
        channels: ['email'],
        events: ['trade_executed'],
        frequency: 'immediate',
      },
      performance: strategy.performance || {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        averageReturn: 0,
        totalLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winRate: 0,
        averageHoldingTime: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async cacheStrategy(strategy: StrategyConfiguration): Promise<void> {
    try {
      const key = `strategy:${strategy.id}`;
      await this.redisClient.setEx(key, 3600, JSON.stringify(strategy)); // 1 hour TTL
    } catch (error) {
      this.logger.warn('Error caching strategy:', error);
    }
  }

  private async getCachedStrategy(strategyId: string): Promise<StrategyConfiguration | null> {
    try {
      const key = `strategy:${strategyId}`;
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.warn('Error getting cached strategy:', error);
      return null;
    }
  }

  private async removeCachedStrategy(strategyId: string): Promise<void> {
    try {
      const key = `strategy:${strategyId}`;
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.warn('Error removing cached strategy:', error);
    }
  }

  private async storeBacktest(backtest: StrategyBacktest): Promise<void> {
    try {
      const key = `backtest:${backtest.id}`;
      await this.redisClient.setEx(key, 86400 * 30, JSON.stringify(backtest)); // 30 days TTL
    } catch (error) {
      this.logger.error('Error storing backtest:', error);
    }
  }

  private startPerformanceMonitoring(): void {
    this.performanceUpdateInterval = setInterval(async () => {
      try {
        // Update performance metrics for all active strategies
        // This would typically aggregate recent trade data
        this.logger.debug('Updating strategy performance metrics');
      } catch (error) {
        this.logger.error('Error in performance monitoring:', error);
      }
    }, this.config.performanceUpdateInterval);
  }

  public getServiceStats(): {
    totalStrategies: number;
    activeStrategies: number;
    totalTemplates: number;
  } {
    return {
      totalStrategies: 0, // Would come from database
      activeStrategies: 0, // Would come from database
      totalTemplates: STRATEGY_TEMPLATES.length,
    };
  }
}