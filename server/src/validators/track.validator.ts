import { body, param } from 'express-validator';
import { ReleaseStatus, STORES } from '../config/constants';

export const createTrackValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Track title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot be more than 100 characters'),
  body('artistName')
    .trim()
    .notEmpty()
    .withMessage('Artist name is required'),
  body('genre')
    .trim()
    .notEmpty()
    .withMessage('Genre is required'),
  body('releaseDate')
    .notEmpty()
    .withMessage('Release date is required')
    .isISO8601()
    .withMessage('Release date must be a valid date')
    .custom((value) => {
      const releaseDate = new Date(value);
      const now = new Date();
      if (releaseDate < now) {
        throw new Error('Release date must be in the future');
      }
      return true;
    }),
  body('isrc')
    .optional()
    .trim()
    .isLength({ max: 24 })
    .withMessage('ISRC cannot be more than 24 characters'),
  body('upc')
    .optional()
    .trim()
    .isLength({ max: 15 })
    .withMessage('UPC cannot be more than 15 characters'),
  body('pline')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('PLine cannot be more than 255 characters'),
  body('cline')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('CLine cannot be more than 255 characters'),
  body('label')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Label cannot be more than 100 characters'),
  body('publisher')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Publisher cannot be more than 100 characters'),
  body('explicit')
    .optional()
    .isBoolean()
    .withMessage('Explicit must be a boolean value'),
  body('iswc')
    .optional()
    .trim()
    .isLength({ max: 15 })
    .withMessage('ISWC cannot be more than 15 characters'),
  body('isni')
    .optional()
    .trim()
    .isLength({ max: 16 })
    .withMessage('ISNI cannot be more than 16 characters'),
  body('language')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Language code cannot be more than 10 characters'),
  body('stores')
    .isArray({ min: 1 })
    .withMessage('At least one store must be selected')
    .custom((stores) => {
      const validStores = stores.every((store: string) => STORES.includes(store));
      if (!validStores) {
        throw new Error(`Stores must be one of: ${STORES.join(', ')}`);
      }
      return true;
    })
];

export const updateTrackValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid track ID'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title cannot be more than 100 characters'),
  body('artistName')
    .optional()
    .trim(),
  body('genre')
    .optional()
    .trim(),
  body('releaseDate')
    .optional()
    .isISO8601()
    .withMessage('Release date must be a valid date')
    .custom((value) => {
      const releaseDate = new Date(value);
      const now = new Date();
      if (releaseDate < now) {
        throw new Error('Release date must be in the future');
      }
      return true;
    }),
  body('isrc')
    .optional()
    .trim()
    .isLength({ max: 24 })
    .withMessage('ISRC cannot be more than 24 characters'),
  body('upc')
    .optional()
    .trim()
    .isLength({ max: 15 })
    .withMessage('UPC cannot be more than 15 characters'),
  body('pline')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('PLine cannot be more than 255 characters'),
  body('cline')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('CLine cannot be more than 255 characters'),
  body('label')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Label cannot be more than 100 characters'),
  body('publisher')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Publisher cannot be more than 100 characters'),
  body('explicit')
    .optional()
    .isBoolean()
    .withMessage('Explicit must be a boolean value'),
  body('iswc')
    .optional()
    .trim()
    .isLength({ max: 15 })
    .withMessage('ISWC cannot be more than 15 characters'),
  body('isni')
    .optional()
    .trim()
    .isLength({ max: 16 })
    .withMessage('ISNI cannot be more than 16 characters'),
  body('language')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Language code cannot be more than 10 characters'),

  body('releaseDate')
    .optional()
    .isISO8601()
    .withMessage('Release date must be a valid date')
    .custom((value) => {
      const releaseDate = new Date(value);
      const now = new Date();
      if (releaseDate < now) {
        throw new Error('Release date must be in the future');
      }
      return true;
    }),
    
  body('isrc')
    .optional()
    .trim()
    .isLength({ max: 24 })
    .withMessage('ISRC cannot be more than 24 characters'),
    
  body('stores')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one store must be selected')
    .custom((stores) => {
      const validStores = stores.every((store: string) => STORES.includes(store));
      if (!validStores) {
        throw new Error(`Stores must be one of: ${STORES.join(', ')}`);
      }
      return true; 
    })
];

export const approveRejectTrackValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid track ID'),
    
  body('status')
    .isIn([ReleaseStatus.APPROVED, ReleaseStatus.REJECTED])
    .withMessage('Status must be either approved or rejected'),
    
  body('rejectionReason')
    .custom((value, { req }) => {
      if (req.body.status === ReleaseStatus.REJECTED && (!value || value.trim() === '')) {
        throw new Error('Rejection reason is required when rejecting a track');
      }
      return true;
    })
]; 
