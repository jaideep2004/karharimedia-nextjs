import { param, body } from 'express-validator';

export const getNotificationValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid notification ID')
];

export const markAsReadValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid notification ID')
];

export const markAllAsReadValidator = [
  body('notificationIds')
    .optional()
    .isArray()
    .withMessage('Notification IDs must be an array')
    .custom((notificationIds) => {
      if (notificationIds && notificationIds.length > 0) {
        const validIds = notificationIds.every((id: string) => {
          return /^[0-9a-fA-F]{24}$/.test(id);
        });
        if (!validIds) {
          throw new Error('Invalid notification ID format in array');
        }
      }
      return true;
    })
]; 