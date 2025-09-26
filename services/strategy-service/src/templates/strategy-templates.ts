import { StrategyTemplate, ParameterSchema } from '../types/strategy';

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'rookie_risers_basic',
    name: 'Rookie Risers - Basic',
    type: 'rookie_risers',
    description: 'Identifies promising rookie players with strong early performance indicators and growth potential.',
    category: 'performance_based',
    difficulty: 'beginner',
    defaultParameters: {
      rookieRisers: {
        performanceThreshold: 0.75,
        priceLimit: 200,
        minGamesPlayed: 10,
        maxYearsExperience: 2,
        targetPositions: ['PG', 'SG', 'SF'],
        minMinutesPerGame: 20,
        efficiencyRatingMin: 15,
        usageRateMin: 0.18,
        projectedGrowthRate: 0.15,
      },
    },
    parameterSchema: {
      'rookieRisers.performanceThreshold': {
        type: 'number',
        required: true,
        min: 0.5,
        max: 1.0,
        description: 'Minimum performance threshold (0.5-1.0)',
      },
      'rookieRisers.priceLimit': {
        type: 'number',
        required: true,
        min: 50,
        max: 1000,
        description: 'Maximum price per moment ($)',
      },
      'rookieRisers.minGamesPlayed': {
        type: 'number',
        required: true,
        min: 5,
        max: 50,
        description: 'Minimum games played this season',
      },
      'rookieRisers.maxYearsExperience': {
        type: 'number',
        required: true,
        min: 1,
        max: 3,
        description: 'Maximum years of NBA experience',
      },
      'rookieRisers.targetPositions': {
        type: 'array',
        required: true,
        options: ['PG', 'SG', 'SF', 'PF', 'C'],
        description: 'Target player positions',
      },
    },
    riskLevel: 'medium',
    expectedReturn: {
      min: 10,
      max: 50,
      timeframe: '3-6 months',
    },
    tags: ['rookie', 'growth', 'performance', 'beginner-friendly'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'post_game_spikes_aggressive',
    name: 'Post-Game Spikes - Aggressive',
    type: 'post_game_spikes',
    description: 'Capitalizes on immediate price movements following exceptional game performances.',
    category: 'time_based',
    difficulty: 'intermediate',
    defaultParameters: {
      postGameSpikes: {
        performanceMetrics: [
          { name: 'points', threshold: 30, comparison: 'greater_than', weight: 0.4 },
          { name: 'rebounds', threshold: 12, comparison: 'greater_than', weight: 0.2 },
          { name: 'assists', threshold: 8, comparison: 'greater_than', weight: 0.2 },
          { name: 'efficiency', threshold: 25, comparison: 'greater_than', weight: 0.2 },
        ],
        timeWindow: 2, // 2 hours after game
        priceChangeThreshold: 0.05,
        volumeThreshold: 2.0,
        gameTypes: ['regular_season', 'playoffs'],
        playerTiers: ['superstar', 'all_star'],
        momentTypes: ['dunk', 'three_pointer', 'game_winner'],
        maxPriceMultiplier: 1.5,
        socialSentimentWeight: 0.3,
      },
    },
    parameterSchema: {
      'postGameSpikes.timeWindow': {
        type: 'number',
        required: true,
        min: 0.5,
        max: 24,
        description: 'Time window after game to monitor (hours)',
      },
      'postGameSpikes.priceChangeThreshold': {
        type: 'number',
        required: true,
        min: 0.02,
        max: 0.2,
        description: 'Minimum price change threshold (5% = 0.05)',
      },
      'postGameSpikes.volumeThreshold': {
        type: 'number',
        required: true,
        min: 1.5,
        max: 5.0,
        description: 'Volume spike multiplier',
      },
    },
    riskLevel: 'high',
    expectedReturn: {
      min: 5,
      max: 30,
      timeframe: '1-7 days',
    },
    tags: ['momentum', 'short-term', 'performance', 'aggressive'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'arbitrage_conservative',
    name: 'Arbitrage - Conservative',
    type: 'arbitrage_mode',
    description: 'Low-risk arbitrage opportunities across multiple marketplaces with strict safety controls.',
    category: 'market_based',
    difficulty: 'advanced',
    defaultParameters: {
      arbitrageMode: {
        priceDifferenceThreshold: 0.08, // 8% minimum profit
        maxExecutionTime: 300, // 5 minutes
        marketplaces: ['topshot', 'othermarket'],
        maxRiskScore: 30,
        minConfidenceLevel: 0.8,
        slippageTolerance: 0.02,
        maxPositionSize: 500,
        excludeHighVolatility: true,
      },
    },
    parameterSchema: {
      'arbitrageMode.priceDifferenceThreshold': {
        type: 'number',
        required: true,
        min: 0.03,
        max: 0.2,
        description: 'Minimum price difference for arbitrage (8% = 0.08)',
      },
      'arbitrageMode.maxExecutionTime': {
        type: 'number',
        required: true,
        min: 60,
        max: 1800,
        description: 'Maximum execution time (seconds)',
      },
      'arbitrageMode.maxRiskScore': {
        type: 'number',
        required: true,
        min: 10,
        max: 80,
        description: 'Maximum acceptable risk score (0-100)',
      },
    },
    riskLevel: 'low',
    expectedReturn: {
      min: 3,
      max: 15,
      timeframe: 'Minutes to hours',
    },
    tags: ['arbitrage', 'low-risk', 'market-neutral', 'advanced'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'value_investing_patient',
    name: 'Value Investing - Patient',
    type: 'value_investing',
    description: 'Long-term value investing strategy focusing on undervalued moments with strong fundamentals.',
    category: 'performance_based',
    difficulty: 'intermediate',
    defaultParameters: {
      valueInvesting: {
        maxPriceToValue: 0.8, // Buy when price is 80% or less of AI valuation
        minAIConfidence: 0.75,
        holdingPeriod: 90, // 3 months
        targetPlayers: [], // Empty means all players
        momentRarityMin: 0.6,
        historicalPerformanceWeight: 0.4,
        marketSentimentWeight: 0.2,
        fundamentalAnalysisWeight: 0.4,
      },
    },
    parameterSchema: {
      'valueInvesting.maxPriceToValue': {
        type: 'number',
        required: true,
        min: 0.5,
        max: 1.0,
        description: 'Maximum price to AI valuation ratio',
      },
      'valueInvesting.minAIConfidence': {
        type: 'number',
        required: true,
        min: 0.6,
        max: 0.95,
        description: 'Minimum AI confidence level',
      },
      'valueInvesting.holdingPeriod': {
        type: 'number',
        required: true,
        min: 30,
        max: 365,
        description: 'Target holding period (days)',
      },
    },
    riskLevel: 'medium',
    expectedReturn: {
      min: 15,
      max: 60,
      timeframe: '3-12 months',
    },
    tags: ['value', 'long-term', 'fundamental-analysis', 'patient'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'momentum_trading_active',
    name: 'Momentum Trading - Active',
    type: 'momentum_trading',
    description: 'Active momentum trading strategy that rides price and volume trends for quick profits.',
    category: 'market_based',
    difficulty: 'advanced',
    defaultParameters: {
      momentumTrading: {
        priceVelocityThreshold: 0.15, // 15% price movement
        volumeVelocityThreshold: 3.0, // 3x volume increase
        trendDuration: 4, // 4 hours minimum trend
        momentumIndicators: ['price_rsi', 'volume_rsi', 'macd'],
        stopLossPercentage: 0.08, // 8% stop loss
        takeProfitPercentage: 0.20, // 20% take profit
        maxHoldingTime: 48, // 48 hours max
      },
    },
    parameterSchema: {
      'momentumTrading.priceVelocityThreshold': {
        type: 'number',
        required: true,
        min: 0.05,
        max: 0.3,
        description: 'Price velocity threshold (15% = 0.15)',
      },
      'momentumTrading.stopLossPercentage': {
        type: 'number',
        required: true,
        min: 0.03,
        max: 0.15,
        description: 'Stop loss percentage (8% = 0.08)',
      },
      'momentumTrading.takeProfitPercentage': {
        type: 'number',
        required: true,
        min: 0.1,
        max: 0.5,
        description: 'Take profit percentage (20% = 0.20)',
      },
    },
    riskLevel: 'high',
    expectedReturn: {
      min: 8,
      max: 40,
      timeframe: '1-7 days',
    },
    tags: ['momentum', 'active', 'technical-analysis', 'short-term'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'contrarian_patient',
    name: 'Contrarian - Patient',
    type: 'contrarian',
    description: 'Contrarian strategy that buys when others are selling and sells when others are buying.',
    category: 'hybrid',
    difficulty: 'advanced',
    defaultParameters: {
      contrarian: {
        oversoldThreshold: 0.3, // RSI below 30
        overboughtThreshold: 0.7, // RSI above 70
        reversalConfirmationPeriod: 12, // 12 hours
        maxDrawdownTolerance: 0.15, // 15% max drawdown
        contraryIndicators: ['rsi', 'sentiment', 'volume_divergence'],
        marketSentimentInversion: true,
      },
    },
    parameterSchema: {
      'contrarian.oversoldThreshold': {
        type: 'number',
        required: true,
        min: 0.2,
        max: 0.4,
        description: 'Oversold threshold (0.3 = RSI 30)',
      },
      'contrarian.overboughtThreshold': {
        type: 'number',
        required: true,
        min: 0.6,
        max: 0.8,
        description: 'Overbought threshold (0.7 = RSI 70)',
      },
      'contrarian.maxDrawdownTolerance': {
        type: 'number',
        required: true,
        min: 0.1,
        max: 0.25,
        description: 'Maximum drawdown tolerance (15% = 0.15)',
      },
    },
    riskLevel: 'high',
    expectedReturn: {
      min: 10,
      max: 45,
      timeframe: '2-8 weeks',
    },
    tags: ['contrarian', 'counter-trend', 'patient', 'advanced'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export function getTemplateById(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find(template => template.id === id);
}

export function getTemplatesByType(type: string): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter(template => template.type === type);
}

export function getTemplatesByDifficulty(difficulty: string): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter(template => template.difficulty === difficulty);
}

export function getTemplatesByRiskLevel(riskLevel: string): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter(template => template.riskLevel === riskLevel);
}

export function searchTemplates(query: string): StrategyTemplate[] {
  const lowerQuery = query.toLowerCase();
  return STRATEGY_TEMPLATES.filter(template => 
    template.name.toLowerCase().includes(lowerQuery) ||
    template.description.toLowerCase().includes(lowerQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}