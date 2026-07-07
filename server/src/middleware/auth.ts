import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../repositories/user.repository';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any; // Consider defining a proper User type
    }
  }
}

// Verify JWT token
export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'No token provided'));
  } 

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    next(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired token'));
  }
};

// Check if user has admin role
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user?.id);
    
    if (!user) {
      return next(new ApiError(httpStatus.NOT_FOUND, 'User not found'));
    }

    if (user.role !== 'admin') {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Admin access required'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default {
  verifyToken,
  isAdmin,
};
