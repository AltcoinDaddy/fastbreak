from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

from ..services.ai_service import AIScoutingService
from ..models.moment_analysis import MomentAnalysisRequest, MomentAnalysisResult
from ..models.player_stats import PlayerPerformanceMetrics
from ..models.reasoning import AIReasoningResult, ReasoningExplanation
from ..api.reasoning_routes import create_reasoning_router
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Request/Response models
class AnalyzeMomentRequest(BaseModel):
    moment_id: str = Field(..., description="Unique identifier for the moment")
    player_id: str = Field(..., description="NBA player ID")
    moment_type: str = Field(..., description="Type of moment (dunk, three_pointer, etc.)")
    game_date: str = Field(..., description="Date of the game (YYYY-MM-DD)")
    serial_number: int = Field(..., ge=1, description="Serial number of the moment")
    current_price: float = Field(..., gt=0, description="Current market price")
    marketplace_id: str = Field(..., description="Marketplace identifier")

class BatchAnalysisRequest(BaseModel):
    moments: List[AnalyzeMomentRequest] = Field(..., max_items=50, description="List of moments to analyze")
    min_confidence: Optional[float] = Field(0.7, ge=0, le=1, description="Minimum confidence threshold")
    min_upside_percentage: Optional[float] = Field(15.0, ge=0, le=100, description="Minimum upside percentage")

class PlayerRecommendationRequest(BaseModel):
    player_id: str = Field(..., description="NBA player ID")

class TrendingPlayersRequest(BaseModel):
    limit: Optional[int] = Field(20, ge=1, le=100, description="Number of trending players to return")

class UndervaluedMomentsRequest(BaseModel):
    moments: List[AnalyzeMomentRequest] = Field(..., max_items=100)
    min_confidence: Optional[float] = Field(0.7, ge=0, le=1)
    min_upside_percentage: Optional[float] = Field(15.0, ge=0, le=100)

# Response models
class APIResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    timestamp: datetime

