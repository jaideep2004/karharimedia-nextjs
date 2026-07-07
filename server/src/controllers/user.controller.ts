import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import User from '../repositories/user.repository';
import AuditLog from '../models/auditLog.model';
import { successResponse, errorResponse, notFoundResponse } from '../utils/apiResponse';
import { ApiError } from '../middleware/errorHandler.middleware';
import { AdminPermission, SUBADMIN_PERMISSION_PRESETS, SupportTicketCategory, UserRole } from '../config/constants';
import { buildDashboardUrl, sendUserAndAdminEmail } from '../services/emailNotification.service';
import { createKycRejectionTicket } from '../services/support.service';

const resolveAdminPermissions = (role: string, preset?: string, overrides?: AdminPermission[]) => {
  if (role === UserRole.ADMIN) {
    return Object.values(AdminPermission);
  }
  if (role !== UserRole.SUBADMIN) {
    return undefined;
  }
  const presetPermissions = preset ? SUBADMIN_PERMISSION_PRESETS[preset] || [] : [];
  return Array.from(new Set([...(presetPermissions || []), ...(overrides || [])]));
};

const normalizeSupportCategories = (value: unknown): SupportTicketCategory[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((item): item is SupportTicketCategory =>
        Object.values(SupportTicketCategory).includes(item as SupportTicketCategory)
      )
    )
  );
};

const resolveSupportCategories = (
  role: string,
  permissions?: AdminPermission[],
  nextCategories?: unknown,
  currentCategories?: SupportTicketCategory[]
) => {
  if (role !== UserRole.SUBADMIN || !permissions?.includes(AdminPermission.SUPPORT)) {
    return undefined;
  }

  if (nextCategories === undefined) return currentCategories;
  return normalizeSupportCategories(nextCategories);
};

/**
 * Create a new user (admin only)
 * @route POST /api/users
 * @access Private (Admin)
 */
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, artistName, bio, socialLinks, accountType, adminPreset, permissions, supportCategories } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      throw new ApiError('User already exists with this email', 400);
    }

    const resolvedPermissions = resolveAdminPermissions(role, adminPreset, permissions);

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
      accountType: role === UserRole.LABEL ? 'label' : role === UserRole.ARTIST ? 'artist' : accountType,
      adminPreset: role === UserRole.SUBADMIN ? adminPreset : undefined,
      permissions: resolvedPermissions,
      supportCategories: resolveSupportCategories(role, resolvedPermissions, supportCategories),
      artistName: artistName || name,
      bio,
      socialLinks,
      createdBy: req.user._id // Track who created this user
    });

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `Karhari Media Distribution account created for ${user.name}`,
        title: 'Account Created',
        intro: `${user.name} was created by an admin.`,
        details: {
          User: user.name,
          Email: user.email,
          Role: user.role,
          'Created By': 'Karhari Media Distribution',
        },
        actionLabel: 'Open Account',
        actionUrl: buildDashboardUrl(user.role === UserRole.ADMIN || user.role === UserRole.SUBADMIN ? '/admin/dashboard' : '/dashboard'),
      }
    ).catch((error) => console.warn('Admin user creation email skipped:', error));

    successResponse(
      res,
      {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        artistName: user.artistName,
        accountType: user.accountType,
        adminPreset: user.adminPreset,
        permissions: user.permissions || [],
        supportCategories: user.supportCategories
      },
      'User created successfully',
      201
    );
  } catch (error) {
    errorResponse(res, 'Failed to create user', error);
  }
};

/**
 * Get all users (admin only)
 * @route GET /api/users
 * @access Private (Admin)
 */
export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get users with pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Apply filters
    const query: any = {};
    
    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.status) {
      query['verification.status'] = req.query.status;
    }
    
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search as string, 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { artistName: searchRegex }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await User.countDocuments(query);

    successResponse(
      res,
      {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      'Users retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve users', error);
  }
};

/**
 * Get user by ID (admin only)
 * @route GET /api/users/:id
 * @access Private (Admin)
 */
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');

    if (!user) {
      notFoundResponse(res, 'User not found');
      return;
    }

    successResponse(res, user, 'User retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user', error);
  }
};

/**
 * Update user (admin only)
 * @route PUT /api/users/:id
 * @access Private (Admin)
 */
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      role,
      artistName,
      bio,
      socialLinks,
      isActive,
      verification,
      onboarding,
      payoutMethod,
      accountType,
      adminPreset,
      permissions,
      supportCategories,
    } = req.body;

    const user = await User.findById(id);

    if (!user) {
      notFoundResponse(res, 'User not found');
      return;
    }

    // Update user fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (role && Object.values(UserRole).includes(role as UserRole)) {
      user.role = role as UserRole;
    }
    if (accountType) user.accountType = accountType;
    if (adminPreset !== undefined) user.adminPreset = adminPreset;
    if (role || adminPreset !== undefined || permissions) {
      const resolvedPermissions = resolveAdminPermissions(user.role, adminPreset ?? user.adminPreset, permissions);
      user.permissions = resolvedPermissions as any;
      user.supportCategories = resolveSupportCategories(
        user.role,
        resolvedPermissions,
        supportCategories,
        user.supportCategories as any
      ) as any;
    } else if (supportCategories !== undefined) {
      user.supportCategories = resolveSupportCategories(
        user.role,
        user.permissions,
        supportCategories,
        user.supportCategories as any
      ) as any;
    }
    if (artistName) user.artistName = artistName;
    if (bio !== undefined) user.bio = bio;
    if (typeof isActive === 'boolean') {
      (user as any).isActive = isActive;
    }
    if (socialLinks) {
      user.socialLinks = {
        ...user.socialLinks,
        ...socialLinks
      };
    }
    if (verification) {
      user.verification = {
        ...(user.verification || {}),
        ...verification,
      };
    }
    if (onboarding && typeof onboarding === 'object') {
      const currentOnboarding = ((user as any).onboarding || {}) as Record<string, any>;
      (user as any).onboarding = {
        ...currentOnboarding,
        ...onboarding,
        location: {
          ...(currentOnboarding.location || {}),
          ...(onboarding.location || {}),
        },
        documents: {
          ...(currentOnboarding.documents || {}),
          ...(onboarding.documents || {}),
        },
      };
    }
    if (payoutMethod && typeof payoutMethod === 'object') {
      const currentPayout = ((user as any).payoutMethod || {}) as Record<string, any>;
      (user as any).payoutMethod = {
        ...currentPayout,
        ...payoutMethod,
        details: {
          ...(currentPayout.details || {}),
          ...(payoutMethod.details || {}),
        },
      };
    }

    await user.save();

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `Karhari Media Distribution profile updated for ${user.name}`,
        title: 'User Profile Updated',
        intro: `${user.name} account details were updated by an admin.`,
        details: {
          User: user.name,
          Email: user.email,
          Role: user.role,
          'Updated By': 'Karhari Media Distribution',
        },
        actionLabel: 'Open User',
        actionUrl: buildDashboardUrl(`/admin/users/${user._id}`),
      }
    ).catch((error) => console.warn('Admin user update email skipped:', error));

    successResponse(res, user, 'User updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update user', error);
  }
};

