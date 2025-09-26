"""
Unit tests for AI Reasoning Service

Tests the reasoning generation, storage, and retrieval functionality
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
from uuid import uuid4

from src.services.reasoning_service import ReasoningService
from src.models.reasoning import (
    AIReasoningResult, ReasoningFactor, ReasoningFactorType,
    PlayerPerformanceReasoning, MarketContextReasoning, ScarcityReasoning,
    ReasoningSearchQuery, ReasoningSearchResult, ReasoningExplanation,
    ReasoningPerformanceMetrics, ReasoningHistory
)
from src.models.moment_analysis import (
    MomentAnalysisResult, ValuationResult, PlayerPerformanceFactor,
    ScarcityFactor, MarketTrendFactor, SocialSentimentFactor
)
from src.data_sources.database_client import DatabaseClient


class TestReasoningService:
    """Test suite for ReasoningService"""
    
    @pytest.fixture
    def mock_db_client(self):
        """Mock database client"""
        db_client = Mock(spec=DatabaseClient)
        db_client.fetch_all = AsyncMock()
        db_client.fetch_one = AsyncMock()
        db_client.execute = AsyncMock()
        return db_client
    
    @pytest.fixture
    def reasoning_service(self, mock_db_client):
        """Create reasoning service with mocked dependencies"""
        service = ReasoningService(mock_db_client)
        return service
    
    @pytest.fixture
    def sample_analysis_result(self):
        """Sample moment analysis result for testing"""
        return MomentAnalysisResult(
            moment_id="test_moment_123",
            player_id="player_456",
            valuation=ValuationResult(
                fair_value=150.0,
                confidence_score=0.85,
                recommendation="buy",
                upside_potential=0.25,
                risk_score=0.3
            ),
            factors=[
                PlayerPerformanceFactor(
                    factor_type="player_performance",
                    weight=0.4,
                    value=0.8,
                    impact=15.0,
                    description="Strong recent performance with 25 PPG average",
                    recent_games_performance={"avg_points": 25, "games": 5},
                    season_performance={"ppg": 22.5, "games": 40},
                    career_trajectory="improving",
                    clutch_performance=0.75
                ),
                ScarcityFactor(
                    factor_type="scarcity",
                    weight=0.3,
                    value=0.7,
                    impact=10.0,
                    description="Low serial number with limited circulation",
                    serial_number_rarity=0.8,
                    moment_type_rarity=0.6,
                    player_moment_count=50,
                    total_circulation=1000
                )
            ],
            player_analysis={
                "performance_metrics": {
                    "recent_form_score": 85,
                    "season_consistency": 78
                }
            },
            market_analysis={
                "current_price": 120.0,
                "price_ratio": 1.25,
                "market_trend": {
                    "price_momentum": 15.0,
                    "volume_trend": 8.0
                }
            },
            risk_assessment={
                "price_volatility": 0.35,  # Above 0.3 threshold to trigger risk factor
                "liquidity_risk": 0.2
            },
            timestamp=datetime.now()
        )
    
    @pytest.fixture
    def sample_reasoning_result(self):
        """Sample reasoning result for testing"""
        return AIReasoningResult(
            moment_id="test_moment_123",
            decision="buy",
            confidence_score=0.85,
            factors=[
                ReasoningFactor(
                    factor_type=ReasoningFactorType.PLAYER_PERFORMANCE,
                    name="Player Performance Analysis",
                    weight=0.4,
                    value=0.8,
                    impact=15.0,
                    confidence=0.9,
                    description="Strong recent performance with 25 PPG average",
                    supporting_data={"avg_points": 25, "games": 5}
                )
            ],
            primary_reasoning="Strong buy opportunity: AI values this moment at $150.00, significantly above current price of $120.00.",
            supporting_reasons=["Player Performance Analysis: positive impact of +15.0% - Strong recent performance"],
            risk_factors=["High price volatility (25%) - price may fluctuate significantly"],
            key_statistics={"current_price": 120.0, "fair_value": 150.0, "recent_form": 85},
            market_context=MarketContextReasoning(
                price_trend_analysis="Current price appears undervalued by 25.0%",
                volume_analysis="Volume trends are stable",
                comparable_sales_context="Based on recent comparable sales analysis",
                market_sentiment="Market sentiment analysis incorporated",
                liquidity_assessment="Liquidity risk assessed based on trading volume",
                arbitrage_opportunities=[],
                market_inefficiencies=[],
                timing_factors=["Real-time market data"]
            ),
            player_analysis=PlayerPerformanceReasoning(
                recent_games_analysis="Excellent recent form (85.0/100) with strong performances",
                season_performance_context="Highly consistent season performance (78.0/100)",
                career_trajectory="Career trajectory analysis based on historical data",
                clutch_performance_note="Clutch performance metrics incorporated",
                injury_status="No current injury concerns identified",
                team_context="Team performance context considered",
                matchup_analysis="Recent matchup performance analyzed",
                statistical_highlights=[],
                performance_trends={}
            ),
            scarcity_analysis=ScarcityReasoning(
                serial_number_significance="Serial number rarity assessed relative to total circulation",
                moment_type_rarity="Moment type rarity based on historical distribution",
                player_moment_availability="Player moment availability in current market",
                circulation_analysis="Total circulation and market supply analysis",
                collector_demand="Collector demand patterns analyzed",
                historical_scarcity_premium="Historical scarcity premiums considered",
                future_scarcity_projection="Future scarcity trends projected"
            ),
            timestamp=datetime.now(),
            analysis_version="1.0"
        )

    def test_generate_reasoning_factors(self, reasoning_service, sample_analysis_result):
        """Test conversion of analysis factors to reasoning factors"""
        factors = reasoning_service.generate_reasoning_factors(sample_analysis_result)
        
        assert len(factors) == 2
        assert factors[0].factor_type == ReasoningFactorType.PLAYER_PERFORMANCE
        assert factors[1].factor_type == ReasoningFactorType.SCARCITY
        assert factors[0].weight == 0.4
        assert factors[0].impact == 15.0
        assert "Strong recent performance" in factors[0].description

    def test_generate_detailed_reasoning(self, reasoning_service, sample_analysis_result):
        """Test generation of detailed reasoning from analysis result"""
        reasoning_result = reasoning_service.generate_detailed_reasoning(sample_analysis_result)
        
        assert reasoning_result.moment_id == "test_moment_123"
        assert reasoning_result.decision == "buy"
        assert reasoning_result.confidence_score == 0.85
        assert len(reasoning_result.factors) == 2
        assert "Strong buy opportunity" in reasoning_result.primary_reasoning
        assert len(reasoning_result.supporting_reasons) > 0
        assert reasoning_result.market_context is not None
        assert reasoning_result.player_analysis is not None
        assert reasoning_result.scarcity_analysis is not None

    def test_map_recommendation_to_decision(self, reasoning_service):
        """Test mapping of recommendations to decisions"""
        assert reasoning_service._map_recommendation_to_decision("strong buy") == "buy"
        assert reasoning_service._map_recommendation_to_decision("buy") == "buy"
        assert reasoning_service._map_recommendation_to_decision("sell") == "sell"
        assert reasoning_service._map_recommendation_to_decision("hold") == "hold"
        assert reasoning_service._map_recommendation_to_decision("skip") == "skip"
        assert reasoning_service._map_recommendation_to_decision("unknown") == "skip"

    def test_generate_primary_reasoning_buy(self, reasoning_service, sample_analysis_result):
        """Test primary reasoning generation for buy decision"""
        factors = reasoning_service.generate_reasoning_factors(sample_analysis_result)
        primary_reasoning = reasoning_service._generate_primary_reasoning(sample_analysis_result, factors)
        
        assert "Strong buy opportunity" in primary_reasoning
        assert "$150.00" in primary_reasoning
        assert "$120.00" in primary_reasoning
        assert "85%" in primary_reasoning

    def test_generate_supporting_reasons(self, reasoning_service):
        """Test generation of supporting reasons from factors"""
        factors = [
            ReasoningFactor(
                factor_type=ReasoningFactorType.PLAYER_PERFORMANCE,
                name="Player Performance",
                weight=0.4,
                value=0.8,
                impact=15.0,
                confidence=0.9,
                description="Strong performance",
                supporting_data={}
            ),
            ReasoningFactor(
                factor_type=ReasoningFactorType.SCARCITY,
                name="Scarcity Analysis",
                weight=0.3,
                value=0.7,
                impact=8.0,
                confidence=0.8,
                description="Limited supply",
                supporting_data={}
            )
        ]
        
        reasons = reasoning_service._generate_supporting_reasons(factors)
        
        assert len(reasons) == 2
        assert "Player Performance: positive impact of +15.0%" in reasons[0]
        assert "Scarcity Analysis: positive impact of +8.0%" in reasons[1]

    def test_identify_risk_factors(self, reasoning_service, sample_analysis_result):
        """Test identification of risk factors"""
        factors = reasoning_service.generate_reasoning_factors(sample_analysis_result)
        risk_factors = reasoning_service._identify_risk_factors(sample_analysis_result, factors)
        
        assert len(risk_factors) > 0
        assert any("volatility" in risk.lower() for risk in risk_factors)

    def test_extract_key_statistics(self, reasoning_service, sample_analysis_result):
        """Test extraction of key statistics"""
        key_stats = reasoning_service._extract_key_statistics(sample_analysis_result)
        
        assert "current_price" in key_stats
        assert "fair_value" in key_stats
        assert "confidence_score" in key_stats
        assert key_stats["current_price"] == 120.0
        assert key_stats["fair_value"] == 150.0

    def test_generate_market_context(self, reasoning_service, sample_analysis_result):
        """Test generation of market context reasoning"""
        market_context = reasoning_service._generate_market_context(sample_analysis_result)
        
        assert "undervalued by 25.0%" in market_context.price_trend_analysis
        assert "Volume trends are stable" in market_context.volume_analysis
        assert market_context.comparable_sales_context is not None

    def test_generate_player_analysis(self, reasoning_service, sample_analysis_result):
        """Test generation of player analysis reasoning"""
        player_analysis = reasoning_service._generate_player_analysis(sample_analysis_result)
        
        assert "Excellent recent form (85.0/100)" in player_analysis.recent_games_analysis
        assert "Highly consistent season performance (78.0/100)" in player_analysis.season_performance_context

    def test_generate_scarcity_analysis(self, reasoning_service, sample_analysis_result):
        """Test generation of scarcity analysis reasoning"""
        scarcity_analysis = reasoning_service._generate_scarcity_analysis(sample_analysis_result)
        
        assert scarcity_analysis.serial_number_significance is not None
        assert scarcity_analysis.moment_type_rarity is not None
        assert scarcity_analysis.circulation_analysis is not None

    @pytest.mark.asyncio
    async def test_store_reasoning(self, reasoning_service, sample_reasoning_result, mock_db_client):
        """Test storing reasoning result in database"""
        mock_db_client.execute.return_value = None
        
        reasoning_id = await reasoning_service.store_reasoning(sample_reasoning_result, "user_123")
        
        assert reasoning_id is not None
        assert mock_db_client.execute.call_count >= 3  # Main record + factors + context

    @pytest.mark.asyncio
    async def test_get_reasoning_by_moment(self, reasoning_service, mock_db_client):
        """Test retrieving reasoning by moment ID"""
        # Mock database responses
        mock_db_client.fetch_all.return_value = [
            {
                'id': str(uuid4()),
                'moment_id': 'test_moment_123',
                'user_id': 'user_123',
                'decision': 'buy',
                'confidence_score': 0.85,
                'primary_reasoning': 'Test reasoning',
                'supporting_reasons': '["reason1", "reason2"]',
                'risk_factors': '["risk1"]',
                'key_statistics': '{"price": 100}',
                'analysis_version': '1.0',
                'created_at': datetime.now(),
                'player_analysis': '{"recent_games_analysis": "Test", "season_performance_context": "Test", "career_trajectory": "Test", "clutch_performance_note": "Test", "injury_status": "Test", "team_context": "Test", "matchup_analysis": "Test", "statistical_highlights": [], "performance_trends": {}}',
                'market_context': '{"price_trend_analysis": "Test", "volume_analysis": "Test", "comparable_sales_context": "Test", "market_sentiment": "Test", "liquidity_assessment": "Test", "arbitrage_opportunities": [], "market_inefficiencies": [], "timing_factors": []}',
                'scarcity_analysis': '{"serial_number_significance": "Test", "moment_type_rarity": "Test", "player_moment_availability": "Test", "circulation_analysis": "Test", "collector_demand": "Test", "historical_scarcity_premium": "Test", "future_scarcity_projection": "Test"}'
            }
        ]
        
        # Mock factors
        reasoning_service._get_reasoning_factors = AsyncMock(return_value=[])
        
        results = await reasoning_service.get_reasoning_by_moment("test_moment_123", 10)
        
        assert len(results) == 1
        assert results[0].moment_id == "test_moment_123"
        assert results[0].decision == "buy"

    def test_generate_human_explanation(self, reasoning_service, sample_reasoning_result):
        """Test generation of human-friendly explanation"""
        explanation = reasoning_service.generate_human_explanation(sample_reasoning_result)
        
        assert "purchase this moment with 85% confidence" in explanation.summary
        assert len(explanation.key_factors) > 0
        assert "Current Price" in explanation.supporting_stats
        assert "Fair Value" in explanation.supporting_stats
        assert explanation.confidence_explanation is not None
        assert len(explanation.what_could_change_decision) > 0

    def test_calculate_search_aggregations(self, reasoning_service):
        """Test calculation of search result aggregations"""
        # Create sample reasoning history
        reasoning_result = AIReasoningResult(
            moment_id="test_moment",
            decision="buy",
            confidence_score=0.8,
            factors=[
                ReasoningFactor(
                    factor_type=ReasoningFactorType.PLAYER_PERFORMANCE,
                    name="Test Factor",
                    weight=0.5,
                    value=0.7,
                    impact=10.0,
                    confidence=0.8,
                    description="Test",
                    supporting_data={}
                )
            ],
            primary_reasoning="Test",
            supporting_reasons=[],
            risk_factors=[],
            key_statistics={},
            market_context=MarketContextReasoning(
                price_trend_analysis="Test price trend",
                volume_analysis="Test volume",
                comparable_sales_context="Test sales",
                market_sentiment="Test sentiment",
                liquidity_assessment="Test liquidity",
                arbitrage_opportunities=[],
                market_inefficiencies=[],
                timing_factors=[]
            ),
            player_analysis=PlayerPerformanceReasoning(
                recent_games_analysis="Test recent games",
                season_performance_context="Test season",
                career_trajectory="Test trajectory",
                clutch_performance_note="Test clutch",
                injury_status="Test injury",
                team_context="Test team",
                matchup_analysis="Test matchup",
                statistical_highlights=[],
                performance_trends={}
            ),
            scarcity_analysis=ScarcityReasoning(
                serial_number_significance="Test serial",
                moment_type_rarity="Test type",
                player_moment_availability="Test availability",
                circulation_analysis="Test circulation",
                collector_demand="Test demand",
                historical_scarcity_premium="Test premium",
                future_scarcity_projection="Test projection"
            ),
            timestamp=datetime.now(),
            analysis_version="1.0"
        )
        
        history = ReasoningHistory(
            id="test_id",
            moment_id="test_moment",
            user_id="test_user",
            reasoning_result=reasoning_result,
            accuracy_score=None
        )
        
        aggregations = reasoning_service._calculate_search_aggregations([history])
        
        assert "decision_distribution" in aggregations
        assert "average_confidence" in aggregations
        assert "factor_type_distribution" in aggregations
        assert aggregations["decision_distribution"]["buy"] == 1
        assert aggregations["average_confidence"] == 0.8

    def test_calculate_confidence_calibration(self, reasoning_service):
        """Test confidence calibration calculation"""
        confidence_accuracy_pairs = [
            (0.9, 0.85),  # High confidence, high accuracy
            (0.7, 0.65),  # Medium confidence, medium accuracy
            (0.3, 0.25),  # Low confidence, low accuracy
        ]
        
        calibration = reasoning_service._calculate_confidence_calibration(confidence_accuracy_pairs)
        
        assert 0.0 <= calibration <= 1.0
        assert calibration > 0.5  # Should be reasonably well calibrated

    def test_calculate_factor_importance(self, reasoning_service):
        """Test factor importance calculation"""
        reasoning_result = AIReasoningResult(
            moment_id="test_moment",
            decision="buy",
            confidence_score=0.8,
            factors=[
                ReasoningFactor(
                    factor_type=ReasoningFactorType.PLAYER_PERFORMANCE,
                    name="Performance",
                    weight=0.5,
                    value=0.7,
                    impact=15.0,
                    confidence=0.8,
                    description="Test",
                    supporting_data={}
                ),
                ReasoningFactor(
                    factor_type=ReasoningFactorType.SCARCITY,
                    name="Scarcity",
                    weight=0.3,
                    value=0.6,
                    impact=8.0,
                    confidence=0.7,
                    description="Test",
                    supporting_data={}
                )
            ],
            primary_reasoning="Test",
            supporting_reasons=[],
            risk_factors=[],
            key_statistics={},
            market_context=MarketContextReasoning(
                price_trend_analysis="Test price trend",
                volume_analysis="Test volume",
                comparable_sales_context="Test sales",
                market_sentiment="Test sentiment",
                liquidity_assessment="Test liquidity",
                arbitrage_opportunities=[],
                market_inefficiencies=[],
                timing_factors=[]
            ),
            player_analysis=PlayerPerformanceReasoning(
                recent_games_analysis="Test recent games",
                season_performance_context="Test season",
                career_trajectory="Test trajectory",
                clutch_performance_note="Test clutch",
                injury_status="Test injury",
                team_context="Test team",
                matchup_analysis="Test matchup",
                statistical_highlights=[],
                performance_trends={}
            ),
            scarcity_analysis=ScarcityReasoning(
                serial_number_significance="Test serial",
                moment_type_rarity="Test type",
                player_moment_availability="Test availability",
                circulation_analysis="Test circulation",
                collector_demand="Test demand",
                historical_scarcity_premium="Test premium",
                future_scarcity_projection="Test projection"
            ),
            timestamp=datetime.now(),
            analysis_version="1.0"
        )
        
        history = ReasoningHistory(
            id="test_id",
            moment_id="test_moment",
            user_id="test_user",
            reasoning_result=reasoning_result,
            accuracy_score=None
        )
        
        importance = reasoning_service._calculate_factor_importance([history])
        
        assert "player_performance" in importance
        assert "scarcity" in importance
        assert importance["player_performance"] == 15.0
        assert importance["scarcity"] == 8.0

    def test_identify_failure_modes(self, reasoning_service):
        """Test identification of failure modes"""
        # Create reasoning results with low confidence
        low_confidence_results = []
        for i in range(5):
            reasoning_result = AIReasoningResult(
                moment_id=f"test_moment_{i}",
                decision="skip",
                confidence_score=0.3,  # Low confidence
                factors=[],
                primary_reasoning="Test",
                supporting_reasons=[],
                risk_factors=[],
                key_statistics={},
                market_context=MarketContextReasoning(
                    price_trend_analysis="Test price trend",
                    volume_analysis="Test volume",
                    comparable_sales_context="Test sales",
                    market_sentiment="Test sentiment",
                    liquidity_assessment="Test liquidity",
                    arbitrage_opportunities=[],
                    market_inefficiencies=[],
                    timing_factors=[]
                ),
                player_analysis=PlayerPerformanceReasoning(
                    recent_games_analysis="Test recent games",
                    season_performance_context="Test season",
                    career_trajectory="Test trajectory",
                    clutch_performance_note="Test clutch",
                    injury_status="Test injury",
                    team_context="Test team",
                    matchup_analysis="Test matchup",
                    statistical_highlights=[],
                    performance_trends={}
                ),
                scarcity_analysis=ScarcityReasoning(
                    serial_number_significance="Test serial",
                    moment_type_rarity="Test type",
                    player_moment_availability="Test availability",
                    circulation_analysis="Test circulation",
                    collector_demand="Test demand",
                    historical_scarcity_premium="Test premium",
                    future_scarcity_projection="Test projection"
                ),
                timestamp=datetime.now(),
                analysis_version="1.0"
            )
            
            history = ReasoningHistory(
                id=f"test_id_{i}",
                moment_id=f"test_moment_{i}",
                user_id="test_user",
                reasoning_result=reasoning_result,
                accuracy_score=None
            )
            
            low_confidence_results.append(history)
        
        failure_modes = reasoning_service._identify_failure_modes(low_confidence_results)
        
        assert len(failure_modes) > 0
        assert any("low-confidence decisions" in mode for mode in failure_modes)

    def test_generate_improvement_suggestions(self, reasoning_service):
        """Test generation of improvement suggestions"""
        suggestions = reasoning_service._generate_improvement_suggestions(
            accuracy_rate=0.5,  # Low accuracy
            confidence_calibration=0.6,  # Poor calibration
            factor_importance={"player_performance": 20.0, "scarcity": 5.0}  # Imbalanced
        )
        
        assert len(suggestions) > 0
        assert any("data quality" in suggestion.lower() for suggestion in suggestions)
        assert any("calibrate" in suggestion.lower() for suggestion in suggestions)
        assert any("balance factor weights" in suggestion.lower() for suggestion in suggestions)


class TestReasoningIntegration:
    """Integration tests for reasoning system"""
    
    @pytest.mark.asyncio
    async def test_full_reasoning_workflow(self):
        """Test complete reasoning workflow from analysis to explanation"""
        # This would require a real database connection in a full integration test
        # For now, we'll test the workflow with mocks
        
        # Mock database client
        mock_db = Mock(spec=DatabaseClient)
        mock_db.fetch_all = AsyncMock(return_value=[])
        mock_db.fetch_one = AsyncMock(return_value=None)
        mock_db.execute = AsyncMock(return_value=None)
        
        # Create service
        service = ReasoningService(mock_db)
        
        # Create sample analysis result
        analysis_result = MomentAnalysisResult(
            moment_id="integration_test_moment",
            player_id="integration_test_player",
            valuation=ValuationResult(
                fair_value=200.0,
                confidence_score=0.9,
                recommendation="strong buy",
                upside_potential=0.3,
                risk_score=0.2
            ),
            factors=[],
            player_analysis={"performance_metrics": {"recent_form_score": 90}},
            market_analysis={"current_price": 150.0, "price_ratio": 1.33},
            risk_assessment={"price_volatility": 0.15},
            timestamp=datetime.now()
        )
        
        # Generate reasoning
        reasoning_result = service.generate_detailed_reasoning(analysis_result)
        
        # Verify reasoning was generated
        assert reasoning_result.moment_id == "integration_test_moment"
        assert reasoning_result.decision == "buy"
        assert reasoning_result.confidence_score == 0.9
        
        # Generate human explanation
        explanation = service.generate_human_explanation(reasoning_result)
        
        # Verify explanation
        assert "purchase this moment with 90% confidence" in explanation.summary
        assert explanation.detailed_explanation is not None
        
        # Store reasoning (mocked)
        reasoning_id = await service.store_reasoning(reasoning_result, "test_user")
        
        # Verify storage was attempted
        assert reasoning_id is not None
        assert mock_db.execute.called


if __name__ == "__main__":
    pytest.main([__file__, "-v"])