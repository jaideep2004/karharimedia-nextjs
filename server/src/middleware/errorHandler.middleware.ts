import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/apiResponse';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle 404 errors for routes that don't exist
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  errorResponse(res, `Route not found: ${req.originalUrl}`, undefined, 404);
};

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  console.error('Error:', err);
  
  // Handle ApiError instances
  if (err instanceof ApiError) {
    errorResponse(res, err.message, err, err.statusCode);
    return;
  }
  
  // Handle mongoose validation errors
  if (err.name === 'ValidationError') {
    errorResponse(res, 'Validation Error', err, 400);
    return;
  }
  
  // Handle mongoose cast errors (e.g., invalid ObjectId)
  if (err.name === 'CastError') {
    errorResponse(res, 'Invalid ID format', err, 400);
    return;
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    errorResponse(res, 'Invalid token', err, 401);
    return;
  }
  
  // Handle expired JWT tokens
  if (err.name === 'TokenExpiredError') {
    errorResponse(res, 'Token expired', err, 401);
    return;
  }
  
  // Default error handler
  errorResponse(res, err.message || 'Server Error', err);
}; 