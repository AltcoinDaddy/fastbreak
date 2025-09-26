import Joi from 'joi';
import { StrategyParameters, PerformanceMetric } from '@fastbreak/types';
import { StrategyConfiguration, RiskControls } from '../types/strategy';
import { getTemplateById } from '../templates/strategy-templates';

export class StrategyValidator {
  
  // Base validation schemas
  private static readonly riskControlsSchema = Joi.object({
    maxDailyLoss: Joi.number().positive().max(10000).required(),
    maxPositionSize: Joi.number().positive().max(5000).required(),
    maxConcurrentTrades: Joi.number().integer().min(1).max(50).required(),
    stopLossPercentage: Joi.number().min(0.01).max(0.5).required(),
    takeProfitPercentage: Joi.number().min(0.05).max(1.0).required(),
    cooldownPeriod: Joi.number().integer().min(0).max(3600).required(),
    blacklistedPlayers: Joi.array().items(Joi.string()).default([]),
    blacklistedMoments: Joi.array().items(Joi.string()).default([]),
    maxPricePerMoment: Joi.number().positive().max(10000).required(),
    requireManualApproval: Joi.boolean().default(false),
    emergencyStop: Joi.object({
      enabled: Joi.boolean().required(),
      triggerConditions: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('loss_threshold', 'consecutive_losses', 'market_volatility', 'external_signal').required(),
          threshold: Joi.number().positive().required(),
          timeframe: Joi.number().integer().positive().optional(),
          isActive: Joi.boolean().required(),
        })
      ).default([]),
    }).required(),
  });

  private static readonly budgetAllocationSchema = Joi.object({
    percentage: Joi.number().min(0.01).max(1.0).required(),
    maxAmount: Joi.number().positive().max(100000).required(),
    dailyLimit: Joi.number().positive().max(10000).required(),
  });

  private static readonly scheduleConfigSchema = Joi.object({
    enabled: Joi.boolean().required(),
    timezone: Joi.string().default('UTC'),
    activeHours: Joi.object({
      start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    }).required(),
    activeDays: Joi.array().items(Joi.number().integer().min(0).max(6)).min(1).max(7).required(),
    pauseDuringGames: Joi.boolean().default(false),
    pauseBeforeGames: Joi.number().integer().min(0).max(180).default(0),
    pauseAfterGames: Joi.number().integer().min(0).max(180).default(0),
  });

  private static readonly notificationConfigSchema = Joi.object({
    enabled: Joi.boolean().required(),
    channels: Joi.array().items(
      Joi.string().valid('email', 'push', 'sms', 'webhook')
    ).min(1).required(),
    events: Joi.array().items(
      Joi.string().valid(
        'trade_executed', 
        'opportunity_found', 
        'risk_threshold_reached', 
        'strategy_paused', 
        'performance_milestone', 
        'error_occurred'
      )
    ).min(1).required(),
    frequency: Joi.string().valid('immediate', 'batched', 'daily_summary').default('immediate'),
    quietHours: Joi.object({
      start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
      end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    }).optional(),
  });

  // Strategy-specific parameter schemas
  private static readonly rookieRisersSchema = Joi.object({
    performanceThreshold: Joi.number().min(0.5).max(1.0).required(),
    priceLimit: Joi.number().positive().max(2000).required(),
    minGamesPlayed: Joi.number().integer().min(1).max(82).required(),
    maxYearsExperience: Joi.number().integer().min(1).max(5).required(),
    targetPositions: Joi.array().items(
      Joi.string().valid('PG', 'SG', 'SF', 'PF', 'C')
    ).min(1).required(),
    excludeTeams: Joi.array().items(Joi.string()).optional(),
    minMinutesPerGame: Joi.number().min(5).max(48).required(),
    efficiencyRatingMin: Joi.number().min(5).max(40).required(),
    usageRateMin: Joi.number().min(0.1).max(0.4).required(),
    projectedGrowthRate: Joi.number().min(0.05).max(0.5).required(),
  });

  private static readonly postGameSpikesSchema = Joi.object({
    performanceMetrics: Joi.array().items(
      Joi.object({
        name: Joi.string().valid('points', 'rebounds', 'assists', 'steals', 'blocks', 'efficiency').required(),
        threshold: Joi.number().positive().required(),
        comparison: Joi.string().valid('greater_than', 'less_than', 'equal_to', 'percentage_change').required(),
        weight: Joi.number().min(0).max(1).required(),
      })
    ).min(1).required(),
    timeWindow: Joi.number().min(0.5).max(48).required(),
    priceChangeThreshold: Joi.number().min(0.01).max(0.5).required(),
    volumeThreshold: Joi.number().min(1.1).max(10).required(),
    gameTypes: Joi.array().items(
      Joi.string().valid('regular_season', 'playoffs', 'finals', 'all_star', 'preseason')
    ).min(1).required(),
    playerTiers: Joi.array().items(
      Joi.string().valid('superstar', 'all_star', 'starter', 'role_player', 'rookie')
    ).min(1).required(),
    momentTypes: Joi.array().items(Joi.string()).min(1).required(),
    maxPriceMultiplier: Joi.number().min(1.1).max(3.0).required(),
    socialSentimentWeight: Joi.number().min(0).max(1).required(),
  });

  private static readonly arbitrageModeSchema = Joi.object({
    priceDifferenceThreshold: Joi.number().min(0.02).max(0.3).required(),
    maxExecutionTime: Joi.number().integer().min(30).max(3600).required(),
    marketplaces: Joi.array().items(Joi.string()).min(2).required(),
    maxRiskScore: Joi.number().min(10).max(90).required(),
    minConfidenceLevel: Joi.number().min(0.5).max(0.95).required(),
    slippageTolerance: Joi.number().min(0.005).max(0.05).required(),
    maxPositionSize: Joi.number().positive().max(5000).required(),
    excludeHighVolatility: Joi.boolean().required(),
  });

  private static readonly valueInvestingSchema = Joi.object({
    maxPriceToValue: Joi.number().min(0.3).max(1.0).required(),
    minAIConfidence: Joi.number().min(0.6).max(0.95).required(),
    holdingPeriod: Joi.number().integer().min(7).max(730).required(),
    targetPlayers: Joi.array().items(Joi.string()).default([]),
    momentRarityMin: Joi.number().min(0.1).max(1.0).required(),
    historicalPerformanceWeight: Joi.number().min(0).max(1).required(),
    marketSentimentWeight: Joi.number().min(0).max(1).required(),
    fundamentalAnalysisWeight: Joi.number().min(0).max(1).required(),
  });

  private static readonly momentumTradingSchema = Joi.object({
    priceVelocityThreshold: Joi.number().min(0.03).max(0.5).required(),
    volumeVelocityThreshold: Joi.number().min(1.5).max(10).required(),
    trendDuration: Joi.number().min(1).max(72).required(),
    momentumIndicators: Joi.array().items(
      Joi.string().valid('price_rsi', 'volume_rsi', 'macd', 'bollinger_bands', 'moving_average')
    ).min(1).required(),
    stopLossPercentage: Joi.number().min(0.02).max(0.2).required(),
    takeProfitPercentage: Joi.number().min(0.05).max(0.8).required(),
    maxHoldingTime: Joi.number().integer().min(1).max(168).required(),
  });

  private static readonly contrarianSchema = Joi.object({
    oversoldThreshold: Joi.number().min(0.1).max(0.4).required(),
    overboughtThreshold: Joi.number().min(0.6).max(0.9).required(),
    reversalConfirmationPeriod: Joi.number().min(1).max(48).required(),
    maxDrawdownTolerance: Joi.number().min(0.05).max(0.3).required(),
    contraryIndicators: Joi.array().items(Joi.string()).min(1).required(),
    marketSentimentInversion: Joi.boolean().required(),
  });

  public static validateStrategyParameters(
    parameters: StrategyParameters, 
    templateId: string
  ): { isValid: boolean; errors: string[] } {
    const template = getTemplateById(templateId);
    if (!template) {
      return { isValid: false, errors: ['Invalid template ID'] };
    }

    const errors: string[] = [];

    // Validate based on strategy type
    switch (template.type) {
      case 'rookie_risers':
        if (parameters.rookieRisers) {
          const { error } = this.rookieRisersSchema.validate(parameters.rookieRisers);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
        } else {
          errors.push('Rookie risers parameters are required');
        }
        break;

      case 'post_game_spikes':
        if (parameters.postGameSpikes) {
          const { error } = this.postGameSpikesSchema.validate(parameters.postGameSpikes);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
          // Additional validation for performance metrics weights
          const totalWeight = parameters.postGameSpikes.performanceMetrics
            .reduce((sum: number, metric: PerformanceMetric) => sum + metric.weight, 0);
          if (Math.abs(totalWeight - 1.0) > 0.01) {
            errors.push('Performance metrics weights must sum to 1.0');
          }
        } else {
          errors.push('Post-game spikes parameters are required');
        }
        break;

      case 'arbitrage_mode':
        if (parameters.arbitrageMode) {
          const { error } = this.arbitrageModeSchema.validate(parameters.arbitrageMode);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
        } else {
          errors.push('Arbitrage mode parameters are required');
        }
        break;

      case 'value_investing':
        if (parameters.valueInvesting) {
          const { error } = this.valueInvestingSchema.validate(parameters.valueInvesting);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
          // Validate weights sum to 1.0
          const { historicalPerformanceWeight, marketSentimentWeight, fundamentalAnalysisWeight } = parameters.valueInvesting;
          const totalWeight = historicalPerformanceWeight + marketSentimentWeight + fundamentalAnalysisWeight;
          if (Math.abs(totalWeight - 1.0) > 0.01) {
            errors.push('Analysis weights must sum to 1.0');
          }
        } else {
          errors.push('Value investing parameters are required');
        }
        break;

      case 'momentum_trading':
        if (parameters.momentumTrading) {
          const { error } = this.momentumTradingSchema.validate(parameters.momentumTrading);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
          // Validate stop loss < take profit
          if (parameters.momentumTrading.stopLossPercentage >= parameters.momentumTrading.takeProfitPercentage) {
            errors.push('Stop loss percentage must be less than take profit percentage');
          }
        } else {
          errors.push('Momentum trading parameters are required');
        }
        break;

      case 'contrarian':
        if (parameters.contrarian) {
          const { error } = this.contrarianSchema.validate(parameters.contrarian);
          if (error) {
            errors.push(...error.details.map(d => d.message));
          }
          // Validate oversold < overbought
          if (parameters.contrarian.oversoldThreshold >= parameters.contrarian.overboughtThreshold) {
            errors.push('Oversold threshold must be less than overbought threshold');
          }
        } else {
          errors.push('Contrarian parameters are required');
        }
        break;

      default:
        errors.push(`Unsupported strategy type: ${template.type}`);
    }

    return { isValid: errors.length === 0, errors };
  }

  public static validateRiskControls(riskControls: RiskControls): { isValid: boolean; errors: string[] } {
    const { error } = this.riskControlsSchema.validate(riskControls);
    const errors: string[] = [];

    if (error) {
      errors.push(...error.details.map(d => d.message));
    }

    // Additional business logic validation
    if (riskControls.stopLossPercentage >= riskControls.takeProfitPercentage) {
      errors.push('Stop loss percentage must be less than take profit percentage');
    }

    if (riskControls.maxDailyLoss > riskControls.maxPositionSize * riskControls.maxConcurrentTrades) {
      errors.push('Max daily loss should not exceed total possible position exposure');
    }

    return { isValid: errors.length === 0, errors };
  }

  public static validateStrategyConfiguration(config: Partial<StrategyConfiguration>): { isValid: boolean; errors: string[] } {
    const schema = Joi.object({
      name: Joi.string().min(3).max(100).required(),
      description: Joi.string().max(500).optional(),
      templateId: Joi.string().required(),
      parameters: Joi.object().required(),
      isActive: Joi.boolean().default(true),
      priority: Joi.number().integer().min(1).max(10).default(5),
      budgetAllocation: this.budgetAllocationSchema.required(),
      riskControls: this.riskControlsSchema.required(),
      schedule: this.scheduleConfigSchema.optional(),
      notifications: this.notificationConfigSchema.required(),
    });

    const { error } = schema.validate(config);
    const errors: string[] = [];

    if (error) {
      errors.push(...error.details.map(d => d.message));
    }

    // Validate parameters against template if provided
    if (config.templateId && config.parameters) {
      const paramValidation = this.validateStrategyParameters(config.parameters, config.templateId);
      if (!paramValidation.isValid) {
        errors.push(...paramValidation.errors);
      }
    }

    // Validate risk controls if provided
    if (config.riskControls) {
      const riskValidation = this.validateRiskControls(config.riskControls);
      if (!riskValidation.isValid) {
        errors.push(...riskValidation.errors);
      }
    }

    // Business logic validations
    if (config.budgetAllocation) {
      if (config.budgetAllocation.dailyLimit > config.budgetAllocation.maxAmount) {
        errors.push('Daily limit cannot exceed maximum amount');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  public static validateParameterUpdate(
    currentParameters: StrategyParameters,
    newParameters: Partial<StrategyParameters>,
    templateId: string
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Merge parameters
    const mergedParameters = { ...currentParameters, ...newParameters };

    // Validate merged parameters
    const validation = this.validateStrategyParameters(mergedParameters, templateId);
    if (!validation.isValid) {
      errors.push(...validation.errors);
    }

    // Check for significant changes that might affect performance
    const template = getTemplateById(templateId);
    if (template) {
      switch (template.type) {
        case 'rookie_risers':
          if (newParameters.rookieRisers?.performanceThreshold && 
              currentParameters.rookieRisers?.performanceThreshold) {
            const change = Math.abs(
              newParameters.rookieRisers.performanceThreshold - 
              currentParameters.rookieRisers.performanceThreshold
            );
            if (change > 0.2) {
              warnings.push('Large change in performance threshold may significantly affect strategy behavior');
            }
          }
          break;

        case 'arbitrage_mode':
          if (newParameters.arbitrageMode?.priceDifferenceThreshold &&
              currentParameters.arbitrageMode?.priceDifferenceThreshold) {
            const change = Math.abs(
              newParameters.arbitrageMode.priceDifferenceThreshold -
              currentParameters.arbitrageMode.priceDifferenceThreshold
            );
            if (change > 0.05) {
              warnings.push('Significant change in price difference threshold may affect opportunity frequency');
            }
          }
          break;
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  public static validateCompatibility(
    strategies: StrategyConfiguration[]
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for conflicting strategies
    const activeStrategies = strategies.filter(s => s.isActive);
    
    // Check total budget allocation
    const totalBudgetPercentage = activeStrategies
      .reduce((sum, strategy) => sum + strategy.budgetAllocation.percentage, 0);
    
    if (totalBudgetPercentage > 1.0) {
      errors.push('Total budget allocation exceeds 100%');
    }

    // Check for conflicting strategy types
    const hasArbitrage = activeStrategies.some(s => s.templateId?.includes('arbitrage'));
    const hasContrarian = activeStrategies.some(s => s.templateId?.includes('contrarian'));
    const hasMomentum = activeStrategies.some(s => s.templateId?.includes('momentum'));

    if (hasContrarian && hasMomentum) {
      warnings.push('Contrarian and momentum strategies may conflict with each other');
    }

    // Check for overlapping risk controls
    const totalMaxConcurrentTrades = activeStrategies
      .reduce((sum, strategy) => sum + (strategy.riskControls?.maxConcurrentTrades || 0), 0);
    
    if (totalMaxConcurrentTrades > 100) {
      warnings.push('High number of concurrent trades across all strategies may increase risk');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}