def create_router(ai_service: AIScoutingService) -> APIRouter:
    """Create FastAPI router with AI scouting endpoints"""
    
    router = APIRouter(prefix="/api/v1", tags=["AI Scouting"])
    
    # Include reasoning routes if reasoning service is available
    if ai_service.reasoning_service:
        reasoning_router = create_reasoning_router(ai_service.reasoning_service)
        router.include_router(reasoning_router)
    
    @router.get("/health")
    async def health_check():
        """Health check endpoint"""
        try:
            health_status = await ai_service.health_check()
            return APIResponse(
                success=True,
                data=health_status,
                timestamp=datetime.now()
            )
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    @router.post("/analyze/moment")
    async def analyze_moment(request: AnalyzeMomentRequest):
        """Analyze a single moment for valuation"""
        try:
            # Convert request to internal model
            moment_request = MomentAnalysisRequest(
                moment_id=request.moment_id,
                player_id=request.player_id,
                moment_type=request.moment_type,
                game_date=datetime.strptime(request.game_date, "%Y-%m-%d").date(),
                serial_number=request.serial_number,
                current_price=request.current_price,
                marketplace_id=request.marketplace_id
            )
            
            # Perform analysis
            result = await ai_service.analyze_moment(moment_request)
            
            if not result:
                raise HTTPException(status_code=404, detail="Could not analyze moment")
            
            return APIResponse(
                success=True,
                data=result.dict(),
                timestamp=datetime.now()
            )
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
        except Exception as e:
            logger.error(f"Error analyzing moment: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.post("/analyze/moment/detailed")
    async def analyze_moment_with_reasoning(request: AnalyzeMomentRequest, user_id: Optional[str] = None):
        """Analyze a moment with detailed AI reasoning"""
        try:
            # Convert request to internal model
            moment_request = MomentAnalysisRequest(
                moment_id=request.moment_id,
                player_id=request.player_id,
                moment_type=request.moment_type,
                game_date=datetime.strptime(request.game_date, "%Y-%m-%d").date(),
                serial_number=request.serial_number,
                current_price=request.current_price,
                marketplace_id=request.marketplace_id
            )
            
            # Perform analysis with reasoning
            analysis_result, reasoning_result = await ai_service.analyze_moment_with_reasoning(
                moment_request, user_id
            )
            
            if not analysis_result:
                raise HTTPException(status_code=404, detail="Could not analyze moment")
            
            response_data = {
                "analysis": analysis_result.dict(),
                "reasoning": reasoning_result.dict() if reasoning_result else None
            }
            
            return APIResponse(
                success=True,
                data=response_data,
                timestamp=datetime.now()
            )
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
        except Exception as e:
            logger.error(f"Error analyzing moment with reasoning: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.post("/analyze/batch")
    async def batch_analyze_moments(request: BatchAnalysisRequest):
        """Analyze multiple moments in batch"""
        try:
            # Convert requests to internal models
            moment_requests = []
            for moment_req in request.moments:
                moment_requests.append(MomentAnalysisRequest(
                    moment_id=moment_req.moment_id,
                    player_id=moment_req.player_id,
                    moment_type=moment_req.moment_type,
                    game_date=datetime.strptime(moment_req.game_date, "%Y-%m-%d").date(),
                    serial_number=moment_req.serial_number,
                    current_price=moment_req.current_price,
                    marketplace_id=moment_req.marketplace_id
                ))
            
            # Perform batch analysis
            results = await ai_service.batch_analyze_moments(moment_requests)
            
            return APIResponse(
                success=True,
                data={
                    "analyses": [result.dict() for result in results],
                    "total_analyzed": len(results),
                    "requested_count": len(request.moments)
                },
                timestamp=datetime.now()
            )
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
        except Exception as e:
            logger.error(f"Error in batch analysis: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.post("/undervalued")
    async def find_undervalued_moments(request: UndervaluedMomentsRequest):
        """Find undervalued moments from a list of candidates"""
        try:
            # Convert requests to internal models
            moment_requests = []
            for moment_req in request.moments:
                moment_requests.append(MomentAnalysisRequest(
                    moment_id=moment_req.moment_id,
                    player_id=moment_req.player_id,
                    moment_type=moment_req.moment_type,
                    game_date=datetime.strptime(moment_req.game_date, "%Y-%m-%d").date(),
                    serial_number=moment_req.serial_number,
                    current_price=moment_req.current_price,
                    marketplace_id=moment_req.marketplace_id
                ))
            
            # Find undervalued moments
            undervalued = await ai_service.find_undervalued_moments(
                moment_requests,
                min_confidence=request.min_confidence,
                min_upside_percentage=request.min_upside_percentage
            )
            
            return APIResponse(
                success=True,
                data={
                    "undervalued_moments": [moment.dict() for moment in undervalued],
                    "count": len(undervalued),
                    "criteria": {
                        "min_confidence": request.min_confidence,
                        "min_upside_percentage": request.min_upside_percentage
                    }
                },
                timestamp=datetime.now()
            )
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
        except Exception as e:
            logger.error(f"Error finding undervalued moments: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.get("/player/{player_id}/performance")
    async def get_player_performance(player_id: str):
        """Get player performance metrics"""
        try:
            metrics = await ai_service.get_player_performance_metrics(player_id)
            
            if not metrics:
                raise HTTPException(status_code=404, detail="Player not found or no data available")
            
            return APIResponse(
                success=True,
                data=metrics.dict(),
                timestamp=datetime.now()
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting player performance: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.post("/player/recommendations")
    async def get_player_recommendations(request: PlayerRecommendationRequest):
        """Get comprehensive player recommendations"""
        try:
            recommendations = await ai_service.get_player_recommendations(request.player_id)
            
            if 'error' in recommendations:
                raise HTTPException(status_code=404, detail=recommendations['error'])
            
            return APIResponse(
                success=True,
                data=recommendations,
                timestamp=datetime.now()
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting player recommendations: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.post("/trending/players")
    async def get_trending_players(request: TrendingPlayersRequest):
        """Get trending players based on recent performance"""
        try:
            trending = await ai_service.get_trending_players(limit=request.limit)
            
            return APIResponse(
                success=True,
                data={
                    "trending_players": trending,
                    "count": len(trending),
                    "limit": request.limit
                },
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error getting trending players: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.get("/player/search/{query}")
    async def search_players(query: str, limit: int = 20):
        """Search for players by name"""
        try:
            async with ai_service.nba_client:
                players = await ai_service.nba_client.search_players(query)
            
            # Limit results
            limited_players = players[:limit]
            
            return APIResponse(
                success=True,
                data={
                    "players": limited_players,
                    "count": len(limited_players),
                    "query": query
                },
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error searching players: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    @router.get("/stats/league-leaders/{category}")
    async def get_league_leaders(category: str, limit: int = 50):
        """Get league leaders for a specific statistical category"""
        try:
            async with ai_service.nba_client:
                leaders = await ai_service.nba_client.get_league_leaders(
                    stat_category=category.upper(),
                    limit=limit
                )
            
            return APIResponse(
                success=True,
                data={
                    "leaders": leaders,
                    "category": category,
                    "count": len(leaders)
                },
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error getting league leaders: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    # Background task endpoints
    @router.post("/tasks/refresh-player-cache/{player_id}")
    async def refresh_player_cache(player_id: str, background_tasks: BackgroundTasks):
        """Refresh player data cache in background"""
        try:
            async def refresh_cache():
                # Clear existing cache
                cache_key = f"player_performance:{player_id}"
                if ai_service.redis_client:
                    await ai_service.redis_client.delete(cache_key)
                
                # Refresh data
                await ai_service.get_player_performance_metrics(player_id)
            
            background_tasks.add_task(refresh_cache)
            
            return APIResponse(
                success=True,
                data={"message": f"Cache refresh initiated for player {player_id}"},
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Error initiating cache refresh: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    return router