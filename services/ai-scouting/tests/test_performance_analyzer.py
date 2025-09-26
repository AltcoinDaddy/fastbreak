import pytest
import numpy as np
from datetime import datetime, date
from src.analysis.performance_analyzer import PerformanceAnalyzer
from src.models.player_stats import GameStats, SeasonStats, PlayerPerformanceMetrics

class TestPerformanceAnalyzer:
    
    def setup_method(self):
        self.analyzer = PerformanceAnalyzer()
        
        # Sample game stats
        self.sample_games = [
            GameStats(
                game_id="game_1",
                player_id="player_123",
                game_date=date(2024, 1, 15),
                opponent="LAL",
                minutes_played=36.0,
                points=25,
                rebounds=8,
                assists=6,
                steals=2,
                blocks=1,
                turnovers=3,
                field_goals_made=10,
                field_goals_attempted=18,
                three_pointers_made=3,
                three_pointers_attempted=7,
                free_throws_made=2,
                free_throws_attempted=2,
                personal_fouls=2,
                plus_minus=8
            ),
            GameStats(
                game_id="game_2",
                player_id="player_123",
                game_date=date(2024, 1, 13),
                opponent="GSW",
                minutes_played=32.0,
                points=18,
                rebounds=5,
                assists=9,
                steals=1,
                blocks=0,
                turnovers=4,
                field_goals_made=7,
                field_goals_attempted=15,
                three_pointers_made=2,
                three_pointers_attempted=5,
                free_throws_made=2,
                free_throws_attempted=3,
                personal_fouls=3,
                plus_minus=-2
            )
        ]
        
        # Sample season stats
        self.sample_season_stats = SeasonStats(
            player_id="player_123",
            season="2023-24",
            team="BOS",
            position="PG",
            games_played=65,
            games_started=60,
            minutes_per_game=34.5,
            points_per_game=22.3,
            rebounds_per_game=6.8,
            assists_per_game=7.2,
            steals_per_game=1.5,
            blocks_per_game=0.8,
            turnovers_per_game=3.1,
            field_goal_percentage=0.485,
            three_point_percentage=0.375,
            free_throw_percentage=0.850,
            player_efficiency_rating=18.5,
            true_shooting_percentage=0.580,
            usage_rate=0.285
        )
        
        # Sample player profile
        self.sample_player_profile = {
            'player_id': 'player_123',
            'years_pro': 4,
            'position': 'PG'
        }
    
    def test_calculate_recent_form_score(self):
        """Test recent form score calculation"""
        score = self.analyzer.calculate_recent_form_score(self.sample_games)
        
        assert isinstance(score, float)
        assert 0 <= score <= 100
        assert score > 50  # Should be above average for decent stats
    
    def test_calculate_recent_form_score_empty_games(self):
        """Test recent form score with no games"""
        score = self.analyzer.calculate_recent_form_score([])
        assert score == 50.0  # Neutral score
    
    def test_calculate_recent_form_score_with_weights(self):
        """Test recent form score with custom weights"""
        weights = [0.6, 0.4]  # More weight on first game
        score = self.analyzer.calculate_recent_form_score(self.sample_games, weights)
        
        assert isinstance(score, float)
        assert 0 <= score <= 100
    
    def test_calculate_season_consistency(self):
        """Test season consistency calculation"""
        consistency = self.analyzer.calculate_season_consistency(
            self.sample_season_stats, 
            self.sample_games
        )
        
        assert isinstance(consistency, float)
        assert 0 <= consistency <= 100
    
    def test_calculate_season_consistency_insufficient_games(self):
        """Test consistency with insufficient games"""
        consistency = self.analyzer.calculate_season_consistency(
            self.sample_season_stats, 
            self.sample_games[:1]  # Only one game
        )
        
        assert consistency == 50.0  # Default value
    
    def test_calculate_clutch_performance(self):
        """Test clutch performance calculation"""
        clutch_score = self.analyzer.calculate_clutch_performance(self.sample_games)
        
        assert isinstance(clutch_score, float)
        assert 0 <= clutch_score <= 100
    
    def test_calculate_clutch_performance_no_plus_minus(self):
        """Test clutch performance with no plus/minus data"""
        games_no_plus_minus = []
        for game in self.sample_games:
            game_copy = game.copy()
            game_copy.plus_minus = None
            games_no_plus_minus.append(game_copy)
        
        clutch_score = self.analyzer.calculate_clutch_performance(games_no_plus_minus)
        assert clutch_score == 50.0
    
    def test_calculate_breakout_potential(self):
        """Test breakout potential calculation"""
        breakout = self.analyzer.calculate_breakout_potential(
            self.sample_player_profile,
            self.sample_season_stats
        )
        
        assert isinstance(breakout, float)
        assert 0 <= breakout <= 100
    
    def test_calculate_breakout_potential_young_player(self):
        """Test breakout potential for young player"""
        young_profile = self.sample_player_profile.copy()
        young_profile['years_pro'] = 1
        
        breakout = self.analyzer.calculate_breakout_potential(
            young_profile,
            self.sample_season_stats
        )
        
        # Young players should have higher breakout potential
        assert breakout >= 70
    
    def test_calculate_veteran_stability(self):
        """Test veteran stability calculation"""
        stability = self.analyzer.calculate_veteran_stability(
            self.sample_player_profile,
            self.sample_season_stats
        )
        
        assert isinstance(stability, float)
        assert 0 <= stability <= 100
    
    def test_calculate_veteran_stability_experienced_player(self):
        """Test veteran stability for experienced player"""
        veteran_profile = self.sample_player_profile.copy()
        veteran_profile['years_pro'] = 10
        
        stability = self.analyzer.calculate_veteran_stability(
            veteran_profile,
            self.sample_season_stats
        )
        
        # Experienced players should have higher stability
        assert stability >= 70
    
    def test_analyze_player_performance(self):
        """Test comprehensive player performance analysis"""
        metrics = self.analyzer.analyze_player_performance(
            self.sample_player_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        assert isinstance(metrics, PlayerPerformanceMetrics)
        assert metrics.player_id == "player_123"
        assert 0 <= metrics.recent_form_score <= 100
        assert 0 <= metrics.season_consistency <= 100
        assert 0 <= metrics.clutch_performance <= 100
        assert 0 <= metrics.injury_risk <= 100
        assert 0 <= metrics.breakout_potential <= 100
        assert 0 <= metrics.veteran_stability <= 100
    
    def test_estimate_injury_risk(self):
        """Test injury risk estimation"""
        risk = self.analyzer.estimate_injury_risk(
            self.sample_player_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        assert isinstance(risk, float)
        assert 0 <= risk <= 100
    
    def test_estimate_injury_risk_high_minutes(self):
        """Test injury risk for high minutes player"""
        high_minutes_stats = self.sample_season_stats.copy()
        high_minutes_stats.minutes_per_game = 38.0
        
        risk = self.analyzer.estimate_injury_risk(
            self.sample_player_profile,
            high_minutes_stats,
            self.sample_games
        )
        
        # High minutes should increase injury risk
        assert risk >= 35
    
    def test_create_performance_factor(self):
        """Test creation of performance factor"""
        metrics = self.analyzer.analyze_player_performance(
            self.sample_player_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        factor = self.analyzer.create_performance_factor(metrics)
        
        assert factor.factor_type == "player_performance"
        assert 0 <= factor.weight <= 1
        assert 0 <= factor.value <= 1
        assert -100 <= factor.impact <= 100
        assert isinstance(factor.description, str)
    
    def test_predict_next_game_performance(self):
        """Test next game performance prediction"""
        prediction = self.analyzer.predict_next_game_performance(
            self.sample_player_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        assert isinstance(prediction, dict)
        assert 'predicted_points' in prediction
        assert 'predicted_rebounds' in prediction
        assert 'predicted_assists' in prediction
        assert 'confidence' in prediction
        
        assert prediction['predicted_points'] > 0
        assert prediction['predicted_rebounds'] >= 0
        assert prediction['predicted_assists'] >= 0
        assert 0 <= prediction['confidence'] <= 1
    
    def test_predict_next_game_performance_no_recent_games(self):
        """Test prediction with no recent games"""
        prediction = self.analyzer.predict_next_game_performance(
            self.sample_player_profile,
            self.sample_season_stats,
            []
        )
        
        # Should fall back to season averages
        assert prediction['predicted_points'] == self.sample_season_stats.points_per_game
        assert prediction['predicted_rebounds'] == self.sample_season_stats.rebounds_per_game
        assert prediction['predicted_assists'] == self.sample_season_stats.assists_per_game
        assert prediction['confidence'] == 0.5
    
    def test_compare_players(self):
        """Test player comparison"""
        metrics1 = self.analyzer.analyze_player_performance(
            self.sample_player_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        # Create second player with different stats
        player2_profile = self.sample_player_profile.copy()
        player2_profile['player_id'] = 'player_456'
        
        metrics2 = self.analyzer.analyze_player_performance(
            player2_profile,
            self.sample_season_stats,
            self.sample_games
        )
        
        comparison = self.analyzer.compare_players(metrics1, metrics2)
        
        assert isinstance(comparison, dict)
        assert comparison['player1_id'] == 'player_123'
        assert comparison['player2_id'] == 'player_456'
        assert 'recent_form_diff' in comparison
        assert 'consistency_diff' in comparison
        assert 'clutch_diff' in comparison
        assert 'injury_risk_diff' in comparison
        assert 'overall_advantage' in comparison
        
        # Since it's the same stats, should be similar
        assert comparison['overall_advantage'] == 'similar'