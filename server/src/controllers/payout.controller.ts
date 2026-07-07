import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import Payout from '../models/payout.model';
import Royalty from '../models/royalty.model';
import { successResponse, errorResponse, notFoundResponse } from '../utils/apiResponse';
import { ApiError } from '../middleware/errorHandler.middleware';
import { UserRole, PayoutStatus, MINIMUM_PAYOUT_USD } from '../config/constants';
import * as notificationService from '../services/notification.service';

/**
 * Request a payout
 * @route POST /api/payouts
 * @access Private (Artist)
 */
export const requestPayout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount, currency, paymentMethod, paymentDetails } = req.body;
    const user = req.user;

    if ((user.role === UserRole.ARTIST || user.role === UserRole.LABEL) && user.verification?.status !== 'approved') {
      throw new ApiError('KYC approval is required before requesting payouts', 403);
    }

    if (Number(amount) < MINIMUM_PAYOUT_USD) {
      throw new ApiError(`Minimum payout amount is ${MINIMUM_PAYOUT_USD} USD`, 400);
    }

    // Calculate available balance
    const totalEarnings = await Royalty.aggregate([
      { $match: { artistId: user._id, currency } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalPayouts = await Payout.aggregate([
      { $match: { artistId: user._id, currency, status: { $ne: PayoutStatus.REJECTED } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const earned = totalEarnings.length > 0 ? totalEarnings[0].total : 0;
    const paidOut = totalPayouts.length > 0 ? totalPayouts[0].total : 0;
    const availableBalance = earned - paidOut;

    // Check if artist has enough balance
    if (amount > availableBalance) {
      throw new ApiError(`Insufficient balance. Available: ${availableBalance} ${currency}`, 400);
    }

    // Create payout request
    const payout = await Payout.create({
      artistId: user._id,
      amount,
      currency,
      paymentMethod,
      paymentDetails,
      status: PayoutStatus.PENDING
    });

    successResponse(res, payout, 'Payout request submitted successfully', 201);
  } catch (error) {
    errorResponse(res, 'Failed to request payout', error);
  }
};

/**
 * Get all payouts
 * @route GET /api/payouts
 * @access Private
 */
export const getPayouts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    let query: any = {};

    // If not admin, restrict to user's payouts
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUBADMIN) {
      query.artistId = user._id;
    } else if (req.query.artistId) {
      // Admin can filter by artistId
      query.artistId = req.query.artistId;
    }

    // Apply status filter
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Get payouts with pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const payouts = await Payout.find(query)
      .sort({ requestDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('artistId', 'name email artistName');

    // Get total count for pagination
    const total = await Payout.countDocuments(query);

    successResponse(
      res,
      {
        payouts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      'Payouts retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve payouts', error);
  }
};

/**
 * Get payout by ID
 * @route GET /api/payouts/:id
 * @access Private
 */
export const getPayoutById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    const payout = await Payout.findById(id);

    if (!payout) {
      notFoundResponse(res, 'Payout not found');
      return;
    }

    // Check if user is authorized to view this payout
    if (user.role !== UserRole.ADMIN && payout.artistId.toString() !== user._id.toString()) {
      throw new ApiError('Not authorized to access this payout', 403);
    }

    successResponse(res, payout, 'Payout retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve payout', error);
  }
};

/**
 * Approve or reject payout
 * @route PUT /api/payouts/:id/status
 * @access Private (Admin)
 */
export const updatePayoutStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const payout = await Payout.findById(id).populate('artistId', 'name');
    if (!payout) {
      notFoundResponse(res, 'Payout not found');
      return;
    }

    // Update payout status
    payout.status = status;
    payout.processedDate = new Date();

    if (status === PayoutStatus.REJECTED) {
      payout.rejectionReason = rejectionReason;
    } else {
      payout.rejectionReason = undefined;
    }

    await payout.save();

    // Send notification to artist
    if (status === PayoutStatus.APPROVED) {
      await notificationService.notifyPayoutApproved(
        payout.artistId,
        payout._id,
        payout.amount,
        payout.currency
      );
    } else if (status === PayoutStatus.REJECTED) {
      await notificationService.notifyPayoutRejected(
        payout.artistId,
        payout._id,
        payout.amount,
        payout.currency,
        rejectionReason
      );
    }

    successResponse(res, payout, `Payout ${status} successfully`);
  } catch (error) {
    errorResponse(res, 'Failed to update payout status', error);
  }
};

/**
 * Get artist's balance
 * @route GET /api/payouts/balance
 * @access Private
 */
export const getBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    let artistId = user._id;

    // Admin can view balance for any artist
    if (user.role === UserRole.ADMIN && req.query.artistId) {
      artistId = req.query.artistId;
    }

    // Get total earnings by currency
    const earnings = await Royalty.aggregate([
      { $match: { artistId } },
      {
        $group: {
          _id: '$currency',
          earned: { $sum: '$amount' },
          streams: { $sum: '$streamCount' }
        }
      }
    ]);

    // Get total payouts by currency (excluding rejected)
    const payouts = await Payout.aggregate([
      { $match: { artistId, status: { $ne: PayoutStatus.REJECTED } } },
      {
        $group: {
          _id: '$currency',
          paid: { $sum: '$amount' }
        }
      }
    ]);

    // Create balance object
    const balance = earnings.map(item => {
      const payout = payouts.find(p => p._id === item._id) || { paid: 0 };
      return {
        currency: item._id,
        earned: item.earned,
        paid: payout.paid,
        available: item.earned - payout.paid,
        streams: item.streams
      };
    });

    successResponse(res, balance, 'Balance retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve balance', error);
  }
}; 