export const logUserPreview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await AuditLog.create({
      user: req.user.email || String(req.user._id),
      action: 'admin_read_only_user_preview',
      entity: 'user',
      entityId: id,
      details: { targetUserId: id },
      status: 'success',
    });
    successResponse(res, null, 'Preview audit logged');
  } catch (error) {
    errorResponse(res, 'Failed to log preview audit', error);
  }
};

/**
 * Review user KYC verification (admin only)
 * @route PATCH /api/users/:id/verification
 * @access Private (Admin)
 */
export const reviewUserVerification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, notes } = req.body as {
      status?: 'approved' | 'rejected' | 'submitted' | 'pending';
      rejectionReason?: string;
      notes?: string;
    };

    if (!status || !['approved', 'rejected', 'submitted', 'pending'].includes(status)) {
      throw new ApiError('Invalid verification status', 400);
    }

    if (status === 'rejected' && !rejectionReason?.trim()) {
      throw new ApiError('Rejection reason is required', 400);
    }

    const user = await User.findById(id);
    if (!user) {
      notFoundResponse(res, 'User not found');
      return;
    }

    user.verification = {
      ...(user.verification || {}),
      status,
      reviewedAt: new Date(),
      reviewedBy: req.user._id,
      rejectionReason: status === 'rejected' ? rejectionReason : undefined,
      notes,
    };

    await user.save();

    if (status === 'rejected') {
      void createKycRejectionTicket({
        userId: String(user._id),
        reviewedBy: String(req.user._id),
        reason: rejectionReason || 'KYC verification was rejected',
      }).catch((error) => console.warn('KYC support ticket skipped:', error));
    }

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `KYC ${status === 'approved' ? 'approved' : status === 'rejected' ? 'needs correction' : 'updated'} for ${user.name}`,
        title: `KYC ${status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Updated'}`,
        intro: status === 'rejected'
          ? 'KYC needs correction. Please review the reason and resubmit.'
          : status === 'approved'
            ? 'KYC is approved. Dashboard tools are unlocked.'
            : 'KYC status was updated.',
        details: {
          User: user.name,
          Email: user.email,
          Status: status,
          Reason: rejectionReason,
          'Reviewed By': 'Karhari Media Distribution',
        },
        actionLabel: status === 'rejected' ? 'Resubmit KYC' : 'Open Dashboard',
        actionUrl: buildDashboardUrl(status === 'rejected' ? '/dashboard' : '/dashboard'),
      }
    ).catch((error) => console.warn('KYC review email skipped:', error));

    successResponse(res, user, 'User verification updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update user verification', error);
  }
};

/**
 * Delete user (admin only)
 * @route DELETE /api/users/:id
 * @access Private (Admin)
 */
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      notFoundResponse(res, 'User not found');
      return;
    }

    // Don't allow deletion of the last admin
    if (user.role === UserRole.ADMIN) {
      const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
      if (adminCount <= 1) {
        throw new ApiError('Cannot delete the last admin user', 400);
      }
    }

    await user.deleteOne();

    successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    errorResponse(res, 'Failed to delete user', error);
  }
};

/**
 * Get user statistics (admin only)
 * @route GET /api/users/stats
 * @access Private (Admin)
 */
export const getUserStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get total counts
    const totalUsers = await User.countDocuments();
    const artistCount = await User.countDocuments({ role: UserRole.ARTIST });
    const labelCount = await User.countDocuments({ role: UserRole.LABEL });
    const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
    const subadminCount = await User.countDocuments({ role: UserRole.SUBADMIN });

    // Get recent users
    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get monthly registration data for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      }
    ]);

    // Format the monthly stats for easier consumption
    const formattedMonthlyStats = monthlyStats.map(stat => ({
      year: stat._id.year,
      month: stat._id.month,
      count: stat.count
    }));

    // Return all stats
    successResponse(
      res,
      {
        totalUsers,
        artistCount,
        labelCount,
        adminCount,
        subadminCount,
        recentUsers,
        monthlyStats: formattedMonthlyStats,
        // Include additional stats for the dashboard
        totalTracks: 0, // These would come from Track model
        pendingTracks: 0,
        totalReleases: 0,
        pendingReleases: 0,
        pendingPayouts: 0,
        totalRevenue: 0
      },
      'User statistics retrieved successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to retrieve user statistics', error);
  }
}; 
