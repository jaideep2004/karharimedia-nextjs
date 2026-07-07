import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import Royalty from '../models/royalty.model';
import { findTrackById } from '../repositories/track.repository';
import { successResponse, errorResponse, notFoundResponse } from '../utils/apiResponse';
import { ApiError } from '../middleware/errorHandler.middleware';
import { UserRole } from '../config/constants';

/**
 * Create a new royalty report
 * @route POST /api/royalties
 * @access Private (Admin)
 */
export const createRoyalty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trackId, artistId, store, amount, currency, reportingDate, streamCount } = req.body;

    // Verify track exists
    const track = await findTrackById(trackId);
    if (!track) {
      throw new ApiError('Track not found', 404);
    }

    // Create royalty record
    const royalty = await Royalty.create({
      trackId,
      artistId,
      store,
      amount,
      currency,
      reportingDate: new Date(reportingDate),
      streamCount: streamCount || 0
    });

    successResponse(res, royalty, 'Royalty report created successfully', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create royalty report', error);
  }
};

/**
 * Get all royalties for a user
 * @route GET /api/royalties
 * @access Private
 */
export const getRoyalties = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    let query: any = {};

    // If not admin, restrict to user's royalties
    if (user.role !== UserRole.ADMIN) {
      query.artistId = user._id;
    } else if (req.query.artistId) {
      // Admin can filter by artistId
      query.artistId = req.query.artistId;
    }

    // Apply filters
    if (req.query.trackId) {
      query.trackId = req.query.trackId;
    }

    if (req.query.store) {
      query.store = req.query.store;
    }

    // Date range filter
    if (req.query.startDate) {
      if (!query.reportingDate) query.reportingDate = {};
      query.reportingDate.$gte = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      if (!query.reportingDate) query.reportingDate = {};
      query.reportingDate.$lte = new Date(req.query.endDate as string);
    }

    // Get royalties with pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const royalties = await Royalty.find(query)
      .sort({ reportingDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate('trackId', 'title');

    // Get total count for pagination
    const total = await Royalty.countDocuments(query);

    // Calculate totals
    const totals = await Royalty.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$currency',
          totalAmount: { $sum: '$amount' },
          totalStreams: { $sum: '$streamCount' }
        }
      }
    ]);

    successResponse(
      res,
      {
        royalties,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        totals
      },
      'Royalties retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve royalties', error);
  }
};

/**
 * Get monthly royalty report
 * @route GET /api/royalties/monthly
 * @access Private
 */
export const getMonthlyReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    let artistId = user._id;

    // Admin can view reports for any artist
    if (user.role === UserRole.ADMIN && req.query.artistId) {
      artistId = new mongoose.Types.ObjectId(req.query.artistId as string);
    }

    // Get year and month
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    // Create date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Aggregate monthly data
    const monthlyReport = await Royalty.aggregate([
      {
        $match: {
          artistId,
          reportingDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $lookup: {
          from: 'tracks',
          localField: 'trackId',
          foreignField: '_id',
          as: 'track'
        }
      },
      {
        $unwind: '$track'
      },
      {
        $group: {
          _id: {
            trackId: '$trackId',
            store: '$store',
            currency: '$currency'
          },
          trackTitle: { $first: '$track.title' },
          totalAmount: { $sum: '$amount' },
          totalStreams: { $sum: '$streamCount' }
        }
      },
      {
        $group: {
          _id: {
            trackId: '$_id.trackId',
            currency: '$_id.currency'
          },
          trackTitle: { $first: '$trackTitle' },
          stores: {
            $push: {
              store: '$_id.store',
              amount: '$totalAmount',
              streams: '$totalStreams'
            }
          },
          totalAmount: { $sum: '$totalAmount' },
          totalStreams: { $sum: '$totalStreams' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    // Calculate grand totals by currency
    const totals = await Royalty.aggregate([
      {
        $match: {
          artistId,
          reportingDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: '$currency',
          totalAmount: { $sum: '$amount' },
          totalStreams: { $sum: '$streamCount' }
        }
      }
    ]);

    successResponse(
      res,
      {
        year,
        month,
        monthlyReport,
        totals
      },
      'Monthly report retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve monthly report', error);
  }
};

/**
 * Get royalty by ID
 * @route GET /api/royalties/:id
 * @access Private
 */
export const getRoyaltyById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    const royalty = await Royalty.findById(id).populate('trackId', 'title');

    if (!royalty) {
      notFoundResponse(res, 'Royalty not found');
      return;
    }

    // Check if user is authorized to view this royalty
    if (user.role !== UserRole.ADMIN && royalty.artistId.toString() !== user._id.toString()) {
      throw new ApiError('Not authorized to access this royalty', 403);
    }

    successResponse(res, royalty, 'Royalty retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve royalty', error);
  }
};

/**
 * Update royalty
 * @route PUT /api/royalties/:id
 * @access Private (Admin)
 */
export const updateRoyalty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { store, amount, currency, reportingDate, streamCount } = req.body;

    const royalty = await Royalty.findById(id);

    if (!royalty) {
      notFoundResponse(res, 'Royalty not found');
      return;
    }

    // Update royalty fields
    if (store) royalty.store = store;
    if (amount !== undefined) royalty.amount = amount;
    if (currency) royalty.currency = currency;
    if (reportingDate) royalty.reportingDate = new Date(reportingDate);
    if (streamCount !== undefined) royalty.streamCount = streamCount;

    await royalty.save();

    successResponse(res, royalty, 'Royalty updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update royalty', error);
  }
};

/**
 * Delete royalty
 * @route DELETE /api/royalties/:id
 * @access Private (Admin)
 */
export const deleteRoyalty = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const royalty = await Royalty.findById(id);

    if (!royalty) {
      notFoundResponse(res, 'Royalty not found');
      return;
    }

    await royalty.deleteOne();

    successResponse(res, null, 'Royalty deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete royalty', error);
  }
}; 
