import { Router } from 'express';
import * as trackController from '../controllers/track.controller';
import { protect, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validator.middleware';
import { createTrackValidator, updateTrackValidator, approveRejectTrackValidator } from '../validators/track.validator';
import { uploadTrackFiles } from '../utils/fileUpload';
import { UserRole } from '../config/constants';

const router = Router();

// Set up multer upload middleware
const uploadMiddleware = [
  uploadTrackFiles.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'artwork', maxCount: 1 }
  ])
];

/**
 * @route   POST /api/tracks
 * @desc    Upload a new track
 * @access  Private (Artist/Label)
 */
router.post(
  '/', 
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  uploadMiddleware,
  validate(createTrackValidator),
  trackController.uploadTrack
);

/**
 * @route   GET /api/tracks
 * @desc    Get all tracks
 * @access  Private
 */
router.get('/', protect, trackController.getTracks);

/**
 * @route   GET /api/tracks/:id
 * @desc    Get track by ID
 * @access  Private
 */
router.get('/:id', protect, trackController.getTrackById);

/**
 * @route   PUT /api/tracks/:id
 * @desc    Update track
 * @access  Private (Artist/Label)
 */
router.put(
  '/:id',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL]),
  validate(updateTrackValidator),
  trackController.updateTrack
);

/**
 * @route   DELETE /api/tracks/:id
 * @desc    Delete track
 * @access  Private (Artist/Admin)
 */
router.delete('/:id', protect, trackController.deleteTrack);

/**
 * @route   PUT /api/tracks/:id/status
 * @desc    Approve or reject track
 * @access  Private (Admin)
 */
router.put(
  '/:id/status',
  protect,
  authorize([UserRole.ADMIN]),
  validate(approveRejectTrackValidator),
  trackController.updateTrackStatus
);

export default router; 
