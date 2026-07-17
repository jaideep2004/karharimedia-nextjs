import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth.middleware';
import User from '../repositories/user.repository';
import PendingSignup from '../models/pendingSignup.model';
import SettingsModel from '../models/settings.model';
import generateToken from '../utils/generateToken';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { ApiError } from '../middleware/errorHandler.middleware';
import {
  generateOtp,
  getOtpExpiry,
  hashOtp,
  sendAmazeSmsOtp,
  sendEmailMessage,
  sendEmailOtp,
  verifyOtpHash,
} from '../services/otp.service';
import { buildDashboardUrl, sendUserAndAdminEmail } from '../services/emailNotification.service';
import { getFileUrl, uploadToR2 } from '../utils/fileUpload';
import { getStorageProvider } from '../config/urlResolver';
import { getFrontendUrl } from '../utils/frontendUrl';

// Escape special regex characters in a string
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseJsonObject = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, string>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalizeUpper = (value: unknown) => String(value || '').trim().toUpperCase();
const hasNumber = (value: unknown) => /\d/.test(String(value || ''));

const getUploadedFileUrl = (
  files: Record<string, Express.Multer.File[]> | undefined,
  field: string
) => {
  const file = files?.[field]?.[0];
  return file?.filename ? `/uploads/registration/${file.filename}` : '';
};

const authPayload = (user: any) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  artistName: user.artistName,
  accountType: user.accountType,
  adminPreset: user.adminPreset,
  permissions: user.permissions || [],
  supportCategories: user.supportCategories,
  verification: user.verification,
  token: generateToken(user),
});

/**
 * Check artist name availability
 * @route GET /api/auth/check-artist-name
 * @access Public
 */
export const checkArtistName = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.query;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      throw new ApiError('Name query parameter is required', 400);
    }

    const exists = await User.findOne({
      artistName: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
    });

    successResponse(res, { available: !exists }, 'Artist name availability checked');
  } catch (error) {
    errorResponse(res, 'Failed to check artist name', error);
  }
};

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Public
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if signups are enabled
    const signupSetting = await SettingsModel.findOne({ key: 'signupEnabled' });
    const signupsEnabled = signupSetting ? signupSetting.value === true : true;

    if (!signupsEnabled && (!req.body.role || req.body.role !== 'admin')) {
      throw new ApiError('New user registration is currently disabled', 403);
    }

    const {
      email,
      password,
      name,
      role,
      accountType,
      // artist fields
      artistName,
      legalName,
      idType,
      idNumber,
      legalAddress,
      phoneNumber,
      numberOfTracks,
      numberOfReleases,
      // label fields
      labelName,
      registrationType,
      legalEntityName,
      companyType,
      totalArtists,
      totalRevenue,
      catalogSize,
      rightsType,
      companyWebsite,
      socialLinks,
      bio,
      verification,
    } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      throw new ApiError('User already exists with this email', 400);
    }

    if (hasNumber(name)) {
      throw new ApiError('Full name cannot contain numbers', 400);
    }

    // Check artist name uniqueness
    if (artistName) {
      const artistNameExists = await User.findOne({
        artistName: { $regex: new RegExp(`^${escapeRegex(artistName)}$`, 'i') },
      });
      if (artistNameExists) {
        throw new ApiError('Artist name is already taken', 400);
      }
    }

    // Build onboarding sub-document
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    let onboarding: Record<string, unknown> | undefined;

    if (accountType === 'artist') {
      onboarding = {
        legalName,
        idType,
        idNumber,
        legalAddress,
        phoneNumber,
        numberOfTracks: Number(numberOfTracks) || 0,
        numberOfReleases: Number(numberOfReleases) || 0,
        governmentIdFile: files?.governmentIdFile?.[0]?.path || '',
      };
    } else if (accountType === 'label') {
      const parsedSocialLinks =
        typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;

      onboarding = {
        labelName,
        registrationType,
        legalName: registrationType === 'individual' ? legalName : undefined,
        labelGovIdFile:
          registrationType === 'individual'
            ? files?.labelGovIdFile?.[0]?.path || ''
            : undefined,
        legalEntityName:
          registrationType === 'registered_company' ? legalEntityName : undefined,
        companyType: registrationType === 'registered_company' ? companyType : undefined,
        certificateFile:
          registrationType === 'registered_company'
            ? companyType === 'private'
              ? files?.incorporationCertFile?.[0]?.path || ''
              : files?.gstCertFile?.[0]?.path || ''
            : undefined,
        totalArtists: Number(totalArtists) || 0,
        totalRevenue: Number(totalRevenue) || 0,
        catalogSize: Number(catalogSize) || 0,
        rightsType,
        companyWebsite: companyWebsite || undefined,
        socialLinks: parsedSocialLinks || undefined,
      };
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || (accountType === 'label' ? 'label' : 'artist'),
      accountType,
      artistName: artistName || undefined,
      bio,
      onboarding,
      verification: {
        status: 'pending',
        mobileProvider: verification?.mobileProvider || verification?.mobileVerificationProvider,
        kycProvider: verification?.kycProvider,
        consent: verification?.consent === true || verification?.kycConsent === true,
        phoneNumber: verification?.phoneNumber || verification?.verificationPhoneNumber,
      },
    });

    // Generate token
    const token = generateToken(user);

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `Welcome to Karhari Media Distribution, ${user.name}`,
        title: 'Account Created',
        intro: `${user.name} now has a Karhari Media Distribution account.`,
        details: {
          User: user.name,
          Email: user.email,
          Role: user.role,
        },
        actionLabel: 'Open Dashboard',
        actionUrl: buildDashboardUrl(user.role === 'admin' || user.role === 'subadmin' ? '/admin/dashboard' : '/dashboard'),
      },
      'email_on_account_created'
    ).catch((error) => console.warn('Account creation email skipped:', error));

    successResponse(
      res,
      {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        artistName: user.artistName,
        accountType: user.accountType,
        verification: user.verification,
        token,
      },
      'User registered successfully',
      201
    );
  } catch (error) {
    errorResponse(res, 'Registration failed', error);
  }
};

