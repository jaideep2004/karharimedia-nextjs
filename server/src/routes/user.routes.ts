import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect, authorize, authorizeAdminPermission } from '../middleware/auth.middleware';
import { AdminPermission, UserRole } from '../config/constants';

const router = Router();

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private (Admin)
 */
router.get(
  '/',
  protect,
  authorizeAdminPermission(AdminPermission.USERS),
  userController.getUsers
);

/**
 * @route   POST /api/users
 * @desc    Create a new user
 * @access  Private (Admin)
 */
router.post(
  '/',
  protect,
  authorize([UserRole.ADMIN]),
  userController.createUser
);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private (Admin)
 */
router.get(
  '/stats',
  protect,
  authorizeAdminPermission(AdminPermission.ANALYTICS),
  userController.getUserStats
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Admin)
 */
router.get(
  '/:id',
  protect,
  authorizeAdminPermission(AdminPermission.USERS),
  userController.getUserById
);

router.post(
  '/:id/preview-audit',
  protect,
  authorizeAdminPermission(AdminPermission.USERS),
  userController.logUserPreview
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  protect,
  authorizeAdminPermission(AdminPermission.USERS),
  userController.updateUser
);

/**
 * @route   PATCH /api/users/:id/verification
 * @desc    Review user KYC verification
 * @access  Private (Admin)
 */
router.patch(
  '/:id/verification',
  protect,
  authorizeAdminPermission(AdminPermission.REVIEW),
  userController.reviewUserVerification
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  protect,
  authorize([UserRole.ADMIN]),
  userController.deleteUser
);

export default router; 
