from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import date, datetime
from enum import Enum

class PlayerPosition(str, Enum):
    POINT_GUARD = "PG"
    SHOOTING_GUARD = "SG"
    SMALL_FORWARD = "SF"
    POWER_FORWARD = "PF"
    CENTER = "C"

class GameStats(BaseModel):
    """Individual game statistics for a player"""
    game_id: str
    player_id: str
    game_date: date
    opponent: str
    minutes_played: float = Field(ge=0, le=48)
    points: int = Field(ge=0)
    rebounds: int = Field(ge=0)
    assists: int = Field(ge=0)
    steals: int = Field(ge=0)
    blocks: int = Field(ge=0)
    turnovers: int = Field(ge=0)
    field_goals_made: int = Field(ge=0)
    field_goals_attempted: int = Field(ge=0)
    three_pointers_made: int = Field(ge=0)
    three_pointers_attempted: int = Field(ge=0)
    free_throws_made: int = Field(ge=0)
    free_throws_attempted: int = Field(ge=0)
    personal_fouls: int = Field(ge=0)
    plus_minus: Optional[int] = None
    
    @property
    def field_goal_percentage(self) -> float:
        if self.field_goals_attempted == 0:
            return 0.0
        return self.field_goals_made / self.field_goals_attempted
    
    @property
    def three_point_percentage(self) -> float:
        if self.three_pointers_attempted == 0:
            return 0.0
        return self.three_pointers_made / self.three_pointers_attempted
    
    @property
    def free_throw_percentage(self) -> float:
        if self.free_throws_attempted == 0:
            return 0.0
        return self.free_throws_made / self.free_throws_attempted
    
    @property
    def efficiency_rating(self) -> float:
        """Calculate basic efficiency rating"""
        return (
            self.points + self.rebounds + self.assists + self.steals + self.blocks
            - (self.field_goals_attempted - self.field_goals_made)
            - (self.free_throws_attempted - self.free_throws_made)
            - self.turnovers
        )

class SeasonStats(BaseModel):
    """Season averages and totals for a player"""
    player_id: str
    season: str
    team: str
    position: PlayerPosition
    games_played: int = Field(ge=0)
    games_started: int = Field(ge=0)
    minutes_per_game: float = Field(ge=0)
    points_per_game: float = Field(ge=0)
    rebounds_per_game: float = Field(ge=0)
    assists_per_game: float = Field(ge=0)
    steals_per_game: float = Field(ge=0)
    blocks_per_game: float = Field(ge=0)
    turnovers_per_game: float = Field(ge=0)
    field_goal_percentage: float = Field(ge=0, le=1)
    three_point_percentage: float = Field(ge=0, le=1)
    free_throw_percentage: float = Field(ge=0, le=1)
    player_efficiency_rating: float = Field(ge=0)
    true_shooting_percentage: float = Field(ge=0, le=1)
    usage_rate: float = Field(ge=0, le=1)
    
class PlayerProfile(BaseModel):
    """Complete player profile with biographical and career information"""
    player_id: str
    name: str
    position: PlayerPosition
    height: str
    weight: int
    birth_date: date
    years_pro: int
    college: Optional[str] = None
    current_team: str
    jersey_number: int
    salary: Optional[float] = None
    contract_years: Optional[int] = None
    
class PlayerPerformanceMetrics(BaseModel):
    """Advanced performance metrics for player evaluation"""
    player_id: str
    evaluation_date: datetime
    recent_form_score: float = Field(ge=0, le=100, description="Performance over last 10 games")
    season_consistency: float = Field(ge=0, le=100, description="Consistency throughout season")
    clutch_performance: float = Field(ge=0, le=100, description="Performance in clutch situations")
    injury_risk: float = Field(ge=0, le=100, description="Injury risk assessment")
    market_momentum: float = Field(ge=0, le=100, description="Current market interest")
    breakout_potential: float = Field(ge=0, le=100, description="Potential for breakout performance")
    veteran_stability: float = Field(ge=0, le=100, description="Veteran consistency factor")
    
