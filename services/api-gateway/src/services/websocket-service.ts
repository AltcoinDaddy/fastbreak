import { FastBreakWebSocketServer } from '../websocket/websocket-server';
import { logger } from '../utils/logger';
import {
  WebSocketMessage,
  PriceUpdate,
  PortfolioUpdate,
  TradeNotification,
  TradeStatus,
  MarketAlert
} from '@fastbreak/types';

export class WebSocketService {
  private wsServer: FastBreakWebSocketServer;

  constructor(wsServer: FastBreakWebSocketServer) {
    this.wsServer = wsServer;
  }

  // Price update methods
  public sendPriceUpdate(priceUpdate: PriceUpdate): void {
    const message: WebSocketMessage = {
      type: 'price_update',
      payload: priceUpdate,
      timestamp: new Date()
    };

    this.wsServer.broadcast(message);
    logger.debug('Price update broadcasted', { momentId: priceUpdate.momentId });
  }

  public sendPriceUpdates(priceUpdates: PriceUpdate[]): void {
    priceUpdates.forEach(update => this.sendPriceUpdate(update));
  }

  // Portfolio update methods
  public sendPortfolioUpdate(userId: string, portfolioUpdate: PortfolioUpdate): void {
    const message: WebSocketMessage = {
      type: 'portfolio_update',
      payload: portfolioUpdate,
      timestamp: new Date(),
      userId
    };

    this.wsServer.sendToUser(userId, message);
    logger.debug('Portfolio update sent', { userId, totalValue: portfolioUpdate.totalValue });
  }

  // Trade notification methods
  public sendTradeNotification(tradeNotification: TradeNotification): void {
    const message: WebSocketMessage = {
      type: 'trade_notification',
      payload: tradeNotification,
      timestamp: new Date(),
      userId: tradeNotification.userId
    };

    this.wsServer.sendToUser(tradeNotification.userId, message);
    logger.info('Trade notification sent', { 
      userId: tradeNotification.userId, 
      tradeId: tradeNotification.tradeId,
      type: tradeNotification.type
    });
  }

  // Trade status methods
  public sendTradeStatus(userId: string, tradeStatus: TradeStatus): void {
    const message: WebSocketMessage = {
      type: 'trade_status',
      payload: tradeStatus,
      timestamp: new Date(),
      userId
    };

    this.wsServer.sendToUser(userId, message);
    logger.debug('Trade status sent', { 
      userId, 
      tradeId: tradeStatus.tradeId, 
      status: tradeStatus.status 
    });
  }

  // Market alert methods
  public sendMarketAlert(marketAlert: MarketAlert, userId?: string): void {
    const message: WebSocketMessage = {
      type: 'market_alert',
      payload: marketAlert,
      timestamp: new Date(),
      userId
    };

    if (userId) {
      this.wsServer.sendToUser(userId, message);
      logger.debug('Market alert sent to user', { userId, type: marketAlert.type });
    } else {
      this.wsServer.broadcast(message);
      logger.debug('Market alert broadcasted', { type: marketAlert.type });
    }
  }

  // System notification methods
  public sendSystemNotification(userId: string, notification: any): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      payload: notification,
      timestamp: new Date(),
      userId
    };

    this.wsServer.sendToUser(userId, message);
    logger.debug('System notification sent', { userId });
  }

  public broadcastSystemNotification(notification: any): void {
    const message: WebSocketMessage = {
      type: 'system_notification',
      payload: notification,
      timestamp: new Date()
    };

    this.wsServer.broadcast(message);
    logger.info('System notification broadcasted');
  }

  // Connection management
  public getConnectionStats(): { totalConnections: number; userConnections: Record<string, number> } {
    return {
      totalConnections: this.wsServer.getConnectionCount(),
      userConnections: {} // Could be expanded to show per-user connection counts
    };
  }

  // Health check
  public isHealthy(): boolean {
    return this.wsServer.getConnectionCount() >= 0; // Basic health check
  }
}

// Singleton instance
let webSocketServiceInstance: WebSocketService | null = null;

export function initializeWebSocketService(wsServer: FastBreakWebSocketServer): WebSocketService {
  webSocketServiceInstance = new WebSocketService(wsServer);
  return webSocketServiceInstance;
}

export function getWebSocketService(): WebSocketService {
  if (!webSocketServiceInstance) {
    throw new Error('WebSocket service not initialized. Call initializeWebSocketService first.');
  }
  return webSocketServiceInstance;
}