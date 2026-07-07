import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import Notification from '../models/notification.model';
import { successResponse, errorResponse, notFoundResponse } from '../utils/apiResponse';
import { ApiError } from '../middleware/errorHandler.middleware';

/**
 * Get all notifications for the authenticated user
 * @route GET /api/notifications
 * @access Private
 */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({
      userId: user._id,
      isRead: false
    });
    
    // Get notifications with pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    const notifications = await Notification.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('relatedId');
    
    // Get total count for pagination
    const total = await Notification.countDocuments({ userId: user._id });
    
    successResponse(
      res,
      {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      'Notifications retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve notifications', error);
  }
};

/**
 * Get notification by ID
 * @route GET /api/notifications/:id
 * @access Private
 */
export const getNotificationById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const notification = await Notification.findById(id);
    
    if (!notification) {
      notFoundResponse(res, 'Notification not found');
      return;
    }
    
    // Check if user is authorized to view this notification
    if (notification.userId.toString() !== user._id.toString()) {
      throw new ApiError('Not authorized to access this notification', 403);
    }
    
    successResponse(res, notification, 'Notification retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve notification', error);
  }
};

/**
 * Mark notification as read
 * @route PUT /api/notifications/:id/read
 * @access Private
 */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const notification = await Notification.findById(id);
    
    if (!notification) {
      notFoundResponse(res, 'Notification not found');
      return;
    }
    
    // Check if user is authorized to update this notification
    if (notification.userId.toString() !== user._id.toString()) {
      throw new ApiError('Not authorized to update this notification', 403);
    }
    
    // Update notification
    notification.isRead = true;
    await notification.save();
    
    successResponse(res, notification, 'Notification marked as read');
  } catch (error) {
    errorResponse(res, 'Failed to mark notification as read', error);
  }
};

/**
 * Mark all notifications as read
 * @route PUT /api/notifications/read-all
 * @access Private
 */
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { notificationIds } = req.body;
    
    let updateQuery: any = { userId: user._id, isRead: false };
    
    // If specific IDs are provided, only mark those as read
    if (notificationIds && notificationIds.length > 0) {
      updateQuery._id = { $in: notificationIds };
    }
    
    // Update notifications
    const result = await Notification.updateMany(
      updateQuery,
      { isRead: true }
    );
    
    successResponse(
      res,
      { modified: result.modifiedCount },
      `${result.modifiedCount} notifications marked as read`
    );
  } catch (error) {
    errorResponse(res, 'Failed to mark notifications as read', error);
  }
};

/**
 * Delete notification
 * @route DELETE /api/notifications/:id
 * @access Private
 */
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const notification = await Notification.findById(id);
    
    if (!notification) {
      notFoundResponse(res, 'Notification not found');
      return;
    }
    
    // Check if user is authorized to delete this notification
    if (notification.userId.toString() !== user._id.toString()) {
      throw new ApiError('Not authorized to delete this notification', 403);
    }
    
    await notification.deleteOne();
    
    successResponse(res, null, 'Notification deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete notification', error);
  }
}; 