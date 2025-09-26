from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime, date
from enum import Enum

class MomentType(str, Enum):
    DUNK = "dunk"
    THREE_POINTER = "three_pointer"
    ASSIST = "assist"
    STEAL = "steal"
    BLOCK = "block"
    REBOUND = "rebound"
    GAME_WINNER = "game_winner"
    MILESTONE = "milestone"

class MomentRarity(str, Enum):
    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    LEGENDARY = "legendary"
    GENESIS = "genesis"

class MomentAnalysisRequest(BaseModel):
    """Request for moment analysis"""
    moment_id: str
    player_id: str
    moment_type: MomentType
    game_date: date
    serial_number: int
    current_price: float = Field(gt=0)
    marketplace_id: str
    
class MomentValuation(BaseModel):
    """AI valuation result for a moment"""
    moment_id: str
    fair_value: float = Field(gt=0, description="AI calculated fair value")
    confidence_score: float = Field(ge=0, le=1, description="Confidence in valuation")
    price_range_low: float = Field(gt=0, description="Lower bound of price range")
    price_range_high: float = Field(gt=0, description="Upper bound of price range")
    recommendation: str = Field(description="Buy/Hold/Sell recommendation")
    analysis_timestamp: datetime

class ValuationResult(BaseModel):
    """Simplified valuation result for reasoning system"""
    fair_value: float = Field(gt=0, description="AI calculated fair value")
    confidence_score: float = Field(ge=0, le=1, description="Confidence in valuation")
    recommendation: str = Field(description="Buy/Hold/Sell recommendation")
    upside_potential: float = Field(ge=0, description="Upside potential as ratio")
    risk_score: float = Field(ge=0, le=1, description="Overall risk score")
    
class ValuationFactor(BaseModel):
    """Individual factor contributing to moment valuation"""
    factor_type: str = Field(description="Type of valuation factor")
    weight: float = Field(ge=0, le=1, description="Weight in overall valuation")
    value: float = Field(description="Normalized factor value")
    description: str = Field(description="Human readable explanation")
    impact: float = Field(ge=-100, le=100, description="Percentage impact on valuation")
    
class PlayerPerformanceFactor(ValuationFactor):
    """Player performance related valuation factor"""
    recent_games_performance: Dict[str, Any] = Field(default_factory=dict)
    season_performance: Dict[str, Any] = Field(default_factory=dict)
    career_trajectory: str = Field(default="stable")
    clutch_performance: float = Field(ge=0, le=1, default=0.5)
    
class ScarcityFactor(ValuationFactor):
    """Scarcity related valuation factor"""
    serial_number_rarity: float = Field(ge=0, le=1)
    moment_type_rarity: float = Field(ge=0, le=1)
    player_moment_count: int = Field(ge=0)
    total_circulation: int = Field(ge=0)
    
class MarketTrendFactor(ValuationFactor):
    """Market trend related valuation factor"""
    price_momentum: float = Field(ge=-100, le=100)
    volume_trend: float = Field(ge=-100, le=100)
    market_sentiment: float = Field(ge=-1, le=1)
    comparable_sales: List[Dict[str, Any]]
    
class SocialSentimentFactor(ValuationFactor):
    """Social sentiment related valuation factor"""
    social_mentions: int = Field(ge=0)
    sentiment_score: float = Field(ge=-1, le=1)
    viral_potential: float = Field(ge=0, le=100)
    influencer_mentions: int = Field(ge=0)
    
class MomentAnalysisResult(BaseModel):
    """Complete analysis result for a moment"""
    moment_id: str
    player_id: str
    valuation: ValuationResult
    factors: List[ValuationFactor]
    player_analysis: Dict[str, Any]
    market_analysis: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    timestamp: datetime
    recommendations: Optional[List[str]] = []
    analysis_metadata: Optional[Dict[str, Any]] = {}
    
class PriceHistoryPoint(BaseModel):
    """Historical price data point"""
    timestamp: datetime
    price: float = Field(gt=0)
    volume: int = Field(ge=0)
    marketplace: str
    transaction_type: str = Field(description="sale, bid, listing")
    
