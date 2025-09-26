"""
Unit tests for AI Reasoning API Routes

Tests the reasoning API endpoints for retrieving and searching reasoning data
"""

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import Mock, AsyncMock
from datetime import datetime, timedelta
from uuid import uuid4

from src.api.reasoning_routes import create_reasoning_router
from src.services.reasoning_service import ReasoningService
from src.models.reasoning import (
    AIReasoningResult, ReasoningFactor, ReasoningFactorType,
    PlayerPerformanceReasoning, MarketContextReasoning, ScarcityReasoning,
    ReasoningSearchQuery, ReasoningSearchResult, ReasoningExplanation,
    ReasoningPerformanceMetrics, ReasoningHistory
)


class TestReasoningRoutes:
    """Test suite for reasoning API routes"""
    
    @pytest.fixture
    def mock_reasoning_service(self):
        """Mock reasoning service"""
        service = Mock(spec=ReasoningService)
        service.get_reasoning_by_moment = AsyncMock()
        service.search_reasoning = AsyncMock()
        service.calculate_performance_metrics = AsyncMock()
        service.generate_detailed_reasoning = Mock()
        service.store_reasoning = AsyncMock()
        service.generate_human_explanation = Mock()
        return service
    
    @pytest.fixture
    def test_app(self, mock_reasoning_service):
        """Create test FastAPI app with reasoning routes"""
        app = FastAPI()
        router = create_reasoning_router(mock_reasoning_service)
        app.include_router(router)
        return app
    
    @pytest.fixture
    def client(self, test_app):
        """Create test client"""
        return TestClient(test_app)
    
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
                    description="Strong recent performance",
                    supporting_data={"avg_points": 25}
                )
            ],
            primary_reasoning="Strong buy opportunity",
            supporting_reasons=["Player performing well"],
            risk_factors=["Market volatility"],
            key_statistics={"current_price": 120.0, "fair_value": 150.0},
            market_context=MarketContextReasoning(
                price_trend_analysis="Undervalued",
                volume_analysis="Stable volume",
                comparable_sales_context="Recent sales support valuation",
                market_sentiment="Positive",
                liquidity_assessment="Good liquidity",
                arbitrage_opportunities=[],
                market_inefficiencies=[],
                timing_factors=["Real-time data"]
            ),
            player_analysis=PlayerPerformanceReasoning(
                recent_games_analysis="Excellent form",
                season_performance_context="Consistent season",
                career_trajectory="Improving",
                clutch_performance_note="Strong clutch stats",
                injury_status="Healthy",
                team_context="Good team performance",
                matchup_analysis="Favorable matchups",
                statistical_highlights=[],
                performance_trends={}
            ),
            scarcity_analysis=ScarcityReasoning(
                serial_number_significance="Low serial number",
                moment_type_rarity="Rare moment type",
                player_moment_availability="Limited availability",
                circulation_analysis="Low circulation",
                collector_demand="High demand",
                historical_scarcity_premium="Premium expected",
                future_scarcity_projection="Increasing scarcity"
            ),
            timestamp=datetime.now(),
            analysis_version="1.0"
        )
    
    @pytest.fixture
    def sample_explanation(self):
        """Sample reasoning explanation for testing"""
        return ReasoningExplanation(
            summary="AI recommends to purchase this moment with 85% confidence.",
            detailed_explanation="Strong buy opportunity based on player performance and market conditions.",
            key_factors=[
                "Player Performance Analysis: Strong recent performance",
                "Market conditions favor purchase"
            ],
            supporting_stats={
                "Current Price": "$120.00",
                "Fair Value": "$150.00",
                "Recent Form": "85"
            },
            market_context="Current price appears undervalued",
            risk_assessment="Market volatility risk identified",
            confidence_explanation="High confidence due to strong supporting data",
            what_could_change_decision=[
                "Significant price increase",
                "Negative performance trends"
            ]
        )

    def test_get_moment_reasoning_success(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test successful retrieval of moment reasoning"""
        mock_reasoning_service.get_reasoning_by_moment.return_value = [sample_reasoning_result]
        
        response = client.get("/reasoning/moment/test_moment_123?limit=5")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["moment_id"] == "test_moment_123"
        assert data[0]["decision"] == "buy"
        assert data[0]["confidence_score"] == 0.85
        
        mock_reasoning_service.get_reasoning_by_moment.assert_called_once_with(
            moment_id="test_moment_123",
            limit=5
        )

    def test_get_moment_reasoning_not_found(self, client, mock_reasoning_service):
        """Test moment reasoning not found"""
        mock_reasoning_service.get_reasoning_by_moment.return_value = []
        
        response = client.get("/reasoning/moment/nonexistent_moment")
        
        assert response.status_code == 404
        assert "No reasoning found" in response.json()["detail"]

    def test_get_moment_reasoning_server_error(self, client, mock_reasoning_service):
        """Test server error in moment reasoning retrieval"""
        mock_reasoning_service.get_reasoning_by_moment.side_effect = Exception("Database error")
        
        response = client.get("/reasoning/moment/test_moment_123")
        
        assert response.status_code == 500
        assert "Failed to retrieve reasoning data" in response.json()["detail"]

    def test_get_moment_explanation_success(self, client, mock_reasoning_service, sample_reasoning_result, sample_explanation):
        """Test successful retrieval of moment explanation"""
        mock_reasoning_service.get_reasoning_by_moment.return_value = [sample_reasoning_result]
        mock_reasoning_service.generate_human_explanation.return_value = sample_explanation
        
        response = client.get("/reasoning/moment/test_moment_123/explanation")
        
        assert response.status_code == 200
        data = response.json()
        assert "purchase this moment with 85% confidence" in data["summary"]
        assert "Current Price" in data["supporting_stats"]
        assert len(data["key_factors"]) > 0

    def test_get_moment_explanation_not_found(self, client, mock_reasoning_service):
        """Test moment explanation not found"""
        mock_reasoning_service.get_reasoning_by_moment.return_value = []
        
        response = client.get("/reasoning/moment/nonexistent_moment/explanation")
        
        assert response.status_code == 404
        assert "No reasoning found" in response.json()["detail"]

    def test_search_reasoning_success(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test successful reasoning search"""
        history = ReasoningHistory(
            id=str(uuid4()),
            moment_id="test_moment_123",
            user_id="test_user",
            reasoning_result=sample_reasoning_result,
            accuracy_score=None
        )
        
        search_result = ReasoningSearchResult(
            total_count=1,
            results=[history],
            aggregations={
                "decision_distribution": {"buy": 1},
                "average_confidence": 0.85
            }
        )
        
        mock_reasoning_service.search_reasoning.return_value = search_result
        
        search_query = {
            "moment_ids": ["test_moment_123"],
            "decision_types": ["buy"],
            "limit": 10,
            "offset": 0
        }
        
        response = client.post("/reasoning/search", json=search_query)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["moment_id"] == "test_moment_123"
        assert "decision_distribution" in data["aggregations"]

    def test_search_reasoning_with_filters(self, client, mock_reasoning_service):
        """Test reasoning search with various filters"""
        mock_reasoning_service.search_reasoning.return_value = ReasoningSearchResult(
            total_count=0,
            results=[],
            aggregations={}
        )
        
        search_query = {
            "decision_types": ["buy", "sell"],
            "min_confidence": 0.7,
            "date_from": "2024-01-01T00:00:00",
            "date_to": "2024-01-31T23:59:59",
            "limit": 50,
            "offset": 0
        }
        
        response = client.post("/reasoning/search", json=search_query)
        
        assert response.status_code == 200
        
        # Verify the service was called with correct parameters
        call_args = mock_reasoning_service.search_reasoning.call_args[0][0]
        assert call_args.decision_types == ["buy", "sell"]
        assert call_args.min_confidence == 0.7
        assert call_args.limit == 50

    def test_get_performance_metrics_success(self, client, mock_reasoning_service):
        """Test successful performance metrics retrieval"""
        metrics = ReasoningPerformanceMetrics(
            total_decisions=100,
            accuracy_rate=0.75,
            confidence_calibration=0.8,
            factor_importance_ranking={
                "player_performance": 15.0,
                "market_trend": 12.0,
                "scarcity": 8.0
            },
            common_failure_modes=[
                "Low confidence in volatile markets"
            ],
            improvement_suggestions=[
                "Improve data quality"
            ]
        )
        
        mock_reasoning_service.calculate_performance_metrics.return_value = metrics
        
        response = client.get("/reasoning/performance?days_back=30")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_decisions"] == 100
        assert data["accuracy_rate"] == 0.75
        assert data["confidence_calibration"] == 0.8
        assert "player_performance" in data["factor_importance_ranking"]

    def test_generate_reasoning_success(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test successful reasoning generation"""
        from src.models.moment_analysis import MomentAnalysisResult, ValuationResult
        
        mock_reasoning_service.generate_detailed_reasoning.return_value = sample_reasoning_result
        mock_reasoning_service.store_reasoning.return_value = str(uuid4())
        
        analysis_data = {
            "moment_id": "test_moment_123",
            "player_id": "player_456",
            "valuation": {
                "fair_value": 150.0,
                "confidence_score": 0.85,
                "recommendation": "buy",
                "upside_potential": 0.25,
                "risk_score": 0.3
            },
            "factors": [],
            "player_analysis": {},
            "market_analysis": {},
            "risk_assessment": {},
            "timestamp": datetime.now().isoformat()
        }
        
        response = client.post("/reasoning/generate", json=analysis_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["moment_id"] == "test_moment_123"
        assert data["decision"] == "buy"

    def test_get_factor_importance_success(self, client, mock_reasoning_service):
        """Test successful factor importance retrieval"""
        metrics = ReasoningPerformanceMetrics(
            total_decisions=50,
            accuracy_rate=0.8,
            confidence_calibration=0.75,
            factor_importance_ranking={
                "player_performance": 18.0,
                "market_trend": 14.0,
                "scarcity": 10.0,
                "social_sentiment": 6.0
            },
            common_failure_modes=[],
            improvement_suggestions=[]
        )
        
        mock_reasoning_service.calculate_performance_metrics.return_value = metrics
        
        response = client.get("/reasoning/factors/importance?days_back=14")
        
        assert response.status_code == 200
        data = response.json()
        assert "factor_importance" in data
        assert data["factor_importance"]["player_performance"] == 18.0
        assert data["total_decisions"] == 50
        assert data["analysis_period"]["days"] == 14

    def test_get_decisions_summary_success(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test successful decisions summary retrieval"""
        history = ReasoningHistory(
            id=str(uuid4()),
            moment_id="test_moment_123",
            user_id="test_user",
            reasoning_result=sample_reasoning_result,
            accuracy_score=None
        )
        
        search_result = ReasoningSearchResult(
            total_count=3,
            results=[history, history, history],  # 3 buy decisions
            aggregations={}
        )
        
        mock_reasoning_service.search_reasoning.return_value = search_result
        
        response = client.get("/reasoning/decisions/summary?days_back=7")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_decisions"] == 3
        assert data["period"]["days"] == 7
        assert "decision_breakdown" in data
        assert "average_confidence_by_decision" in data
        assert data["decision_breakdown"]["buy"] == 3

    def test_get_confidence_distribution_success(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test successful confidence distribution retrieval"""
        # Create reasoning results with different confidence levels
        high_confidence = sample_reasoning_result
        medium_confidence = AIReasoningResult(
            moment_id="test_moment_456",
            decision="hold",
            confidence_score=0.65,
            factors=[],
            primary_reasoning="Medium confidence decision",
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
        
        histories = [
            ReasoningHistory(
                id=str(uuid4()),
                moment_id="test_moment_123",
                user_id="test_user",
                reasoning_result=high_confidence,
                accuracy_score=None
            ),
            ReasoningHistory(
                id=str(uuid4()),
                moment_id="test_moment_456",
                user_id="test_user",
                reasoning_result=medium_confidence,
                accuracy_score=None
            )
        ]
        
        search_result = ReasoningSearchResult(
            total_count=2,
            results=histories,
            aggregations={}
        )
        
        mock_reasoning_service.search_reasoning.return_value = search_result
        
        response = client.get("/reasoning/confidence/distribution?days_back=30")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_decisions"] == 2
        assert data["average_confidence"] == 0.75  # (0.85 + 0.65) / 2
        assert "confidence_distribution" in data
        assert "confidence_percentiles" in data

    def test_invalid_query_parameters(self, client, mock_reasoning_service):
        """Test handling of invalid query parameters"""
        # Test invalid days_back parameter
        response = client.get("/reasoning/performance?days_back=0")
        assert response.status_code == 422  # Validation error
        
        response = client.get("/reasoning/performance?days_back=400")
        assert response.status_code == 422  # Validation error

    def test_search_reasoning_validation_error(self, client, mock_reasoning_service):
        """Test search reasoning with validation errors"""
        # Invalid search query
        invalid_query = {
            "limit": -1,  # Invalid limit
            "offset": -5   # Invalid offset
        }
        
        response = client.post("/reasoning/search", json=invalid_query)
        assert response.status_code == 422  # Validation error

    def test_server_error_handling(self, client, mock_reasoning_service):
        """Test server error handling across endpoints"""
        mock_reasoning_service.calculate_performance_metrics.side_effect = Exception("Database connection failed")
        
        response = client.get("/reasoning/performance")
        assert response.status_code == 500
        assert "Failed to calculate performance metrics" in response.json()["detail"]

    def test_empty_search_results(self, client, mock_reasoning_service):
        """Test handling of empty search results"""
        empty_result = ReasoningSearchResult(
            total_count=0,
            results=[],
            aggregations={}
        )
        
        mock_reasoning_service.search_reasoning.return_value = empty_result
        
        response = client.post("/reasoning/search", json={"limit": 10, "offset": 0})
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 0
        assert len(data["results"]) == 0

    def test_large_search_results(self, client, mock_reasoning_service, sample_reasoning_result):
        """Test handling of large search results"""
        # Create many reasoning histories
        histories = []
        for i in range(100):
            history = ReasoningHistory(
                id=str(uuid4()),
                moment_id=f"test_moment_{i}",
                user_id="test_user",
                reasoning_result=sample_reasoning_result,
                accuracy_score=None
            )
            histories.append(history)
        
        large_result = ReasoningSearchResult(
            total_count=1000,  # More results available
            results=histories,  # But only 100 returned
            aggregations={
                "decision_distribution": {"buy": 1000},
                "average_confidence": 0.85
            }
        )
        
        mock_reasoning_service.search_reasoning.return_value = large_result
        
        response = client.post("/reasoning/search", json={"limit": 100, "offset": 0})
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 1000
        assert len(data["results"]) == 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])