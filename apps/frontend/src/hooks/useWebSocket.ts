import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  WebSocketMessage, 
  WebSocketMessageType,
  ConnectionStatus,
  PriceUpdate,
  PortfolioUpdate,
  TradeNotification,
  TradeStatus,
  MarketAlert
} from '@fastbreak/types';

interface WebSocketConfig {
  url: string;
  token: string;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempts: number;
  lastHeartbeat: Date | null;
}

interface WebSocketHookReturn {
  state: WebSocketState;
  sendMessage: (message: WebSocketMessage) => void;
  connect: () => void;
  disconnect: () => void;
  subscribe: (type: WebSocketMessageType, handler: (payload: any) => void) => () => void;
}

export function useWebSocket(config: WebSocketConfig): WebSocketHookReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageHandlersRef = useRef<Map<WebSocketMessageType, Set<(payload: any) => void>>>(new Map());

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0,
    lastHeartbeat: null
  });

  const {
    url,
    token,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    heartbeatInterval = 30000
  } = config;

  // Clear timeouts
  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const heartbeatMessage: WebSocketMessage = {
          type: 'heartbeat',
          payload: { timestamp: new Date() },
          timestamp: new Date()
        };
        wsRef.current.send(JSON.stringify(heartbeatMessage));
      }
    }, heartbeatInterval);
  }, [heartbeatInterval]);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Update last heartbeat for heartbeat messages
      if (message.type === 'heartbeat') {
        setState(prev => ({ ...prev, lastHeartbeat: new Date() }));
        return;
      }

      // Handle connection status messages
      if (message.type === 'connection_status') {
        const status = message.payload as ConnectionStatus;
        setState(prev => ({ 
          ...prev, 
          connected: status.connected,
          lastHeartbeat: status.lastHeartbeat ? new Date(status.lastHeartbeat) : null
        }));
        return;
      }

      // Call registered handlers
      const handlers = messageHandlersRef.current.get(message.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message.payload);
          } catch (error) {
            console.error('Error in WebSocket message handler:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || state.connecting) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null,
          reconnectAttempts: 0
        }));
        startHeartbeat();
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setState(prev => ({
          ...prev,
          connected: false,
          connecting: false
        }));
        clearTimeouts();

        // Attempt reconnection if not a manual close
        if (event.code !== 1000 && state.reconnectAttempts < reconnectAttempts) {
          const delay = reconnectInterval * Math.pow(2, state.reconnectAttempts); // Exponential backoff
          console.log(`Attempting to reconnect in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setState(prev => ({ ...prev, reconnectAttempts: prev.reconnectAttempts + 1 }));
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          error: 'WebSocket connection error',
          connecting: false
        }));
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
        connecting: false
      }));
    }
  }, [url, token, handleMessage, startHeartbeat, reconnectAttempts, reconnectInterval, state.connecting, state.reconnectAttempts]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    clearTimeouts();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setState({
      connected: false,
      connecting: false,
      error: null,
      reconnectAttempts: 0,
      lastHeartbeat: null
    });
  }, [clearTimeouts]);

  // Send message
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }, []);

  // Subscribe to message type
  const subscribe = useCallback((type: WebSocketMessageType, handler: (payload: any) => void) => {
    if (!messageHandlersRef.current.has(type)) {
      messageHandlersRef.current.set(type, new Set());
    }
    messageHandlersRef.current.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = messageHandlersRef.current.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          messageHandlersRef.current.delete(type);
        }
      }
    };
  }, []);

  // Auto-connect on mount and token change
  useEffect(() => {
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [token]); // Only reconnect when token changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    sendMessage,
    connect,
    disconnect,
    subscribe
  };
}

// Typed hooks for specific message types
export function usePriceUpdates(onPriceUpdate: (update: PriceUpdate) => void, webSocket: WebSocketHookReturn) {
  useEffect(() => {
    return webSocket.subscribe('price_update', onPriceUpdate);
  }, [onPriceUpdate, webSocket]);
}

export function usePortfolioUpdates(onPortfolioUpdate: (update: PortfolioUpdate) => void, webSocket: WebSocketHookReturn) {
  useEffect(() => {
    return webSocket.subscribe('portfolio_update', onPortfolioUpdate);
  }, [onPortfolioUpdate, webSocket]);
}

export function useTradeNotifications(onTradeNotification: (notification: TradeNotification) => void, webSocket: WebSocketHookReturn) {
  useEffect(() => {
    return webSocket.subscribe('trade_notification', onTradeNotification);
  }, [onTradeNotification, webSocket]);
}

export function useTradeStatus(onTradeStatus: (status: TradeStatus) => void, webSocket: WebSocketHookReturn) {
  useEffect(() => {
    return webSocket.subscribe('trade_status', onTradeStatus);
  }, [onTradeStatus, webSocket]);
}

export function useMarketAlerts(onMarketAlert: (alert: MarketAlert) => void, webSocket: WebSocketHookReturn) {
  useEffect(() => {
    return webSocket.subscribe('market_alert', onMarketAlert);
  }, [onMarketAlert, webSocket]);
}