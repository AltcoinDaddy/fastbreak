import { Express } from 'express';
import { userRoutes } from './user-routes';
import { aiRoutes } from './ai-routes';
import { marketplaceRoutes } from './marketplace-routes';
import { tradingRoutes } from './trading-routes';
import { notificationRoutes } from './notification-routes';
import { strategyRoutes } from './strategy-routes';
import { portfolioRoutes } from './portfolio-routes';
import { leaderboardRoutes } from './leaderboard-routes';
import { systemRoutes } from './system-routes';
import websocketRoutes from './websocket';
import { notFoundHandler } from '../middleware/error-handler';

export function setupRoutes(app: Express): void {
  // API version prefix
  const apiPrefix = '/api/v1';

  // System routes (health, status, etc.)
  app.use('/api', systemRoutes);

  // User management routes
  app.use(`${apiPrefix}/users`, userRoutes);

  // AI scouting routes
  app.use(`${apiPrefix}/ai`, aiRoutes);

  // Marketplace monitoring routes
  app.use(`${apiPrefix}/marketplace`, marketplaceRoutes);

  // Trading service routes
  app.use(`${apiPrefix}/trades`, tradingRoutes);

  // Notification service routes
  app.use(`${apiPrefix}/notifications`, notificationRoutes);

  // Strategy configuration routes
  app.use(`${apiPrefix}/strategies`, strategyRoutes);

  // Portfolio management routes
  app.use(`${apiPrefix}/portfolio`, portfolioRoutes);

  // Leaderboard routes
  app.use(`${apiPrefix}/leaderboard`, leaderboardRoutes);

  // WebSocket management routes
  app.use(`${apiPrefix}/websocket`, websocketRoutes);

  // Handle 404 for all other routes
  app.use('*', notFoundHandler);
}