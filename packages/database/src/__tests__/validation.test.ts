import { DataValidator, ValidationError } from '../validation';
import { User, Strategy, Moment, Trade, Notification, BudgetLimits } from '@fastbreak/types';

describe('DataValidator', () => {
  describe('validateUser', () => {
    it('should validate valid user data', () => {
      const user: Partial<User> = {
        walletAddress: '0x1234567890abcdef',
        budgetLimits: {
          dailySpendingCap: 1000,
          maxPricePerMoment: 500,
          totalBudgetLimit: 10000,
          emergencyStopThreshold: 5000,
        },
        strategies: [{
          id: 'strategy-1',
          type: 'rookie_risers',
          parameters: {
            rookieRisers: {
              performanceThreshold: 0.8,
              priceLimit: 300,
              minGamesPlayed: 10,
              maxYearsExperience: 3,
              targetPositions: ['PG', 'SG'],
              minMinutesPerGame: 20,
              efficiencyRatingMin: 15,
              usageRateMin: 18,
              projectedGrowthRate: 0.25,
            }
          },
          isActive: true,
          performance: {
            totalTrades: 0,
            successfulTrades: 0,
            totalProfit: 0,
            averageReturn: 0,
          }
        }]
      };

      expect(() => DataValidator.validateUser(user)).not.toThrow();
    });

    it('should throw error for invalid wallet address', () => {
      const user: Partial<User> = {
        walletAddress: 'invalid-address',
      };

      expect(() => DataValidator.validateUser(user)).toThrow(ValidationError);
      expect(() => DataValidator.validateUser(user)).toThrow('Invalid Flow wallet address format');
    });

    it('should validate nested budget limits', () => {
      const user: Partial<User> = {
        budgetLimits: {
          dailySpendingCap: -100, // Invalid
          maxPricePerMoment: 500,
          totalBudgetLimit: 10000,
          emergencyStopThreshold: 5000,
        }
      };

      expect(() => DataValidator.validateUser(user)).toThrow(ValidationError);
      expect(() => DataValidator.validateUser(user)).toThrow('Daily spending cap must be positive');
    });

    it('should validate nested strategies', () => {
      const user: Partial<User> = {
        strategies: [{
          id: 'strategy-1',
          type: 'invalid_type' as any, // Invalid strategy type
          parameters: {},
          isActive: true,
          performance: {
            totalTrades: 0,
            successfulTrades: 0,
            totalProfit: 0,
            averageReturn: 0,
          }
        }]
      };

      expect(() => DataValidator.validateUser(user)).toThrow(ValidationError);
      expect(() => DataValidator.validateUser(user)).toThrow('Invalid strategy at index 0');
    });
  });

  describe('validateStrategy', () => {
    it('should validate valid strategy', () => {
      const strategy: Partial<Strategy> = {
        type: 'post_game_spikes',
        parameters: {
          postGameSpikes: {
            performanceMetrics: [
              { name: 'points', threshold: 25, comparison: 'greater_than' as const, weight: 0.5 },
              { name: 'rebounds', threshold: 10, comparison: 'greater_than' as const, weight: 0.5 }
            ],
            timeWindow: 24,
            priceChangeThreshold: 0.15,
            volumeThreshold: 100,
            gameTypes: ['regular_season' as const],
            playerTiers: ['superstar' as const],
            momentTypes: ['Dunk'],
            maxPriceMultiplier: 2.0,
            socialSentimentWeight: 0.2,
          }
        },
        isActive: true,
      };

      expect(() => DataValidator.validateStrategy(strategy)).not.toThrow();
    });

    it('should throw error for invalid strategy type', () => {
      const strategy: Partial<Strategy> = {
        type: 'invalid_strategy' as any,
      };

      expect(() => DataValidator.validateStrategy(strategy)).toThrow(ValidationError);
      expect(() => DataValidator.validateStrategy(strategy)).toThrow('Invalid strategy type');
    });
  });

  describe('validateStrategyParameters', () => {
    it('should validate rookie risers parameters', () => {
      const parameters = {
        rookieRisers: {
          performanceThreshold: 0.8,
          priceLimit: 300,
          minGamesPlayed: 10,
          maxYearsExperience: 3,
          targetPositions: ['PG', 'SG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 18,
          projectedGrowthRate: 0.25,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'rookie_risers')).not.toThrow();
    });

    it('should throw error for invalid rookie risers threshold', () => {
      const parameters = {
        rookieRisers: {
          performanceThreshold: 1.5, // Invalid - greater than 1
          priceLimit: 300,
          minGamesPlayed: 10,
          maxYearsExperience: 3,
          targetPositions: ['PG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 18,
          projectedGrowthRate: 0.25,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'rookie_risers')).toThrow(ValidationError);
      expect(() => DataValidator.validateStrategyParameters(parameters, 'rookie_risers')).toThrow('Performance threshold must be between 0 and 1');
    });

    it('should validate post game spikes parameters', () => {
      const parameters = {
        postGameSpikes: {
          performanceMetrics: [
            { name: 'points', threshold: 30, comparison: 'greater_than' as const, weight: 0.6 },
            { name: 'assists', threshold: 8, comparison: 'greater_than' as const, weight: 0.4 }
          ],
          timeWindow: 48,
          priceChangeThreshold: 0.2,
          volumeThreshold: 150,
          gameTypes: ['regular_season' as const, 'playoffs' as const],
          playerTiers: ['all_star' as const],
          momentTypes: ['3-Pointer', 'Assist'],
          maxPriceMultiplier: 3.0,
          socialSentimentWeight: 0.15,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'post_game_spikes')).not.toThrow();
    });

    it('should throw error for empty performance metrics', () => {
      const parameters = {
        postGameSpikes: {
          performanceMetrics: [], // Invalid - empty array
          timeWindow: 48,
          priceChangeThreshold: 0.2,
          volumeThreshold: 100,
          gameTypes: ['regular_season' as const],
          playerTiers: ['superstar' as const],
          momentTypes: ['Dunk'],
          maxPriceMultiplier: 2.0,
          socialSentimentWeight: 0.2,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'post_game_spikes')).toThrow(ValidationError);
      expect(() => DataValidator.validateStrategyParameters(parameters, 'post_game_spikes')).toThrow('Performance metrics must be a non-empty array');
    });

    it('should validate arbitrage mode parameters', () => {
      const parameters = {
        arbitrageMode: {
          priceDifferenceThreshold: 0.1,
          maxExecutionTime: 30,
          marketplaces: ['topshot', 'othermarket'],
          maxRiskScore: 0.7,
          minConfidenceLevel: 0.8,
          slippageTolerance: 0.05,
          maxPositionSize: 1000,
          excludeHighVolatility: true,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'arbitrage_mode')).not.toThrow();
    });

    it('should throw error for invalid arbitrage parameters', () => {
      const parameters = {
        arbitrageMode: {
          priceDifferenceThreshold: -0.1, // Invalid - negative
          maxExecutionTime: 30,
          marketplaces: ['topshot'],
          maxRiskScore: 0.7,
          minConfidenceLevel: 0.8,
          slippageTolerance: 0.05,
          maxPositionSize: 1000,
          excludeHighVolatility: true,
        }
      };

      expect(() => DataValidator.validateStrategyParameters(parameters, 'arbitrage_mode')).toThrow(ValidationError);
      expect(() => DataValidator.validateStrategyParameters(parameters, 'arbitrage_mode')).toThrow('Price difference threshold must be positive');
    });
  });

  describe('validateBudgetLimits', () => {
    it('should validate valid budget limits', () => {
      const budgetLimits: BudgetLimits = {
        dailySpendingCap: 1000,
        maxPricePerMoment: 500,
        totalBudgetLimit: 10000,
        emergencyStopThreshold: 5000,
      };

      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).not.toThrow();
    });

    it('should throw error for negative values', () => {
      const budgetLimits: Partial<BudgetLimits> = {
        dailySpendingCap: -100,
      };

      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow(ValidationError);
      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow('Daily spending cap must be positive');
    });

    it('should throw error for illogical limits', () => {
      const budgetLimits: BudgetLimits = {
        dailySpendingCap: 2000, // Greater than total budget
        maxPricePerMoment: 500,
        totalBudgetLimit: 1000,
        emergencyStopThreshold: 500,
      };

      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow(ValidationError);
      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow('Daily spending cap cannot exceed total budget limit');
    });

    it('should throw error when max price exceeds daily cap', () => {
      const budgetLimits: BudgetLimits = {
        dailySpendingCap: 500,
        maxPricePerMoment: 1000, // Greater than daily cap
        totalBudgetLimit: 10000,
        emergencyStopThreshold: 5000,
      };

      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow(ValidationError);
      expect(() => DataValidator.validateBudgetLimits(budgetLimits)).toThrow('Max price per moment cannot exceed daily spending cap');
    });
  });

  describe('validateMoment', () => {
    it('should validate valid moment', () => {
      const moment: Partial<Moment> = {
        playerId: 'player-123',
        playerName: 'LeBron James',
        serialNumber: 123,
        currentPrice: 150.50,
        aiValuation: 200.00,
        confidence: 0.85,
        scarcityRank: 5,
        gameDate: new Date('2024-01-15'),
      };

      expect(() => DataValidator.validateMoment(moment)).not.toThrow();
    });

    it('should throw error for invalid serial number', () => {
      const moment: Partial<Moment> = {
        serialNumber: -5, // Invalid - negative
      };

      expect(() => DataValidator.validateMoment(moment)).toThrow(ValidationError);
      expect(() => DataValidator.validateMoment(moment)).toThrow('Serial number must be a positive integer');
    });

    it('should throw error for invalid confidence', () => {
      const moment: Partial<Moment> = {
        confidence: 1.5, // Invalid - greater than 1
      };

      expect(() => DataValidator.validateMoment(moment)).toThrow(ValidationError);
      expect(() => DataValidator.validateMoment(moment)).toThrow('Confidence must be between 0 and 1');
    });

    it('should throw error for negative price', () => {
      const moment: Partial<Moment> = {
        currentPrice: -50, // Invalid - negative
      };

      expect(() => DataValidator.validateMoment(moment)).toThrow(ValidationError);
      expect(() => DataValidator.validateMoment(moment)).toThrow('Current price cannot be negative');
    });
  });

  describe('validateTrade', () => {
    it('should validate valid trade', () => {
      const trade: Partial<Trade> = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        momentId: 'moment-123',
        action: 'buy',
        price: 150.50,
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        reasoning: 'AI detected undervalued moment based on recent performance',
      };

      expect(() => DataValidator.validateTrade(trade)).not.toThrow();
    });

    it('should throw error for invalid action', () => {
      const trade: Partial<Trade> = {
        action: 'invalid' as any,
      };

      expect(() => DataValidator.validateTrade(trade)).toThrow(ValidationError);
      expect(() => DataValidator.validateTrade(trade)).toThrow('Trade action must be either "buy" or "sell"');
    });

    it('should throw error for invalid price', () => {
      const trade: Partial<Trade> = {
        price: -100, // Invalid - negative
      };

      expect(() => DataValidator.validateTrade(trade)).toThrow(ValidationError);
      expect(() => DataValidator.validateTrade(trade)).toThrow('Trade price must be positive');
    });

    it('should throw error for invalid UUID', () => {
      const trade: Partial<Trade> = {
        userId: 'invalid-uuid',
      };

      expect(() => DataValidator.validateTrade(trade)).toThrow(ValidationError);
      expect(() => DataValidator.validateTrade(trade)).toThrow('User ID must be a valid UUID');
    });

    it('should throw error for too long reasoning', () => {
      const trade: Partial<Trade> = {
        reasoning: 'a'.repeat(1001), // Too long
      };

      expect(() => DataValidator.validateTrade(trade)).toThrow(ValidationError);
      expect(() => DataValidator.validateTrade(trade)).toThrow('Reasoning cannot exceed 1000 characters');
    });
  });

  describe('validateNotification', () => {
    it('should validate valid notification', () => {
      const notification: Partial<Notification> = {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        type: 'trade',
        title: 'Trade Executed',
        message: 'Successfully purchased LeBron James moment',
        priority: 'medium',
      };

      expect(() => DataValidator.validateNotification(notification)).not.toThrow();
    });

    it('should throw error for invalid type', () => {
      const notification: Partial<Notification> = {
        type: 'invalid' as any,
      };

      expect(() => DataValidator.validateNotification(notification)).toThrow(ValidationError);
      expect(() => DataValidator.validateNotification(notification)).toThrow('Invalid notification type');
    });

    it('should throw error for invalid priority', () => {
      const notification: Partial<Notification> = {
        priority: 'urgent' as any,
      };

      expect(() => DataValidator.validateNotification(notification)).toThrow(ValidationError);
      expect(() => DataValidator.validateNotification(notification)).toThrow('Invalid notification priority');
    });

    it('should throw error for empty title', () => {
      const notification: Partial<Notification> = {
        title: '',
      };

      expect(() => DataValidator.validateNotification(notification)).toThrow(ValidationError);
      expect(() => DataValidator.validateNotification(notification)).toThrow('Title must be between 1 and 255 characters');
    });

    it('should throw error for empty message', () => {
      const notification: Partial<Notification> = {
        message: '',
      };

      expect(() => DataValidator.validateNotification(notification)).toThrow(ValidationError);
      expect(() => DataValidator.validateNotification(notification)).toThrow('Message cannot be empty');
    });
  });

  describe('sanitization methods', () => {
    it('should sanitize strings', () => {
      expect(DataValidator.sanitizeString('  hello   world  ')).toBe('hello world');
      expect(DataValidator.sanitizeString('test\n\nstring')).toBe('test string');
    });

    it('should sanitize numbers', () => {
      expect(DataValidator.sanitizeNumber(123.456789, 2)).toBe(123.46);
      expect(DataValidator.sanitizeNumber(123.456789, 4)).toBe(123.4568);
    });

    it('should sanitize emails', () => {
      expect(DataValidator.sanitizeEmail('  TEST@EXAMPLE.COM  ')).toBe('test@example.com');
    });
  });

  describe('batch validation', () => {
    it('should validate all items in batch', () => {
      const trades: Partial<Trade>[] = [
        { action: 'buy', price: 100 },
        { action: 'sell', price: 150 },
      ];

      expect(() => DataValidator.validateBatch(trades, DataValidator.validateTrade)).not.toThrow();
    });

    it('should collect all validation errors in batch', () => {
      const trades: Partial<Trade>[] = [
        { action: 'invalid' as any, price: 100 },
        { action: 'buy', price: -50 },
      ];

      expect(() => DataValidator.validateBatch(trades, DataValidator.validateTrade)).toThrow(ValidationError);
      expect(() => DataValidator.validateBatch(trades, DataValidator.validateTrade)).toThrow('Batch validation failed');
    });
  });
});