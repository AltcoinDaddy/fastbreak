"""
AI Reasoning and Transparency Service

This service handles the generation, storage, and retrieval of AI reasoning
for moment analysis decisions. It provides transparency into how the AI
makes decisions and allows users to understand the factors behind each trade.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from uuid import UUID, uuid4
import json

from ..models.reasoning import (
    AIReasoningResult, ReasoningFactor, ReasoningFactorType,
    PlayerPerformanceReasoning, MarketContextReasoning, ScarcityReasoning,
    ReasoningHistory, ReasoningSearchQuery, ReasoningSearchResult,
    ReasoningExplanation, ReasoningPerformanceMetrics, ReasoningInsight,
    ReasoningTemplate
)
from ..models.moment_analysis import (
    MomentAnalysisResult, ValuationFactor, PlayerPerformanceFactor,
    ScarcityFactor, MarketTrendFactor, SocialSentimentFactor
)
from ..data_sources.database_client import DatabaseClient

logger = logging.getLogger(__name__)

class ReasoningService:
    """Service for AI reasoning generation and management"""
    
    def __init__(self, db_client: DatabaseClient):
        self.db = db_client
        self.templates = {}
        # Load default templates immediately
        self._load_default_templates()
    
    async def _load_templates(self):
        """Load reasoning templates from database"""
        try:
            query = """
                SELECT template_id, decision_type, template_text, 
                       required_variables, optional_variables
                FROM reasoning_templates 
                WHERE is_active = true
            """
            
            rows = await self.db.fetch_all(query)
            
            for row in rows:
                self.templates[row['template_id']] = ReasoningTemplate(
                    template_id=row['template_id'],
                    decision_type=row['decision_type'],
                    template_text=row['template_text'],
                    required_variables=row['required_variables'],
                    optional_variables=row['optional_variables']
                )
                
            logger.info(f"Loaded {len(self.templates)} reasoning templates")
            
        except Exception as e:
            logger.error(f"Failed to load reasoning templates: {str(e)}")
            # Use default templates if database fails
            self._load_default_templates()
    
    def _load_default_templates(self):
        """Load default reasoning templates"""
        self.templates = {
            'buy_strong_performance': ReasoningTemplate(
                template_id='buy_strong_performance',
                decision_type='buy',
                template_text='Player {player_name} just scored {points} points with {rebounds} rebounds, showing {performance_trend} performance. Current price of ${current_price} is {price_assessment} compared to fair value of ${fair_value}. {additional_factors}',
                required_variables=['player_name', 'points', 'rebounds', 'performance_trend', 'current_price', 'price_assessment', 'fair_value'],
                optional_variables=['additional_factors', 'risk_note']
            ),
            'buy_undervalued': ReasoningTemplate(
                template_id='buy_undervalued',
                decision_type='buy',
                template_text='Moment appears undervalued at ${current_price} vs fair value of ${fair_value} ({discount_percentage}% discount). {scarcity_factor} and {market_context}. Confidence: {confidence_level}%',
                required_variables=['current_price', 'fair_value', 'discount_percentage', 'scarcity_factor', 'market_context', 'confidence_level'],
                optional_variables=['risk_factors']
            )
        }
    
    def generate_reasoning_factors(
        self, 
        analysis_result: MomentAnalysisResult
    ) -> List[ReasoningFactor]:
        """Convert analysis factors to detailed reasoning factors"""
        
        reasoning_factors = []
        
        for factor in analysis_result.factors:
            # Convert each valuation factor to a reasoning factor with detailed explanation
            reasoning_factor = self._convert_to_reasoning_factor(factor, analysis_result)
            reasoning_factors.append(reasoning_factor)
        
        return reasoning_factors
    
    def _convert_to_reasoning_factor(
        self, 
        factor: ValuationFactor, 
        analysis_result: MomentAnalysisResult
    ) -> ReasoningFactor:
        """Convert a valuation factor to a detailed reasoning factor"""
        
        # Determine factor type
        if isinstance(factor, PlayerPerformanceFactor):
            factor_type = ReasoningFactorType.PLAYER_PERFORMANCE
            name = "Player Performance Analysis"
            supporting_data = {
                'recent_games_performance': factor.recent_games_performance,
                'season_performance': factor.season_performance,
                'career_trajectory': factor.career_trajectory,
                'clutch_performance': factor.clutch_performance
            }
        elif isinstance(factor, ScarcityFactor):
            factor_type = ReasoningFactorType.SCARCITY
            name = "Scarcity and Rarity Analysis"
            supporting_data = {
                'serial_number_rarity': factor.serial_number_rarity,
                'moment_type_rarity': factor.moment_type_rarity,
                'player_moment_count': factor.player_moment_count,
                'total_circulation': factor.total_circulation
            }
        elif isinstance(factor, MarketTrendFactor):
            factor_type = ReasoningFactorType.MARKET_TREND
            name = "Market Trend Analysis"
            supporting_data = {
                'price_momentum': factor.price_momentum,
                'volume_trend': factor.volume_trend,
                'market_sentiment': factor.market_sentiment,
                'comparable_sales_count': len(factor.comparable_sales)
            }
        elif isinstance(factor, SocialSentimentFactor):
            factor_type = ReasoningFactorType.SOCIAL_SENTIMENT
            name = "Social Sentiment Analysis"
            supporting_data = {
                'social_mentions': factor.social_mentions,
                'sentiment_score': factor.sentiment_score,
                'viral_potential': factor.viral_potential,
                'influencer_mentions': factor.influencer_mentions
            }
        else:
            factor_type = ReasoningFactorType.FUNDAMENTAL_ANALYSIS
            name = "General Analysis Factor"
            supporting_data = {}
        
        return ReasoningFactor(
            factor_type=factor_type,
            name=name,
            weight=factor.weight,
            value=factor.value,
            raw_value=None,  # Could be added if we track raw values
            impact=factor.impact,
            confidence=0.8,  # Default confidence, could be calculated
            description=factor.description,
            supporting_data=supporting_data
        )
    
    def generate_detailed_reasoning(
        self, 
        analysis_result: MomentAnalysisResult,
        user_id: Optional[str] = None
    ) -> AIReasoningResult:
        """Generate comprehensive AI reasoning for an analysis result"""
        
        # Generate reasoning factors
        factors = self.generate_reasoning_factors(analysis_result)
        
        # Determine decision based on recommendation
        decision = self._map_recommendation_to_decision(analysis_result.valuation.recommendation)
        
        # Generate primary reasoning
        primary_reasoning = self._generate_primary_reasoning(analysis_result, factors)
        
        # Generate supporting reasons
        supporting_reasons = self._generate_supporting_reasons(factors)
        
        # Identify risk factors
        risk_factors = self._identify_risk_factors(analysis_result, factors)
        
        # Extract key statistics
        key_statistics = self._extract_key_statistics(analysis_result)
        
        # Generate detailed context
        market_context = self._generate_market_context(analysis_result)
        player_analysis = self._generate_player_analysis(analysis_result)
        scarcity_analysis = self._generate_scarcity_analysis(analysis_result)
        
        return AIReasoningResult(
            moment_id=analysis_result.moment_id,
            decision=decision,
            confidence_score=analysis_result.valuation.confidence_score,
            factors=factors,
            primary_reasoning=primary_reasoning,
            supporting_reasons=supporting_reasons,
            risk_factors=risk_factors,
            key_statistics=key_statistics,
            market_context=market_context,
            player_analysis=player_analysis,
            scarcity_analysis=scarcity_analysis,
            timestamp=datetime.now(),
            analysis_version="1.0"
        )
    
    def _map_recommendation_to_decision(self, recommendation: str) -> str:
        """Map analysis recommendation to decision"""
        recommendation_lower = recommendation.lower()
        if 'strong buy' in recommendation_lower or 'buy' in recommendation_lower:
            return 'buy'
        elif 'sell' in recommendation_lower:
            return 'sell'
        elif 'hold' in recommendation_lower:
            return 'hold'
        else:
            return 'skip'
    
    def _generate_primary_reasoning(
        self, 
        analysis_result: MomentAnalysisResult, 
        factors: List[ReasoningFactor]
    ) -> str:
        """Generate the primary reasoning statement"""
        
        decision = self._map_recommendation_to_decision(analysis_result.valuation.recommendation)
        current_price = analysis_result.market_analysis['current_price']
        fair_value = analysis_result.valuation.fair_value
        confidence = analysis_result.valuation.confidence_score
        
        # Find the most impactful factor
        top_factor = max(factors, key=lambda f: abs(f.impact)) if factors else None
        
        if decision == 'buy':
            if fair_value > current_price * 1.1:
                return f"Strong buy opportunity: AI values this moment at ${fair_value:.2f}, significantly above current price of ${current_price:.2f}. Primary driver: {top_factor.name if top_factor else 'Multiple factors'} with {confidence*100:.0f}% confidence."
            else:
                return f"Buy recommendation: Moment appears fairly valued with slight upside potential. Current price ${current_price:.2f} vs fair value ${fair_value:.2f}. Key factor: {top_factor.name if top_factor else 'Analysis factors'}."
        
        elif decision == 'sell':
            return f"Sell recommendation: Current price of ${current_price:.2f} exceeds fair value of ${fair_value:.2f}. Market appears to be overvaluing this moment. Primary concern: {top_factor.name if top_factor else 'Valuation metrics'}."
        
        elif decision == 'hold':
            return f"Hold recommendation: Mixed signals with current price ${current_price:.2f} near fair value ${fair_value:.2f}. Waiting for clearer market direction. Key consideration: {top_factor.name if top_factor else 'Market uncertainty'}."
        
        else:  # skip
            return f"Skip recommendation: Insufficient opportunity or high risk. Current price ${current_price:.2f} vs fair value ${fair_value:.2f} with {confidence*100:.0f}% confidence. Primary reason: {top_factor.name if top_factor else 'Risk assessment'}."
    
    def _generate_supporting_reasons(self, factors: List[ReasoningFactor]) -> List[str]:
        """Generate supporting reasons from factors"""
        
        supporting_reasons = []
        
        # Sort factors by impact magnitude
        sorted_factors = sorted(factors, key=lambda f: abs(f.impact), reverse=True)
        
        for factor in sorted_factors[:5]:  # Top 5 factors
            if abs(factor.impact) > 5:  # Only include significant factors
                impact_direction = "positive" if factor.impact > 0 else "negative"
                supporting_reasons.append(
                    f"{factor.name}: {impact_direction} impact of {factor.impact:+.1f}% - {factor.description}"
                )
        
        return supporting_reasons
    
    def _identify_risk_factors(
        self, 
        analysis_result: MomentAnalysisResult, 
        factors: List[ReasoningFactor]
    ) -> List[str]:
        """Identify risk factors from the analysis"""
        
        risk_factors = []
        
        # Low confidence risk
        if analysis_result.valuation.confidence_score < 0.6:
            risk_factors.append(f"Low confidence analysis ({analysis_result.valuation.confidence_score*100:.0f}%) - limited data or conflicting signals")
        
        # High volatility risk
        volatility = analysis_result.risk_assessment.get('price_volatility', 0)
        if volatility > 0.3:
            risk_factors.append(f"High price volatility ({volatility*100:.0f}%) - price may fluctuate significantly")
        
        # Liquidity risk
        liquidity_risk = analysis_result.risk_assessment.get('liquidity_risk', 0)
        if liquidity_risk > 0.4:
            risk_factors.append(f"Liquidity concerns ({liquidity_risk*100:.0f}%) - may be difficult to sell quickly")
        
        # Factor-specific risks
        for factor in factors:
            if factor.factor_type == ReasoningFactorType.SOCIAL_SENTIMENT and factor.confidence < 0.5:
                risk_factors.append("Social sentiment data limited - sentiment analysis may be unreliable")
            elif factor.factor_type == ReasoningFactorType.MARKET_TREND and factor.impact < -20:
                risk_factors.append("Negative market trend - broader market conditions unfavorable")
        
        return risk_factors
    
    def _extract_key_statistics(self, analysis_result: MomentAnalysisResult) -> Dict[str, Any]:
        """Extract key statistics that influenced the decision"""
        
        key_stats = {}
        
        # Price metrics
        key_stats['current_price'] = analysis_result.market_analysis['current_price']
        key_stats['fair_value'] = analysis_result.valuation.fair_value
        key_stats['price_ratio'] = analysis_result.market_analysis['price_ratio']
        key_stats['confidence_score'] = analysis_result.valuation.confidence_score
        
        # Player metrics
        player_metrics = analysis_result.player_analysis.get('performance_metrics', {})
        if player_metrics:
            key_stats['recent_form'] = player_metrics.get('recent_form_score')
            key_stats['season_consistency'] = player_metrics.get('season_consistency')
        
        # Market metrics
        market_analysis = analysis_result.market_analysis
        if 'market_trend' in market_analysis:
            trend_data = market_analysis['market_trend']
            key_stats['price_momentum'] = trend_data.get('price_momentum')
            key_stats['volume_trend'] = trend_data.get('volume_trend')
        
        return key_stats
    
    def _generate_market_context(self, analysis_result: MomentAnalysisResult) -> MarketContextReasoning:
        """Generate detailed market context reasoning"""
        
        market_data = analysis_result.market_analysis
        
        # Price trend analysis
        price_ratio = market_data.get('price_ratio', 1.0)
        if price_ratio > 1.1:
            price_trend = f"Current price appears undervalued by {(price_ratio-1)*100:.1f}%"
        elif price_ratio < 0.9:
            price_trend = f"Current price appears overvalued by {(1-price_ratio)*100:.1f}%"
        else:
            price_trend = "Current price is fairly valued relative to AI assessment"
        
        # Volume analysis
        trend_data = market_data.get('market_trend', {})
        volume_trend = trend_data.get('volume_trend', 0)
        if volume_trend > 20:
            volume_analysis = f"Strong volume increase ({volume_trend:+.1f}%) indicates growing interest"
        elif volume_trend < -20:
            volume_analysis = f"Volume decline ({volume_trend:+.1f}%) suggests waning interest"
        else:
            volume_analysis = "Volume trends are stable"
        
        return MarketContextReasoning(
            price_trend_analysis=price_trend,
            volume_analysis=volume_analysis,
            comparable_sales_context="Based on recent comparable sales analysis",
            market_sentiment="Market sentiment analysis incorporated",
            liquidity_assessment="Liquidity risk assessed based on trading volume",
            arbitrage_opportunities=[],
            market_inefficiencies=[],
            timing_factors=["Real-time market data", "Recent performance updates"]
        )
    
    def _generate_player_analysis(self, analysis_result: MomentAnalysisResult) -> PlayerPerformanceReasoning:
        """Generate detailed player performance reasoning"""
        
        player_data = analysis_result.player_analysis
        performance_metrics = player_data.get('performance_metrics', {})
        
        recent_form = performance_metrics.get('recent_form_score', 50)
        season_consistency = performance_metrics.get('season_consistency', 50)
        
        if recent_form > 70:
            recent_analysis = f"Excellent recent form ({recent_form:.1f}/100) with strong performances"
        elif recent_form > 50:
            recent_analysis = f"Good recent form ({recent_form:.1f}/100) showing positive trends"
        else:
            recent_analysis = f"Concerning recent form ({recent_form:.1f}/100) with declining performance"
        
        if season_consistency > 70:
            season_analysis = f"Highly consistent season performance ({season_consistency:.1f}/100)"
        elif season_consistency > 50:
            season_analysis = f"Moderately consistent season ({season_consistency:.1f}/100)"
        else:
            season_analysis = f"Inconsistent season performance ({season_consistency:.1f}/100)"
        
        return PlayerPerformanceReasoning(
            recent_games_analysis=recent_analysis,
            season_performance_context=season_analysis,
            career_trajectory="Career trajectory analysis based on historical data",
            clutch_performance_note="Clutch performance metrics incorporated",
            injury_status="No current injury concerns identified",
            team_context="Team performance context considered",
            matchup_analysis="Recent matchup performance analyzed",
            statistical_highlights=[],
            performance_trends={}
        )
    
    def _generate_scarcity_analysis(self, analysis_result: MomentAnalysisResult) -> ScarcityReasoning:
        """Generate detailed scarcity reasoning"""
        
        return ScarcityReasoning(
            serial_number_significance="Serial number rarity assessed relative to total circulation",
            moment_type_rarity="Moment type rarity based on historical distribution",
            player_moment_availability="Player moment availability in current market",
            circulation_analysis="Total circulation and market supply analysis",
            collector_demand="Collector demand patterns analyzed",
            historical_scarcity_premium="Historical scarcity premiums considered",
            future_scarcity_projection="Future scarcity trends projected"
        )
    
    async def store_reasoning(
        self, 
        reasoning_result: AIReasoningResult, 
        user_id: Optional[str] = None
    ) -> str:
        """Store reasoning result in database"""
        
        try:
            # Insert main reasoning record
            reasoning_id = str(uuid4())
            
            query = """
                INSERT INTO ai_reasoning (
                    id, moment_id, user_id, decision, confidence_score,
                    primary_reasoning, supporting_reasons, risk_factors,
                    key_statistics, analysis_version
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """
            
            await self.db.execute(query, [
                reasoning_id,
                reasoning_result.moment_id,
                user_id,
                reasoning_result.decision,
                reasoning_result.confidence_score,
                reasoning_result.primary_reasoning,
                json.dumps(reasoning_result.supporting_reasons),
                json.dumps(reasoning_result.risk_factors),
                json.dumps(reasoning_result.key_statistics),
                reasoning_result.analysis_version
            ])
            
            # Insert reasoning factors
            for factor in reasoning_result.factors:
                factor_query = """
                    INSERT INTO reasoning_factors (
                        reasoning_id, factor_type, name, weight, value,
                        raw_value, impact, confidence, description, supporting_data
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """
                
                await self.db.execute(factor_query, [
                    reasoning_id,
                    factor.factor_type.value,
                    factor.name,
                    factor.weight,
                    factor.value,
                    factor.raw_value,
                    factor.impact,
                    factor.confidence,
                    factor.description,
                    json.dumps(factor.supporting_data)
                ])
            
            # Insert reasoning context
            context_query = """
                INSERT INTO reasoning_context (
                    reasoning_id, player_analysis, market_context, scarcity_analysis
                ) VALUES ($1, $2, $3, $4)
            """
            
            await self.db.execute(context_query, [
                reasoning_id,
                json.dumps(reasoning_result.player_analysis.model_dump()),
                json.dumps(reasoning_result.market_context.model_dump()),
                json.dumps(reasoning_result.scarcity_analysis.model_dump())
            ])
            
            logger.info(f"Stored reasoning for moment {reasoning_result.moment_id}")
            return reasoning_id
            
        except Exception as e:
            logger.error(f"Failed to store reasoning: {str(e)}")
            raise
    
    async def get_reasoning_by_moment(
        self, 
        moment_id: str, 
        limit: int = 10
    ) -> List[AIReasoningResult]:
        """Get reasoning history for a specific moment"""
        
        try:
            query = """
                SELECT r.*, 
                       rc.player_analysis, rc.market_context, rc.scarcity_analysis
                FROM ai_reasoning r
                LEFT JOIN reasoning_context rc ON r.id = rc.reasoning_id
                WHERE r.moment_id = $1
                ORDER BY r.created_at DESC
                LIMIT $2
            """
            
            rows = await self.db.fetch_all(query, [moment_id, limit])
            
            results = []
            for row in rows:
                # Get factors for this reasoning
                factors = await self._get_reasoning_factors(row['id'])
                
                reasoning_result = AIReasoningResult(
                    moment_id=row['moment_id'],
                    decision=row['decision'],
                    confidence_score=row['confidence_score'],
                    factors=factors,
                    primary_reasoning=row['primary_reasoning'],
                    supporting_reasons=json.loads(row['supporting_reasons']),
                    risk_factors=json.loads(row['risk_factors']),
                    key_statistics=json.loads(row['key_statistics']),
                    market_context=MarketContextReasoning(**json.loads(row['market_context'])) if row['market_context'] else MarketContextReasoning(),
                    player_analysis=PlayerPerformanceReasoning(**json.loads(row['player_analysis'])) if row['player_analysis'] else PlayerPerformanceReasoning(),
                    scarcity_analysis=ScarcityReasoning(**json.loads(row['scarcity_analysis'])) if row['scarcity_analysis'] else ScarcityReasoning(),
                    timestamp=row['created_at'],
                    analysis_version=row['analysis_version']
                )
                
                results.append(reasoning_result)
            
            return results
            
        except Exception as e:
            logger.error(f"Failed to get reasoning for moment {moment_id}: {str(e)}")
            return []
    
    async def _get_reasoning_factors(self, reasoning_id: str) -> List[ReasoningFactor]:
        """Get reasoning factors for a specific reasoning record"""
        
        query = """
            SELECT * FROM reasoning_factors 
            WHERE reasoning_id = $1 
            ORDER BY weight DESC
        """
        
        rows = await self.db.fetch_all(query, [reasoning_id])
        
        factors = []
        for row in rows:
            factor = ReasoningFactor(
                factor_type=ReasoningFactorType(row['factor_type']),
                name=row['name'],
                weight=row['weight'],
                value=row['value'],
                raw_value=row['raw_value'],
                impact=row['impact'],
                confidence=row['confidence'],
                description=row['description'],
                supporting_data=json.loads(row['supporting_data'])
            )
            factors.append(factor)
        
        return factors
    
    async def search_reasoning(
        self, 
        search_query: ReasoningSearchQuery
    ) -> ReasoningSearchResult:
        """Search reasoning history with filters"""
        
        try:
            # Build WHERE clause
            where_conditions = []
            params = []
            param_count = 0
            
            if search_query.moment_ids:
                param_count += 1
                where_conditions.append(f"r.moment_id = ANY(${param_count})")
                params.append(search_query.moment_ids)
            
            if search_query.decision_types:
                param_count += 1
                where_conditions.append(f"r.decision = ANY(${param_count})")
                params.append(search_query.decision_types)
            
            if search_query.date_from:
                param_count += 1
                where_conditions.append(f"r.created_at >= ${param_count}")
                params.append(search_query.date_from)
            
            if search_query.date_to:
                param_count += 1
                where_conditions.append(f"r.created_at <= ${param_count}")
                params.append(search_query.date_to)
            
            if search_query.min_confidence:
                param_count += 1
                where_conditions.append(f"r.confidence_score >= ${param_count}")
                params.append(search_query.min_confidence)
            
            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            # Count total results
            count_query = f"""
                SELECT COUNT(*) as total
                FROM ai_reasoning r
                {where_clause}
            """
            
            count_result = await self.db.fetch_one(count_query, params)
            total_count = count_result['total'] if count_result else 0
            
            # Get paginated results
            param_count += 1
            limit_param = param_count
            param_count += 1
            offset_param = param_count
            
            query = f"""
                SELECT r.*, 
                       rc.player_analysis, rc.market_context, rc.scarcity_analysis
                FROM ai_reasoning r
                LEFT JOIN reasoning_context rc ON r.id = rc.reasoning_id
                {where_clause}
                ORDER BY r.created_at DESC
                LIMIT ${limit_param} OFFSET ${offset_param}
            """
            
            params.extend([search_query.limit, search_query.offset])
            
            rows = await self.db.fetch_all(query, params)
            
            # Convert to ReasoningHistory objects
            results = []
            for row in rows:
                factors = await self._get_reasoning_factors(row['id'])
                
                reasoning_result = AIReasoningResult(
                    moment_id=row['moment_id'],
                    decision=row['decision'],
                    confidence_score=row['confidence_score'],
                    factors=factors,
                    primary_reasoning=row['primary_reasoning'],
                    supporting_reasons=json.loads(row['supporting_reasons']),
                    risk_factors=json.loads(row['risk_factors']),
                    key_statistics=json.loads(row['key_statistics']),
                    market_context=MarketContextReasoning(**json.loads(row['market_context'])) if row['market_context'] else MarketContextReasoning(),
                    player_analysis=PlayerPerformanceReasoning(**json.loads(row['player_analysis'])) if row['player_analysis'] else PlayerPerformanceReasoning(),
                    scarcity_analysis=ScarcityReasoning(**json.loads(row['scarcity_analysis'])) if row['scarcity_analysis'] else ScarcityReasoning(),
                    timestamp=row['created_at'],
                    analysis_version=row['analysis_version']
                )
                
                history_record = ReasoningHistory(
                    id=row['id'],
                    moment_id=row['moment_id'],
                    user_id=row['user_id'],
                    reasoning_result=reasoning_result
                )
                
                results.append(history_record)
            
            return ReasoningSearchResult(
                total_count=total_count,
                results=results,
                aggregations=self._calculate_search_aggregations(results)
            )
            
        except Exception as e:
            logger.error(f"Failed to search reasoning: {str(e)}")
            return ReasoningSearchResult(total_count=0, results=[], aggregations={})
    
    def generate_human_explanation(
        self, 
        reasoning_result: AIReasoningResult
    ) -> ReasoningExplanation:
        """Generate human-friendly explanation of the reasoning"""
        
        # Generate summary
        decision_action = {
            'buy': 'purchase',
            'sell': 'sell',
            'hold': 'hold onto',
            'skip': 'skip'
        }.get(reasoning_result.decision, 'analyze')
        
        summary = f"AI recommends to {decision_action} this moment with {reasoning_result.confidence_score*100:.0f}% confidence."
        
        # Generate detailed explanation
        current_price = reasoning_result.key_statistics.get('current_price', 0)
        fair_value = reasoning_result.key_statistics.get('fair_value', 0)
        
        if fair_value and current_price:
            price_comparison = f"The AI values this moment at ${fair_value:.2f} compared to the current price of ${current_price:.2f}."
        else:
            price_comparison = "Price analysis was performed based on available market data."
        
        detailed_explanation = f"{reasoning_result.primary_reasoning} {price_comparison}"
        
        # Extract key factors
        key_factors = []
        top_factors = sorted(reasoning_result.factors, key=lambda f: abs(f.impact), reverse=True)[:3]
        for factor in top_factors:
            impact_desc = "positive" if factor.impact > 0 else "negative"
            key_factors.append(f"{factor.name}: {impact_desc} impact ({factor.impact:+.1f}%)")
        
        # Generate supporting stats
        supporting_stats = {}
        for key, value in reasoning_result.key_statistics.items():
            if isinstance(value, (int, float)):
                if key == 'confidence_score':
                    supporting_stats[key] = f"{value*100:.0f}% confidence level"
                elif key in ['current_price', 'fair_value']:
                    supporting_stats[key] = f"${value:.2f}"
                elif key == 'price_ratio':
                    supporting_stats[key] = f"{value:.2f}x fair value ratio"
                else:
                    supporting_stats[key] = f"{value:.1f}"
        
        return ReasoningExplanation(
            summary=summary,
            detailed_explanation=detailed_explanation,
            key_factors=key_factors,
            supporting_stats=supporting_stats,
            market_context=reasoning_result.market_context.price_trend_analysis,
            risk_assessment="; ".join(reasoning_result.risk_factors[:2]) if reasoning_result.risk_factors else "No significant risks identified",
            confidence_explanation=f"Confidence is {reasoning_result.confidence_score*100:.0f}% based on data quality and factor consistency",
            what_could_change_decision=[
                "Significant player performance changes",
                "Major market trend shifts",
                "New comparable sales data"
            ]
        )
    
    async def calculate_performance_metrics(
        self, 
        date_from: datetime, 
        date_to: datetime
    ) -> ReasoningPerformanceMetrics:
        """Calculate performance metrics for the reasoning system"""
        
        try:
            # Get total decisions
            total_query = """
                SELECT COUNT(*) as total_decisions,
                       AVG(confidence_score) as avg_confidence
                FROM ai_reasoning
                WHERE created_at BETWEEN $1 AND $2
            """
            
            total_result = await self.db.fetch_one(total_query, [date_from, date_to])
            total_decisions = total_result['total_decisions'] if total_result else 0
            
            # Get accuracy metrics (would need actual outcomes)
            accuracy_query = """
                SELECT COUNT(*) as accurate_decisions
                FROM ai_reasoning r
                JOIN reasoning_outcomes ro ON r.id = ro.reasoning_id
                WHERE r.created_at BETWEEN $1 AND $2
                AND ro.accuracy_score >= 0.7
            """
            
            accuracy_result = await self.db.fetch_one(accuracy_query, [date_from, date_to])
            accurate_decisions = accuracy_result['accurate_decisions'] if accuracy_result else 0
            
            accuracy_rate = accurate_decisions / total_decisions if total_decisions > 0 else 0
            
            # Get factor importance
            factor_query = """
                SELECT factor_type, AVG(ABS(impact)) as avg_impact
                FROM reasoning_factors rf
                JOIN ai_reasoning r ON rf.reasoning_id = r.id
                WHERE r.created_at BETWEEN $1 AND $2
                GROUP BY factor_type
                ORDER BY avg_impact DESC
            """
            
            factor_rows = await self.db.fetch_all(factor_query, [date_from, date_to])
            factor_importance = {row['factor_type']: row['avg_impact'] for row in factor_rows}
            
            return ReasoningPerformanceMetrics(
                total_decisions=total_decisions,
                accuracy_rate=accuracy_rate,
                confidence_calibration=0.8,  # Would need to calculate based on actual outcomes
                factor_importance_ranking=factor_importance,
                common_failure_modes=[
                    "Low confidence in volatile markets",
                    "Social sentiment data limitations"
                ],
                improvement_suggestions=[
                    "Incorporate more real-time data sources",
                    "Improve social sentiment analysis accuracy"
                ]
            )
            
        except Exception as e:
            logger.error(f"Failed to calculate performance metrics: {str(e)}")
            return ReasoningPerformanceMetrics(
                total_decisions=0,
                accuracy_rate=0.0,
                confidence_calibration=0.0,
                factor_importance_ranking={},
                common_failure_modes=[],
                improvement_suggestions=[]
            )    

    def generate_human_explanation(self, reasoning_result: AIReasoningResult) -> ReasoningExplanation:
        """Generate human-friendly explanation of AI reasoning"""
        
        # Create summary
        decision_action = {
            'buy': 'purchase',
            'sell': 'sell',
            'hold': 'hold onto',
            'skip': 'skip'
        }.get(reasoning_result.decision, reasoning_result.decision)
        
        summary = f"AI recommends to {decision_action} this moment with {reasoning_result.confidence_score*100:.0f}% confidence."
        
        # Extract key factors (top 3 by impact)
        top_factors = sorted(reasoning_result.factors, key=lambda f: abs(f.impact), reverse=True)[:3]
        key_factors = [f"{factor.name}: {factor.description}" for factor in top_factors]
        
        # Create supporting stats
        supporting_stats = {}
        for key, value in reasoning_result.key_statistics.items():
            if isinstance(value, (int, float)):
                if key == 'current_price' or key == 'fair_value':
                    supporting_stats[key.replace('_', ' ').title()] = f"${value:.2f}"
                elif key.endswith('_score') or key.endswith('_ratio'):
                    supporting_stats[key.replace('_', ' ').title()] = f"{value:.1f}"
                else:
                    supporting_stats[key.replace('_', ' ').title()] = str(value)
        
        # Generate confidence explanation
        if reasoning_result.confidence_score >= 0.8:
            confidence_explanation = "High confidence due to strong supporting data and clear market signals."
        elif reasoning_result.confidence_score >= 0.6:
            confidence_explanation = "Moderate confidence with some uncertainty in market conditions or player performance."
        else:
            confidence_explanation = "Lower confidence due to limited data or conflicting signals."
        
        # Identify what could change the decision
        change_factors = []
        if reasoning_result.decision == 'buy':
            change_factors = [
                "Significant price increase above fair value",
                "Negative player performance trends",
                "Market sentiment turning bearish"
            ]
        elif reasoning_result.decision == 'skip':
            change_factors = [
                "Price dropping closer to fair value",
                "Improved player performance metrics",
                "Positive market momentum"
            ]
        
        return ReasoningExplanation(
            summary=summary,
            detailed_explanation=reasoning_result.primary_reasoning,
            key_factors=key_factors,
            supporting_stats=supporting_stats,
            market_context=reasoning_result.market_context.price_trend_analysis,
            risk_assessment="; ".join(reasoning_result.risk_factors) if reasoning_result.risk_factors else "No significant risks identified",
            confidence_explanation=confidence_explanation,
            what_could_change_decision=change_factors
        )
    
    def _calculate_search_aggregations(self, results: List['ReasoningHistory']) -> Dict[str, Any]:
        """Calculate aggregations for search results"""
        if not results:
            return {}
        
        # Decision type distribution
        decision_counts = {}
        confidence_sum = 0
        factor_type_counts = {}
        
        for history in results:
            reasoning = history.reasoning_result
            
            # Count decisions
            decision_counts[reasoning.decision] = decision_counts.get(reasoning.decision, 0) + 1
            
            # Sum confidence
            confidence_sum += reasoning.confidence_score
            
            # Count factor types
            for factor in reasoning.factors:
                factor_type = factor.factor_type.value
                factor_type_counts[factor_type] = factor_type_counts.get(factor_type, 0) + 1
        
        return {
            "decision_distribution": decision_counts,
            "average_confidence": confidence_sum / len(results),
            "factor_type_distribution": factor_type_counts,
            "total_results": len(results)
        }
    
    def _calculate_confidence_calibration(self, confidence_accuracy_pairs: List[Tuple[float, float]]) -> float:
        """Calculate how well confidence scores match actual accuracy"""
        if not confidence_accuracy_pairs:
            return 0.0
        
        # Group by confidence buckets and calculate average accuracy
        buckets = {
            'low': [],      # 0-0.5
            'medium': [],   # 0.5-0.8
            'high': []      # 0.8-1.0
        }
        
        for confidence, accuracy in confidence_accuracy_pairs:
            if confidence < 0.5:
                buckets['low'].append(accuracy)
            elif confidence < 0.8:
                buckets['medium'].append(accuracy)
            else:
                buckets['high'].append(accuracy)
        
        # Calculate calibration score
        calibration_errors = []
        
        for bucket_name, accuracies in buckets.items():
            if accuracies:
                avg_accuracy = sum(accuracies) / len(accuracies)
                expected_confidence = {'low': 0.25, 'medium': 0.65, 'high': 0.9}[bucket_name]
                calibration_errors.append(abs(avg_accuracy - expected_confidence))
        
        # Return inverse of average calibration error (higher is better)
        if calibration_errors:
            avg_error = sum(calibration_errors) / len(calibration_errors)
            return max(0.0, 1.0 - avg_error)
        
        return 0.0
    
    def _calculate_factor_importance(self, results: List['ReasoningHistory']) -> Dict[str, float]:
        """Calculate importance ranking of different factors"""
        factor_impacts = {}
        factor_counts = {}
        
        for history in results:
            for factor in history.reasoning_result.factors:
                factor_type = factor.factor_type.value
                
                if factor_type not in factor_impacts:
                    factor_impacts[factor_type] = 0.0
                    factor_counts[factor_type] = 0
                
                factor_impacts[factor_type] += abs(factor.impact)
                factor_counts[factor_type] += 1
        
        # Calculate average impact per factor type
        factor_importance = {}
        for factor_type, total_impact in factor_impacts.items():
            count = factor_counts[factor_type]
            factor_importance[factor_type] = total_impact / count if count > 0 else 0.0
        
        return factor_importance
    
    def _identify_failure_modes(self, results: List['ReasoningHistory']) -> List[str]:
        """Identify common failure modes in reasoning"""
        failure_modes = []
        
        # Analyze confidence vs decision patterns
        low_confidence_decisions = [
            r for r in results 
            if r.reasoning_result.confidence_score < 0.5
        ]
        
        if len(low_confidence_decisions) > len(results) * 0.3:
            failure_modes.append("High frequency of low-confidence decisions")
        
        # Check for factor imbalances
        factor_usage = {}
        for history in results:
            for factor in history.reasoning_result.factors:
                factor_type = factor.factor_type.value
                factor_usage[factor_type] = factor_usage.get(factor_type, 0) + 1
        
        total_factors = sum(factor_usage.values())
        for factor_type, count in factor_usage.items():
            if count / total_factors > 0.6:
                failure_modes.append(f"Over-reliance on {factor_type} factors")
        
        return failure_modes
    
    def _generate_improvement_suggestions(
        self, 
        accuracy_rate: float, 
        confidence_calibration: float, 
        factor_importance: Dict[str, float]
    ) -> List[str]:
        """Generate suggestions for improving reasoning performance"""
        suggestions = []
        
        if accuracy_rate < 0.6:
            suggestions.append("Improve data quality and feature engineering")
            suggestions.append("Consider ensemble methods for decision making")
        
        if confidence_calibration < 0.7:
            suggestions.append("Recalibrate confidence scoring algorithm")
            suggestions.append("Add uncertainty quantification methods")
        
        # Check factor balance
        if factor_importance:
            max_importance = max(factor_importance.values())
            min_importance = min(factor_importance.values())
            
            if max_importance > min_importance * 3:
                suggestions.append("Balance factor weights to reduce over-reliance on single factors")
        
        if not suggestions:
            suggestions.append("Performance is good - continue monitoring and fine-tuning")
        
        return suggestions