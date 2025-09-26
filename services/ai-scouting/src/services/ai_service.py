import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import redis.asyncio as redis
import json

from ..data_sources.nba_stats_client import NBAStatsClient
from ..data_sources.database_client import DatabaseClient
from ..analysis.performance_analyzer import PerformanceAnalyzer
from ..analysis.moment_valuator import MomentValuator
from ..services.reasoning_service import ReasoningService
from ..models.moment_analysis import MomentAnalysisRequest, MomentAnalysisResult
from ..models.player_stats import PlayerPerformanceMetrics
from ..models.reasoning import AIReasoningResult, ReasoningExplanation

logger = logging.getLogger(__name__)

class AIScoutingService:
    """Main AI scouting service orchestrating all analysis components"""
    
    def __init__(self, redis_url: str, nba_api_key: Optional[str] = None, database_url: Optional[str] = None):
        self.nba_client = None
        self.performance_analyzer = PerformanceAnalyzer()
        self.moment_valuator = MomentValuator()
        self.redis_client = None
        self.redis_url = redis_url
        self.nba_api_key = nba_api_key
        
        # Initialize database client and reasoning service
        self.db_client = DatabaseClient(database_url)
        self.reasoning_service = None
        
        # Cache settings
        self.cache_ttl = {
            'player_info': 3600 * 24,  # 24 hours
            'season_stats': 3600 * 6,  # 6 hours
            'game_log': 3600,  # 1 hour
            'analysis_result': 1800,  # 30 minutes
        }
    
    async def initialize(self):
        """Initialize all service components"""
        try:
            # Initialize NBA stats client
            self.nba_client = NBAStatsClient(api_key=self.nba_api_key)
            
            # Initialize Redis client
            self.redis_client = redis.from_url(self.redis_url)
            await self.redis_client.ping()
            
            # Initialize database client and reasoning service
            await self.db_client.initialize()
            self.reasoning_service = ReasoningService(self.db_client)
            
            logger.info("AI Scouting Service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI Scouting Service: {str(e)}")
            raise
    
    async def close(self):
        """Clean up resources"""
        if self.redis_client:
            await self.redis_client.close()
        if self.nba_client:
            await self.nba_client.__aexit__(None, None, None)
        if self.db_client:
            await self.db_client.close()
    
    async def _get_cached_data(self, key: str) -> Optional[Any]:
        """Get data from Redis cache"""
        try:
            if self.redis_client:
                cached_data = await self.redis_client.get(key)
                if cached_data:
                    return json.loads(cached_data)
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {str(e)}")
        return None
    
    async def _set_cached_data(self, key: str, data: Any, ttl: int):
        """Set data in Redis cache"""
        try:
            if self.redis_client:
                await self.redis_client.setex(
                    key, 
                    ttl, 
                    json.dumps(data, default=str)
                )
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {str(e)}")
    
    async def get_player_performance_metrics(self, player_id: str) -> Optional[PlayerPerformanceMetrics]:
        """Get comprehensive player performance metrics"""
        cache_key = f"player_performance:{player_id}"
        
        # Try cache first
        cached_metrics = await self._get_cached_data(cache_key)
        if cached_metrics:
            return PlayerPerformanceMetrics(**cached_metrics)
        
        try:
            async with self.nba_client:
                # Get player data
                player_info = await self.nba_client.get_player_info(player_id)
                season_stats = await self.nba_client.get_player_season_stats(player_id)
                recent_games = await self.nba_client.get_player_game_log(player_id, last_n_games=10)
                
                if not all([player_info, season_stats]):
                    logger.warning(f"Incomplete data for player {player_id}")
                    return None
                
                # Analyze performance
                player_profile = player_info.dict()
                metrics = self.performance_analyzer.analyze_player_performance(
                    player_profile, season_stats, recent_games
                )
                
                # Cache the result
                await self._set_cached_data(
                    cache_key, 
                    metrics.dict(), 
                    self.cache_ttl['analysis_result']
                )
                
                return metrics
                
        except Exception as e:
            logger.error(f"Error getting player performance metrics for {player_id}: {str(e)}")
            return None
    
    async def analyze_moment(self, moment_request: MomentAnalysisRequest) -> Optional[MomentAnalysisResult]:
        """Analyze a single moment for valuation"""
        cache_key = f"moment_analysis:{moment_request.moment_id}"
        
        # Try cache first
        cached_analysis = await self._get_cached_data(cache_key)
        if cached_analysis:
            return MomentAnalysisResult(**cached_analysis)
        
        try:
            # Get player performance metrics
            player_performance = await self.get_player_performance_metrics(moment_request.player_id)
            if not player_performance:
                logger.error(f"Could not get player performance for {moment_request.player_id}")
                return None
            
            # Prepare market data (in real implementation, this would come from marketplace APIs)
            market_data = await self._get_market_data(moment_request.moment_id)
            
            # Get social sentiment data (placeholder for now)
            social_data = await self._get_social_sentiment_data(moment_request.player_id)
            
            # Perform moment analysis
            analysis_result = self.moment_valuator.analyze_moment(
                moment_request,
                player_performance,
                market_data,
                social_data
            )
            
            # Generate and store reasoning if reasoning service is available
            if self.reasoning_service:
                try:
                    reasoning_result = self.reasoning_service.generate_detailed_reasoning(
                        analysis_result=analysis_result
                    )
                    await self.reasoning_service.store_reasoning(reasoning_result)
                    logger.info(f"Generated reasoning for moment {moment_request.moment_id}")
                except Exception as e:
                    logger.warning(f"Failed to generate reasoning for moment {moment_request.moment_id}: {str(e)}")
            
            # Cache the result
            await self._set_cached_data(
                cache_key,
                analysis_result.dict(),
                self.cache_ttl['analysis_result']
            )
            
            return analysis_result
            
        except Exception as e:
            logger.error(f"Error analyzing moment {moment_request.moment_id}: {str(e)}")
            return None
    
    async def batch_analyze_moments(self, moment_requests: List[MomentAnalysisRequest]) -> List[MomentAnalysisResult]:
        """Analyze multiple moments in parallel"""
        tasks = [self.analyze_moment(request) for request in moment_requests]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out None results and exceptions
        valid_results = []
        for result in results:
            if isinstance(result, MomentAnalysisResult):
                valid_results.append(result)
            elif isinstance(result, Exception):
                logger.error(f"Batch analysis error: {str(result)}")
        
        return valid_results
    
    async def find_undervalued_moments(
        self,
        moment_requests: List[MomentAnalysisRequest],
        min_confidence: float = 0.7,
        min_upside_percentage: float = 15.0
    ) -> List[MomentAnalysisResult]:
        """Find undervalued moments from a list of candidates"""
        
        # Analyze all moments
        analysis_results = await self.batch_analyze_moments(moment_requests)
        
        # Filter for undervalued moments
        undervalued = self.moment_valuator.get_undervalued_moments(
            analysis_results,
            min_confidence=min_confidence,
            min_upside=min_upside_percentage / 100.0
        )
        
        logger.info(f"Found {len(undervalued)} undervalued moments out of {len(analysis_results)} analyzed")
        
        return undervalued
    
    async def get_player_recommendations(self, player_id: str) -> Dict[str, Any]:
        """Get comprehensive recommendations for a player"""
        try:
            performance_metrics = await self.get_player_performance_metrics(player_id)
            if not performance_metrics:
                return {'error': 'Could not analyze player performance'}
            
            async with self.nba_client:
                # Get additional context
                upcoming_games = await self.nba_client.get_upcoming_games()
                player_info = await self.nba_client.get_player_info(player_id)
                season_stats = await self.nba_client.get_player_season_stats(player_id)
                recent_games = await self.nba_client.get_player_game_log(player_id, last_n_games=5)
                
                # Generate next game prediction
                next_game_prediction = self.performance_analyzer.predict_next_game_performance(
                    player_info.dict() if player_info else {},
                    season_stats,
                    recent_games
                )
                
                return {
                    'player_id': player_id,
                    'performance_metrics': performance_metrics.dict(),
                    'next_game_prediction': next_game_prediction,
                    'recommendations': self._generate_player_recommendations(performance_metrics),
                    'analysis_timestamp': datetime.now().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Error getting player recommendations for {player_id}: {str(e)}")
            return {'error': str(e)}
    
    async def _get_market_data(self, moment_id: str) -> Dict[str, Any]:
        """Get market data for a moment (placeholder implementation)"""
        # In a real implementation, this would fetch from marketplace APIs
        return {
            'total_moments_for_player': 75,
            'total_circulation': 2500,
            'price_history': [
                {'timestamp': datetime.now() - timedelta(days=i), 'price': 100 + i * 5, 'volume': 10}
                for i in range(10, 0, -1)
            ],
            'comparable_sales': [
                {'price': 95, 'timestamp': datetime.now() - timedelta(days=1)},
                {'price': 105, 'timestamp': datetime.now() - timedelta(days=2)},
                {'price': 98, 'timestamp': datetime.now() - timedelta(days=3)}
            ],
            'volatility': 0.15,
            'liquidity_risk': 0.25
        }
    
    async def _get_social_sentiment_data(self, player_id: str) -> Dict[str, Any]:
        """Get social sentiment data for a player (placeholder implementation)"""
        # In a real implementation, this would integrate with social media APIs
        return {
            'mentions': 150,
            'sentiment': 0.2,
            'viral_score': 45,
            'influencer_mentions': 3
        }
    
    def _generate_player_recommendations(self, metrics: PlayerPerformanceMetrics) -> List[str]:
        """Generate actionable recommendations based on player metrics"""
        recommendations = []
        
        if metrics.recent_form_score > 80:
            recommendations.append("Player is in excellent recent form - consider buying moments")
        elif metrics.recent_form_score < 40:
            recommendations.append("Player struggling recently - wait for improvement before buying")
        
        if metrics.breakout_potential > 75:
            recommendations.append("High breakout potential - good long-term investment candidate")
        
        if metrics.injury_risk > 70:
            recommendations.append("High injury risk - consider this in investment decisions")
        
        if metrics.season_consistency > 80:
            recommendations.append("Very consistent performer - reliable investment")
        elif metrics.season_consistency < 40:
            recommendations.append("Inconsistent performance - higher risk investment")
        
        return recommendations
    
    async def get_trending_players(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get trending players based on recent performance"""
        try:
            async with self.nba_client:
                # Get league leaders in various categories
                scoring_leaders = await self.nba_client.get_league_leaders("PTS", limit=limit)
                
                trending_players = []
                for player_data in scoring_leaders:
                    player_id = str(player_data.get('PLAYER_ID', ''))
                    if player_id:
                        metrics = await self.get_player_performance_metrics(player_id)
                        if metrics:
                            trending_players.append({
                                'player_id': player_id,
                                'name': player_data.get('PLAYER', ''),
                                'recent_form_score': metrics.recent_form_score,
                                'breakout_potential': metrics.breakout_potential,
                                'points_per_game': player_data.get('PTS', 0)
                            })
                
                # Sort by recent form score
                trending_players.sort(key=lambda x: x['recent_form_score'], reverse=True)
                
                return trending_players[:limit]
                
        except Exception as e:
            logger.error(f"Error getting trending players: {str(e)}")
            return []
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for the AI scouting service"""
        health_status = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'components': {}
        }
        
        try:
            # Check NBA API client
            if self.nba_client:
                health_status['components']['nba_api'] = 'connected'
            else:
                health_status['components']['nba_api'] = 'disconnected'
            
            # Check Redis
            if self.redis_client:
                await self.redis_client.ping()
                health_status['components']['redis'] = 'connected'
            else:
                health_status['components']['redis'] = 'disconnected'
            
            # Check analyzers
            health_status['components']['performance_analyzer'] = 'ready'
            health_status['components']['moment_valuator'] = 'ready'
            
        except Exception as e:
            health_status['status'] = 'unhealthy'
            health_status['error'] = str(e)
        
        return health_status
    
    async def get_moment_reasoning(self, moment_id: str, limit: int = 10) -> List[AIReasoningResult]:
        """Get AI reasoning history for a specific moment"""
        if not self.reasoning_service:
            logger.warning("Reasoning service not available")
            return []
        
        try:
            return await self.reasoning_service.get_reasoning_by_moment(moment_id, limit)
        except Exception as e:
            logger.error(f"Error getting reasoning for moment {moment_id}: {str(e)}")
            return []
    
    async def get_moment_explanation(self, moment_id: str) -> Optional[ReasoningExplanation]:
        """Get human-friendly explanation for a moment's latest reasoning"""
        if not self.reasoning_service:
            logger.warning("Reasoning service not available")
            return None
        
        try:
            reasoning_results = await self.reasoning_service.get_reasoning_by_moment(moment_id, 1)
            if reasoning_results:
                return self.reasoning_service.generate_human_explanation(reasoning_results[0])
            return None
        except Exception as e:
            logger.error(f"Error getting explanation for moment {moment_id}: {str(e)}")
            return None
    
    async def analyze_moment_with_reasoning(
        self, 
        moment_request: MomentAnalysisRequest,
        user_id: Optional[str] = None
    ) -> tuple[Optional[MomentAnalysisResult], Optional[AIReasoningResult]]:
        """Analyze a moment and generate detailed reasoning"""
        
        # Perform standard analysis
        analysis_result = await self.analyze_moment(moment_request)
        if not analysis_result:
            return None, None
        
        # Generate detailed reasoning
        reasoning_result = None
        if self.reasoning_service:
            try:
                reasoning_result = self.reasoning_service.generate_detailed_reasoning(
                    analysis_result=analysis_result,
                    user_id=user_id
                )
                await self.reasoning_service.store_reasoning(reasoning_result, user_id)
                logger.info(f"Generated detailed reasoning for moment {moment_request.moment_id}")
            except Exception as e:
                logger.error(f"Failed to generate detailed reasoning: {str(e)}")
        
        return analysis_result, reasoning_result