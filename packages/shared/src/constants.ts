// API Endpoints
export const API_ENDPOINTS = {
  USERS: '/api/users',
  STRATEGIES: '/api/strategies',
  TRADES: '/api/trades',
  PORTFOLIO: '/api/portfolio',
  NOTIFICATIONS: '/api/notifications',
  LEADERBOARD: '/api/leaderboard',
  AI_ANALYSIS: '/api/ai/analyze',
  MARKETPLACE: '/api/marketplace',
} as const;

// Strategy Types
export const STRATEGY_TYPES = {
  ROOKIE_RISERS: 'rookie_risers',
  POST_GAME_SPIKES: 'post_game_spikes',
  ARBITRAGE_MODE: 'arbitrage_mode',
} as const;

// Trade Actions
export const TRADE_ACTIONS = {
  BUY: 'buy',
  SELL: 'sell',
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  TRADE: 'trade',
  BUDGET: 'budget',
  SYSTEM: 'system',
  OPPORTUNITY: 'opportunity',
} as const;

// Notification Priorities
export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

// AI Recommendation Types
export const AI_RECOMMENDATIONS = {
  BUY: 'buy',
  HOLD: 'hold',
  SELL: 'sell',
  SKIP: 'skip',
} as const;

// Analysis Factor Types
export const ANALYSIS_FACTOR_TYPES = {
  PLAYER_PERFORMANCE: 'player_performance',
  MARKET_TREND: 'market_trend',
  SCARCITY: 'scarcity',
  SOCIAL_SENTIMENT: 'social_sentiment',
} as const;

// Flow Network Configuration
export const FLOW_NETWORKS = {
  EMULATOR: 'emulator',
  TESTNET: 'testnet',
  MAINNET: 'mainnet',
} as const;

// Default Configuration Values
export const DEFAULT_CONFIG = {
  PAGINATION_LIMIT: 20,
  MAX_DAILY_SPENDING: 1000,
  MAX_PRICE_PER_MOMENT: 500,
  MIN_AI_CONFIDENCE: 0.7,
  CACHE_TTL: 300, // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Wallet not connected',
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance',
  BUDGET_EXCEEDED: 'Budget limit exceeded',
  INVALID_STRATEGY: 'Invalid strategy configuration',
  TRADE_FAILED: 'Trade execution failed',
  UNAUTHORIZED: 'Unauthorized access',
  SERVER_ERROR: 'Internal server error',
} as const;