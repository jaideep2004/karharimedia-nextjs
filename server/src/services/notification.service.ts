import mongoose from 'mongoose';
import Notification from '../models/notification.model';
import { NotificationType } from '../config/constants';

/**
 * Create a new notification
 * @param userId - User ID to send notification to
 * @param message - Notification message
 * @param type - Notification type
 * @param relatedId - Related document ID (optional)
 * @param refModel - Reference model for relatedId (optional)
 * @returns Created notification
 */
export const createNotification = async (
  userId: mongoose.Types.ObjectId | string,
  message: string,
  type: NotificationType,
  relatedId?: mongoose.Types.ObjectId | string,
  refModel?: 'Track' | 'Payout' | 'SupportTicket'
): Promise<any> => {
  try {
    const notification = await Notification.create({
      userId,
      message,
      type,
      relatedId,
      refModel
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw error - notifications should not block the main process
    return null;
  }
};

/**
 * Create a release approval notification
 * @param userId - User ID to send notification to
 * @param trackId - Track ID
 * @param trackTitle - Track title
 * @returns Created notification
 */
export const notifyReleaseApproved = async (
  userId: mongoose.Types.ObjectId | string,
  trackId: mongoose.Types.ObjectId | string,
  trackTitle: string
): Promise<any> => {
  return createNotification(
    userId,
    `Your release "${trackTitle}" has been approved and will be distributed to stores.`,
    NotificationType.RELEASE_APPROVED,
    trackId,
    'Track'
  );
};

/**
 * Create a release rejection notification
 * @param userId - User ID to send notification to
 * @param trackId - Track ID
 * @param trackTitle - Track title
 * @param reason - Rejection reason
 * @returns Created notification
 */
export const notifyReleaseRejected = async (
  userId: mongoose.Types.ObjectId | string,
  trackId: mongoose.Types.ObjectId | string,
  trackTitle: string,
  reason: string
): Promise<any> => {
  return createNotification(
    userId,
    `Your release "${trackTitle}" has been rejected. Reason: ${reason}`,
    NotificationType.RELEASE_REJECTED,
    trackId,
    'Track'
  );
};

/**
 * Create a payout approval notification
 * @param userId - User ID to send notification to
 * @param payoutId - Payout ID
 * @param amount - Payout amount
 * @param currency - Payout currency
 * @returns Created notification
 */
export const notifyPayoutApproved = async (
  userId: mongoose.Types.ObjectId | string,
  payoutId: mongoose.Types.ObjectId | string,
  amount: number,
  currency: string
): Promise<any> => {
  return createNotification(
    userId,
    `Your payout request for ${amount} ${currency} has been approved and will be processed shortly.`,
    NotificationType.PAYOUT_APPROVED,
    payoutId,
    'Payout'
  );
};

/**
 * Create a payout rejection notification
 * @param userId - User ID to send notification to
 * @param payoutId - Payout ID
 * @param amount - Payout amount
 * @param currency - Payout currency
 * @param reason - Rejection reason
 * @returns Created notification
 */
export const notifyPayoutRejected = async (
  userId: mongoose.Types.ObjectId | string,
  payoutId: mongoose.Types.ObjectId | string,
  amount: number,
  currency: string,
  reason: string
): Promise<any> => {
  return createNotification(
    userId,
    `Your payout request for ${amount} ${currency} has been rejected. Reason: ${reason}`,
    NotificationType.PAYOUT_REJECTED,
    payoutId,
    'Payout'
  );
};