export const startSignup = async (req: Request, res: Response): Promise<void> => {
  try {
    const signupSetting = await SettingsModel.findOne({ key: 'signupEnabled' });
    const signupsEnabled = signupSetting ? signupSetting.value === true : true;

    if (!signupsEnabled) {
      throw new ApiError('New user registration is currently disabled', 403);
    }

    const { email, password, name, accountType, phoneNumber, verification } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const mobile = String(verification?.phoneNumber || phoneNumber || '').trim();

    if (!normalizedEmail || !password || !name) {
      throw new ApiError('Name, email, and password are required', 400);
    }

    if (hasNumber(name)) {
      throw new ApiError('Full name cannot contain numbers', 400);
    }

    if (!/^\+?[0-9]{10,15}$/.test(mobile)) {
      throw new ApiError('Valid mobile number is required for OTP verification', 400);
    }

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      throw new ApiError('User already exists with this email', 400);
    }

    const mobileExists = await User.exists({ 'verification.phoneNumber': mobile });
    if (mobileExists) {
      throw new ApiError('Mobile number is already taken', 400);
    }

    const pendingMobileExists = await PendingSignup.exists({
      phoneNumber: mobile,
      email: { $ne: normalizedEmail },
      expiresAt: { $gt: new Date() },
    });
    if (pendingMobileExists) {
      throw new ApiError('Mobile number is already taken', 400);
    }

    const emailOtp = generateOtp();
    const smsOtp = generateOtp();
    await PendingSignup.findOneAndUpdate(
      { email: normalizedEmail },
      {
        email: normalizedEmail,
        phoneNumber: mobile,
        payload: { ...req.body, email: normalizedEmail, accountType: accountType || 'artist' },
        emailOtpHash: hashOtp(emailOtp),
        smsOtpHash: hashOtp(smsOtp),
        emailVerified: false,
        smsVerified: false,
        attempts: 0,
        expiresAt: getOtpExpiry(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Promise.all([sendEmailOtp(normalizedEmail, emailOtp), sendAmazeSmsOtp(mobile, smsOtp)]);

    successResponse(res, { email: normalizedEmail, phoneNumber: mobile }, 'OTP sent successfully');
  } catch (error) {
    errorResponse(res, 'Failed to start signup verification', error);
  }
};

export const verifySignup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, emailOtp, smsOtp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const pending = await PendingSignup.findOne({ email: normalizedEmail });

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      throw new ApiError('OTP session expired. Please restart signup.', 400);
    }

    if (pending.attempts >= 5) {
      throw new ApiError('Too many OTP attempts. Please restart signup.', 429);
    }

    pending.attempts += 1;
    if (emailOtp && verifyOtpHash(String(emailOtp), pending.emailOtpHash)) {
      pending.emailVerified = true;
    }
    if (smsOtp && verifyOtpHash(String(smsOtp), pending.smsOtpHash)) {
      pending.smsVerified = true;
    }

    if (!pending.emailVerified || !pending.smsVerified) {
      await pending.save();
      throw new ApiError('Both email and mobile OTP must be verified', 400);
    }

    const payload = pending.payload as any;
    if (hasNumber(payload.name)) {
      throw new ApiError('Full name cannot contain numbers', 400);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new ApiError('User already exists with this email', 400);
    }

    const existingMobile = await User.exists({ 'verification.phoneNumber': pending.phoneNumber });
    if (existingMobile) {
      throw new ApiError('Mobile number is already taken', 400);
    }

    const user = await User.create({
      name: payload.name,
      email: normalizedEmail,
      password: payload.password,
      role: payload.accountType === 'label' ? 'label' : 'artist',
      accountType: payload.accountType,
      artistName: payload.artistName || payload.name,
      bio: payload.bio,
      verification: {
        status: 'pending',
        mobileProvider: 'amaze',
        consent: false,
        phoneNumber: pending.phoneNumber,
      },
    });

    await pending.deleteOne();

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `Welcome to Karhari Media Distribution, ${user.name}`,
        title: 'Account Created',
        intro: `${user.name} completed signup and can now submit KYC.`,
        details: {
          User: user.name,
          Email: user.email,
          Role: user.role,
          Mobile: pending.phoneNumber,
        },
        actionLabel: 'Open Dashboard',
        actionUrl: buildDashboardUrl('/dashboard'),
      },
      'email_on_signup_completed'
    ).catch((error) => console.warn('Signup email skipped:', error));

    successResponse(res, authPayload(user), 'User registered successfully', 201);
  } catch (error) {
    errorResponse(res, 'Signup verification failed', error);
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 * @access Public
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new ApiError('Invalid email or password', 401);
    }

    // Generate token
    const token = generateToken(user);

    // Return user data and token
    successResponse(res, {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      artistName: user.artistName,
      accountType: user.accountType,
      adminPreset: user.adminPreset,
      permissions: user.permissions || [],
      supportCategories: user.supportCategories,
      verification: user.verification,
      token
    }, 'Login successful');
  } catch (error) {
    errorResponse(res, 'Login failed', error);
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = hashOtp(token);
      user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();

      const origin = getFrontendUrl();
      const resetUrl = `${origin.replace(/\/$/, '')}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      await sendEmailMessage(
        email,
        'Reset Your Karhari Media Distribution Password',
        `Use this secure link to reset your Karhari Media Distribution password: ${resetUrl}\n\nThis link expires in 30 minutes.`
      );
    }

    successResponse(res, null, 'If an account exists, reset instructions have been sent');
  } catch (error) {
    errorResponse(res, 'Failed to request password reset', error);
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, token, password } = req.body;
    if (!password || String(password).length < 8) {
      throw new ApiError('Password must be at least 8 characters', 400);
    }

    const user = await User.findOne({
      email: String(email || '').trim().toLowerCase(),
      resetPasswordToken: hashOtp(String(token || '')),
      resetPasswordExpires: { $gt: new Date() },
    }).select('+password');

    if (!user) {
      throw new ApiError('Reset link is invalid or expired', 400);
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    errorResponse(res, 'Failed to reset password', error);
  }
};

/**
 * Get current user profile
 * @route GET /api/auth/me
 * @access Private
 */
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    successResponse(res, {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      artistName: user.artistName,
      accountType: user.accountType,
      adminPreset: user.adminPreset,
      permissions: user.permissions || [],
      supportCategories: user.supportCategories,
      verification: user.verification || { status: 'pending' },
      bio: user.bio,
      socialLinks: user.socialLinks,
      profilePicture: user.profilePicture,
      payoutMethod: user.payoutMethod,
      onboarding: user.onboarding,
      createdAt: user.createdAt
    }, 'User profile retrieved successfully');
  } catch (error) {
    errorResponse(res, 'Failed to get user profile', error);
  }
};

/**
 * Submit current user's KYC data
 * @route PUT /api/auth/me/kyc
 * @access Private
 */
export const submitKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    if (user.verification?.status === 'submitted') {
      throw new ApiError('KYC is already submitted and under admin review', 400);
    }

    if (user.verification?.status === 'approved') {
      throw new ApiError('KYC is already approved', 400);
    }

    const {
      region,
      accountType,
      artistName,
      legalName,
      idType,
      idNumber,
      aadhaarNumber,
      panNumber,
      legalAddress,
      phoneNumber,
      numberOfTracks,
      numberOfReleases,
      labelName,
      registrationType,
      labelLegalName,
      legalEntityName,
      companyType,
      totalArtists,
      totalRevenue,
      catalogSize,
      rightsType,
      companyWebsite,
      socialLinks,
      mobileVerificationProvider,
      kycProvider,
      kycConsent,
      location,
      payoutMethod,
      notes,
    } = req.body;
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const normalizedRegion = region === 'international' ? 'international' : 'india';
    const locationData = parseJsonObject(location);
    const payoutData = parseJsonObject(payoutMethod) as {
      method?: 'bank_transfer' | 'paypal';
      details?: Record<string, string>;
    };
    const aadhaar = normalizeDigits(aadhaarNumber || idNumber);
    const pan = normalizeUpper(panNumber || idNumber);

    const hasKycConsent = kycConsent === true || kycConsent === 'true';

    if (!hasKycConsent) {
      throw new ApiError('KYC consent is required', 400);
    }

    if (!legalAddress || !phoneNumber) {
      throw new ApiError('Phone number and address are required', 400);
    }

    if (normalizedRegion === 'india') {
      if (!/^\d{12}$/.test(aadhaar)) {
        throw new ApiError('Valid 12 digit Aadhaar number is required', 400);
      }
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        throw new ApiError('Valid PAN number is required', 400);
      }
      if (payoutData.method !== 'bank_transfer') {
        throw new ApiError('Indian users must submit bank transfer details', 400);
      }
      const ifsc = normalizeUpper(payoutData.details?.ifscCode);
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        throw new ApiError('Valid IFSC code is required', 400);
      }
      if (
        !payoutData.details?.accountHolderName ||
        !payoutData.details?.accountNumber ||
        payoutData.details.accountNumber !== payoutData.details.confirmAccountNumber
      ) {
        throw new ApiError('Valid matching bank account details are required', 400);
      }
    } else {
      if (payoutData.method !== 'paypal' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payoutData.details?.paypalEmail || ''))) {
        throw new ApiError('Valid PayPal email is required for international users', 400);
      }
    }

    const documents = {
      aadhaarFront: getUploadedFileUrl(files, 'aadhaarFrontFile'),
      aadhaarBack: getUploadedFileUrl(files, 'aadhaarBackFile'),
      panCard: getUploadedFileUrl(files, 'panCardFile'),
      nationalIdFront: getUploadedFileUrl(files, 'nationalIdFrontFile'),
      nationalIdBack: getUploadedFileUrl(files, 'nationalIdBackFile'),
    };

    if (
      normalizedRegion === 'india' &&
      (!documents.aadhaarFront || !documents.aadhaarBack || !documents.panCard)
    ) {
      throw new ApiError('Aadhaar front, Aadhaar back, and PAN card are required', 400);
    }

    if (normalizedRegion === 'international' && !documents.nationalIdFront) {
      throw new ApiError('National ID front is required', 400);
    }

    if (accountType === 'artist') {
      user.role = 'artist' as any;
      user.accountType = 'artist';
      user.artistName = artistName || user.artistName;
      user.onboarding = {
        region: normalizedRegion,
        legalName,
        idType: normalizedRegion === 'india' ? 'aadhaar' : idType || 'national_id',
        idNumber: normalizedRegion === 'india' ? aadhaar : idNumber,
        aadhaarNumber: normalizedRegion === 'india' ? aadhaar : undefined,
        panNumber: normalizedRegion === 'india' ? pan : undefined,
        legalAddress,
        phoneNumber,
        location: locationData,
        documents,
        payoutMethod: {
          method: payoutData.method,
          details: payoutData.details || {},
          updatedAt: new Date(),
        },
        numberOfTracks: Number(numberOfTracks) || 0,
        numberOfReleases: Number(numberOfReleases) || 0,
        governmentIdFile: documents.aadhaarFront || documents.nationalIdFront || '',
      } as any;
    } else if (accountType === 'label') {
      user.role = 'label' as any;
      user.accountType = 'label';
      user.onboarding = {
        region: normalizedRegion,
        labelName,
        registrationType,
        legalName: registrationType === 'individual' ? labelLegalName : undefined,
        legalEntityName: registrationType === 'registered_company' ? legalEntityName : undefined,
        companyType: registrationType === 'registered_company' ? companyType : undefined,
        legalAddress,
        phoneNumber,
        aadhaarNumber: normalizedRegion === 'india' ? aadhaar : undefined,
        panNumber: normalizedRegion === 'india' ? pan : undefined,
        idNumber: normalizedRegion === 'international' ? idNumber : undefined,
        location: locationData,
        documents,
        payoutMethod: {
          method: payoutData.method,
          details: payoutData.details || {},
          updatedAt: new Date(),
        },
        totalArtists: Number(totalArtists) || 0,
        totalRevenue: Number(totalRevenue) || 0,
        catalogSize: Number(catalogSize) || 0,
        rightsType,
        companyWebsite: companyWebsite || undefined,
        socialLinks: socialLinks || undefined,
      } as any;
    }

    user.verification = {
      ...(user.verification || {}),
      status: 'submitted',
      mobileProvider: mobileVerificationProvider || 'sandbox',
      kycProvider: kycProvider || 'sandbox',
      consent: true,
      phoneNumber,
      submittedAt: new Date(),
      rejectionReason: undefined,
      notes: notes || `Manual ${normalizedRegion} KYC submitted`,
    };

    user.payoutMethod = {
      method: payoutData.method as any,
      details: payoutData.details || {},
      updatedAt: new Date(),
    };

    await user.save();

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `KYC submitted for review: ${user.name}`,
        title: 'KYC Submitted',
        intro: `${user.name} submitted KYC details for admin review.`,
        details: {
          User: user.name,
          Email: user.email,
          Account: user.accountType || user.role,
          Region: normalizedRegion,
          Status: 'submitted',
        },
        actionLabel: 'Review User',
        actionUrl: buildDashboardUrl(`/admin/users/${user._id}`),
      },
      'email_on_kyc_submitted'
    ).catch((error) => console.warn('KYC submission email skipped:', error));

    successResponse(
      res,
      {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        artistName: user.artistName,
        verification: user.verification,
        onboarding: user.onboarding,
        payoutMethod: user.payoutMethod,
      },
      'KYC submitted successfully'
    );
  } catch (error) {
    errorResponse(res, 'Failed to submit KYC', error);
  }
};

/**
 * Update user profile
 * @route PUT /api/auth/me
 * @access Private
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, artistName, bio, socialLinks, payoutMethod } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Update fields
    if (name) user.name = name;
    if (artistName) user.artistName = artistName;
    if (bio !== undefined) user.bio = bio;
    if (socialLinks) {
      user.socialLinks = {
        ...user.socialLinks,
        ...socialLinks
      };
    }
    if (payoutMethod?.method) {
      if (user.payoutMethod?.method) {
        throw new ApiError('Payout method is already saved. Contact admin to change it.', 400);
      }
      user.payoutMethod = {
        method: payoutMethod.method,
        details: payoutMethod.details || {},
        updatedAt: new Date(),
      };
    }

    await user.save();

    void sendUserAndAdminEmail(
      { name: user.name, email: user.email },
      {
        subject: `Karhari Media Distribution profile updated for ${user.name}`,
        title: 'Profile Updated',
        intro: `${user.name} updated profile details.`,
        details: {
          User: user.name,
          Email: user.email,
          Role: user.role,
        },
        actionLabel: 'Open Profile',
        actionUrl: buildDashboardUrl('/dashboard/profile'),
      },
      'email_on_profile_updated'
    ).catch((error) => console.warn('Profile update email skipped:', error));

    successResponse(res, {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      artistName: user.artistName,
      bio: user.bio,
      socialLinks: user.socialLinks,
      profilePicture: user.profilePicture,
      payoutMethod: user.payoutMethod,
      onboarding: user.onboarding,
    }, 'Profile updated successfully');
  } catch (error) {
    errorResponse(res, 'Failed to update profile', error);
  }
};

export const updateProfilePicture = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new ApiError('Profile image is required', 400);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    await uploadToR2(file, 'artwork');
    const sp = getStorageProvider({});
    user.profilePictureFile = file.filename;
    user.storageProvider = sp as any;
    await user.save();

    const profilePictureUrl = getFileUrl(file.filename, 'image', sp);

    successResponse(res, {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      artistName: user.artistName,
      accountType: user.accountType,
      profilePicture: profilePictureUrl,
      verification: user.verification,
      onboarding: user.onboarding,
      payoutMethod: user.payoutMethod,
    }, 'Profile image updated');
  } catch (error) {
    errorResponse(res, 'Failed to update profile image', error);
  }
};

/**
 * Change password
 * @route PUT /api/auth/change-password
 * @access Private
 */
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError('Current password is incorrect', 401);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    errorResponse(res, 'Failed to change password', error);
  }
}; 
