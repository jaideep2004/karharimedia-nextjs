import { body } from 'express-validator';
import { UserRole } from '../config/constants';

export const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),

  body('role')
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage(`Role must be one of: ${Object.values(UserRole).join(', ')}`),

  body('accountType')
    .optional()
    .isIn(['artist', 'label'])
    .withMessage('Account type must be artist or label'),

  // Artist fields
  body('artistName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Artist name must be between 1 and 100 characters'),

  body('legalName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Legal name must be between 1 and 100 characters'),

  body('idType')
    .optional()
    .isIn(['pan', 'aadhaar'])
    .withMessage('ID type must be pan or aadhaar'),

  body('idNumber').optional().trim().notEmpty().withMessage('ID number is required'),

  body('legalAddress').optional().trim().notEmpty().withMessage('Legal address is required'),

  body('phoneNumber')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{10,15}$/)
    .withMessage('Enter a valid phone number (10–15 digits)'),

  body('numberOfTracks')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Number of tracks must be a non-negative integer'),

  body('numberOfReleases')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Number of releases must be a non-negative integer'),

  // Label fields
  body('labelName').optional().trim().notEmpty().withMessage('Label name is required'),

  body('registrationType')
    .optional()
    .isIn(['individual', 'registered_company'])
    .withMessage('Registration type must be individual or registered_company'),

  body('legalEntityName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Legal entity name is required'),

  body('companyType')
    .optional()
    .isIn(['private', 'public'])
    .withMessage('Company type must be private or public'),

  body('totalArtists')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total artists must be a non-negative integer'),

  body('totalRevenue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total revenue must be a non-negative number'),

  body('catalogSize')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Catalog size must be a non-negative integer'),

  body('rightsType')
    .optional()
    .isIn(['exclusive', 'non_exclusive'])
    .withMessage('Rights type must be exclusive or non_exclusive'),

  body('companyWebsite')
    .optional()
    .trim()
    .isURL()
    .withMessage('Enter a valid URL (e.g. https://example.com)'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot be more than 500 characters'),
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
    
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
];

export const updateProfileValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
    
  body('artistName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Artist name must be between 2 and 50 characters'),
    
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot be more than 500 characters'),
    
  body('socialLinks')
    .optional()
    .isObject()
    .withMessage('Social links must be an object'),
    
  body('socialLinks.website')
    .optional()
    .trim()
    .isURL()
    .withMessage('Website must be a valid URL'),
    
  body('socialLinks.instagram')
    .optional()
    .trim()
    .isString()
    .withMessage('Instagram handle must be a string'),
    
  body('socialLinks.twitter')
    .optional()
    .trim()
    .isString()
    .withMessage('Twitter handle must be a string'),
    
  body('socialLinks.facebook')
    .optional()
    .trim()
    .isString()
    .withMessage('Facebook handle must be a string')
];

export const changePasswordValidator = [
  body('currentPassword')
    .trim()
    .notEmpty()
    .withMessage('Current password is required'),
    
  body('newPassword')
    .trim()
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
]; 