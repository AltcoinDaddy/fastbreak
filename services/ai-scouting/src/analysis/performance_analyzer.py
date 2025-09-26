import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import logging

from ..models.player_stats import GameStats, SeasonStats, PlayerPerformanceMetrics
from ..models.moment_analysis import ValuationFactor, PlayerPerformanceFactor

logger = logging.getLogger(__name__)

class PerformanceAnalyzer:
    """Analyzes player performance for moment valuation"""
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.performance_model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.is_trained = False
        
    def calculate_recent_form_score(self, recent_games: List[GameStats], weights: Optional[List[float]] = None) -> float:
        """Calculate recent form score based on last N games"""
        if not recent_games:
            return 50.0  # Neutral score
        
        if weights is None:
            # More recent games get higher weights
            weights = [1.0 / (i + 1) for i in range(len(recent_games))]
        
        # Normalize weights
        total_weight = sum(weights)
        weights = [w / total_weight for w in weights]
        
        # Calculate weighted performance metrics
        weighted_scores = []
        
        for i, game in enumerate(recent_games):
            # Calculate game performance score (0-100)
            efficiency = game.efficiency_rating
            minutes_factor = min(game.minutes_played / 36.0, 1.0)  # Normalize to 36 minutes
            
            # Composite score based on multiple factors
            game_score = (
                (game.points / 30.0) * 25 +  # Points (max 30 for 100% of 25 points)
                (game.rebounds / 15.0) * 15 +  # Rebounds
                (game.assists / 12.0) * 15 +  # Assists
                (game.steals / 4.0) * 10 +  # Steals
                (game.blocks / 4.0) * 10 +  # Blocks
                (efficiency / 30.0) * 25  # Efficiency rating
            ) * minutes_factor
            
            # Cap at 100
            game_score = min(game_score, 100.0)
            weighted_scores.append(game_score * weights[i])
        
        return sum(weighted_scores)
    
    def calculate_season_consistency(self, season_stats: SeasonStats, recent_games: List[GameStats]) -> float:
        """Calculate consistency score based on variance in performance"""
        if not recent_games or len(recent_games) < 5:
            return 50.0
        
        # Calculate coefficient of variation for key stats
        points = [game.points for game in recent_games]
        rebounds = [game.rebounds for game in recent_games]
        assists = [game.assists for game in recent_games]
        
        def coefficient_of_variation(values: List[float]) -> float:
            if not values or np.mean(values) == 0:
                return 1.0
            return np.std(values) / np.mean(values)
        
        points_cv = coefficient_of_variation(points)
        rebounds_cv = coefficient_of_variation(rebounds)
        assists_cv = coefficient_of_variation(assists)
        
        # Lower CV means higher consistency
        avg_cv = (points_cv + rebounds_cv + assists_cv) / 3
        consistency_score = max(0, 100 - (avg_cv * 100))
        
        return consistency_score
    
    def calculate_clutch_performance(self, recent_games: List[GameStats]) -> float:
        """Estimate clutch performance based on game context"""
        if not recent_games:
            return 50.0
        
        # This is a simplified clutch calculation
        # In reality, you'd need clutch-specific stats from the API
        clutch_scores = []
        
        for game in recent_games:
            # Use plus/minus as a proxy for clutch performance
            if game.plus_minus is not None:
                # Normalize plus/minus to 0-100 scale
                clutch_score = 50 + (game.plus_minus * 2)  # Rough normalization
                clutch_score = max(0, min(100, clutch_score))
                clutch_scores.append(clutch_score)
        
        return np.mean(clutch_scores) if clutch_scores else 50.0
    
    def calculate_breakout_potential(self, player_profile: Dict[str, Any], season_stats: SeasonStats) -> float:
        """Calculate potential for breakout performance"""
        breakout_score = 50.0  # Base score
        
        # Age factor (younger players have higher breakout potential)
        years_pro = player_profile.get('years_pro', 5)
        if years_pro <= 2:
            breakout_score += 20
        elif years_pro <= 4:
            breakout_score += 10
        elif years_pro >= 10:
            breakout_score -= 10
        
        # Usage rate factor
        if season_stats.usage_rate > 0.25:
            breakout_score += 15
        elif season_stats.usage_rate < 0.15:
            breakout_score -= 10
        
        # Efficiency factor
        if season_stats.player_efficiency_rating > 20:
            breakout_score += 10
        elif season_stats.player_efficiency_rating < 15:
            breakout_score -= 10
        
        # Minutes played factor (opportunity)
        if season_stats.minutes_per_game > 30:
            breakout_score += 10
        elif season_stats.minutes_per_game < 20:
            breakout_score -= 15
        
        return max(0, min(100, breakout_score))
    
    def calculate_veteran_stability(self, player_profile: Dict[str, Any], season_stats: SeasonStats) -> float:
        """Calculate veteran stability factor"""
        stability_score = 50.0
        
        years_pro = player_profile.get('years_pro', 5)
        
        # Experience factor
        if years_pro >= 8:
            stability_score += 20
        elif years_pro >= 5:
            stability_score += 10
        else:
            stability_score -= 10
        
        # Performance consistency (using PER as proxy)
        if season_stats.player_efficiency_rating > 18:
            stability_score += 15
        elif season_stats.player_efficiency_rating < 12:
            stability_score -= 15
        
        # Games played factor (availability)
        if season_stats.games_played > 70:
            stability_score += 10
        elif season_stats.games_played < 50:
            stability_score -= 20
        
        return max(0, min(100, stability_score))
    
    def analyze_player_performance(
        self,
        player_profile: Dict[str, Any],
        season_stats: SeasonStats,
        recent_games: List[GameStats]
    ) -> PlayerPerformanceMetrics:
        """Comprehensive player performance analysis"""
        
        recent_form = self.calculate_recent_form_score(recent_games)
        consistency = self.calculate_season_consistency(season_stats, recent_games)
        clutch_perf = self.calculate_clutch_performance(recent_games)
        
        # Injury risk assessment (simplified)
        injury_risk = self.estimate_injury_risk(player_profile, season_stats, recent_games)
        
        # Market momentum (would need external data in real implementation)
        market_momentum = 50.0  # Placeholder
        
        breakout_potential = self.calculate_breakout_potential(player_profile, season_stats)
        veteran_stability = self.calculate_veteran_stability(player_profile, season_stats)
        
        return PlayerPerformanceMetrics(
            player_id=str(player_profile.get('player_id', '')),
            evaluation_date=datetime.now(),
            recent_form_score=recent_form,
            season_consistency=consistency,
            clutch_performance=clutch_perf,
            injury_risk=injury_risk,
            market_momentum=market_momentum,
            breakout_potential=breakout_potential,
            veteran_stability=veteran_stability
        )
    
    def estimate_injury_risk(
        self,
        player_profile: Dict[str, Any],
        season_stats: SeasonStats,
        recent_games: List[GameStats]
    ) -> float:
        """Estimate injury risk based on various factors"""
        risk_score = 20.0  # Base low risk
        
        # Age factor
        years_pro = player_profile.get('years_pro', 5)
        if years_pro >= 12:
            risk_score += 20
        elif years_pro >= 8:
            risk_score += 10
        
        # Minutes load factor
        if season_stats.minutes_per_game > 36:
            risk_score += 15
        elif season_stats.minutes_per_game > 32:
            risk_score += 5
        
        # Games played factor (recent availability)
        if season_stats.games_played < 60:
            risk_score += 20
        elif season_stats.games_played < 70:
            risk_score += 10
        
        # Position factor (centers and forwards typically higher injury risk)
        position = player_profile.get('position', 'PG')
        if position in ['C', 'PF']:
            risk_score += 10
        
        return max(0, min(100, risk_score))
    
    def create_performance_factor(
        self,
        performance_metrics: PlayerPerformanceMetrics,
        weight: float = 0.3
    ) -> PlayerPerformanceFactor:
        """Create a valuation factor based on player performance"""
        
        # Combine metrics into overall performance score
        overall_score = (
            performance_metrics.recent_form_score * 0.3 +
            performance_metrics.season_consistency * 0.2 +
            performance_metrics.clutch_performance * 0.2 +
            (100 - performance_metrics.injury_risk) * 0.1 +
            performance_metrics.breakout_potential * 0.1 +
            performance_metrics.veteran_stability * 0.1
        )
        
        # Calculate impact on valuation
        impact = (overall_score - 50) * 2  # Scale to -100 to +100
        
        return PlayerPerformanceFactor(
            factor_type="player_performance",
            weight=weight,
            value=overall_score / 100.0,  # Normalize to 0-1
            description=f"Player performance analysis based on recent form ({performance_metrics.recent_form_score:.1f}), "
                       f"consistency ({performance_metrics.season_consistency:.1f}), and clutch performance "
                       f"({performance_metrics.clutch_performance:.1f})",
            impact=impact,
            recent_games_performance=performance_metrics.recent_form_score,
            season_performance=performance_metrics.season_consistency,
            career_trajectory=performance_metrics.breakout_potential,
            clutch_performance=performance_metrics.clutch_performance
        )
    
    def predict_next_game_performance(
        self,
        player_profile: Dict[str, Any],
        season_stats: SeasonStats,
        recent_games: List[GameStats],
        opponent_defense_rating: float = 110.0
    ) -> Dict[str, float]:
        """Predict performance for next game"""
        
        if not recent_games:
            # Use season averages as fallback
            return {
                'predicted_points': season_stats.points_per_game,
                'predicted_rebounds': season_stats.rebounds_per_game,
                'predicted_assists': season_stats.assists_per_game,
                'confidence': 0.5
            }
        
        # Calculate recent averages
        recent_points = np.mean([game.points for game in recent_games[-5:]])
        recent_rebounds = np.mean([game.rebounds for game in recent_games[-5:]])
        recent_assists = np.mean([game.assists for game in recent_games[-5:]])
        
        # Adjust for opponent strength (simplified)
        league_avg_defense = 112.0
        difficulty_factor = opponent_defense_rating / league_avg_defense
        
        predicted_points = recent_points / difficulty_factor
        predicted_rebounds = recent_rebounds  # Less affected by opponent defense
        predicted_assists = recent_assists / (difficulty_factor * 0.5)  # Partially affected
        
        # Calculate confidence based on consistency
        points_std = np.std([game.points for game in recent_games[-10:]])
        confidence = max(0.3, 1.0 - (points_std / recent_points))
        
        return {
            'predicted_points': predicted_points,
            'predicted_rebounds': predicted_rebounds,
            'predicted_assists': predicted_assists,
            'confidence': confidence
        }
    
    def compare_players(
        self,
        player1_metrics: PlayerPerformanceMetrics,
        player2_metrics: PlayerPerformanceMetrics
    ) -> Dict[str, Any]:
        """Compare two players' performance metrics"""
        
        comparison = {
            'player1_id': player1_metrics.player_id,
            'player2_id': player2_metrics.player_id,
            'recent_form_diff': player1_metrics.recent_form_score - player2_metrics.recent_form_score,
            'consistency_diff': player1_metrics.season_consistency - player2_metrics.season_consistency,
            'clutch_diff': player1_metrics.clutch_performance - player2_metrics.clutch_performance,
            'injury_risk_diff': player2_metrics.injury_risk - player1_metrics.injury_risk,  # Lower is better
            'overall_advantage': None
        }
        
        # Calculate overall advantage
        total_diff = (
            comparison['recent_form_diff'] * 0.3 +
            comparison['consistency_diff'] * 0.2 +
            comparison['clutch_diff'] * 0.2 +
            comparison['injury_risk_diff'] * 0.1 +
            (player1_metrics.breakout_potential - player2_metrics.breakout_potential) * 0.1 +
            (player1_metrics.veteran_stability - player2_metrics.veteran_stability) * 0.1
        )
        
        if total_diff > 5:
            comparison['overall_advantage'] = 'player1'
        elif total_diff < -5:
            comparison['overall_advantage'] = 'player2'
        else:
            comparison['overall_advantage'] = 'similar'
        
        return comparison