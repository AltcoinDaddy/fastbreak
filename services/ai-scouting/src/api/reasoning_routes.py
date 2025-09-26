"""
API routes for AI reasoning and transparency system

Provides endpoints for accessing AI reasoning data, explanations,
and performance metrics.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime, timedelta
import logging

from ..services.reasoning_service import ReasoningService
from ..models.reasoning import (
    AIReasoningResult, ReasoningSearchQuery, ReasoningSearchResult,
    ReasoningExplanation, ReasoningPerformanceMetrics, ReasoningHistory
)
from ..models.moment_analysis import MomentAnalysisResult

logger = logging.getLogger(__name__)

def create_reasoning_router(reasoning_service: ReasoningService) -> APIRouter:
    """Create reasoning API router"""
    
    router = APIRouter(prefix="/reasoning", tags=["reasoning"])
    
    @router.get("/moment/{moment_id}", response_model=List[AIReasoningResult])
    async def get_moment_reasoning(
        moment_id: str,
        limit: int = Query(10, ge=1, le=100, description="Number of reasoning records to return")
    ):
        """Get AI reasoning history for a specific moment"""
        try:
            reasoning_results = await reasoning_service.get_reasoning_by_moment(
                moment_id=moment_id,
                limit=limit
            )
            
            if not reasoning_results:
                raise HTTPException(
                    status_code=404,
                    detail=f"No reasoning found for moment {moment_id}"
                )
            
            return reasoning_results
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting reasoning for moment {moment_id}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve reasoning data"
            )
    
    @router.get("/moment/{moment_id}/explanation", response_model=ReasoningExplanation)
    async def get_moment_explanation(moment_id: str):
        """Get human-friendly explanation for the latest reasoning of a moment"""
        try:
            reasoning_results = await reasoning_service.get_reasoning_by_moment(
                moment_id=moment_id,
                limit=1
            )
            
            if not reasoning_results:
                raise HTTPException(
                    status_code=404,
                    detail=f"No reasoning found for moment {moment_id}"
                )
            
            explanation = reasoning_service.generate_human_explanation(reasoning_results[0])
            return explanation
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error generating explanation for moment {moment_id}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to generate explanation"
            )
    
    @router.post("/search", response_model=ReasoningSearchResult)
    async def search_reasoning(search_query: ReasoningSearchQuery):
        """Search reasoning history with filters"""
        try:
            search_result = await reasoning_service.search_reasoning(search_query)
            return search_result
            
        except Exception as e:
            logger.error(f"Error searching reasoning: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to search reasoning data"
            )
    
    @router.get("/performance", response_model=ReasoningPerformanceMetrics)
    async def get_performance_metrics(
        days_back: int = Query(30, ge=1, le=365, description="Number of days to analyze")
    ):
        """Get performance metrics for the reasoning system"""
        try:
            date_to = datetime.now()
            date_from = date_to - timedelta(days=days_back)
            
            metrics = await reasoning_service.calculate_performance_metrics(
                date_from=date_from,
                date_to=date_to
            )
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error calculating performance metrics: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to calculate performance metrics"
            )
    
    @router.post("/generate", response_model=AIReasoningResult)
    async def generate_reasoning(
        analysis_result: MomentAnalysisResult,
        user_id: Optional[str] = None
    ):
        """Generate and store reasoning for an analysis result"""
        try:
            # Generate detailed reasoning
            reasoning_result = reasoning_service.generate_detailed_reasoning(
                analysis_result=analysis_result,
                user_id=user_id
            )
            
            # Store reasoning in database
            reasoning_id = await reasoning_service.store_reasoning(
                reasoning_result=reasoning_result,
                user_id=user_id
            )
            
            logger.info(f"Generated and stored reasoning {reasoning_id} for moment {analysis_result.moment_id}")
            
            return reasoning_result
            
        except Exception as e:
            logger.error(f"Error generating reasoning: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to generate reasoning"
            )
    
    @router.get("/factors/importance", response_model=dict)
    async def get_factor_importance(
        days_back: int = Query(30, ge=1, le=365, description="Number of days to analyze")
    ):
        """Get factor importance ranking over time"""
        try:
            date_to = datetime.now()
            date_from = date_to - timedelta(days=days_back)
            
            metrics = await reasoning_service.calculate_performance_metrics(
                date_from=date_from,
                date_to=date_to
            )
            
            return {
                "factor_importance": metrics.factor_importance_ranking,
                "analysis_period": {
                    "from": date_from.isoformat(),
                    "to": date_to.isoformat(),
                    "days": days_back
                },
                "total_decisions": metrics.total_decisions
            }
            
        except Exception as e:
            logger.error(f"Error getting factor importance: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to get factor importance data"
            )
    
    @router.get("/decisions/summary", response_model=dict)
    async def get_decisions_summary(
        days_back: int = Query(7, ge=1, le=365, description="Number of days to analyze")
    ):
        """Get summary of recent decisions"""
        try:
            date_from = datetime.now() - timedelta(days=days_back)
            
            search_query = ReasoningSearchQuery(
                date_from=date_from,
                limit=1000,
                offset=0
            )
            
            search_result = await reasoning_service.search_reasoning(search_query)
            
            # Aggregate decision types
            decision_counts = {}
            confidence_by_decision = {}
            
            for history in search_result.results:
                decision = history.reasoning_result.decision
                confidence = history.reasoning_result.confidence_score
                
                decision_counts[decision] = decision_counts.get(decision, 0) + 1
                
                if decision not in confidence_by_decision:
                    confidence_by_decision[decision] = []
                confidence_by_decision[decision].append(confidence)
            
            # Calculate average confidence by decision type
            avg_confidence = {}
            for decision, confidences in confidence_by_decision.items():
                avg_confidence[decision] = sum(confidences) / len(confidences) if confidences else 0
            
            return {
                "period": {
                    "days": days_back,
                    "from": date_from.isoformat(),
                    "to": datetime.now().isoformat()
                },
                "total_decisions": search_result.total_count,
                "decision_breakdown": decision_counts,
                "average_confidence_by_decision": avg_confidence,
                "most_common_decision": max(decision_counts.items(), key=lambda x: x[1])[0] if decision_counts else None
            }
            
        except Exception as e:
            logger.error(f"Error getting decisions summary: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to get decisions summary"
            )
    
    @router.get("/confidence/distribution", response_model=dict)
    async def get_confidence_distribution(
        days_back: int = Query(30, ge=1, le=365, description="Number of days to analyze")
    ):
        """Get confidence score distribution"""
        try:
            date_from = datetime.now() - timedelta(days=days_back)
            
            search_query = ReasoningSearchQuery(
                date_from=date_from,
                limit=1000,
                offset=0
            )
            
            search_result = await reasoning_service.search_reasoning(search_query)
            
            # Create confidence buckets
            confidence_buckets = {
                "very_low": 0,    # 0-0.3
                "low": 0,         # 0.3-0.5
                "medium": 0,      # 0.5-0.7
                "high": 0,        # 0.7-0.9
                "very_high": 0    # 0.9-1.0
            }
            
            confidences = []
            
            for history in search_result.results:
                confidence = history.reasoning_result.confidence_score
                confidences.append(confidence)
                
                if confidence < 0.3:
                    confidence_buckets["very_low"] += 1
                elif confidence < 0.5:
                    confidence_buckets["low"] += 1
                elif confidence < 0.7:
                    confidence_buckets["medium"] += 1
                elif confidence < 0.9:
                    confidence_buckets["high"] += 1
                else:
                    confidence_buckets["very_high"] += 1
            
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            return {
                "period": {
                    "days": days_back,
                    "from": date_from.isoformat(),
                    "to": datetime.now().isoformat()
                },
                "total_decisions": len(confidences),
                "average_confidence": avg_confidence,
                "confidence_distribution": confidence_buckets,
                "confidence_percentiles": {
                    "p25": sorted(confidences)[len(confidences)//4] if confidences else 0,
                    "p50": sorted(confidences)[len(confidences)//2] if confidences else 0,
                    "p75": sorted(confidences)[3*len(confidences)//4] if confidences else 0
                } if confidences else {}
            }
            
        except Exception as e:
            logger.error(f"Error getting confidence distribution: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to get confidence distribution"
            )
    
    return router