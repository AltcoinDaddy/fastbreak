"""
Comprehensive error handling system for FastBreak AI Scouting Service
"""
import logging
import traceback
import uuid
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import asyncio
import time


class ErrorCategory(Enum):
    VALIDATION = "validation"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    NETWORK = "network"
    BLOCKCHAIN = "blockchain"
    DATABASE = "database"
    EXTERNAL_API = "external_api"
    BUSINESS_LOGIC = "business_logic"
    SYSTEM = "system"
    CONFIGURATION = "configuration"


class ErrorSeverity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ErrorContext:
    correlation_id: str
    service: str
    operation: str
    timestamp: datetime
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class FastBreakError:
    code: str
    message: str
    user_message: str
    context: ErrorContext
    severity: ErrorSeverity
    category: ErrorCategory
    retryable: bool
    troubleshooting_guide: Optional[str] = None
    original_error: Optional[str] = None
    stack_trace: Optional[str] = None


class FastBreakAppError(Exception):
    """Custom exception class for FastBreak application errors"""
    
    def __init__(
        self,
        code: str,
        message: str,
        user_message: str,
        context: ErrorContext,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        category: ErrorCategory = ErrorCategory.SYSTEM,
        retryable: bool = False,
        troubleshooting_guide: Optional[str] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.user_message = user_message
        self.context = context
        self.severity = severity
        self.category = category
        self.retryable = retryable
        self.troubleshooting_guide = troubleshooting_guide
        self.original_error = str(original_error) if original_error else None
        self.stack_trace = traceback.format_exc() if original_error else None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for JSON serialization"""
        return {
            "code": self.code,
            "message": self.message,
            "user_message": self.user_message,
            "context": asdict(self.context),
            "severity": self.severity.value,
            "category": self.category.value,
            "retryable": self.retryable,
            "troubleshooting_guide": self.troubleshooting_guide,
            "original_error": self.original_error,
            "stack_trace": self.stack_trace
        }


# Error codes and messages
ERROR_CODES = {
    # Validation Errors
    "INVALID_INPUT": {
        "message": "Invalid input provided",
        "user_message": "The provided input is not valid",
        "category": ErrorCategory.VALIDATION,
        "troubleshooting_guide": "Please check your input format and try again"
    },
    
    # External API Errors
    "NBA_API_ERROR": {
        "message": "NBA Stats API error",
        "user_message": "Unable to fetch latest player statistics",
        "category": ErrorCategory.EXTERNAL_API,
        "retryable": True,
        "troubleshooting_guide": "Our system is temporarily unable to access NBA statistics. AI analysis may be limited until the connection is restored."
    },
    
    "RATE_LIMIT_EXCEEDED": {
        "message": "API rate limit exceeded",
        "user_message": "Too many requests, please try again later",
        "category": ErrorCategory.EXTERNAL_API,
        "retryable": True,
        "troubleshooting_guide": "Please wait a moment before making another request"
    },
    
    # AI Analysis Errors
    "AI_ANALYSIS_FAILED": {
        "message": "AI analysis failed",
        "user_message": "Unable to analyze moment at this time",
        "category": ErrorCategory.BUSINESS_LOGIC,
        "troubleshooting_guide": "The AI analysis system is temporarily unavailable. Please try again later."
    },
    
    "INSUFFICIENT_DATA": {
        "message": "Insufficient data for analysis",
        "user_message": "Not enough data available for accurate analysis",
        "category": ErrorCategory.BUSINESS_LOGIC,
        "troubleshooting_guide": "This player or moment may not have enough historical data for reliable analysis"
    },
    
    # Database Errors
    "DATABASE_ERROR": {
        "message": "Database operation failed",
        "user_message": "A database error occurred",
        "category": ErrorCategory.DATABASE,
        "retryable": True,
        "troubleshooting_guide": "Please try again. If the problem persists, contact support."
    },
    
    # System Errors
    "INTERNAL_SERVER_ERROR": {
        "message": "Internal server error",
        "user_message": "An unexpected error occurred",
        "category": ErrorCategory.SYSTEM,
        "troubleshooting_guide": "Please try again. If the problem persists, contact support."
    }
}


def create_error(
    code: str,
    context: ErrorContext,
    severity: Optional[ErrorSeverity] = None,
    retryable: Optional[bool] = None,
    original_error: Optional[Exception] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> FastBreakAppError:
    """Create a FastBreakAppError with predefined error code"""
    
    error_info = ERROR_CODES.get(code, ERROR_CODES["INTERNAL_SERVER_ERROR"])
    
    # Update context with additional metadata
    if metadata:
        context.metadata = {**(context.metadata or {}), **metadata}
    
    return FastBreakAppError(
        code=code,
        message=error_info["message"],
        user_message=error_info["user_message"],
        context=context,
        severity=severity or ErrorSeverity.MEDIUM,
        category=error_info["category"],
        retryable=retryable if retryable is not None else error_info.get("retryable", False),
        troubleshooting_guide=error_info.get("troubleshooting_guide"),
        original_error=original_error
    )


class CorrelationContext:
    """Thread-local correlation ID context"""
    _context: Dict[str, str] = {}
    
    @classmethod
    def set(cls, key: str, correlation_id: str) -> None:
        cls._context[key] = correlation_id
    
    @classmethod
    def get(cls, key: str = "default") -> str:
        return cls._context.get(key, str(uuid.uuid4()))
    
    @classmethod
    def clear(cls, key: str = "default") -> None:
        cls._context.pop(key, None)
    
    @classmethod
    def generate_id(cls) -> str:
        return str(uuid.uuid4())


class FastBreakLogger:
    """Structured logger with correlation ID support"""
    
    def __init__(self, service: str, level: str = "INFO"):
        self.service = service
        self.logger = logging.getLogger(service)
        self.logger.setLevel(getattr(logging, level.upper()))
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] [%(name)s] [%(correlation_id)s] [%(operation)s]: %(message)s'
        )
        
        # Add console handler if not already present
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
    
    def _log(self, level: str, message: str, **kwargs) -> None:
        extra = {
            'correlation_id': kwargs.get('correlation_id', CorrelationContext.get()),
            'operation': kwargs.get('operation', 'unknown'),
            'user_id': kwargs.get('user_id'),
            'metadata': kwargs.get('metadata', {})
        }
        
        getattr(self.logger, level.lower())(message, extra=extra)
    
    def error(self, message: str, **kwargs) -> None:
        self._log('ERROR', message, **kwargs)
    
    def warn(self, message: str, **kwargs) -> None:
        self._log('WARNING', message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        self._log('INFO', message, **kwargs)
    
    def debug(self, message: str, **kwargs) -> None:
        self._log('DEBUG', message, **kwargs)
    
    def start_operation(self, operation: str, **kwargs) -> str:
        correlation_id = kwargs.get('correlation_id', CorrelationContext.generate_id())
        CorrelationContext.set('default', correlation_id)
        
        self.info(f"Starting operation: {operation}", 
                 correlation_id=correlation_id, 
                 operation=operation, 
                 **kwargs)
        
        return correlation_id
    
    def complete_operation(self, operation: str, **kwargs) -> None:
        self.info(f"Completed operation: {operation}", 
                 operation=operation, 
                 **kwargs)
    
    def fail_operation(self, operation: str, error: Exception, **kwargs) -> None:
        self.error(f"Failed operation: {operation}", 
                  operation=operation, 
                  error=error,
                  **kwargs)


class RetryConfig:
    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        backoff_multiplier: float = 2.0,
        jitter: bool = True
    ):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_multiplier = backoff_multiplier
        self.jitter = jitter


async def with_retry(
    operation,
    config: RetryConfig = None,
    logger: FastBreakLogger = None,
    operation_name: str = None
):
    """Retry async operation with exponential backoff"""
    if config is None:
        config = RetryConfig()
    
    last_error = None
    
    for attempt in range(1, config.max_attempts + 1):
        try:
            if logger and operation_name:
                logger.debug(f"Attempting operation: {operation_name}", 
                           metadata={"attempt": attempt, "max_attempts": config.max_attempts})
            
            result = await operation()
            
            if attempt > 1 and logger and operation_name:
                logger.info(f"Operation succeeded after {attempt} attempts: {operation_name}")
            
            return result
            
        except Exception as error:
            last_error = error
            
            # Check if error is retryable
            if isinstance(error, FastBreakAppError) and not error.retryable:
                if logger and operation_name:
                    logger.warn(f"Operation failed with non-retryable error: {operation_name}",
                              error=error, metadata={"attempt": attempt})
                raise error
            
            # If this was the last attempt, raise the error
            if attempt == config.max_attempts:
                if logger and operation_name:
                    logger.error(f"Operation failed after {attempt} attempts: {operation_name}",
                               error=error, metadata={"max_attempts": config.max_attempts})
                raise error
            
            # Calculate delay and wait before next attempt
            delay = min(
                config.base_delay * (config.backoff_multiplier ** (attempt - 1)),
                config.max_delay
            )
            
            if config.jitter:
                import random
                jitter_range = delay * 0.25
                jitter = (random.random() - 0.5) * 2 * jitter_range
                delay = max(0, delay + jitter)
            
            if logger and operation_name:
                logger.warn(f"Operation failed, retrying in {delay:.2f}s: {operation_name}",
                          error=error,
                          metadata={
                              "attempt": attempt,
                              "max_attempts": config.max_attempts,
                              "delay": delay,
                              "next_attempt": attempt + 1
                          })
            
            await asyncio.sleep(delay)
    
    # This should never be reached, but just in case
    raise last_error


def error_handler_middleware(logger: FastBreakLogger):
    """FastAPI middleware for comprehensive error handling"""
    
    async def middleware(request: Request, call_next):
        # Add correlation ID to request
        correlation_id = request.headers.get('x-correlation-id', str(uuid.uuid4()))
        CorrelationContext.set('default', correlation_id)
        
        start_time = time.time()
        
        try:
            # Log request start
            logger.info("Request started",
                       correlation_id=correlation_id,
                       metadata={
                           "method": request.method,
                           "url": str(request.url),
                           "user_agent": request.headers.get("user-agent"),
                           "client_ip": request.client.host if request.client else None
                       })
            
            response = await call_next(request)
            
            # Log successful response
            duration = time.time() - start_time
            logger.info("Request completed",
                       correlation_id=correlation_id,
                       metadata={
                           "method": request.method,
                           "url": str(request.url),
                           "status_code": response.status_code,
                           "duration": duration
                       })
            
            # Add correlation ID to response headers
            response.headers["x-correlation-id"] = correlation_id
            
            return response
            
        except Exception as error:
            duration = time.time() - start_time
            
            # Convert to FastBreakAppError if needed
            if not isinstance(error, FastBreakAppError):
                context = ErrorContext(
                    correlation_id=correlation_id,
                    service="ai-scouting",
                    operation=f"{request.method} {request.url.path}",
                    timestamp=datetime.utcnow(),
                    metadata={
                        "method": request.method,
                        "url": str(request.url),
                        "duration": duration
                    }
                )
                
                fastbreak_error = create_error(
                    "INTERNAL_SERVER_ERROR",
                    context,
                    severity=ErrorSeverity.HIGH,
                    original_error=error
                )
            else:
                fastbreak_error = error
            
            # Log the error
            logger.error("Request failed with error",
                        correlation_id=correlation_id,
                        operation=f"{request.method} {request.url.path}",
                        error=fastbreak_error,
                        metadata={
                            "method": request.method,
                            "url": str(request.url),
                            "status_code": get_status_code_from_error(fastbreak_error),
                            "duration": duration
                        })
            
            # Return error response
            status_code = get_status_code_from_error(fastbreak_error)
            return JSONResponse(
                status_code=status_code,
                content={
                    "success": False,
                    "error": {
                        "code": fastbreak_error.code,
                        "message": fastbreak_error.user_message,
                        "correlation_id": correlation_id,
                        "troubleshooting_guide": fastbreak_error.troubleshooting_guide
                    },
                    "timestamp": datetime.utcnow().isoformat()
                },
                headers={"x-correlation-id": correlation_id}
            )
    
    return middleware


def get_status_code_from_error(error: FastBreakAppError) -> int:
    """Map FastBreakAppError to HTTP status code"""
    status_map = {
        ErrorCategory.VALIDATION: 400,
        ErrorCategory.AUTHENTICATION: 401,
        ErrorCategory.AUTHORIZATION: 403,
        ErrorCategory.BUSINESS_LOGIC: 422,
        ErrorCategory.EXTERNAL_API: 502,
        ErrorCategory.NETWORK: 503,
    }
    return status_map.get(error.category, 500)


def with_error_context(operation, context: ErrorContext):
    """Decorator to wrap operations with error context"""
    async def wrapper(*args, **kwargs):
        try:
            return await operation(*args, **kwargs)
        except FastBreakAppError as error:
            # Update context if it's already a FastBreakAppError
            error.context = context
            raise error
        except Exception as error:
            # Wrap unknown errors
            raise create_error(
                "INTERNAL_SERVER_ERROR",
                context,
                severity=ErrorSeverity.HIGH,
                original_error=error
            )
    
    return wrapper