class PlayerComparison(BaseModel):
    """Comparison between players for relative valuation"""
    player_a_id: str
    player_b_id: str
    statistical_similarity: float = Field(ge=0, le=1)
    performance_differential: float = Field(ge=-100, le=100)
    market_value_ratio: float = Field(gt=0)
    recommendation: str = Field(description="Which player offers better value")
    
class PlayerTrend(BaseModel):
    """Trending analysis for a player"""
    player_id: str
    trend_period: str = Field(description="Time period for trend analysis")
    performance_trend: float = Field(ge=-100, le=100, description="Performance trend percentage")
    market_interest_trend: float = Field(ge=-100, le=100, description="Market interest trend")
    social_sentiment_trend: float = Field(ge=-100, le=100, description="Social media sentiment trend")
    injury_status: str = Field(description="Current injury status")
    upcoming_schedule_difficulty: float = Field(ge=0, le=100, description="Difficulty of upcoming games")
    
class RookieAnalysis(BaseModel):
    """Specialized analysis for rookie players"""
    player_id: str
    draft_position: int
    college_stats: Dict[str, Any]
    nba_adaptation_score: float = Field(ge=0, le=100)
    development_trajectory: str = Field(description="Projected development path")
    comparable_players: List[str] = Field(description="Similar players from history")
    breakout_probability: float = Field(ge=0, le=1)
    minutes_projection: float = Field(ge=0, le=48)
    
class GamePrediction(BaseModel):
    """Prediction for upcoming game performance"""
    player_id: str
    game_date: date
    opponent: str
    predicted_points: float = Field(ge=0)
    predicted_rebounds: float = Field(ge=0)
    predicted_assists: float = Field(ge=0)
    confidence_score: float = Field(ge=0, le=1)
    key_factors: List[str] = Field(description="Factors influencing prediction")
    upset_potential: float = Field(ge=0, le=1, description="Potential for exceptional performance")
    
class MarketSentiment(BaseModel):
    """Market sentiment analysis for a player"""
    player_id: str
    analysis_date: datetime
    social_media_mentions: int = Field(ge=0)
    sentiment_score: float = Field(ge=-1, le=1, description="Overall sentiment (-1 to 1)")
    trending_hashtags: List[str]
    news_sentiment: float = Field(ge=-1, le=1)
    fan_engagement_score: float = Field(ge=0, le=100)
    media_coverage_volume: int = Field(ge=0)
    
class InjuryReport(BaseModel):
    """Injury status and risk assessment"""
    player_id: str
    injury_status: str = Field(description="Current injury status")
    injury_type: Optional[str] = None
    expected_return_date: Optional[date] = None
    games_missed: int = Field(ge=0)
    injury_history: List[Dict[str, Any]] = Field(description="Historical injury data")
    risk_assessment: float = Field(ge=0, le=100, description="Future injury risk")
    load_management_likelihood: float = Field(ge=0, le=1)
    
class TeamContext(BaseModel):
    """Team context that affects player performance"""
    team_id: str
    team_name: str
    current_record: str
    playoff_position: Optional[int] = None
    pace_of_play: float = Field(description="Team pace factor")
    offensive_rating: float
    defensive_rating: float
    key_players: List[str]
    coaching_style: str
    recent_trades: List[Dict[str, Any]]
    
class PerformanceCatalyst(BaseModel):
    """Factors that could catalyze performance changes"""
    player_id: str
    catalyst_type: str = Field(description="Type of catalyst (trade, injury, etc.)")
    probability: float = Field(ge=0, le=1)
    impact_magnitude: float = Field(ge=-100, le=100)
    timeline: str = Field(description="Expected timeline for impact")
    related_players: List[str] = Field(description="Other players affected")
    market_implications: str = Field(description="Expected market impact")