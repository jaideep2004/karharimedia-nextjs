import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validator.middleware';
import { getNotificationValidator, markAsReadValidator, markAllAsReadValidator } from '../validators/notification.validator';

const router = Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for the authenticated user
 * @access  Private
 */
router.get(
  '/',
  protect,
  notificationController.getNotifications
);

/**
 * @route   GET /api/notifications/:id
 * @desc    Get notification by ID
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  validate(getNotificationValidator),
  notificationController.getNotificationById
);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/:id/read',
  protect,
  validate(markAsReadValidator),
  notificationController.markAsRead
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put(
  '/read-all',
  protect,
  validate(markAllAsReadValidator),
  notificationController.markAllAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/:id',
  protect,
  validate(getNotificationValidator),
  notificationController.deleteNotification
);

export default router; 