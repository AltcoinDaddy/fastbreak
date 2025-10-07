import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { WebSocketProvider, useWebSocketContext } from '../contexts/WebSocketContext';
import { RealTimePortfolio } from '../components/portfolio/RealTimePortfolio';
import { RealTimeNotifications } from '../components/notifications/RealTimeNotifications';
import { WebSocketStatus } from '../components/status/WebSocketStatus';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
      
      // Send connection status message
      if (this.onmessage) {
        const message = {
          type: 'connection_status',
          payload: { connected: true, lastHeartbeat: new Date() },
          timestamp: new Date()
        };
        this.onmessage(new MessageEvent('message', { 
          data: JSON.stringify(message) 
        }));
      }
    }, 10);
  }

  send(data: string) {
    // Mock send - could be used to simulate server responses
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code: code || 1000, reason }));
    }
  }

  ping() {
    // Mock ping
  }

  terminate() {
    this.close(1006, 'Connection terminated');
  }
}

// Mock the WebSocket constructor
(global as any).WebSocket = MockWebSocket;

// Test component that uses WebSocket context
function TestComponent() {
  const { connected, connecting, error } = useWebSocketContext();
  
  return (
    <div>
      <div data-testid="connection-status">
        {connected ? 'Connected' : connecting ? 'Connecting' : 'Disconnected'}
      </div>
      {error && <div data-testid="error">{error}</div>}
    </div>
  );
}

describe('WebSocket Integration', () => {
  const mockToken = 'mock-jwt-token';
  const mockApiUrl = 'ws://localhost:3001';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocketProvider', () => {
    it('should provide WebSocket context to children', async () => {
      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <TestComponent />
        </WebSocketProvider>
      );

      // Initially connecting
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Connecting');

      // Should connect after a short delay
      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
      });
    });

    it('should handle connection errors', async () => {
      // Mock WebSocket that fails to connect
      const FailingWebSocket = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            if (this.onerror) {
              this.onerror(new Event('error'));
            }
          }, 10);
        }
      };

      (global as any).WebSocket = FailingWebSocket;

      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <TestComponent />
        </WebSocketProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('Disconnected');
      });
    });
  });

  describe('RealTimePortfolio', () => {
    it('should show loading state when no portfolio data', () => {
      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <RealTimePortfolio />
        </WebSocketProvider>
      );

      expect(screen.getByText('Portfolio Overview')).toBeInTheDocument();
      // Should show loading skeleton
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    it('should display portfolio data when received', async () => {
      const MockWebSocketWithData = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            
            // Send portfolio update
            if (this.onmessage) {
              const portfolioUpdate = {
                type: 'portfolio_update',
                payload: {
                  userId: 'test-user',
                  totalValue: 1500.00,
                  totalChange: 150.00,
                  changePercent: 11.11,
                  moments: [
                    {
                      momentId: 'moment-1',
                      playerName: 'LeBron James',
                      currentValue: 500.00,
                      purchasePrice: 450.00,
                      profitLoss: 50.00,
                      profitLossPercent: 11.11
                    }
                  ],
                  lastUpdated: new Date()
                },
                timestamp: new Date()
              };
              
              this.onmessage(new MessageEvent('message', { 
                data: JSON.stringify(portfolioUpdate) 
              }));
            }
          }, 10);
        }
      };

      (global as any).WebSocket = MockWebSocketWithData;

      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <RealTimePortfolio />
        </WebSocketProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('$1,500.00')).toBeInTheDocument();
        expect(screen.getByText('LeBron James')).toBeInTheDocument();
      });
    });
  });

  describe('RealTimeNotifications', () => {
    it('should display empty state when no notifications', () => {
      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <RealTimeNotifications />
        </WebSocketProvider>
      );

      expect(screen.getByText('Recent Trades (0)')).toBeInTheDocument();
      expect(screen.getByText('No recent trades')).toBeInTheDocument();
    });

    it('should display trade notifications when received', async () => {
      const MockWebSocketWithTrade = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            
            // Send trade notification
            if (this.onmessage) {
              const tradeNotification = {
                type: 'trade_notification',
                payload: {
                  tradeId: 'trade-123',
                  userId: 'test-user',
                  type: 'buy',
                  momentId: 'moment-456',
                  playerName: 'Stephen Curry',
                  price: 300.00,
                  reasoning: 'Player hit 8 three-pointers in last game',
                  timestamp: new Date()
                },
                timestamp: new Date()
              };
              
              this.onmessage(new MessageEvent('message', { 
                data: JSON.stringify(tradeNotification) 
              }));
            }
          }, 10);
        }
      };

      (global as any).WebSocket = MockWebSocketWithTrade;

      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <RealTimeNotifications />
        </WebSocketProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Recent Trades (1)')).toBeInTheDocument();
        expect(screen.getByText('Stephen Curry')).toBeInTheDocument();
        expect(screen.getByText('Player hit 8 three-pointers in last game')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocketStatus', () => {
    it('should show connection status', async () => {
      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <WebSocketStatus showDetails={true} />
        </WebSocketProvider>
      );

      // Initially connecting
      expect(screen.getByText('Connecting...')).toBeInTheDocument();

      // Should show connected after connection
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('should show compact status indicator', async () => {
      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <WebSocketStatus showDetails={false} />
        </WebSocketProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Message Handling', () => {
    it('should handle price updates', async () => {
      const MockWebSocketWithPriceUpdate = class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            
            // Send price update
            if (this.onmessage) {
              const priceUpdate = {
                type: 'price_update',
                payload: {
                  momentId: 'moment-123',
                  currentPrice: 105.50,
                  previousPrice: 100.00,
                  changePercent: 5.5,
                  volume24h: 1200,
                  timestamp: new Date()
                },
                timestamp: new Date()
              };
              
              this.onmessage(new MessageEvent('message', { 
                data: JSON.stringify(priceUpdate) 
              }));
            }
          }, 10);
        }
      };

      (global as any).WebSocket = MockWebSocketWithPriceUpdate;

      function PriceTestComponent() {
        const { priceUpdates } = useWebSocketContext();
        const priceUpdate = priceUpdates.get('moment-123');
        
        return (
          <div>
            {priceUpdate && (
              <div data-testid="price-update">
                Price: ${priceUpdate.currentPrice}
              </div>
            )}
          </div>
        );
      }

      render(
        <WebSocketProvider token={mockToken} apiUrl={mockApiUrl}>
          <PriceTestComponent />
        </WebSocketProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('price-update')).toHaveTextContent('Price: $105.5');
      });
    });
  });
});