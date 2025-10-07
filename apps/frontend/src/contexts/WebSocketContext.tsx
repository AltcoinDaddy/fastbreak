'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { 
  PriceUpdate, 
  PortfolioUpdate, 
  TradeNotification, 
  TradeStatus, 
  MarketAlert 
} from '@fastbreak/types';

interface WebSocketContextType {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempts: number;
  lastHeartbeat: Date | null;
  
  // Real-time data
  priceUpdates: Map<string, PriceUpdate>;
  portfolioUpdate: PortfolioUpdate | null;
  tradeNotifications: TradeNotification[];
  marketAlerts: MarketAlert[];
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  clearNotifications: () => void;
  clearAlerts: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  apiUrl?: string;
  token?: string;
}

export function WebSocketProvider({ 
  children, 
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'ws://localhost:3001',
  token 
}: WebSocketProviderProps) {
  const [priceUpdates, setPriceUpdates] = useState<Map<string, PriceUpdate>>(new Map());
  const [portfolioUpdate, setPortfolioUpdate] = useState<PortfolioUpdate | null>(null);
  const [tradeNotifications, setTradeNotifications] = useState<TradeNotification[]>([]);
  const [marketAlerts, setMarketAlerts] = useState<MarketAlert[]>([]);

  // Convert HTTP URL to WebSocket URL
  const wsUrl = apiUrl.replace(/^https?:/, 'ws:').replace(/^http:/, 'ws:') + '/ws';

  const webSocket = useWebSocket({
    url: wsUrl,
    token: token || '',
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    heartbeatInterval: 30000
  });

  // Handle price updates
  useEffect(() => {
    return webSocket.subscribe('price_update', (update: PriceUpdate) => {
      setPriceUpdates(prev => {
        const newMap = new Map(prev);
        newMap.set(update.momentId, update);
        return newMap;
      });
    });
  }, [webSocket]);

  // Handle portfolio updates
  useEffect(() => {
    return webSocket.subscribe('portfolio_update', (update: PortfolioUpdate) => {
      setPortfolioUpdate(update);
    });
  }, [webSocket]);

  // Handle trade notifications
  useEffect(() => {
    return webSocket.subscribe('trade_notification', (notification: TradeNotification) => {
      setTradeNotifications(prev => [notification, ...prev].slice(0, 50)); // Keep last 50
    });
  }, [webSocket]);

  // Handle trade status updates
  useEffect(() => {
    return webSocket.subscribe('trade_status', (status: TradeStatus) => {
      // Update existing trade notifications with status
      setTradeNotifications(prev => 
        prev.map(notification => 
          notification.tradeId === status.tradeId 
            ? { ...notification, status: status.status }
            : notification
        )
      );
    });
  }, [webSocket]);

  // Handle market alerts
  useEffect(() => {
    return webSocket.subscribe('market_alert', (alert: MarketAlert) => {
      setMarketAlerts(prev => [alert, ...prev].slice(0, 20)); // Keep last 20
    });
  }, [webSocket]);

  // Handle system notifications
  useEffect(() => {
    return webSocket.subscribe('system_notification', (notification: any) => {
      // You could show these as toast notifications or add to a notifications list
      console.log('System notification:', notification);
    });
  }, [webSocket]);

  const clearNotifications = () => {
    setTradeNotifications([]);
  };

  const clearAlerts = () => {
    setMarketAlerts([]);
  };

  const contextValue: WebSocketContextType = {
    connected: webSocket.state.connected,
    connecting: webSocket.state.connecting,
    error: webSocket.state.error,
    reconnectAttempts: webSocket.state.reconnectAttempts,
    lastHeartbeat: webSocket.state.lastHeartbeat,
    
    priceUpdates,
    portfolioUpdate,
    tradeNotifications,
    marketAlerts,
    
    connect: webSocket.connect,
    disconnect: webSocket.disconnect,
    clearNotifications,
    clearAlerts
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

// Convenience hooks for specific data
export function usePriceUpdate(momentId: string): PriceUpdate | null {
  const { priceUpdates } = useWebSocketContext();
  return priceUpdates.get(momentId) || null;
}

export function usePortfolioValue(): PortfolioUpdate | null {
  const { portfolioUpdate } = useWebSocketContext();
  return portfolioUpdate;
}

export function useRecentTrades(limit: number = 10): TradeNotification[] {
  const { tradeNotifications } = useWebSocketContext();
  return tradeNotifications.slice(0, limit);
}

export function useMarketAlerts(priority?: 'low' | 'medium' | 'high'): MarketAlert[] {
  const { marketAlerts } = useWebSocketContext();
  return priority 
    ? marketAlerts.filter(alert => alert.priority === priority)
    : marketAlerts;
}