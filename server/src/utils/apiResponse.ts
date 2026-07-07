import { Response } from 'express';

/**
 * Standard API response interface
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: any;
}

/**
 * Send a success response
 * @param res - Express response object
 * @param data - Data to send in the response
 * @param message - Success message
 * @param statusCode - HTTP status code (default: 200)
 */
export const successResponse = <T>(
  res: Response,
  data: T,
  message = 'Operation successful',
  statusCode = 200
): void => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send an error response
 * @param res - Express response object
 * @param message - Error message
 * @param error - Error object or message
 * @param statusCode - HTTP status code (default: 500)
 */
export const errorResponse = (
  res: Response,
  message = 'Server error',
  error?: any,
  statusCode = 500
): void => {
  const isApiError = typeof error?.statusCode === 'number' && typeof error?.message === 'string';
  const isDuplicateKey = error?.code === 11000;
  const duplicateField = isDuplicateKey ? Object.keys(error?.keyPattern || error?.keyValue || {})[0] : '';
  const effectiveMessage = isApiError
    ? error.message
    : isDuplicateKey && duplicateField
      ? `${duplicateField.charAt(0).toUpperCase()}${duplicateField.slice(1)} is already taken`
      : message;
  const effectiveStatus = isApiError ? error.statusCode : isDuplicateKey ? 400 : statusCode;

  res.status(effectiveStatus).json({
    success: false,
    message: effectiveMessage,
    error: process.env.NODE_ENV === 'development' ? error : undefined,
  });
};

/**
 * Send a not found response
 * @param res - Express response object
 * @param message - Error message (default: 'Resource not found')
 */
export const notFoundResponse = (
  res: Response,
  message = 'Resource not found'
): void => {
  errorResponse(res, message, undefined, 404);
};

/**
 * Send a validation error response
 * @param res - Express response object
 * @param message - Error message (default: 'Validation error')
 * @param error - Validation error details
 */
export const validationErrorResponse = (
  res: Response,
  message = 'Validation error',
  error?: any
): void => {
  errorResponse(res, message, error, 400);
}; 
