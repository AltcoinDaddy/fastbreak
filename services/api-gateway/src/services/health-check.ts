import { serviceProxy } from '../utils/service-proxy';
import { logger } from '../utils/logger';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  timestamp: Date;
  uptime: number;
}

class HealthCheckService {
  private serviceHealthMap: Map<string, ServiceHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor() {
    this.intervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'); // 30 seconds
    this.timeoutMs = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000'); // 5 seconds
  }

  startMonitoring(): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    logger.info('Starting health check monitoring', {
      interval: this.intervalMs,
      timeout: this.timeoutMs,
    });

    // Initial check
    this.checkAllServices();

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllServices();
    }, this.intervalMs);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Health check monitoring stopped');
    }
  }

  private async checkAllServices(): Promise<void> {
    const services = [
      'user-service',
      'ai-scouting',
      'marketplace-monitor',
      'trading-service',
      'notification-service',
      'risk-management',
      'strategy-service',
      'forte-actions',
      'forte-agents',
    ];

    const healthChecks = services.map(service => this.checkService(service));
    await Promise.allSettled(healthChecks);

    // Log overall system health
    const systemHealth = this.getSystemHealth();
    logger.info('System health check completed', {
      status: systemHealth.status,
      healthyServices: systemHealth.services.filter(s => s.status === 'healthy').length,
      totalServices: systemHealth.services.length,
    });
  }

  private async checkService(serviceName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      await serviceProxy.request(serviceName, '/health', {
        timeout: this.timeoutMs,
        method: 'GET',
      });

      const responseTime = Date.now() - startTime;
      
      this.serviceHealthMap.set(serviceName, {
        name: serviceName,
        status: 'healthy',
        responseTime,
        lastCheck: new Date(),
      });

      logger.debug('Service health check passed', {
        service: serviceName,
        responseTime,
      });

    } catch (error: any) {
      this.serviceHealthMap.set(serviceName, {
        name: serviceName,
        status: 'unhealthy',
        lastCheck: new Date(),
        error: error.message,
      });

      logger.warn('Service health check failed', {
        service: serviceName,
        error: error.message,
      });
    }
  }

  getServiceHealth(serviceName: string): ServiceHealth | undefined {
    return this.serviceHealthMap.get(serviceName);
  }

  getSystemHealth(): SystemHealth {
    const services = Array.from(this.serviceHealthMap.values());
    
    let status: SystemHealth['status'] = 'healthy';
    
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const totalCount = services.length;
    
    if (healthyCount === 0) {
      status = 'unhealthy';
    } else if (healthyCount < totalCount) {
      status = 'degraded';
    }

    return {
      status,
      services,
      timestamp: new Date(),
      uptime: process.uptime(),
    };
  }

  async checkServiceHealth(serviceName: string): Promise<ServiceHealth> {
    await this.checkService(serviceName);
    return this.getServiceHealth(serviceName) || {
      name: serviceName,
      status: 'unknown',
      lastCheck: new Date(),
      error: 'Service not found',
    };
  }
}

export const healthCheckService = new HealthCheckService();