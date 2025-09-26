import { Router } from 'express';
import { NotificationService } from '../services/notification-service';
import { PushService } from '../services/push-service';
import { validateNotificationRequest, validatePushSubscription } from '../middleware/validation';
import { authenticateUser } from '../middleware/auth';

export function createNotificationRoutes(
  notificationService: NotificationService,
  pushService: PushService
): Router {
  const router = Router();

  /**
   * Send a notification
   * POST /api/notifications
   */
  router.post('/', authenticateUser, validateNotificationRequest, async (req, res) => {
    try {
      const notificationId = await notificationService.sendNotification(req.body);
      
      res.status(201).json({
        success: true,
        data: { notificationId },
        message: 'Notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send notification'
      });
    }
  });

  /**
   * Send purchase notification
   * POST /api/notifications/purchase
   */
  router.post('/purchase', authenticateUser, async (req, res) => {
    try {
      const { userId, momentDetails, reasoning, strategyUsed } = req.body;
      
      const notificationId = await notificationService.sendPurchaseNotification(
        userId,
        momentDetails,
        reasoning,
        strategyUsed
      );
      
      res.status(201).json({
        success: true,
        data: { notificationId },
        message: 'Purchase notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send purchase notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send purchase notification'
      });
    }
  });

  /**
   * Send rare moment notification
   * POST /api/notifications/rare-moment
   */
  router.post('/rare-moment', authenticateUser, async (req, res) => {
    try {
      const { userId, momentDetails } = req.body;
      
      const notificationId = await notificationService.sendRareMomentNotification(
        userId,
        momentDetails
      );
      
      res.status(201).json({
        success: true,
        data: { notificationId },
        message: 'Rare moment notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send rare moment notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send rare moment notification'
      });
    }
  });

  /**
   * Send budget warning notification
   * POST /api/notifications/budget-warning
   */
  router.post('/budget-warning', authenticateUser, async (req, res) => {
    try {
      const { userId, budgetInfo } = req.body;
      
      const notificationId = await notificationService.sendBudgetWarningNotification(
        userId,
        budgetInfo
      );
      
      res.status(201).json({
        success: true,
        data: { notificationId },
        message: 'Budget warning notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send budget warning notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send budget warning notification'
      });
    }
  });

  /**
   * Send system error notification
   * POST /api/notifications/system-error
   */
  router.post('/system-error', authenticateUser, async (req, res) => {
    try {
      const { userId, error } = req.body;
      
      const notificationId = await notificationService.sendSystemErrorNotification(
        userId,
        error
      );
      
      res.status(201).json({
        success: true,
        data: { notificationId },
        message: 'System error notification sent successfully'
      });
    } catch (error) {
      console.error('Failed to send system error notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send system error notification'
      });
    }
  });

  /**
   * Get notification history for authenticated user
   * GET /api/notifications/history
   */
  router.get('/history', authenticateUser, async (req, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const result = await notificationService.getNotificationHistory(userId, limit, offset);
      
      res.json({
        success: true,
        data: result,
        message: 'Notification history retrieved successfully'
      });
    } catch (error) {
      console.error('Failed to get notification history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve notification history'
      });
    }
  });

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  router.get('/unread-count', authenticateUser, async (req, res) => {
    try {
      const userId = req.user.id;
      const count = await notificationService.getUnreadCount(userId);
      
      res.json({
        success: true,
        data: { count },
        message: 'Unread count retrieved successfully'
      });
    } catch (error) {
      console.error('Failed to get unread count:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve unread count'
      });
    }
  });

  /**
   * Mark notification as read
   * PUT /api/notifications/:id/read
   */
  router.put('/:id/read', authenticateUser, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user.id;
      
      await notificationService.markAsRead(notificationId, userId);
      
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read'
      });
    }
  });

  /**
   * Mark all notifications as read
   * PUT /api/notifications/read-all
   */
  router.put('/read-all', authenticateUser, async (req, res) => {
    try {
      const userId = req.user.id;
      
      await notificationService.markAllAsRead(userId);
      
      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read'
      });
    }
  });

  /**
   * Register push notification subscription
   * POST /api/notifications/push/subscribe
   */
  router.post('/push/subscribe', authenticateUser, validatePushSubscription, async (req, res) => {
    try {
      const userId = req.user.id;
      const { subscription } = req.body;
      const userAgent = req.get('User-Agent');
      
      await pushService.registerPushSubscription(userId, subscription, userAgent);
      
      res.status(201).json({
        success: true,
        message: 'Push subscription registered successfully'
      });
    } catch (error) {
      console.error('Failed to register push subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to register push subscription'
      });
    }
  });

  /**
   * Unregister push notification subscription
   * POST /api/notifications/push/unsubscribe
   */
  router.post('/push/unsubscribe', authenticateUser, async (req, res) => {
    try {
      const userId = req.user.id;
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({
          success: false,
          error: 'Endpoint is required'
        });
      }
      
      await pushService.unregisterPushSubscription(userId, endpoint);
      
      res.json({
        success: true,
        message: 'Push subscription unregistered successfully'
      });
    } catch (error) {
      console.error('Failed to unregister push subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to unregister push subscription'
      });
    }
  });

  /**
   * Test push notification
   * POST /api/notifications/push/test
   */
  router.post('/push/test', authenticateUser, async (req, res) => {
    try {
      const userId = req.user.id;
      
      const success = await pushService.testPushService(userId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Test push notification sent successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send test push notification'
        });
      }
    } catch (error) {
      console.error('Failed to test push notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test push notification'
      });
    }
  });

  return router;
}