#!/usr/bin/env python3
"""
Basic test runner for AI Reasoning System

This script tests the core functionality of the reasoning system
without requiring a full database setup.
"""

import sys
import os
from datetime import datetime
from unittest.mock import Mock, AsyncMock

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from src.services.reasoning_service import ReasoningService
from src.models.reasoning import (
    AIReasoningResult, ReasoningFactor, ReasoningFactorType,
    PlayerPerformanceReasoning, MarketContextReasoning, ScarcityReasoning,
    ReasoningExplanation
)
from src.models.moment_analysis import (
    MomentAnalysisResult, ValuationResult, PlayerPerformanceFactor,
    ScarcityFactor
)
from src.data_sources.database_client import DatabaseClient


def create_sample_analysis_result():
    """Create a sample moment analysis result for testing"""
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
            "price_volatility": 0.25,
            "liquidity_risk": 0.2
        },
        timestamp=datetime.now()
    )


def test_reasoning_generation():
    """Test the reasoning generation functionality"""
    print("Testing AI Reasoning Generation...")
    
    # Create mock database client
    mock_db = Mock(spec=DatabaseClient)
    mock_db.fetch_all = AsyncMock(return_value=[])
    mock_db.fetch_one = AsyncMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=None)
    
    # Create reasoning service
    service = ReasoningService(mock_db)
    
    # Create sample analysis result
    analysis_result = create_sample_analysis_result()
    
    # Test factor generation
    print("  ✓ Testing factor generation...")
    factors = service.generate_reasoning_factors(analysis_result)
    assert len(factors) == 2, f"Expected 2 factors, got {len(factors)}"
    assert factors[0].factor_type == ReasoningFactorType.PLAYER_PERFORMANCE
    assert factors[1].factor_type == ReasoningFactorType.SCARCITY
    print(f"    Generated {len(factors)} reasoning factors")
    
    # Test detailed reasoning generation
    print("  ✓ Testing detailed reasoning generation...")
    reasoning_result = service.generate_detailed_reasoning(analysis_result)
    assert reasoning_result.moment_id == "test_moment_123"
    assert reasoning_result.decision == "buy"
    assert reasoning_result.confidence_score == 0.85
    assert len(reasoning_result.factors) == 2
    assert "Strong buy opportunity" in reasoning_result.primary_reasoning
    print(f"    Generated reasoning with decision: {reasoning_result.decision}")
    print(f"    Confidence score: {reasoning_result.confidence_score}")
    
    # Test human explanation generation
    print("  ✓ Testing human explanation generation...")
    explanation = service.generate_human_explanation(reasoning_result)
    assert "purchase this moment with 85% confidence" in explanation.summary
    assert len(explanation.key_factors) > 0
    assert "Current Price" in explanation.supporting_stats
    print(f"    Generated explanation: {explanation.summary}")
    
    print("✅ Reasoning generation tests passed!")
    return True


def test_reasoning_analysis():
    """Test reasoning analysis functionality"""
    print("\nTesting AI Reasoning Analysis...")
    
    # Create mock database client
    mock_db = Mock(spec=DatabaseClient)
    service = ReasoningService(mock_db)
    
    # Test decision mapping
    print("  ✓ Testing decision mapping...")
    assert service._map_recommendation_to_decision("strong buy") == "buy"
    assert service._map_recommendation_to_decision("sell") == "sell"
    assert service._map_recommendation_to_decision("hold") == "hold"
    assert service._map_recommendation_to_decision("unknown") == "skip"
    print("    Decision mapping works correctly")
    
    # Test supporting reasons generation
    print("  ✓ Testing supporting reasons generation...")
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
        )
    ]
    
    reasons = service._generate_supporting_reasons(factors)
    assert len(reasons) == 1
    assert "Player Performance: positive impact of +15.0%" in reasons[0]
    print(f"    Generated {len(reasons)} supporting reasons")
    
    # Test key statistics extraction
    print("  ✓ Testing key statistics extraction...")
    analysis_result = create_sample_analysis_result()
    key_stats = service._extract_key_statistics(analysis_result)
    assert "current_price" in key_stats
    assert "fair_value" in key_stats
    assert key_stats["current_price"] == 120.0
    print(f"    Extracted {len(key_stats)} key statistics")
    
    print("✅ Reasoning analysis tests passed!")
    return True


