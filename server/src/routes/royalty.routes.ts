import { Router } from 'express';
import * as royaltyController from '../controllers/royalty.controller';
import { protect, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validator.middleware';
import { createRoyaltyValidator, getRoyaltiesValidator, getRoyaltyByIdValidator } from '../validators/royalty.validator';
import { UserRole } from '../config/constants';

const router = Router();

/**
 * @route   POST /api/royalties
 * @desc    Create a new royalty report
 * @access  Private (Admin)
 */
router.post(
  '/',
  protect,
  authorize([UserRole.ADMIN]),
  validate(createRoyaltyValidator),
  royaltyController.createRoyalty
);

/**
 * @route   GET /api/royalties
 * @desc    Get all royalties with filters
 * @access  Private
 */
router.get(
  '/',
  protect,
  validate(getRoyaltiesValidator),
  royaltyController.getRoyalties
);

/**
 * @route   GET /api/royalties/monthly
 * @desc    Get monthly royalty report
 * @access  Private
 */
router.get(
  '/monthly',
  protect,
  royaltyController.getMonthlyReport
);

/**
 * @route   GET /api/royalties/:id
 * @desc    Get royalty by ID
 * @access  Private
 */
router.get(
  '/:id',
  protect,
  validate(getRoyaltyByIdValidator),
  royaltyController.getRoyaltyById
);

/**
 * @route   PUT /api/royalties/:id
 * @desc    Update royalty
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  protect,
  authorize([UserRole.ADMIN]),
  royaltyController.updateRoyalty
);

/**
 * @route   DELETE /api/royalties/:id
 * @desc    Delete royalty
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  protect,
  authorize([UserRole.ADMIN]),
  royaltyController.deleteRoyalty
);

export default router; 