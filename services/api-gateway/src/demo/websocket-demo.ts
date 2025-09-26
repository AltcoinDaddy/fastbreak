import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { WebSocketMessage, PriceUpdate, TradeNotification } from '@fastbreak/types';

// Demo script to test WebSocket functionality
async function runWebSocketDemo() {
  console.log('🚀 Starting WebSocket Demo...\n');

  // Create test JWT token
  const testToken = jwt.sign(
    { userId: 'demo-user-123', walletAddress: '0x123456789abcdef0' },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1h' }
  );

  const wsUrl = `ws://localhost:3001/ws?token=${testToken}`;
  console.log(`📡 Connecting to: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    
    // Send a heartbeat message
    const heartbeatMessage: WebSocketMessage = {
      type: 'heartbeat',
      payload: { timestamp: new Date() },
      timestamp: new Date()
    };
    
    console.log('💓 Sending heartbeat...');
    ws.send(JSON.stringify(heartbeatMessage));
  });

  ws.on('message', (data) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'connection_status':
          console.log('🔗 Connection Status:', message.payload);
          break;
          
        case 'heartbeat':
          console.log('💓 Heartbeat response received');
          break;
          
        case 'price_update':
          const priceUpdate = message.payload as PriceUpdate;
          console.log(`📈 Price Update: ${priceUpdate.momentId} - $${priceUpdate.currentPrice} (${priceUpdate.changePercent > 0 ? '+' : ''}${priceUpdate.changePercent}%)`);
          break;
          
        case 'trade_notification':
          const trade = message.payload as TradeNotification;
          console.log(`🎯 Trade: ${trade.type.toUpperCase()} ${trade.playerName} for $${trade.price}`);
          console.log(`   Reasoning: ${trade.reasoning}`);
          break;
          
        case 'portfolio_update':
          console.log('💼 Portfolio Update:', message.payload);
          break;
          
        case 'market_alert':
          console.log('🚨 Market Alert:', message.payload);
          break;
          
        default:
          console.log('📨 Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket disconnected: ${code} - ${reason}`);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  // Keep the demo running for 30 seconds
  setTimeout(() => {
    console.log('\n⏰ Demo timeout reached, closing connection...');
    ws.close();
    process.exit(0);
  }, 30000);
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runWebSocketDemo().catch(console.error);
}

export { runWebSocketDemo };