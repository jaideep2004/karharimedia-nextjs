import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AdminPermission, JWT_SECRET, UserRole } from '../config/constants';
import { ApiError } from './errorHandler.middleware';
import User from '../repositories/user.repository';

// Extended Request interface to include user property
export interface AuthRequest extends Request {
  user?: any;
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token;

    // Check if token exists in authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      throw new ApiError('Not authorized to access this route', 401);
    }

    try {
      // Verify token
      const decoded: any = jwt.verify(token, JWT_SECRET);

      // Attach user to request
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        throw new ApiError('User not found', 404);
      }

      next();
    } catch (error) {
      throw new ApiError('Not authorized, token failed', 401);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to restrict access based on user role
 * @param roles - Array of allowed roles
 */
export const authorize = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError('User not authenticated', 401));
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      next(new ApiError(`Role ${req.user.role} is not authorized to access this route`, 403));
      return;
    }

    next();
  };
};

export const authorizeAdminPermission = (permission: AdminPermission) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError('User not authenticated', 401));
      return;
    }

    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    if (req.user.role !== UserRole.SUBADMIN) {
      next(new ApiError(`Role ${req.user.role} is not authorized to access this route`, 403));
      return;
    }

    const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (!permissions.includes(permission)) {
      next(new ApiError(`Permission ${permission} is required`, 403));
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is accessing their own resource
 * @param paramField - Request parameter field containing resource owner ID
 */
export const isResourceOwner = (paramField: string = 'userId') => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError('User not authenticated', 401));
      return;
    }

    // Admin can access any resource
    if (req.user.role === UserRole.ADMIN) {
      next();
      return;
    }

    // Check if user ID matches resource owner ID
    const resourceOwnerId = req.params[paramField];
    
    if (resourceOwnerId && resourceOwnerId !== req.user.id.toString()) {
      next(new ApiError('Not authorized to access this resource', 403));
      return;
    }

    next();
  };
}; 
