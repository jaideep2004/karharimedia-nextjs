import { body, param, query } from 'express-validator';
import { STORES } from '../config/constants';

export const createRoyaltyValidator = [
  body('trackId')
    .isMongoId()
    .withMessage('Invalid track ID'),
    
  body('artistId')
    .isMongoId()
    .withMessage('Invalid artist ID'),
    
  body('store')
    .trim()
    .notEmpty()
    .withMessage('Store is required')
    .isIn(STORES)
    .withMessage(`Store must be one of: ${STORES.join(', ')}`),
    
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      if (parseFloat(value) < 0) {
        throw new Error('Amount cannot be negative');
      }
      return true;
    }),
    
  body('currency')
    .trim()
    .notEmpty()
    .withMessage('Currency is required')
    .isIn(['USD', 'EUR', 'GBP', 'INR', 'JPY'])
    .withMessage('Currency must be one of: USD, EUR, GBP, INR, JPY'),
    
  body('reportingDate')
    .notEmpty()
    .withMessage('Reporting date is required')
    .isISO8601()
    .withMessage('Reporting date must be a valid date'),
    
  body('streamCount')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stream count must be a non-negative integer')
];

export const getRoyaltiesValidator = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
    
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
    .custom((value, { req }) => {
      if (req.query?.startDate && value) {
        const startDate = new Date(req.query.startDate as string);
        const endDate = new Date(value);
        if (endDate < startDate) {
          throw new Error('End date must be after start date');
        }
      }
      return true;
    }),
    
  query('store')
    .optional()
    .isIn(STORES)
    .withMessage(`Store must be one of: ${STORES.join(', ')}`),
    
  query('trackId')
    .optional()
    .isMongoId()
    .withMessage('Invalid track ID')
];

export const getRoyaltyByIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid royalty ID')
]; 