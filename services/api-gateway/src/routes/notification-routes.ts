import { Router } from 'express';
import { serviceProxy } from '../utils/service-proxy';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

const router = Router();

// Get user notifications (authenticated)
router.get('/', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 20, offset = 0, unreadOnly = false, type } = req.query;
  
  const response = await serviceProxy.get('notification-service', '/notifications', {
    params: {
      userId: req.user!.id,
      limit,
      offset,
      unreadOnly,
      type,
    },
  });
  
  res.json(response);
}));

// Mark notification as read (authenticated)
router.put('/:notificationId/read', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { notificationId } = req.params;
  
  const response = await serviceProxy.put('notification-service', `/notifications/${notificationId}/read`, {
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Mark all notifications as read (authenticated)
router.put('/read-all', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.put('notification-service', '/notifications/read-all', {
    userId: req.user!.id,
  });
  
  res.json(response);
}));

// Delete notification (authenticated)
router.delete('/:notificationId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { notificationId } = req.params;
  
  const response = await serviceProxy.delete('notification-service', `/notifications/${notificationId}`, {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Get notification count (authenticated)
router.get('/count', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const response = await serviceProxy.get('notification-service', '/notifications/count', {
    params: {
      userId: req.user!.id,
    },
  });
  
  res.json(response);
}));

// Test notification (authenticated, development only)
router.post('/test', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test notifications not available in production',
      timestamp: new Date(),
    });
  }

  const response = await serviceProxy.post('notification-service', '/notifications/test', {
    ...req.body,
    userId: req.user!.id,
  });
  
  res.json(response);
}));

export { router as notificationRoutes };