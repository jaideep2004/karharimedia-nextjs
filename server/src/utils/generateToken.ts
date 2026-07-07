import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import { IUser } from '../models/user.model';
import mongoose from 'mongoose';

/**
 * Generate a JWT token for a user
 * @param user - User for whom to generate token
 * @returns JWT token
 */
const generateToken = (user: IUser): string => {
  // Create payload with user information
  const payload = {
    id: user._id instanceof mongoose.Types.ObjectId 
      ? user._id.toString() 
      : typeof user._id === 'string' ? user._id : String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    accountType: user.accountType,
    adminPreset: user.adminPreset,
    permissions: user.permissions || [],
    supportCategories: user.supportCategories,
    verification: user.verification,
  };

  // Use the secret as string with explicit typing
  return jwt.sign(
    payload,
    JWT_SECRET as jwt.Secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export default generateToken;  
