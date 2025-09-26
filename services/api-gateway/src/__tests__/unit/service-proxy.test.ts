import axios from 'axios';
import { ServiceProxy } from '../../utils/service-proxy';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ServiceProxy', () => {
  let serviceProxy: ServiceProxy;

  beforeEach(() => {
    serviceProxy = new ServiceProxy();
    jest.clearAllMocks();
  });

  describe('Service configuration', () => {
    it('should initialize with default service configurations', () => {
      expect(serviceProxy.isServiceConfigured('user-service')).toBe(true);
      expect(serviceProxy.isServiceConfigured('ai-scouting')).toBe(true);
      expect(serviceProxy.isServiceConfigured('marketplace-monitor')).toBe(true);
      expect(serviceProxy.isServiceConfigured('trading-service')).toBe(true);
    });

    it('should return false for non-configured services', () => {
      expect(serviceProxy.isServiceConfigured('non-existent-service')).toBe(false);
    });

    it('should return service URLs', () => {
      const userServiceUrl = serviceProxy.getServiceUrl('user-service');
      expect(userServiceUrl).toBeDefined();
      expect(userServiceUrl).toContain('localhost');
    });
  });

  describe('HTTP methods', () => {
    const mockResponse = {
      data: { success: true, data: 'test' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    };

    beforeEach(() => {
      mockedAxios.mockResolvedValue(mockResponse);
    });

    it('should make GET requests', async () => {
      const result = await serviceProxy.get('user-service', '/users/123');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/users/123'),
          timeout: 5000,
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should make POST requests', async () => {
      const postData = { name: 'test' };
      const result = await serviceProxy.post('user-service', '/users', postData);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/users'),
          data: postData,
          timeout: 5000,
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should make PUT requests', async () => {
      const putData = { name: 'updated' };
      const result = await serviceProxy.put('user-service', '/users/123', putData);

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: expect.stringContaining('/users/123'),
          data: putData,
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should make DELETE requests', async () => {
      const result = await serviceProxy.delete('user-service', '/users/123');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: expect.stringContaining('/users/123'),
        })
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent service', async () => {
      await expect(
        serviceProxy.get('non-existent-service', '/test')
      ).rejects.toThrow("Service 'non-existent-service' not found");
    });

    it('should handle connection refused errors', async () => {
      const connectionError = new Error('Connection refused');
      (connectionError as any).code = 'ECONNREFUSED';
      mockedAxios.mockRejectedValue(connectionError);

      try {
        await serviceProxy.get('user-service', '/test');
      } catch (error: any) {
        expect(error.message).toContain("Service 'user-service' is unavailable");
        expect(error.statusCode).toBe(503);
        expect(error.service).toBe('user-service');
        expect(error.requestId).toBeDefined();
      }
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ECONNABORTED';
      mockedAxios.mockRejectedValue(timeoutError);

      try {
        await serviceProxy.get('user-service', '/test');
      } catch (error: any) {
        expect(error.message).toContain("Service 'user-service' request timed out");
        expect(error.statusCode).toBe(504);
      }
    });

    it('should handle network unreachable errors', async () => {
      const networkError = new Error('Network unreachable');
      (networkError as any).code = 'ENETUNREACH';
      mockedAxios.mockRejectedValue(networkError);

      try {
        await serviceProxy.get('user-service', '/test');
      } catch (error: any) {
        expect(error.message).toContain("Service 'user-service' is unreachable");
        expect(error.statusCode).toBe(503);
      }
    });

    it('should handle HTTP errors', async () => {
      const httpError = {
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: { error: 'Not found' },
        },
      };
      mockedAxios.mockRejectedValue(httpError);

      try {
        await serviceProxy.get('user-service', '/test');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
        expect(error.service).toBe('user-service');
        expect(error.responseTime).toBeDefined();
      }
    });

    it('should handle generic network errors', async () => {
      const networkError = new Error('Network Error');
      mockedAxios.mockRejectedValue(networkError);

      await expect(
        serviceProxy.get('user-service', '/test')
      ).rejects.toThrow('Network Error');
    });
  });

  describe('Request configuration', () => {
    beforeEach(() => {
      mockedAxios.mockResolvedValue({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });
    });

    it('should use service-specific timeout', async () => {
      await serviceProxy.get('ai-scouting', '/test');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000, // AI service has longer timeout
        })
      );
    });

    it('should include custom headers', async () => {
      await serviceProxy.get('user-service', '/test', {
        headers: { 'Custom-Header': 'value' },
      });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Custom-Header': 'value',
          }),
        })
      );
    });

    it('should add request ID and gateway version headers', async () => {
      await serviceProxy.get('user-service', '/test');

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Request-ID': expect.any(String),
            'X-Gateway-Version': '1.0.0',
          }),
        })
      );
    });

    it('should preserve custom headers while adding default ones', async () => {
      const customHeaders = { 'Authorization': 'Bearer token123' };
      
      await serviceProxy.request('user-service', '/test', {
        headers: customHeaders,
      });

      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token123',
            'Content-Type': 'application/json',
            'X-Request-ID': expect.any(String),
            'X-Gateway-Version': '1.0.0',
          }),
        })
      );
    });
  });

  describe('Response handling', () => {
    it('should add response metadata headers', async () => {
      const mockResponse = {
        data: { test: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      
      mockedAxios.mockResolvedValue(mockResponse);
      
      const response = await serviceProxy.request('user-service', '/test');
      
      expect(response.headers['x-response-time']).toBeDefined();
      expect(response.headers['x-service-name']).toBe('user-service');
    });

    it('should return response data for convenience methods', async () => {
      const mockData = { id: '123', name: 'Test' };
      const mockResponse = {
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      
      mockedAxios.mockResolvedValue(mockResponse);
      
      const result = await serviceProxy.get('user-service', '/test');
      expect(result).toEqual(mockData);
    });
  });
});