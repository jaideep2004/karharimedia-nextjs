import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { ApiError } from '../middleware/errorHandler.middleware';
import { validate } from '../middleware/validator.middleware';
import {
  registerValidator,
  loginValidator,
  updateProfileValidator,
  changePasswordValidator,
} from '../validators/auth.validator';
import { uploadImage, uploadRegistrationFiles } from '../utils/fileUpload';
import { PROFILE_IMAGE_MAX_FILE_SIZE } from '../config/constants';

const router = Router();
const profilePictureUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadImage.single('profilePicture')(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const maxMb = Math.floor(PROFILE_IMAGE_MAX_FILE_SIZE / (1024 * 1024));
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `Profile image must be ${maxMb}MB or smaller`
        : error.message;
      next(new ApiError(message, 400));
      return;
    }

    next(error);
  });
};

/**
 * @route   GET /api/auth/check-artist-name
 * @desc    Check if an artist name is available
 * @access  Public
 */
router.get('/check-artist-name', authController.checkArtistName);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  uploadRegistrationFiles,
  validate(registerValidator),
  authController.register
);

router.post('/signup/start', validate(registerValidator), authController.startSignup);
router.post('/signup/verify', authController.verifySignup);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validate(loginValidator), authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, authController.getMe);

/**
 * @route   PUT /api/auth/me/kyc
 * @desc    Submit current user's KYC/onboarding data
 * @access  Private
 */
router.put('/me/kyc', protect, uploadRegistrationFiles, authController.submitKyc);

/**
 * @route   PUT /api/auth/me
 * @desc    Update user profile
 * @access  Private
 */
router.put('/me', protect, validate(updateProfileValidator), authController.updateProfile);
router.put('/me/profile-picture', protect, profilePictureUpload, authController.updateProfilePicture);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password
 * @access  Private
 */
router.put(
  '/change-password',
  protect,
  validate(changePasswordValidator),
  authController.changePassword
);

export default router;
