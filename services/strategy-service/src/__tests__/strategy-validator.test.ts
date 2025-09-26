import { StrategyValidator } from '../validators/strategy-validator';
import { StrategyParameters, RiskControls } from '../types/strategy';

describe('StrategyValidator', () => {
  
  describe('validateStrategyParameters', () => {
    it('should validate rookie risers parameters correctly', () => {
      const parameters: StrategyParameters = {
        rookieRisers: {
          performanceThreshold: 0.75,
          priceLimit: 200,
          minGamesPlayed: 10,
          maxYearsExperience: 2,
          targetPositions: ['PG', 'SG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 0.18,
          projectedGrowthRate: 0.15,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'rookie_risers_basic');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid rookie risers parameters', () => {
      const parameters: StrategyParameters = {
        rookieRisers: {
          performanceThreshold: 1.5, // Invalid: > 1.0
          priceLimit: -100, // Invalid: negative
          minGamesPlayed: 0, // Invalid: < 1
          maxYearsExperience: 2,
          targetPositions: [], // Invalid: empty array
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 0.18,
          projectedGrowthRate: 0.15,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'rookie_risers_basic');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate post-game spikes parameters with weight validation', () => {
      const parameters: StrategyParameters = {
        postGameSpikes: {
          performanceMetrics: [
            { name: 'points', threshold: 30, comparison: 'greater_than', weight: 0.5 },
            { name: 'rebounds', threshold: 12, comparison: 'greater_than', weight: 0.3 },
            { name: 'assists', threshold: 8, comparison: 'greater_than', weight: 0.2 },
          ],
          timeWindow: 2,
          priceChangeThreshold: 0.05,
          volumeThreshold: 2.0,
          gameTypes: ['regular_season'],
          playerTiers: ['superstar'],
          momentTypes: ['dunk'],
          maxPriceMultiplier: 1.5,
          socialSentimentWeight: 0.3,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'post_game_spikes_aggressive');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject post-game spikes with invalid weight sum', () => {
      const parameters: StrategyParameters = {
        postGameSpikes: {
          performanceMetrics: [
            { name: 'points', threshold: 30, comparison: 'greater_than', weight: 0.6 },
            { name: 'rebounds', threshold: 12, comparison: 'greater_than', weight: 0.6 }, // Total > 1.0
          ],
          timeWindow: 2,
          priceChangeThreshold: 0.05,
          volumeThreshold: 2.0,
          gameTypes: ['regular_season'],
          playerTiers: ['superstar'],
          momentTypes: ['dunk'],
          maxPriceMultiplier: 1.5,
          socialSentimentWeight: 0.3,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'post_game_spikes_aggressive');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('weights must sum to 1.0'))).toBe(true);
    });

    it('should validate arbitrage mode parameters', () => {
      const parameters: StrategyParameters = {
        arbitrageMode: {
          priceDifferenceThreshold: 0.08,
          maxExecutionTime: 300,
          marketplaces: ['topshot', 'othermarket'],
          maxRiskScore: 30,
          minConfidenceLevel: 0.8,
          slippageTolerance: 0.02,
          maxPositionSize: 500,
          excludeHighVolatility: true,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'arbitrage_conservative');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate momentum trading with stop loss < take profit', () => {
      const parameters: StrategyParameters = {
        momentumTrading: {
          priceVelocityThreshold: 0.15,
          volumeVelocityThreshold: 3.0,
          trendDuration: 4,
          momentumIndicators: ['price_rsi', 'volume_rsi'],
          stopLossPercentage: 0.08,
          takeProfitPercentage: 0.20,
          maxHoldingTime: 48,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'momentum_trading_active');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject momentum trading with stop loss >= take profit', () => {
      const parameters: StrategyParameters = {
        momentumTrading: {
          priceVelocityThreshold: 0.15,
          volumeVelocityThreshold: 3.0,
          trendDuration: 4,
          momentumIndicators: ['price_rsi'],
          stopLossPercentage: 0.25, // Higher than take profit
          takeProfitPercentage: 0.20,
          maxHoldingTime: 48,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'momentum_trading_active');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Stop loss percentage must be less than take profit percentage'))).toBe(true);
    });

    it('should reject invalid template ID', () => {
      const parameters: StrategyParameters = {
        rookieRisers: {
          performanceThreshold: 0.75,
          priceLimit: 200,
          minGamesPlayed: 10,
          maxYearsExperience: 2,
          targetPositions: ['PG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 0.18,
          projectedGrowthRate: 0.15,
        },
      };

      const result = StrategyValidator.validateStrategyParameters(parameters, 'invalid_template');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid template ID');
    });
  });

  describe('validateRiskControls', () => {
    it('should validate correct risk controls', () => {
      const riskControls: RiskControls = {
        maxDailyLoss: 500,
        maxPositionSize: 200,
        maxConcurrentTrades: 5,
        stopLossPercentage: 0.1,
        takeProfitPercentage: 0.2,
        cooldownPeriod: 300,
        blacklistedPlayers: [],
        blacklistedMoments: [],
        maxPricePerMoment: 1000,
        requireManualApproval: false,
        emergencyStop: {
          enabled: true,
          triggerConditions: [
            {
              type: 'loss_threshold',
              threshold: 0.15,
              isActive: true,
            },
          ],
        },
      };

      const result = StrategyValidator.validateRiskControls(riskControls);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject risk controls with stop loss >= take profit', () => {
      const riskControls: RiskControls = {
        maxDailyLoss: 500,
        maxPositionSize: 200,
        maxConcurrentTrades: 5,
        stopLossPercentage: 0.25, // Higher than take profit
        takeProfitPercentage: 0.2,
        cooldownPeriod: 300,
        blacklistedPlayers: [],
        blacklistedMoments: [],
        maxPricePerMoment: 1000,
        requireManualApproval: false,
        emergencyStop: {
          enabled: true,
          triggerConditions: [],
        },
      };

      const result = StrategyValidator.validateRiskControls(riskControls);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Stop loss percentage must be less than take profit percentage'))).toBe(true);
    });

    it('should reject invalid emergency stop conditions', () => {
      const riskControls: RiskControls = {
        maxDailyLoss: 500,
        maxPositionSize: 200,
        maxConcurrentTrades: 5,
        stopLossPercentage: 0.1,
        takeProfitPercentage: 0.2,
        cooldownPeriod: 300,
        blacklistedPlayers: [],
        blacklistedMoments: [],
        maxPricePerMoment: 1000,
        requireManualApproval: false,
        emergencyStop: {
          enabled: true,
          triggerConditions: [
            {
              type: 'invalid_type' as any, // Invalid type
              threshold: 0.15,
              isActive: true,
            },
          ],
        },
      };

      const result = StrategyValidator.validateRiskControls(riskControls);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateParameterUpdate', () => {
    it('should validate parameter updates and provide warnings for significant changes', () => {
      const currentParameters: StrategyParameters = {
        rookieRisers: {
          performanceThreshold: 0.5,
          priceLimit: 200,
          minGamesPlayed: 10,
          maxYearsExperience: 2,
          targetPositions: ['PG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 0.18,
          projectedGrowthRate: 0.15,
        },
      };

      const newParameters: Partial<StrategyParameters> = {
        rookieRisers: {
          performanceThreshold: 0.9, // Significant change
          priceLimit: 250,
          minGamesPlayed: 10,
          maxYearsExperience: 2,
          targetPositions: ['PG'],
          minMinutesPerGame: 20,
          efficiencyRatingMin: 15,
          usageRateMin: 0.18,
          projectedGrowthRate: 0.15,
        },
      };

      const result = StrategyValidator.validateParameterUpdate(
        currentParameters,
        newParameters,
        'rookie_risers_basic'
      );

      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(warning => warning.includes('Large change in performance threshold'))).toBe(true);
    });
  });

  describe('validateCompatibility', () => {
    it('should detect budget allocation exceeding 100%', () => {
      const strategies = [
        {
          budgetAllocation: { percentage: 0.6, maxAmount: 1000, dailyLimit: 100 },
          isActive: true,
        },
        {
          budgetAllocation: { percentage: 0.5, maxAmount: 1000, dailyLimit: 100 },
          isActive: true,
        },
      ] as any[];

      const result = StrategyValidator.validateCompatibility(strategies);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Total budget allocation exceeds 100%'))).toBe(true);
    });

    it('should warn about conflicting strategy types', () => {
      const strategies = [
        {
          templateId: 'contrarian_patient',
          budgetAllocation: { percentage: 0.3, maxAmount: 1000, dailyLimit: 100 },
          riskControls: { maxConcurrentTrades: 5 },
          isActive: true,
        },
        {
          templateId: 'momentum_trading_active',
          budgetAllocation: { percentage: 0.4, maxAmount: 1000, dailyLimit: 100 },
          riskControls: { maxConcurrentTrades: 5 },
          isActive: true,
        },
      ] as any[];

      const result = StrategyValidator.validateCompatibility(strategies);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('Contrarian and momentum strategies may conflict'))).toBe(true);
    });

    it('should pass validation for compatible strategies', () => {
      const strategies = [
        {
          templateId: 'rookie_risers_basic',
          budgetAllocation: { percentage: 0.3, maxAmount: 1000, dailyLimit: 100 },
          riskControls: { maxConcurrentTrades: 3 },
          isActive: true,
        },
        {
          templateId: 'arbitrage_conservative',
          budgetAllocation: { percentage: 0.4, maxAmount: 1000, dailyLimit: 100 },
          riskControls: { maxConcurrentTrades: 2 },
          isActive: true,
        },
      ] as any[];

      const result = StrategyValidator.validateCompatibility(strategies);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});