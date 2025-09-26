from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum

class ReasoningFactorType(str, Enum):
    PLAYER_PERFORMANCE = "player_performance"
    MARKET_TREND = "market_trend"
    SCARCITY = "scarcity"
    SOCIAL_SENTIMENT = "social_sentiment"
    TECHNICAL_ANALYSIS = "technical_analysis"
    FUNDAMENTAL_ANALYSIS = "fundamental_analysis"
    RISK_ASSESSMENT = "risk_assessment"

class ReasoningFactor(BaseModel):
    """Individual reasoning factor with detailed explanation"""
    factor_type: ReasoningFactorType
    name: str = Field(description="Human-readable factor name")
    weight: float = Field(ge=0, le=1, description="Weight in overall decision")
    value: float = Field(description="Normalized factor value")
    raw_value: Optional[float] = Field(default=None, description="Raw value before normalization")
    impact: float = Field(ge=-100, le=100, description="Percentage impact on decision")
    confidence: float = Field(ge=0, le=1, description="Confidence in this factor")
    description: str = Field(description="Detailed explanation of the factor")
    supporting_data: Dict[str, Any] = Field(default_factory=dict, description="Supporting statistics and data")
    
class PlayerPerformanceReasoning(BaseModel):
    """Detailed reasoning for player performance factors"""
    recent_games_analysis: str
    season_performance_context: str
    career_trajectory: str
    clutch_performance_note: str
    injury_status: str
    team_context: str
    matchup_analysis: str
    statistical_highlights: List[str]
    performance_trends: Dict[str, float]
    
class MarketContextReasoning(BaseModel):
    """Market context and trend reasoning"""
    price_trend_analysis: str
    volume_analysis: str
    comparable_sales_context: str
    market_sentiment: str
    liquidity_assessment: str
    arbitrage_opportunities: List[str]
    market_inefficiencies: List[str]
    timing_factors: List[str]
    
class ScarcityReasoning(BaseModel):
    """Scarcity and rarity reasoning"""
    serial_number_significance: str
    moment_type_rarity: str
    player_moment_availability: str
    circulation_analysis: str
    collector_demand: str
    historical_scarcity_premium: str
    future_scarcity_projection: str
    
class AIReasoningResult(BaseModel):
    """Complete AI reasoning result for a decision"""
    moment_id: str
    decision: str = Field(description="Final decision: buy, sell, hold, skip")
    confidence_score: float = Field(ge=0, le=1, description="Overall confidence in decision")
    factors: List[ReasoningFactor] = Field(description="All factors considered")
    primary_reasoning: str = Field(description="Main reason for the decision")
    supporting_reasons: List[str] = Field(description="Additional supporting reasons")
    risk_factors: List[str] = Field(description="Identified risks")
    key_statistics: Dict[str, Any] = Field(description="Key stats that influenced decision")
    market_context: MarketContextReasoning
    player_analysis: PlayerPerformanceReasoning
    scarcity_analysis: ScarcityReasoning
    timestamp: datetime = Field(default_factory=datetime.now)
    analysis_version: str = Field(default="1.0", description="Version of analysis algorithm")
    
class ReasoningTemplate(BaseModel):
    """Template for generating human-readable reasoning"""
    template_id: str
    decision_type: str
    template_text: str
    required_variables: List[str]
    optional_variables: List[str]
    
class ReasoningHistory(BaseModel):
    """Historical reasoning record for tracking and learning"""
    id: str
    moment_id: str
    user_id: Optional[str] = None
    reasoning_result: AIReasoningResult
    actual_outcome: Optional[Dict[str, Any]] = None
    outcome_timestamp: Optional[datetime] = None
    accuracy_score: Optional[float] = Field(default=None, ge=0, le=1, description="How accurate the reasoning was")
    lessons_learned: List[str] = Field(default_factory=list)
    
class ReasoningSearchQuery(BaseModel):
    """Query parameters for searching reasoning history"""
    moment_ids: Optional[List[str]] = None
    player_ids: Optional[List[str]] = None
    decision_types: Optional[List[str]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    factor_types: Optional[List[ReasoningFactorType]] = None
    keywords: Optional[List[str]] = None
    limit: int = Field(default=50, le=1000)
    offset: int = Field(default=0, ge=0)
    
class ReasoningSearchResult(BaseModel):
    """Search results for reasoning history"""
    total_count: int
    results: List[ReasoningHistory]
    aggregations: Dict[str, Any] = Field(description="Aggregated statistics")
    
class ReasoningInsight(BaseModel):
    """Insights derived from reasoning analysis"""
    insight_type: str
    title: str
    description: str
    supporting_evidence: List[str]
    confidence: float = Field(ge=0, le=1)
    actionable_recommendation: str
    
class ReasoningPerformanceMetrics(BaseModel):
    """Performance metrics for reasoning system"""
    total_decisions: int
    accuracy_rate: float = Field(ge=0, le=1)
    confidence_calibration: float = Field(ge=0, le=1, description="How well confidence matches accuracy")
    factor_importance_ranking: Dict[str, float]
    common_failure_modes: List[str]
    improvement_suggestions: List[str]
    
class ReasoningExplanation(BaseModel):
    """Human-friendly explanation of AI reasoning"""
    summary: str = Field(description="One-sentence summary of the decision")
    detailed_explanation: str = Field(description="Detailed explanation in plain English")
    key_factors: List[str] = Field(description="Top 3-5 most important factors")
    supporting_stats: Dict[str, str] = Field(description="Key statistics with explanations")
    market_context: str = Field(description="Market context explanation")
    risk_assessment: str = Field(description="Risk explanation")
    confidence_explanation: str = Field(description="Why this confidence level")
    what_could_change_decision: List[str] = Field(description="What factors could change this decision")
    
class ReasoningVisualization(BaseModel):
    """Data structure for reasoning visualization"""
    factor_weights_chart: Dict[str, float]
    confidence_breakdown: Dict[str, float]
    historical_accuracy: List[Dict[str, Any]]
    factor_correlation_matrix: Dict[str, Dict[str, float]]
    decision_tree_data: Dict[str, Any]