def test_reasoning_context():
    """Test reasoning context generation"""
    print("\nTesting Reasoning Context Generation...")
    
    mock_db = Mock(spec=DatabaseClient)
    service = ReasoningService(mock_db)
    analysis_result = create_sample_analysis_result()
    
    # Test market context generation
    print("  ✓ Testing market context generation...")
    market_context = service._generate_market_context(analysis_result)
    assert "undervalued by 25.0%" in market_context.price_trend_analysis
    assert market_context.volume_analysis is not None
    print("    Market context generated successfully")
    
    # Test player analysis generation
    print("  ✓ Testing player analysis generation...")
    player_analysis = service._generate_player_analysis(analysis_result)
    assert "Excellent recent form (85.0/100)" in player_analysis.recent_games_analysis
    assert "Highly consistent season performance (78.0/100)" in player_analysis.season_performance_context
    print("    Player analysis generated successfully")
    
    # Test scarcity analysis generation
    print("  ✓ Testing scarcity analysis generation...")
    scarcity_analysis = service._generate_scarcity_analysis(analysis_result)
    assert scarcity_analysis.serial_number_significance is not None
    assert scarcity_analysis.circulation_analysis is not None
    print("    Scarcity analysis generated successfully")
    
    print("✅ Reasoning context tests passed!")
    return True


def test_reasoning_performance():
    """Test reasoning performance analysis"""
    print("\nTesting Reasoning Performance Analysis...")
    
    mock_db = Mock(spec=DatabaseClient)
    service = ReasoningService(mock_db)
    
    # Test confidence calibration calculation
    print("  ✓ Testing confidence calibration...")
    confidence_accuracy_pairs = [
        (0.9, 0.85),  # High confidence, high accuracy
        (0.7, 0.65),  # Medium confidence, medium accuracy
        (0.3, 0.25),  # Low confidence, low accuracy
    ]
    
    calibration = service._calculate_confidence_calibration(confidence_accuracy_pairs)
    assert 0.0 <= calibration <= 1.0
    print(f"    Confidence calibration score: {calibration:.3f}")
    
    # Test improvement suggestions
    print("  ✓ Testing improvement suggestions...")
    suggestions = service._generate_improvement_suggestions(
        accuracy_rate=0.5,  # Low accuracy
        confidence_calibration=0.6,  # Poor calibration
        factor_importance={"player_performance": 20.0, "scarcity": 5.0}
    )
    
    assert len(suggestions) > 0
    print(f"    Generated {len(suggestions)} improvement suggestions")
    for i, suggestion in enumerate(suggestions, 1):
        print(f"      {i}. {suggestion}")
    
    print("✅ Reasoning performance tests passed!")
    return True


def main():
    """Run all reasoning system tests"""
    print("🚀 Starting AI Reasoning System Tests\n")
    
    try:
        # Run all test suites
        test_results = [
            test_reasoning_generation(),
            test_reasoning_analysis(),
            test_reasoning_context(),
            test_reasoning_performance()
        ]
        
        if all(test_results):
            print("\n🎉 All AI Reasoning System tests passed successfully!")
            print("\nThe reasoning system is ready for:")
            print("  • Generating detailed AI reasoning for moment analysis")
            print("  • Creating human-friendly explanations")
            print("  • Storing and retrieving reasoning history")
            print("  • Performance monitoring and improvement suggestions")
            print("  • Factor analysis and ranking")
            return True
        else:
            print("\n❌ Some tests failed!")
            return False
            
    except Exception as e:
        print(f"\n💥 Test execution failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)