import { createServer } from 'http';
import app from './app';
import { logger } from './utils/logger';
import { healthCheckService } from './services/health-check';
import { FastBreakWebSocketServer } from './websocket/websocket-server';
import { initializeWebSocketService } from './services/websocket-service';

const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket server
const wsServer = new FastBreakWebSocketServer(server);
const webSocketService = initializeWebSocketService(wsServer);

// Start server
server.listen(PORT, () => {
  logger.info(`API Gateway started on port ${PORT}`);
  logger.info(`WebSocket server available at ws://localhost:${PORT}/ws`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start health check monitoring
  healthCheckService.startMonitoring();
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Shutting down gracefully');
  
  // Stop health check monitoring
  healthCheckService.stopMonitoring();
  
  // Close WebSocket server
  wsServer.close();
  
  // Close HTTP server
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default app;