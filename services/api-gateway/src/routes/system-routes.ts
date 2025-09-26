import { Router, Request, Response } from 'express';
import { healthCheckService } from '../services/health-check';
import { asyncHandler } from '../middleware/error-handler';
import { createSuccessResponse, createErrorResponse } from '@fastbreak/shared';
import { logger } from '../utils/logger';
import { getMetricsHandler } from '../middleware/monitoring';

const router = Router();

// Detailed health check endpoint
router.get('/health/detailed', asyncHandler(async (req: Request, res: Response) => {
  const systemHealth = healthCheckService.getSystemHealth();
  
  res.status(systemHealth.status === 'healthy' ? 200 : 503).json(
    createSuccessResponse(systemHealth)
  );
}));

// Individual service health check
router.get('/health/:serviceName', asyncHandler(async (req: Request, res: Response) => {
  const { serviceName } = req.params;
  
  try {
    const serviceHealth = await healthCheckService.checkServiceHealth(serviceName);
    
    res.status(serviceHealth.status === 'healthy' ? 200 : 503).json(
      createSuccessResponse(serviceHealth)
    );
  } catch (error: any) {
    logger.error('Failed to check service health', {
      service: serviceName,
      error: error.message,
    });
    
    res.status(500).json(createErrorResponse('Failed to check service health'));
  }
}));

// System status endpoint
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const systemHealth = healthCheckService.getSystemHealth();
  
  const status = {
    status: systemHealth.status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      total: systemHealth.services.length,
      healthy: systemHealth.services.filter(s => s.status === 'healthy').length,
      unhealthy: systemHealth.services.filter(s => s.status === 'unhealthy').length,
    },
  };
  
  res.json(createSuccessResponse(status));
}));

// System metrics endpoint
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const systemHealth = healthCheckService.getSystemHealth();
  
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    },
    cpu: {
      usage: process.cpuUsage(),
    },
    services: systemHealth.services.map(service => ({
      name: service.name,
      status: service.status,
      responseTime: service.responseTime,
      lastCheck: service.lastCheck,
    })),
  };
  
  res.json(createSuccessResponse(metrics));
}));

// API Gateway performance metrics
router.get('/performance', getMetricsHandler);

export { router as systemRoutes };