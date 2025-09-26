import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import logging

from ..models.moment_analysis import (
    MomentAnalysisRequest, MomentValuation, ValuationFactor,
    PlayerPerformanceFactor, ScarcityFactor, MarketTrendFactor,
    SocialSentimentFactor, MomentAnalysisResult
)
from ..models.player_stats import PlayerPerformanceMetrics

logger = logging.getLogger(__name__)

class MomentValuator:
    """AI-powered moment valuation engine"""
    
    def __init__(self):
        self.valuation_model = GradientBoostingRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            random_state=42
        )
        self.scaler = StandardScaler()
        self.is_trained = False
        self.feature_importance = {}
        
        # Valuation weights for different factors
        self.factor_weights = {
            'player_performance': 0.35,
            'scarcity': 0.25,
            'market_trend': 0.20,
            'social_sentiment': 0.20
        }
    
    def calculate_scarcity_factor(
        self,
        moment_request: MomentAnalysisRequest,
        total_moments_for_player: int,
        total_circulation: int
    ) -> ScarcityFactor:
        """Calculate scarcity-based valuation factor"""
        
        # Serial number rarity (lower serial numbers are rarer)
        serial_rarity = max(0, 100 - (moment_request.serial_number / 1000) * 100)
        serial_rarity = min(100, serial_rarity)
        
        # Moment type rarity scoring
        moment_type_scores = {
            'dunk': 85,
            'game_winner': 95,
            'milestone': 90,
            'three_pointer': 70,
            'assist': 60,
            'steal': 75,
            'block': 80,
            'rebound': 50
        }
        moment_type_rarity = moment_type_scores.get(moment_request.moment_type.value, 60)
        
        # Player moment scarcity
        player_scarcity = max(0, 100 - (total_moments_for_player / 100) * 100)
        player_scarcity = min(100, player_scarcity)
        
        # Overall circulation scarcity
        circulation_scarcity = max(0, 100 - (total_circulation / 10000) * 100)
        circulation_scarcity = min(100, circulation_scarcity)
        
        # Weighted scarcity score
        overall_scarcity = (
            serial_rarity * 0.4 +
            moment_type_rarity * 0.3 +
            player_scarcity * 0.2 +
            circulation_scarcity * 0.1
        )
        
        # Calculate impact on valuation
        impact = (overall_scarcity - 50) * 1.5  # Scale to impact percentage
        
        return ScarcityFactor(
            factor_type="scarcity",
            weight=self.factor_weights['scarcity'],
            value=overall_scarcity / 100.0,
            description=f"Scarcity analysis: Serial #{moment_request.serial_number} "
                       f"({serial_rarity:.1f}/100), {moment_request.moment_type.value} "
                       f"({moment_type_rarity}/100), Player moments: {total_moments_for_player}",
            impact=impact,
            serial_number_rarity=serial_rarity,
            moment_type_rarity=moment_type_rarity,
            player_moment_count=total_moments_for_player,
            total_circulation=total_circulation
        )
    
    def calculate_market_trend_factor(
        self,
        moment_request: MomentAnalysisRequest,
        price_history: List[Dict[str, Any]],
        comparable_sales: List[Dict[str, Any]]
    ) -> MarketTrendFactor:
        """Calculate market trend-based valuation factor"""
        
        if not price_history:
            return MarketTrendFactor(
                factor_type="market_trend",
                weight=self.factor_weights['market_trend'],
                value=0.5,
                description="No price history available",
                impact=0,
                price_momentum=0,
                volume_trend=0,
                market_sentiment=0,
                comparable_sales=[]
            )
        
        # Calculate price momentum
        recent_prices = [p['price'] for p in price_history[-10:]]
        if len(recent_prices) >= 2:
            price_change = (recent_prices[-1] - recent_prices[0]) / recent_prices[0] * 100
            price_momentum = max(-100, min(100, price_change))
        else:
            price_momentum = 0
        
        # Calculate volume trend
        recent_volumes = [p.get('volume', 0) for p in price_history[-10:]]
        if len(recent_volumes) >= 2 and sum(recent_volumes) > 0:
            volume_change = (recent_volumes[-1] - recent_volumes[0]) / max(recent_volumes[0], 1) * 100
            volume_trend = max(-100, min(100, volume_change))
        else:
            volume_trend = 0
        
        # Market sentiment based on price vs. comparable sales
        if comparable_sales:
            avg_comparable_price = np.mean([sale['price'] for sale in comparable_sales])
            sentiment = (moment_request.current_price - avg_comparable_price) / avg_comparable_price
            market_sentiment = max(-1, min(1, sentiment))
        else:
            market_sentiment = 0
        
        # Overall market trend score
        trend_score = (
            (price_momentum + 100) / 2 * 0.4 +  # Normalize to 0-100
            (volume_trend + 100) / 2 * 0.3 +
            (market_sentiment + 1) * 50 * 0.3  # Normalize to 0-100
        )
        
        impact = (trend_score - 50) * 1.2
        
        return MarketTrendFactor(
            factor_type="market_trend",
            weight=self.factor_weights['market_trend'],
            value=trend_score / 100.0,
            description=f"Market trend: Price momentum {price_momentum:+.1f}%, "
                       f"Volume trend {volume_trend:+.1f}%, "
                       f"Market sentiment {market_sentiment:+.2f}",
            impact=impact,
            price_momentum=price_momentum,
            volume_trend=volume_trend,
            market_sentiment=market_sentiment,
            comparable_sales=comparable_sales
        )
    
    def calculate_social_sentiment_factor(
        self,
        player_id: str,
        social_data: Optional[Dict[str, Any]] = None
    ) -> SocialSentimentFactor:
        """Calculate social sentiment-based valuation factor"""
        
        # In a real implementation, this would integrate with social media APIs
        # For now, we'll use placeholder logic
        
        if not social_data:
            social_data = {
                'mentions': 100,
                'sentiment': 0.1,
                'viral_score': 30,
                'influencer_mentions': 5
            }
        
        mentions = social_data.get('mentions', 0)
        sentiment = social_data.get('sentiment', 0)  # -1 to 1
        viral_score = social_data.get('viral_score', 0)  # 0 to 100
        influencer_mentions = social_data.get('influencer_mentions', 0)
        
        # Normalize mentions (log scale for large numbers)
        mentions_score = min(100, np.log10(max(1, mentions)) * 20)
        
        # Sentiment score (convert -1,1 to 0,100)
        sentiment_score = (sentiment + 1) * 50
        
        # Overall social sentiment score
        social_score = (
            mentions_score * 0.3 +
            sentiment_score * 0.4 +
            viral_score * 0.2 +
            min(100, influencer_mentions * 10) * 0.1
        )
        
        impact = (social_score - 50) * 0.8  # Social sentiment has moderate impact
        
        return SocialSentimentFactor(
            factor_type="social_sentiment",
            weight=self.factor_weights['social_sentiment'],
            value=social_score / 100.0,
            description=f"Social sentiment: {mentions} mentions, "
                       f"sentiment {sentiment:+.2f}, viral score {viral_score}",
            impact=impact,
            social_mentions=mentions,
            sentiment_score=sentiment,
            viral_potential=viral_score,
            influencer_mentions=influencer_mentions
        )
    
    def calculate_fair_value(
        self,
        factors: List[ValuationFactor],
        base_price: float
    ) -> Tuple[float, float]:
        """Calculate fair value and confidence based on factors"""
        
        # Calculate weighted impact
        total_impact = 0
        total_weight = 0
        
        for factor in factors:
            weighted_impact = factor.impact * factor.weight
            total_impact += weighted_impact
            total_weight += factor.weight
        
        # Normalize impact
        if total_weight > 0:
            avg_impact = total_impact / total_weight
        else:
            avg_impact = 0
        
        # Apply impact to base price
        impact_multiplier = 1 + (avg_impact / 100)
        fair_value = base_price * impact_multiplier
        
        # Calculate confidence based on factor consistency
        factor_values = [factor.value for factor in factors]
        if len(factor_values) > 1:
            consistency = 1 - np.std(factor_values)
            confidence = max(0.3, min(1.0, consistency))
        else:
            confidence = 0.5
        
        return fair_value, confidence
    
    def analyze_moment(
        self,
        moment_request: MomentAnalysisRequest,
        player_performance: PlayerPerformanceMetrics,
        market_data: Dict[str, Any],
        social_data: Optional[Dict[str, Any]] = None
    ) -> MomentAnalysisResult:
        """Complete moment analysis and valuation"""
        
        # Create performance factor
        performance_factor = self._create_performance_factor(player_performance)
        
        # Create scarcity factor
        scarcity_factor = self.calculate_scarcity_factor(
            moment_request,
            market_data.get('total_moments_for_player', 50),
            market_data.get('total_circulation', 1000)
        )
        
        # Create market trend factor
        market_factor = self.calculate_market_trend_factor(
            moment_request,
            market_data.get('price_history', []),
            market_data.get('comparable_sales', [])
        )
        
        # Create social sentiment factor
        sentiment_factor = self.calculate_social_sentiment_factor(
            moment_request.player_id,
            social_data
        )
        
        factors = [performance_factor, scarcity_factor, market_factor, sentiment_factor]
        
        # Calculate fair value
        fair_value, confidence = self.calculate_fair_value(factors, moment_request.current_price)
        
        # Determine recommendation
        price_ratio = fair_value / moment_request.current_price
        if price_ratio > 1.2:
            recommendation = "Strong Buy"
        elif price_ratio > 1.05:
            recommendation = "Buy"
        elif price_ratio > 0.95:
            recommendation = "Hold"
        elif price_ratio > 0.8:
            recommendation = "Sell"
        else:
            recommendation = "Strong Sell"
        
        # Create valuation
        valuation = MomentValuation(
            moment_id=moment_request.moment_id,
            fair_value=fair_value,
            confidence_score=confidence,
            price_range_low=fair_value * 0.85,
            price_range_high=fair_value * 1.15,
            recommendation=recommendation,
            analysis_timestamp=datetime.now()
        )
        
        # Generate recommendations
        recommendations = self._generate_recommendations(
            moment_request, valuation, factors
        )
        
        return MomentAnalysisResult(
            moment_id=moment_request.moment_id,
            valuation=valuation,
            factors=factors,
            player_analysis={
                'performance_metrics': player_performance.dict(),
                'recent_form': player_performance.recent_form_score,
                'consistency': player_performance.season_consistency
            },
            market_analysis={
                'current_price': moment_request.current_price,
                'fair_value': fair_value,
                'price_ratio': price_ratio,
                'market_trend': market_factor.dict()
            },
            risk_assessment={
                'confidence': confidence,
                'price_volatility': market_data.get('volatility', 0.2),
                'liquidity_risk': market_data.get('liquidity_risk', 0.3)
            },
            recommendations=recommendations,
            analysis_metadata={
                'analysis_timestamp': datetime.now().isoformat(),
                'model_version': '1.0',
                'factors_count': len(factors)
            }
        )
    
    def _create_performance_factor(self, performance_metrics: PlayerPerformanceMetrics) -> PlayerPerformanceFactor:
        """Create performance factor from metrics"""
        
        overall_score = (
            performance_metrics.recent_form_score * 0.4 +
            performance_metrics.season_consistency * 0.3 +
            performance_metrics.clutch_performance * 0.3
        )
        
        impact = (overall_score - 50) * 1.5
        
        return PlayerPerformanceFactor(
            factor_type="player_performance",
            weight=self.factor_weights['player_performance'],
            value=overall_score / 100.0,
            description=f"Player performance: Recent form {performance_metrics.recent_form_score:.1f}, "
                       f"Consistency {performance_metrics.season_consistency:.1f}, "
                       f"Clutch {performance_metrics.clutch_performance:.1f}",
            impact=impact,
            recent_games_performance=performance_metrics.recent_form_score,
            season_performance=performance_metrics.season_consistency,
            career_trajectory=performance_metrics.breakout_potential,
            clutch_performance=performance_metrics.clutch_performance
        )
    
    def _generate_recommendations(
        self,
        moment_request: MomentAnalysisRequest,
        valuation: MomentValuation,
        factors: List[ValuationFactor]
    ) -> List[str]:
        """Generate actionable recommendations"""
        
        recommendations = []
        
        # Price-based recommendations
        price_ratio = valuation.fair_value / moment_request.current_price
        if price_ratio > 1.2:
            recommendations.append(f"Strong buy opportunity: Fair value ${valuation.fair_value:.2f} vs current ${moment_request.current_price:.2f}")
        elif price_ratio < 0.8:
            recommendations.append(f"Consider selling: Current price ${moment_request.current_price:.2f} above fair value ${valuation.fair_value:.2f}")
        
        # Factor-based recommendations
        for factor in factors:
            if factor.impact > 20:
                recommendations.append(f"Positive {factor.factor_type}: {factor.description}")
            elif factor.impact < -20:
                recommendations.append(f"Negative {factor.factor_type}: {factor.description}")
        
        # Confidence-based recommendations
        if valuation.confidence_score < 0.5:
            recommendations.append("Low confidence analysis - consider waiting for more data")
        elif valuation.confidence_score > 0.8:
            recommendations.append("High confidence analysis - strong signal for action")
        
        return recommendations
    
    def batch_analyze_moments(
        self,
        moment_requests: List[MomentAnalysisRequest],
        player_performances: Dict[str, PlayerPerformanceMetrics],
        market_data: Dict[str, Dict[str, Any]]
    ) -> List[MomentAnalysisResult]:
        """Analyze multiple moments in batch"""
        
        results = []
        
        for moment_request in moment_requests:
            try:
                player_perf = player_performances.get(moment_request.player_id)
                moment_market_data = market_data.get(moment_request.moment_id, {})
                
                if player_perf:
                    result = self.analyze_moment(
                        moment_request,
                        player_perf,
                        moment_market_data
                    )
                    results.append(result)
                else:
                    logger.warning(f"No player performance data for {moment_request.player_id}")
                    
            except Exception as e:
                logger.error(f"Error analyzing moment {moment_request.moment_id}: {str(e)}")
                continue
        
        return results
    
    def get_undervalued_moments(
        self,
        analysis_results: List[MomentAnalysisResult],
        min_confidence: float = 0.6,
        min_upside: float = 0.1
    ) -> List[MomentAnalysisResult]:
        """Filter for undervalued moments based on criteria"""
        
        undervalued = []
        
        for result in analysis_results:
            if (result.valuation.confidence_score >= min_confidence and
                result.valuation.fair_value / result.market_analysis['current_price'] > (1 + min_upside)):
                undervalued.append(result)
        
        # Sort by potential upside
        undervalued.sort(
            key=lambda x: x.valuation.fair_value / x.market_analysis['current_price'],
            reverse=True
        )
        
        return undervalued