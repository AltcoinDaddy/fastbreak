import axios from 'axios';
import jwt from 'jsonwebtoken';

// Script to send test data through the WebSocket service
async function sendTestData() {
  console.log('📤 Sending test data to WebSocket service...\n');

  // Create test JWT token
  const testToken = jwt.sign(
    { userId: 'demo-user-123', walletAddress: '0x123456789abcdef0' },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1h' }
  );

  const apiUrl = 'http://localhost:3001/api/v1';

  try {
    // Test portfolio update
    console.log('💼 Sending portfolio update...');
    await axios.post(`${apiUrl}/websocket/test-message`, {
      type: 'portfolio_update',
      payload: {
        userId: 'demo-user-123',
        totalValue: 2500.00,
        totalChange: 250.00,
        changePercent: 11.11,
        moments: [
          {
            momentId: 'moment-lebron-dunk-123',
            playerName: 'LeBron James',
            currentValue: 800.00,
            purchasePrice: 700.00,
            profitLoss: 100.00,
            profitLossPercent: 14.29
          },
          {
            momentId: 'moment-curry-3pt-456',
            playerName: 'Stephen Curry',
            currentValue: 600.00,
            purchasePrice: 550.00,
            profitLoss: 50.00,
            profitLossPercent: 9.09
          }
        ],
        lastUpdated: new Date()
      }
    }, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    console.log('✅ Portfolio update sent');

    // Test trade notification
    console.log('🎯 Sending trade notification...');
    await axios.post(`${apiUrl}/websocket/test-message`, {
      type: 'trade_notification',
      payload: {
        tradeId: 'trade-789',
        type: 'buy',
        momentId: 'moment-giannis-block-789',
        playerName: 'Giannis Antetokounmpo',
        price: 450.00,
        reasoning: 'Player recorded triple-double with 5 blocks - rare defensive performance',
        timestamp: new Date()
      }
    }, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    console.log('✅ Trade notification sent');

    // Test market alert
    console.log('🚨 Sending market alert...');
    await axios.post(`${apiUrl}/websocket/test-message`, {
      type: 'market_alert',
      payload: {
        type: 'price_spike',
        momentId: 'moment-luka-buzzer-999',
        playerName: 'Luka Dončić',
        message: 'Price spiked 25% after game-winning buzzer beater!',
        priority: 'high',
        timestamp: new Date()
      }
    }, {
      headers: { Authorization: `Bearer ${testToken}` }
    });
    console.log('✅ Market alert sent');

    console.log('\n🎉 All test messages sent successfully!');

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('❌ API Error:', error.response?.status, error.response?.data);
    } else {
      console.error('❌ Error:', error);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  sendTestData().catch(console.error);
}

export { sendTestData };