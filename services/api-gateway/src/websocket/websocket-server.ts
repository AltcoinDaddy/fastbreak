import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { 
  WebSocketMessage, 
  WebSocketMessageType,
  ConnectionStatus 
} from '@fastbreak/types';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  connectionId: string;
  isAlive: boolean;
  lastHeartbeat: Date;
}

export class FastBreakWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  private verifyClient(info: any): boolean {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
      info.req.userId = decoded.userId;
      return true;
    } catch (error) {
      logger.warn('WebSocket connection rejected: Invalid token', { error: error.message });
      return false;
    }
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: any) => {
      const connectionId = uuidv4();
      const userId = req.userId;

      // Initialize connection properties
      ws.connectionId = connectionId;
      ws.userId = userId;
      ws.isAlive = true;
      ws.lastHeartbeat = new Date();

      // Store connection
      this.clients.set(connectionId, ws);
      
      // Track user connections
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(connectionId);

      logger.info('WebSocket client connected', { 
        connectionId, 
        userId,
        totalConnections: this.clients.size 
      });

      // Send connection confirmation immediately
      setTimeout(() => {
        this.sendToConnection(connectionId, {
          type: 'connection_status',
          payload: { connected: true, lastHeartbeat: new Date() } as ConnectionStatus,
          timestamp: new Date()
        });
      }, 10);

      // Handle messages
      ws.on('message', (data: Buffer) => {
        this.handleMessage(connectionId, data);
      });

      // Handle pong responses
      ws.on('pong', () => {
        ws.isAlive = true;
        ws.lastHeartbeat = new Date();
      });

      // Handle connection close
      ws.on('close', () => {
        this.handleDisconnection(connectionId, userId);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { connectionId, userId, error: error.message });
        this.handleDisconnection(connectionId, userId);
      });
    });

    logger.info('WebSocket server initialized');
  }

  private handleMessage(connectionId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      const client = this.clients.get(connectionId);

      if (!client) {
        logger.warn('Message from unknown connection', { connectionId });
        return;
      }

      logger.debug('WebSocket message received', { 
        connectionId, 
        userId: client.userId, 
        type: message.type 
      });

      // Handle different message types
      switch (message.type) {
        case 'heartbeat':
          client.isAlive = true;
          client.lastHeartbeat = new Date();
          this.sendToConnection(connectionId, {
            type: 'heartbeat',
            payload: { timestamp: new Date() },
            timestamp: new Date()
          });
          break;

        default:
          logger.warn('Unknown message type', { type: message.type, connectionId });
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', { 
        connectionId, 
        error: error.message 
      });
    }
  }

  private handleDisconnection(connectionId: string, userId: string): void {
    // Remove from clients
    this.clients.delete(connectionId);

    // Remove from user connections
    const userConnections = this.userConnections.get(userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(userId);
      }
    }

    logger.info('WebSocket client disconnected', { 
      connectionId, 
      userId,
      totalConnections: this.clients.size 
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 30000; // 30 seconds

      this.clients.forEach((client, connectionId) => {
        if (!client.isAlive || (now.getTime() - client.lastHeartbeat.getTime()) > staleThreshold) {
          logger.info('Terminating stale WebSocket connection', { connectionId, userId: client.userId });
          client.terminate();
          return;
        }

        client.isAlive = false;
        client.ping();
      });
    }, 15000); // Check every 15 seconds
  }

  // Public methods for sending messages
  public sendToUser(userId: string, message: WebSocketMessage): void {
    const connections = this.userConnections.get(userId);
    if (!connections || connections.size === 0) {
      logger.debug('No active connections for user', { userId });
      return;
    }

    connections.forEach(connectionId => {
      this.sendToConnection(connectionId, message);
    });
  }

  public sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const client = this.clients.get(connectionId);
    if (!client || client.readyState !== WebSocket.OPEN) {
      logger.debug('Cannot send to connection', { connectionId, readyState: client?.readyState });
      return;
    }

    try {
      client.send(JSON.stringify(message));
      logger.debug('Message sent to connection', { connectionId, type: message.type });
    } catch (error) {
      logger.error('Error sending WebSocket message', { 
        connectionId, 
        error: error.message 
      });
    }
  }

  public broadcast(message: WebSocketMessage, excludeUserId?: string): void {
    this.clients.forEach((client, connectionId) => {
      if (excludeUserId && client.userId === excludeUserId) {
        return;
      }
      this.sendToConnection(connectionId, message);
    });
  }

  public getConnectionCount(): number {
    return this.clients.size;
  }

  public getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.clients.forEach((client) => {
      client.close();
    });

    this.wss.close();
    logger.info('WebSocket server closed');
  }
}