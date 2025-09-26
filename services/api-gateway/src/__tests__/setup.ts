// Test setup file
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.PORT = '0'; // Use random available port for tests
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock the health check service to prevent it from starting during tests
jest.mock('../services/health-check', () => ({
  healthCheckService: {
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
    getSystemHealth: jest.fn(() => ({
      status: 'healthy',
      services: [],
      timestamp: new Date(),
      uptime: 0,
    })),
    checkServiceHealth: jest.fn(() => Promise.resolve({
      name: 'test-service',
      status: 'healthy',
      lastCheck: new Date(),
    })),
  },
}));

// Increase timeout for integration tests
jest.setTimeout(15000);