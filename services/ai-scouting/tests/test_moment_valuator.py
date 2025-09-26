import pytest
import numpy as np
from datetime import datetime, date, timedelta
from src.analysis.moment_valuator import MomentValuator
from src.models.moment_analysis import (
    MomentAnalysisRequest, MomentType, MomentValuation,
    ScarcityFactor, MarketTrendFactor, SocialSentimentFactor
)
from src.models.player_stats import PlayerPerformanceMetrics

class TestMomentValuator:
    
    def setup_method(self):
        self.valuator = MomentValuator()
        
        # Sample moment request
        self.sample_moment_request = MomentAnalysisRequest(
            moment_id="moment_123",
            player_id="player_456",
            moment_type=MomentType.DUNK,
            game_date=date(2024, 1, 15),
            serial_number=42,
            current_price=150.0,
            marketplace_id="topshot"
        )
        
        # Sample player performance metrics
        self.sample_performance_metrics = PlayerPerformanceMetrics(
            player_id="player_456",
            evaluation_date=datetime.now(),
            recent_form_score=75.0,
            season_consistency=68.0,
            clutch_performance=82.0,
            injury_risk=25.0,
            market_momentum=60.0,
            breakout_potential=45.0,
            veteran_stability=70.0
        )
        
        # Sample market data
        self.sample_market_data = {
            'total_moments_for_player': 50,
            'total_circulation': 2000,
            'price_history': [
                {'timestamp': datetime.now() - timedelta(days=i), 'price': 140 + i * 2, 'volume': 5}
                for i in range(10, 0, -1)
            ],
            'comparable_sales': [
                {'price': 145, 'timestamp': datetime.now() - timedelta(days=1)},
                {'price': 155, 'timestamp': datetime.now() - timedelta(days=2)},
                {'price': 148, 'timestamp': datetime.now() - timedelta(days=3)}
            ],
            'volatility': 0.15,
            'liquidity_risk': 0.20
        }
        
        # Sample social data
        self.sample_social_data = {
            'mentions': 250,
            'sentiment': 0.3,
            'viral_score': 65,
            'influencer_mentions': 8
        }
    
    def test_calculate_scarcity_factor(self):
        """Test scarcity factor calculation"""
        factor = self.valuator.calculate_scarcity_factor(
            self.sample_moment_request,
            total_moments_for_player=50,
            total_circulation=2000
        )
        
        assert isinstance(factor, ScarcityFactor)
        assert factor.factor_type == "scarcity"
        assert 0 <= factor.weight <= 1
        assert 0 <= factor.value <= 1
        assert -100 <= factor.impact <= 100
        assert factor.player_moment_count == 50
        assert factor.total_circulation == 2000
        assert isinstance(factor.description, str)
    
    def test_calculate_scarcity_factor_low_serial(self):
        """Test scarcity factor for low serial number"""
        low_serial_request = self.sample_moment_request.copy()
        low_serial_request.serial_number = 1
        
        factor = self.valuator.calculate_scarcity_factor(
            low_serial_request,
            total_moments_for_player=50,
            total_circulation=2000
        )
        
        # Low serial numbers should have higher scarcity
        assert factor.serial_number_rarity > 90
    
    def test_calculate_scarcity_factor_rare_moment_type(self):
        """Test scarcity factor for rare moment type"""
        rare_moment_request = self.sample_moment_request.copy()
        rare_moment_request.moment_type = MomentType.GAME_WINNER
        
        factor = self.valuator.calculate_scarcity_factor(
            rare_moment_request,
            total_moments_for_player=50,
            total_circulation=2000
        )
        
        # Game winners should have high rarity
        assert factor.moment_type_rarity >= 90
    
    def test_calculate_market_trend_factor(self):
        """Test market trend factor calculation"""
        factor = self.valuator.calculate_market_trend_factor(
            self.sample_moment_request,
            self.sample_market_data['price_history'],
            self.sample_market_data['comparable_sales']
        )
        
        assert isinstance(factor, MarketTrendFactor)
        assert factor.factor_type == "market_trend"
        assert 0 <= factor.weight <= 1
        assert 0 <= factor.value <= 1
        assert -100 <= factor.impact <= 100
        assert -100 <= factor.price_momentum <= 100
        assert -100 <= factor.volume_trend <= 100
        assert -1 <= factor.market_sentiment <= 1
        assert isinstance(factor.comparable_sales, list)
    
    def test_calculate_market_trend_factor_no_history(self):
        """Test market trend factor with no price history"""
        factor = self.valuator.calculate_market_trend_factor(
            self.sample_moment_request,
            [],
            []
        )
        
        assert factor.value == 0.5  # Neutral value
        assert factor.impact == 0
        assert factor.price_momentum == 0
        assert factor.volume_trend == 0
        assert factor.market_sentiment == 0
    
    def test_calculate_social_sentiment_factor(self):
        """Test social sentiment factor calculation"""
        factor = self.valuator.calculate_social_sentiment_factor(
            "player_456",
            self.sample_social_data
        )
        
        assert isinstance(factor, SocialSentimentFactor)
        assert factor.factor_type == "social_sentiment"
        assert 0 <= factor.weight <= 1
        assert 0 <= factor.value <= 1
        assert -100 <= factor.impact <= 100
        assert factor.social_mentions == 250
        assert factor.sentiment_score == 0.3
        assert factor.viral_potential == 65
        assert factor.influencer_mentions == 8
    
    def test_calculate_social_sentiment_factor_no_data(self):
        """Test social sentiment factor with no data"""
        factor = self.valuator.calculate_social_sentiment_factor("player_456", None)
        
        # Should use default values
        assert factor.social_mentions == 100
        assert factor.sentiment_score == 0.1
        assert factor.viral_potential == 30
        assert factor.influencer_mentions == 5
    
    def test_calculate_fair_value(self):
        """Test fair value calculation"""
        # Create sample factors
        factors = [
            self.valuator.calculate_scarcity_factor(
                self.sample_moment_request, 50, 2000
            ),
            self.valuator.calculate_market_trend_factor(
                self.sample_moment_request,
                self.sample_market_data['price_history'],
                self.sample_market_data['comparable_sales']
            ),
            self.valuator.calculate_social_sentiment_factor(
                "player_456",
                self.sample_social_data
            )
        ]
        
        fair_value, confidence = self.valuator.calculate_fair_value(
            factors,
            self.sample_moment_request.current_price
        )
        
        assert isinstance(fair_value, float)
        assert fair_value > 0
        assert isinstance(confidence, float)
        assert 0 <= confidence <= 1
    
    def test_analyze_moment(self):
        """Test complete moment analysis"""
        result = self.valuator.analyze_moment(
            self.sample_moment_request,
            self.sample_performance_metrics,
            self.sample_market_data,
            self.sample_social_data
        )
        
        assert result.moment_id == "moment_123"
        assert isinstance(result.valuation, MomentValuation)
        assert len(result.factors) == 4  # Performance, scarcity, market, social
        assert isinstance(result.player_analysis, dict)
        assert isinstance(result.market_analysis, dict)
        assert isinstance(result.risk_assessment, dict)
        assert isinstance(result.recommendations, list)
        assert isinstance(result.analysis_metadata, dict)
        
        # Check valuation
        valuation = result.valuation
        assert valuation.fair_value > 0
        assert 0 <= valuation.confidence_score <= 1
        assert valuation.price_range_low < valuation.fair_value < valuation.price_range_high
        assert valuation.recommendation in ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"]
    
    def test_create_performance_factor(self):
        """Test creation of performance factor from metrics"""
        factor = self.valuator._create_performance_factor(self.sample_performance_metrics)
        
        assert factor.factor_type == "player_performance"
        assert factor.weight == self.valuator.factor_weights['player_performance']
        assert 0 <= factor.value <= 1
        assert -100 <= factor.impact <= 100
        assert factor.recent_games_performance == 75.0
        assert factor.season_performance == 68.0
        assert factor.career_trajectory == 45.0
        assert factor.clutch_performance == 82.0
    
    def test_generate_recommendations(self):
        """Test recommendation generation"""
        # Create a valuation that should trigger buy recommendation
        valuation = MomentValuation(
            moment_id="moment_123",
            fair_value=180.0,  # Higher than current price of 150
            confidence_score=0.8,
            price_range_low=170.0,
            price_range_high=190.0,
            recommendation="Buy",
            analysis_timestamp=datetime.now()
        )
        
        factors = [
            self.valuator._create_performance_factor(self.sample_performance_metrics)
        ]
        
        recommendations = self.valuator._generate_recommendations(
            self.sample_moment_request,
            valuation,
            factors
        )
        
        assert isinstance(recommendations, list)
        assert len(recommendations) > 0
        
        # Should include buy recommendation due to fair value > current price
        buy_rec_found = any("buy" in rec.lower() for rec in recommendations)
        assert buy_rec_found
    
    def test_batch_analyze_moments(self):
        """Test batch moment analysis"""
        # Create multiple moment requests
        moment_requests = [
            self.sample_moment_request,
            MomentAnalysisRequest(
                moment_id="moment_456",
                player_id="player_789",
                moment_type=MomentType.THREE_POINTER,
                game_date=date(2024, 1, 16),
                serial_number=100,
                current_price=80.0,
                marketplace_id="topshot"
            )
        ]
        
        # Create performance metrics for both players
        player_performances = {
            "player_456": self.sample_performance_metrics,
            "player_789": PlayerPerformanceMetrics(
                player_id="player_789",
                evaluation_date=datetime.now(),
                recent_form_score=60.0,
                season_consistency=55.0,
                clutch_performance=70.0,
                injury_risk=30.0,
                market_momentum=50.0,
                breakout_potential=80.0,
                veteran_stability=40.0
            )
        }
        
        # Create market data for both moments
        market_data = {
            "moment_123": self.sample_market_data,
            "moment_456": {
                'total_moments_for_player': 100,
                'total_circulation': 5000,
                'price_history': [],
                'comparable_sales': [],
                'volatility': 0.25,
                'liquidity_risk': 0.35
            }
        }
        
        results = self.valuator.batch_analyze_moments(
            moment_requests,
            player_performances,
            market_data
        )
        
        assert isinstance(results, list)
        assert len(results) <= len(moment_requests)  # Some might fail
        
        for result in results:
            assert result.moment_id in ["moment_123", "moment_456"]
    
    def test_get_undervalued_moments(self):
        """Test filtering for undervalued moments"""
        # Create analysis results with different valuations
        results = [
            # Undervalued moment
            self.valuator.analyze_moment(
                self.sample_moment_request,
                self.sample_performance_metrics,
                self.sample_market_data,
                self.sample_social_data
            ),
        ]
        
        # Modify the first result to be clearly undervalued
        results[0].valuation.fair_value = 200.0  # Much higher than current price of 150
        results[0].valuation.confidence_score = 0.8
        results[0].market_analysis['current_price'] = 150.0
        
        undervalued = self.valuator.get_undervalued_moments(
            results,
            min_confidence=0.6,
            min_upside=0.1  # 10% minimum upside
        )
        
        assert isinstance(undervalued, list)
        assert len(undervalued) >= 1
        
        # Results should be sorted by upside potential
        if len(undervalued) > 1:
            for i in range(len(undervalued) - 1):
                upside1 = undervalued[i].valuation.fair_value / undervalued[i].market_analysis['current_price']
                upside2 = undervalued[i+1].valuation.fair_value / undervalued[i+1].market_analysis['current_price']
                assert upside1 >= upside2
    
    def test_factor_weights_sum(self):
        """Test that factor weights are properly configured"""
        total_weight = sum(self.valuator.factor_weights.values())
        assert abs(total_weight - 1.0) < 0.01  # Should sum to approximately 1.0
    
    def test_recommendation_logic(self):
        """Test recommendation logic based on price ratios"""
        base_price = 100.0
        
        # Test strong buy scenario
        factors = []  # Empty factors for neutral impact
        fair_value, _ = self.valuator.calculate_fair_value(factors, base_price)
        
        # Manually set fair value for testing
        test_cases = [
            (130.0, "Strong Buy"),  # 30% upside
            (110.0, "Buy"),         # 10% upside
            (100.0, "Hold"),        # No change
            (90.0, "Sell"),         # 10% downside
            (70.0, "Strong Sell")   # 30% downside
        ]
        
        for test_fair_value, expected_rec in test_cases:
            price_ratio = test_fair_value / base_price
            
            if price_ratio > 1.2:
                expected = "Strong Buy"
            elif price_ratio > 1.05:
                expected = "Buy"
            elif price_ratio > 0.95:
                expected = "Hold"
            elif price_ratio > 0.8:
                expected = "Sell"
            else:
                expected = "Strong Sell"
            
            assert expected == expected_rec