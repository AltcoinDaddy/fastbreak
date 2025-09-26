import asyncio
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from dotenv import load_dotenv

from src.services.ai_service import AIScoutingService
from src.api.routes import create_router
from src.utils.error_handling import (
    FastBreakLogger,
    error_handler_middleware,
    ErrorContext,
    create_error,
    ErrorSeverity
)
from datetime import datetime

# Load environment variables
load_dotenv()

# Configure comprehensive logging
fastbreak_logger = FastBreakLogger("ai-scouting", level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger(__name__)

# Global service instance
ai_service: AIScoutingService = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    global ai_service
    
    # Startup
    correlation_id = fastbreak_logger.start_operation("service_startup")
    
    try:
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        nba_api_key = os.getenv('NBA_STATS_API_KEY')
        
        database_url = os.getenv('DATABASE_URL', 'postgresql://fastbreak:password@localhost:5432/fastbreak')
        ai_service = AIScoutingService(redis_url=redis_url, nba_api_key=nba_api_key, database_url=database_url)
        await ai_service.initialize()
        
        fastbreak_logger.complete_operation("service_startup", correlation_id=correlation_id)
        yield
        
    except Exception as e:
        fastbreak_logger.fail_operation("service_startup", e, correlation_id=correlation_id)
        
        # Create structured error
        context = ErrorContext(
            correlation_id=correlation_id,
            service="ai-scouting",
            operation="service_startup",
            timestamp=datetime.utcnow()
        )
        
        structured_error = create_error(
            "INTERNAL_SERVER_ERROR",
            context,
            severity=ErrorSeverity.CRITICAL,
            original_error=e
        )
        
        raise structured_error
    
    # Shutdown
    shutdown_correlation_id = fastbreak_logger.start_operation("service_shutdown")
    
    try:
        if ai_service:
            await ai_service.close()
        fastbreak_logger.complete_operation("service_shutdown", correlation_id=shutdown_correlation_id)
    except Exception as e:
        fastbreak_logger.fail_operation("service_shutdown", e, correlation_id=shutdown_correlation_id)

# Create FastAPI app
app = FastAPI(
    title="FastBreak AI Scouting Service",
    description="AI-powered NBA player and moment analysis for FastBreak",
    version="1.0.0",
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv('ALLOWED_ORIGINS', 'http://localhost:3001').split(','),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add comprehensive error handling middleware
@app.middleware("http")
async def error_handling(request: Request, call_next):
    return await error_handler_middleware(fastbreak_logger)(request, call_next)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "ai-scouting",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "FastBreak AI Scouting Service",
        "version": "1.0.0",
        "status": "running"
    }

def create_app() -> FastAPI:
    """Create and configure the FastAPI application"""
    
    # Add routes
    if ai_service:
        router = create_router(ai_service)
        app.include_router(router)
    
    return app

if __name__ == "__main__":
    # Development server
    port = int(os.getenv('AI_SCOUTING_PORT', 8001))
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )