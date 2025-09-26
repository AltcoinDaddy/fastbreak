import { Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import app from '../app';
import { FastBreakWebSocketServer } from '../websocket/websocket-server';
import { initializeWebSocketService, getWebSocketService } from '../services/websocket-service';
import { WebSocketMessage, PriceUpdate, TradeNotification } from '@fastbreak/types';

describe('WebSocket Integration Tests', () => {
  let server: Server;
  let wsServer: FastBreakWebSocketServer;
  let port: number;
  let testToken: string;

  beforeAll((done) => {
    // Create test JWT token
    testToken = jwt.sign(
      { userId: 'test-user-123', walletAddress: '0x123' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Start server
    server = app.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      
      // Initialize WebSocket server
      wsServer = new FastBreakWebSocketServer(server);
      initializeWebSocketService(wsServer);
      
      done();
    });
  });

  afterAll((done) => {
    wsServer.close();
    server.close(done);
  });

  describe('WebSocket Connection', () => {
    it('should accept connection with valid token', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
      });

      ws.on('close', () => {
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection without token', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      
      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });

      ws.on('error', () => {
        // Expected behavior
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=invalid-token`);
      
      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });

      ws.on('error', () => {
        // Expected behavior
        done();
      });
    });
  });

  describe('Message Handling', () => {
    let ws: WebSocket;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should receive connection status message on connect', (done) => {
      ws.on('message', (data) => {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        if (message.type === 'connection_status') {
          expect(message.payload.connected).toBe(true);
          expect(message.payload.lastHeartbeat).toBeDefined();
          done();
        }
      });
    });

    it('should handle heartbeat messages', (done) => {
      const heartbeatMessage: WebSocketMessage = {
        type: 'heartbeat',
        payload: { timestamp: new Date() },
        timestamp: new Date()
      };

      ws.on('message', (data) => {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        if (message.type === 'heartbeat') {
          expect(message.payload.timestamp).toBeDefined();
          done();
        }
      });

      // Send heartbeat after connection is established
      setTimeout(() => {
        ws.send(JSON.stringify(heartbeatMessage));
      }, 100);
    });
  });

  describe('WebSocket Service Broadcasting', () => {
    let ws: WebSocket;
    let webSocketService: any;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      ws.on('open', () => {
        webSocketService = getWebSocketService();
        done();
      });
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should broadcast price updates', (done) => {
      const priceUpdate: PriceUpdate = {
        momentId: 'moment-123',
        currentPrice: 100.50,
        previousPrice: 95.00,
        changePercent: 5.79,
        volume24h: 1500,
        timestamp: new Date()
      };

      ws.on('message', (data) => {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        if (message.type === 'price_update') {
          expect(message.payload.momentId).toBe(priceUpdate.momentId);
          expect(message.payload.currentPrice).toBe(priceUpdate.currentPrice);
          expect(message.payload.changePercent).toBe(priceUpdate.changePercent);
          done();
        }
      });

      // Wait for connection to be fully established
      setTimeout(() => {
        webSocketService.sendPriceUpdate(priceUpdate);
      }, 100);
    });

    it('should send trade notifications to specific user', (done) => {
      const tradeNotification: TradeNotification = {
        tradeId: 'trade-456',
        userId: 'test-user-123',
        type: 'buy',
        momentId: 'moment-789',
        playerName: 'LeBron James',
        price: 250.00,
        reasoning: 'Player scored 40+ points in last game',
        timestamp: new Date()
      };

      ws.on('message', (data) => {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        if (message.type === 'trade_notification') {
          expect(message.payload.tradeId).toBe(tradeNotification.tradeId);
          expect(message.payload.userId).toBe(tradeNotification.userId);
          expect(message.payload.type).toBe(tradeNotification.type);
          expect(message.payload.playerName).toBe(tradeNotification.playerName);
          done();
        }
      });

      // Wait for connection to be fully established
      setTimeout(() => {
        webSocketService.sendTradeNotification(tradeNotification);
      }, 100);
    });
  });

  describe('Connection Management', () => {
    it('should track connection count', () => {
      expect(wsServer.getConnectionCount()).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple connections from same user', (done) => {
      const ws1 = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      const ws2 = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      
      let connectionsOpened = 0;
      
      const handleOpen = () => {
        connectionsOpened++;
        if (connectionsOpened === 2) {
          expect(wsServer.getUserConnectionCount('test-user-123')).toBe(2);
          ws1.close();
          ws2.close();
          done();
        }
      };

      ws1.on('open', handleOpen);
      ws2.on('open', handleOpen);
      ws1.on('error', done);
      ws2.on('error', done);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON messages gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      
      ws.on('open', () => {
        // Send malformed JSON
        ws.send('invalid json');
        
        // Connection should remain open
        setTimeout(() => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', done);
    });

    it('should handle connection drops gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws?token=${testToken}`);
      
      ws.on('open', () => {
        const initialCount = wsServer.getConnectionCount();
        
        // Forcefully close connection
        ws.terminate();
        
        // Check that connection count decreases
        setTimeout(() => {
          expect(wsServer.getConnectionCount()).toBe(initialCount - 1);
          done();
        }, 100);
      });

      ws.on('error', () => {
        // Expected when terminating
      });
    });
  });
});