import { User, Strategy, Moment, Trade, Notification, BudgetLimits, StrategyParameters } from '@fastbreak/types';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DataValidator {
  // User validation
  static validateUser(user: Partial<User>): void {
    if (user.walletAddress && !this.isValidFlowAddress(user.walletAddress)) {
      throw new ValidationError('Invalid Flow wallet address format', 'walletAddress');
    }

    if (user.budgetLimits) {
      this.validateBudgetLimits(user.budgetLimits);
    }

    if (user.strategies) {
      user.strategies.forEach((strategy: any, index: number) => {
        try {
          this.validateStrategy(strategy);
        } catch (error: any) {
          throw new ValidationError(`Invalid strategy at index ${index}: ${error.message}`, `strategies[${index}]`);
        }
      });
    }
  }

  // Strategy validation
  static validateStrategy(strategy: Partial<Strategy>): void {
    if (strategy.type && !['rookie_risers', 'post_game_spikes', 'arbitrage_mode'].includes(strategy.type)) {
      throw new ValidationError('Invalid strategy type', 'type');
    }

    if (strategy.parameters) {
      this.validateStrategyParameters(strategy.parameters, strategy.type);
    }
  }

  // Strategy parameters validation
  static validateStrategyParameters(parameters: StrategyParameters, strategyType?: string): void {
    if (strategyType === 'rookie_risers' && parameters.rookieRisers) {
      const params = parameters.rookieRisers;
      if (params.performanceThreshold < 0 || params.performanceThreshold > 1) {
        throw new ValidationError('Performance threshold must be between 0 and 1', 'performanceThreshold');
      }
      if (params.priceLimit <= 0) {
        throw new ValidationError('Price limit must be positive', 'priceLimit');
      }
      if (params.minGamesPlayed < 0) {
        throw new ValidationError('Minimum games played cannot be negative', 'minGamesPlayed');
      }
      if (params.maxYearsExperience < 0) {
        throw new ValidationError('Maximum years experience cannot be negative', 'maxYearsExperience');
      }
      if (!Array.isArray(params.targetPositions) || params.targetPositions.length === 0) {
        throw new ValidationError('Target positions must be a non-empty array', 'targetPositions');
      }
      if (params.minMinutesPerGame < 0) {
        throw new ValidationError('Minimum minutes per game cannot be negative', 'minMinutesPerGame');
      }
      if (params.efficiencyRatingMin < 0) {
        throw new ValidationError('Efficiency rating minimum cannot be negative', 'efficiencyRatingMin');
      }
      if (params.usageRateMin < 0) {
        throw new ValidationError('Usage rate minimum cannot be negative', 'usageRateMin');
      }
      if (params.projectedGrowthRate < 0) {
        throw new ValidationError('Projected growth rate cannot be negative', 'projectedGrowthRate');
      }
    }

    if (strategyType === 'post_game_spikes' && parameters.postGameSpikes) {
      const params = parameters.postGameSpikes;
      if (params.timeWindow <= 0) {
        throw new ValidationError('Time window must be positive', 'timeWindow');
      }
      if (params.priceChangeThreshold <= 0) {
        throw new ValidationError('Price change threshold must be positive', 'priceChangeThreshold');
      }
      if (!Array.isArray(params.performanceMetrics) || params.performanceMetrics.length === 0) {
        throw new ValidationError('Performance metrics must be a non-empty array', 'performanceMetrics');
      }
      if (params.volumeThreshold <= 0) {
        throw new ValidationError('Volume threshold must be positive', 'volumeThreshold');
      }
      if (!Array.isArray(params.gameTypes) || params.gameTypes.length === 0) {
        throw new ValidationError('Game types must be a non-empty array', 'gameTypes');
      }
      if (!Array.isArray(params.playerTiers) || params.playerTiers.length === 0) {
        throw new ValidationError('Player tiers must be a non-empty array', 'playerTiers');
      }
      if (!Array.isArray(params.momentTypes) || params.momentTypes.length === 0) {
        throw new ValidationError('Moment types must be a non-empty array', 'momentTypes');
      }
      if (params.maxPriceMultiplier <= 0) {
        throw new ValidationError('Max price multiplier must be positive', 'maxPriceMultiplier');
      }
      if (params.socialSentimentWeight < 0 || params.socialSentimentWeight > 1) {
        throw new ValidationError('Social sentiment weight must be between 0 and 1', 'socialSentimentWeight');
      }
    }

    if (strategyType === 'arbitrage_mode' && parameters.arbitrageMode) {
      const params = parameters.arbitrageMode;
      if (params.priceDifferenceThreshold <= 0) {
        throw new ValidationError('Price difference threshold must be positive', 'priceDifferenceThreshold');
      }
      if (params.maxExecutionTime <= 0) {
        throw new ValidationError('Max execution time must be positive', 'maxExecutionTime');
      }
      if (!Array.isArray(params.marketplaces) || params.marketplaces.length === 0) {
        throw new ValidationError('Marketplaces must be a non-empty array', 'marketplaces');
      }
      if (params.maxRiskScore < 0 || params.maxRiskScore > 1) {
        throw new ValidationError('Max risk score must be between 0 and 1', 'maxRiskScore');
      }
      if (params.minConfidenceLevel < 0 || params.minConfidenceLevel > 1) {
        throw new ValidationError('Min confidence level must be between 0 and 1', 'minConfidenceLevel');
      }
      if (params.slippageTolerance < 0) {
        throw new ValidationError('Slippage tolerance cannot be negative', 'slippageTolerance');
      }
      if (params.maxPositionSize <= 0) {
        throw new ValidationError('Max position size must be positive', 'maxPositionSize');
      }
    }
  }

  // Budget limits validation
  static validateBudgetLimits(budgetLimits: Partial<BudgetLimits>): void {
    if (budgetLimits.dailySpendingCap !== undefined && budgetLimits.dailySpendingCap <= 0) {
      throw new ValidationError('Daily spending cap must be positive', 'dailySpendingCap');
    }

    if (budgetLimits.maxPricePerMoment !== undefined && budgetLimits.maxPricePerMoment <= 0) {
      throw new ValidationError('Max price per moment must be positive', 'maxPricePerMoment');
    }

    if (budgetLimits.totalBudgetLimit !== undefined && budgetLimits.totalBudgetLimit <= 0) {
      throw new ValidationError('Total budget limit must be positive', 'totalBudgetLimit');
    }

    if (budgetLimits.emergencyStopThreshold !== undefined && budgetLimits.emergencyStopThreshold <= 0) {
      throw new ValidationError('Emergency stop threshold must be positive', 'emergencyStopThreshold');
    }

    // Logical validations
    if (budgetLimits.dailySpendingCap && budgetLimits.totalBudgetLimit && 
        budgetLimits.dailySpendingCap > budgetLimits.totalBudgetLimit) {
      throw new ValidationError('Daily spending cap cannot exceed total budget limit', 'dailySpendingCap');
    }

    if (budgetLimits.maxPricePerMoment && budgetLimits.dailySpendingCap && 
        budgetLimits.maxPricePerMoment > budgetLimits.dailySpendingCap) {
      throw new ValidationError('Max price per moment cannot exceed daily spending cap', 'maxPricePerMoment');
    }
  }

  // Moment validation
  static validateMoment(moment: Partial<Moment>): void {
    if (moment.playerId && !this.isValidString(moment.playerId)) {
      throw new ValidationError('Player ID is required and must be a valid string', 'playerId');
    }

    if (moment.playerName && !this.isValidString(moment.playerName)) {
      throw new ValidationError('Player name is required and must be a valid string', 'playerName');
    }

    if (moment.serialNumber !== undefined && (!Number.isInteger(moment.serialNumber) || moment.serialNumber <= 0)) {
      throw new ValidationError('Serial number must be a positive integer', 'serialNumber');
    }

    if (moment.currentPrice !== undefined && moment.currentPrice < 0) {
      throw new ValidationError('Current price cannot be negative', 'currentPrice');
    }

    if (moment.aiValuation !== undefined && moment.aiValuation < 0) {
      throw new ValidationError('AI valuation cannot be negative', 'aiValuation');
    }

    if (moment.confidence !== undefined && (moment.confidence < 0 || moment.confidence > 1)) {
      throw new ValidationError('Confidence must be between 0 and 1', 'confidence');
    }

    if (moment.scarcityRank !== undefined && (!Number.isInteger(moment.scarcityRank) || moment.scarcityRank <= 0)) {
      throw new ValidationError('Scarcity rank must be a positive integer', 'scarcityRank');
    }

    if (moment.gameDate && !this.isValidDate(moment.gameDate)) {
      throw new ValidationError('Game date must be a valid date', 'gameDate');
    }
  }

  // Trade validation
  static validateTrade(trade: Partial<Trade>): void {
    if (trade.action && !['buy', 'sell'].includes(trade.action)) {
      throw new ValidationError('Trade action must be either "buy" or "sell"', 'action');
    }

    if (trade.price !== undefined && trade.price <= 0) {
      throw new ValidationError('Trade price must be positive', 'price');
    }

    if (trade.userId && !this.isValidUUID(trade.userId)) {
      throw new ValidationError('User ID must be a valid UUID', 'userId');
    }

    if (trade.momentId && !this.isValidString(trade.momentId)) {
      throw new ValidationError('Moment ID is required and must be a valid string', 'momentId');
    }

    if (trade.transactionHash && !this.isValidTransactionHash(trade.transactionHash)) {
      throw new ValidationError('Transaction hash must be a valid hex string', 'transactionHash');
    }

    if (trade.reasoning && trade.reasoning.length > 1000) {
      throw new ValidationError('Reasoning cannot exceed 1000 characters', 'reasoning');
    }
  }

  // Notification validation
  static validateNotification(notification: Partial<Notification>): void {
    if (notification.type && !['trade', 'budget', 'system', 'opportunity'].includes(notification.type)) {
      throw new ValidationError('Invalid notification type', 'type');
    }

    if (notification.priority && !['low', 'medium', 'high'].includes(notification.priority)) {
      throw new ValidationError('Invalid notification priority', 'priority');
    }

    if (notification.title !== undefined && (notification.title.length === 0 || notification.title.length > 255)) {
      throw new ValidationError('Title must be between 1 and 255 characters', 'title');
    }

    if (notification.message !== undefined && notification.message.length === 0) {
      throw new ValidationError('Message cannot be empty', 'message');
    }

    if (notification.userId && !this.isValidUUID(notification.userId)) {
      throw new ValidationError('User ID must be a valid UUID', 'userId');
    }
  }

  // Helper validation methods
  private static isValidString(value: string): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private static isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  private static isValidFlowAddress(address: string): boolean {
    // Flow addresses are 16 characters long and start with '0x'
    const flowAddressRegex = /^0x[a-fA-F0-9]{16}$/;
    return flowAddressRegex.test(address);
  }

  private static isValidTransactionHash(hash: string): boolean {
    // Transaction hashes are typically 64 character hex strings with 0x prefix
    const hashRegex = /^0x[a-fA-F0-9]{64}$/;
    return hashRegex.test(hash);
  }

  private static isValidDate(date: Date): boolean {
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Sanitization methods
  static sanitizeString(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  static sanitizeNumber(value: number, decimals = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  static sanitizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  // Batch validation
  static validateBatch<T>(items: T[], validator: (item: T) => void): void {
    const errors: { index: number; error: ValidationError }[] = [];

    items.forEach((item, index) => {
      try {
        validator(item);
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push({ index, error });
        } else {
          errors.push({ index, error: new ValidationError((error as any).message) });
        }
      }
    });

    if (errors.length > 0) {
      const errorMessage = errors
        .map(({ index, error }) => `Item ${index}: ${error.message}`)
        .join('; ');
      throw new ValidationError(`Batch validation failed: ${errorMessage}`);
    }
  }
}

// Export validation functions for convenience
export const validateUser = DataValidator.validateUser.bind(DataValidator);
export const validateStrategy = DataValidator.validateStrategy.bind(DataValidator);
export const validateMoment = DataValidator.validateMoment.bind(DataValidator);
export const validateTrade = DataValidator.validateTrade.bind(DataValidator);
export const validateNotification = DataValidator.validateNotification.bind(DataValidator);
export const validateBudgetLimits = DataValidator.validateBudgetLimits.bind(DataValidator);