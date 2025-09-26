"""
Database client for AI Scouting Service

Provides database connectivity and query execution for the AI scouting service.
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional
import asyncpg

logger = logging.getLogger(__name__)

class DatabaseClient:
    """Database client for PostgreSQL operations"""
    
    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url
        self.pool = None
    
    async def initialize(self):
        """Initialize database connection pool"""
        if self.database_url:
            try:
                self.pool = await asyncpg.create_pool(self.database_url)
                logger.info("Database connection pool initialized")
            except Exception as e:
                logger.error(f"Failed to initialize database pool: {str(e)}")
                raise
    
    async def close(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")
    
    async def execute(self, query: str, params: List[Any] = None) -> None:
        """Execute a query without returning results"""
        if not self.pool:
            logger.warning("Database pool not initialized")
            return
        
        try:
            async with self.pool.acquire() as connection:
                await connection.execute(query, *(params or []))
        except Exception as e:
            logger.error(f"Database execute error: {str(e)}")
            raise
    
    async def fetch_one(self, query: str, params: List[Any] = None) -> Optional[Dict[str, Any]]:
        """Fetch a single row from the database"""
        if not self.pool:
            logger.warning("Database pool not initialized")
            return None
        
        try:
            async with self.pool.acquire() as connection:
                row = await connection.fetchrow(query, *(params or []))
                return dict(row) if row else None
        except Exception as e:
            logger.error(f"Database fetch_one error: {str(e)}")
            raise
    
    async def fetch_all(self, query: str, params: List[Any] = None) -> List[Dict[str, Any]]:
        """Fetch all rows from the database"""
        if not self.pool:
            logger.warning("Database pool not initialized")
            return []
        
        try:
            async with self.pool.acquire() as connection:
                rows = await connection.fetch(query, *(params or []))
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Database fetch_all error: {str(e)}")
            raise
    
    async def fetch_many(self, query: str, params: List[Any] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetch multiple rows with limit"""
        if not self.pool:
            logger.warning("Database pool not initialized")
            return []
        
        try:
            async with self.pool.acquire() as connection:
                rows = await connection.fetch(query, *(params or []))
                return [dict(row) for row in rows[:limit]]
        except Exception as e:
            logger.error(f"Database fetch_many error: {str(e)}")
            raise
    
    async def transaction(self):
        """Get a database transaction context"""
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        
        return self.pool.acquire()
    
    async def health_check(self) -> bool:
        """Check database connectivity"""
        if not self.pool:
            return False
        
        try:
            async with self.pool.acquire() as connection:
                await connection.fetchval("SELECT 1")
                return True
        except Exception as e:
            logger.error(f"Database health check failed: {str(e)}")
            return False