class MomentPriceHistory(BaseModel):
    """Price history for a moment"""
    moment_id: str
    price_points: List[PriceHistoryPoint]
    current_floor_price: float = Field(gt=0)
    average_sale_price: float = Field(gt=0)
    price_volatility: float = Field(ge=0, description="Price volatility measure")
    trend_direction: str = Field(description="up, down, stable")
    
class ComparableMoment(BaseModel):
    """Comparable moment for valuation reference"""
    moment_id: str
    player_id: str
    moment_type: MomentType
    serial_number: int
    recent_sale_price: float = Field(gt=0)
    sale_date: datetime
    similarity_score: float = Field(ge=0, le=1)
    key_differences: List[str]
    
class MomentComparables(BaseModel):
    """Set of comparable moments for analysis"""
    target_moment_id: str
    comparables: List[ComparableMoment]
    average_comparable_price: float = Field(gt=0)
    price_premium_discount: float = Field(description="Premium/discount vs comparables")
    
class ArbitrageOpportunity(BaseModel):
    """Arbitrage opportunity between marketplaces"""
    moment_id: str
    source_marketplace: str
    target_marketplace: str
    source_price: float = Field(gt=0)
    target_price: float = Field(gt=0)
    profit_potential: float = Field(description="Potential profit amount")
    profit_percentage: float = Field(description="Profit as percentage")
    execution_risk: float = Field(ge=0, le=100, description="Risk of execution failure")
    time_sensitivity: str = Field(description="How quickly opportunity may disappear")
    
class MomentLiquidityAnalysis(BaseModel):
    """Liquidity analysis for a moment"""
    moment_id: str
    daily_volume: float = Field(ge=0)
    bid_ask_spread: float = Field(ge=0, description="Spread between highest bid and lowest ask")
    time_to_sell: float = Field(ge=0, description="Expected time to sell in days")
    market_depth: int = Field(ge=0, description="Number of active buyers/sellers")
    liquidity_score: float = Field(ge=0, le=100, description="Overall liquidity score")
    
class MomentRiskAssessment(BaseModel):
    """Risk assessment for moment investment"""
    moment_id: str
    price_volatility_risk: float = Field(ge=0, le=100)
    liquidity_risk: float = Field(ge=0, le=100)
    player_performance_risk: float = Field(ge=0, le=100)
    market_sentiment_risk: float = Field(ge=0, le=100)
    regulatory_risk: float = Field(ge=0, le=100)
    overall_risk_score: float = Field(ge=0, le=100)
    risk_factors: List[str]
    mitigation_strategies: List[str]
    
class MomentPortfolioImpact(BaseModel):
    """Analysis of how moment fits in portfolio"""
    moment_id: str
    portfolio_correlation: float = Field(ge=-1, le=1)
    diversification_benefit: float = Field(ge=0, le=100)
    concentration_risk: float = Field(ge=0, le=100)
    optimal_position_size: float = Field(ge=0, le=1, description="Recommended portfolio weight")
    
class MomentPrediction(BaseModel):
    """Price prediction for a moment"""
    moment_id: str
    prediction_horizon: str = Field(description="Time horizon for prediction")
    predicted_price: float = Field(gt=0)
    confidence_interval_low: float = Field(gt=0)
    confidence_interval_high: float = Field(gt=0)
    key_assumptions: List[str]
    scenario_analysis: Dict[str, float] = Field(description="Bull/base/bear scenarios")
    
class MomentAlert(BaseModel):
    """Alert configuration for moment monitoring"""
    moment_id: str
    alert_type: str = Field(description="price_drop, volume_spike, etc.")
    threshold_value: float
    current_value: float
    triggered: bool = False
    trigger_timestamp: Optional[datetime] = None
    alert_message: str
    
class MomentRecommendation(BaseModel):
    """Investment recommendation for a moment"""
    moment_id: str
    recommendation_type: str = Field(description="buy, sell, hold, watch")
    target_price: Optional[float] = Field(gt=0)
    stop_loss_price: Optional[float] = Field(gt=0)
    time_horizon: str
    conviction_level: float = Field(ge=0, le=100)
    reasoning: str
    key_catalysts: List[str]
    risks: List[str]