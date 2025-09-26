import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from './logger';
import { withRetry } from '@fastbreak/shared';

export interface ServiceConfig {
  name: string;
  url: string;
  timeout?: number;
  retries?: number;
}

export class ServiceProxy {
  private services: Map<string, ServiceConfig> = new Map();

  constructor() {
    this.initializeServices();
  }

  private initializeServices() {
    const services: ServiceConfig[] = [
      {
        name: 'user-service',
        url: process.env.USER_SERVICE_URL || 'http://localhost:3001',
        timeout: 5000,
        retries: 3,
      },
      {
        name: 'ai-scouting',
        url: process.env.AI_SCOUTING_SERVICE_URL || 'http://localhost:8001',
        timeout: 10000,
        retries: 2,
      },
      {
        name: 'marketplace-monitor',
        url: process.env.MARKETPLACE_MONITOR_URL || 'http://localhost:3002',
        timeout: 5000,
        retries: 3,
      },
      {
        name: 'trading-service',
        url: process.env.TRADING_SERVICE_URL || 'http://localhost:3003',
        timeout: 15000,
        retries: 2,
      },
      {
        name: 'notification-service',
        url: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
        timeout: 5000,
        retries: 3,
      },
      {
        name: 'risk-management',
        url: process.env.RISK_MANAGEMENT_URL || 'http://localhost:3005',
        timeout: 5000,
        retries: 3,
      },
      {
        name: 'strategy-service',
        url: process.env.STRATEGY_SERVICE_URL || 'http://localhost:3006',
        timeout: 5000,
        retries: 3,
      },
      {
        name: 'forte-actions',
        url: process.env.FORTE_ACTIONS_URL || 'http://localhost:3007',
        timeout: 10000,
        retries: 2,
      },
      {
        name: 'forte-agents',
        url: process.env.FORTE_AGENTS_URL || 'http://localhost:3008',
        timeout: 5000,
        retries: 3,
      },
    ];

    services.forEach(service => {
      this.services.set(service.name, service);
    });

    logger.info('Service proxy initialized', {
      services: Array.from(this.services.keys()),
    });
  }

  async request<T = any>(
    serviceName: string,
    path: string,
    options: AxiosRequestConfig = {}
  ): Promise<AxiosResponse<T>> {
    const service = this.services.get(serviceName);
    
    if (!service) {
      logger.error('Service not found', { serviceName, availableServices: Array.from(this.services.keys()) });
      throw new Error(`Service '${serviceName}' not found`);
    }

    const url = `${service.url}${path}`;
    const startTime = Date.now();
    const config: AxiosRequestConfig = {
      ...options,
      url,
      timeout: service.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': this.generateRequestId(),
        'X-Gateway-Version': '1.0.0',
        ...options.headers,
      },
    };

    logger.debug('Making service request', {
      service: serviceName,
      method: config.method || 'GET',
      url,
      timeout: config.timeout,
      requestId: config.headers['X-Request-ID'],
    });

    try {
      const response = await withRetry(
        () => axios(config),
        service.retries || 3,
        1000
      );

      const responseTime = Date.now() - startTime;

      logger.info('Service request successful', {
        service: serviceName,
        status: response.status,
        url,
        responseTime,
        requestId: config.headers['X-Request-ID'],
      });

      // Add response metadata
      response.headers['x-response-time'] = responseTime.toString();
      response.headers['x-service-name'] = serviceName;

      return response;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Service request failed', {
        service: serviceName,
        url,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        responseTime,
        requestId: config.headers['X-Request-ID'],
        code: error.code,
      });

      // Enhanced error handling based on error type
      let statusCode = error.response?.status || 500;
      let errorMessage = error.message;

      if (error.code === 'ECONNREFUSED') {
        statusCode = 503;
        errorMessage = `Service '${serviceName}' is unavailable`;
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        statusCode = 504;
        errorMessage = `Service '${serviceName}' request timed out`;
      } else if (error.code === 'ENETUNREACH') {
        statusCode = 503;
        errorMessage = `Service '${serviceName}' is unreachable`;
      }

      // Re-throw with additional context
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).originalError = error;
      (enhancedError as any).service = serviceName;
      (enhancedError as any).statusCode = statusCode;
      (enhancedError as any).responseTime = responseTime;
      (enhancedError as any).requestId = config.headers['X-Request-ID'];
      
      throw enhancedError;
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async get<T = any>(serviceName: string, path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>(serviceName, path, { ...config, method: 'GET' });
    return response.data;
  }

  async post<T = any>(serviceName: string, path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>(serviceName, path, { ...config, method: 'POST', data });
    return response.data;
  }

  async put<T = any>(serviceName: string, path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>(serviceName, path, { ...config, method: 'PUT', data });
    return response.data;
  }

  async patch<T = any>(serviceName: string, path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>(serviceName, path, { ...config, method: 'PATCH', data });
    return response.data;
  }

  async delete<T = any>(serviceName: string, path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>(serviceName, path, { ...config, method: 'DELETE' });
    return response.data;
  }

  getServiceUrl(serviceName: string): string | undefined {
    return this.services.get(serviceName)?.url;
  }

  isServiceConfigured(serviceName: string): boolean {
    return this.services.has(serviceName);
  }
}

export const serviceProxy = new ServiceProxy();