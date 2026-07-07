import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, ValidationError } from 'express-validator';
import { validationErrorResponse } from '../utils/apiResponse';

/**
 * Middleware to validate request using express-validator
 * @param validations - Array of validation chains
 * @returns Middleware function
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    // Check for validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const formattedErrors = errors.array().map((err: ValidationError) => {
      // Handle both types of validation errors by checking if properties exist
      return {
        field: 'path' in err ? err.path : err.type,
        message: err.msg,
        value: 'value' in err ? err.value : undefined
      };
    }); 

    // Return validation error response
    validationErrorResponse(res, 'Validation failed', formattedErrors);
  };
}; 