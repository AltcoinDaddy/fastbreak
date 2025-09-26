import { Router } from 'express';
import { getWebSocketService } from '../services/websocket-service';
import { authenticateToken as authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// Get WebSocket connection status
router.get('/status', authMiddleware, (req, res) => {
  try {
    const webSocketService = getWebSocketService();
    const stats = webSocketService.getConnectionStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        healthy: webSocketService.isHealthy(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error getting WebSocket status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket status'
    });
  }
});

// Send test message (for development/testing)
router.post('/test-message', authMiddleware, (req, res) => {
  try {
    const { type, payload } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const webSocketService = getWebSocketService();
    
    // Send test message based on type
    switch (type) {
      case 'portfolio_update':
        webSocketService.sendPortfolioUpdate(userId, payload);
        break;
      case 'trade_notification':
        webSocketService.sendTradeNotification({ ...payload, userId });
        break;
      case 'market_alert':
        webSocketService.sendMarketAlert(payload, userId);
        break;
      case 'system_notification':
        webSocketService.sendSystemNotification(userId, payload);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid message type'
        });
    }

    res.json({
      success: true,
      message: 'Test message sent'
    });
  } catch (error) {
    logger.error('Error sending test message', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to send test message'
    });
  }
});

export default router;