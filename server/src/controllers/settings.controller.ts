import { Request, Response } from 'express';
import httpStatus from 'http-status';
import SettingsModel from '../models/settings.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

const getSettings = catchAsync(async (req: Request, res: Response) => {
  const settings = await SettingsModel.find({});
  res.status(httpStatus.OK).json({
    success: true,
    data: settings,
  });
});

const getSetting = catchAsync(async (req: Request, res: Response) => {
  const { key } = req.params;
  const setting = await SettingsModel.findOne({ key });
  
  if (!setting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Setting not found');
  }
  
  res.status(httpStatus.OK).json({
    success: true,
    data: setting,
  });
});

// Public method to get signup enabled status - no auth required
const getSignupEnabled = catchAsync(async (req: Request, res: Response) => {
  const setting = await SettingsModel.findOne({ key: 'signupEnabled' });
  
  // Default to enabled if setting doesn't exist
  const enabled = setting ? setting.value : true;
  
  res.status(httpStatus.OK).json({
    success: true,
    data: {
      key: 'signupEnabled',
      value: enabled,
      description: 'Whether new user signups are enabled'
    },
  });
});

const getMaintenanceMode = catchAsync(async (_req: Request, res: Response) => {
  const setting = await SettingsModel.findOne({ key: 'maintenanceMode' });
  const enabled = setting ? setting.value === true : false;

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      key: 'maintenanceMode',
      value: enabled,
      description: 'Whether user dashboard maintenance mode is enabled',
    },
  });
});

const getUploadLimit = catchAsync(async (_req: Request, res: Response) => {
  const [sizeSetting, fileTypesSetting] = await Promise.all([
    SettingsModel.findOne({ key: 'maxUploadSize' }),
    SettingsModel.findOne({ key: 'allowedFileTypes' }),
  ]);
  const value = Number(sizeSetting?.value || 100);
  const maxUploadSize = Math.min(200, Math.max(1, Number.isFinite(value) ? value : 100));
  const allowedFileTypes = Array.isArray(fileTypesSetting?.value)
    ? fileTypesSetting.value
    : ['mp3', 'wav', 'aac', 'flac'];

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      key: 'maxUploadSize',
      value: maxUploadSize,
      allowedFileTypes,
      description: 'Maximum user audio upload size in MB',
    },
  });
});

const normalizeSettingValue = (key: string, value: unknown) => {
  const booleanKeys = [
    'signupEnabled',
    'maintenanceMode',
    'enableEmailNotifications',
    'email_on_release_submitted',
    'email_on_release_approved',
    'email_on_release_rejected',
    'email_on_gs1_upc_assigned',
    'email_on_gs1_upc_failed',
    'email_on_account_created',
    'email_on_signup_completed',
    'email_on_kyc_submitted',
    'email_on_profile_updated',
    'email_on_admin_user_created',
    'email_on_admin_user_updated',
    'email_on_kyc_reviewed',
  ];
  if (booleanKeys.includes(key)) {
    return value === true;
  }

  if (key === 'maxUploadSize') {
    const size = Number(value);
    if (!Number.isFinite(size) || size < 1 || size > 200) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Maximum upload size must be between 1 and 200 MB');
    }
    return size;
  }

  if (key === 'allowedFileTypes') {
    if (!Array.isArray(value)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Allowed file types must be an array');
    }
    const types = Array.from(
      new Set(
        value
          .map(item => String(item || '').trim().toLowerCase().replace(/^\./, ''))
          .filter(item => /^[a-z0-9]+$/.test(item))
      )
    );
    if (!types.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'At least one audio file type is required');
    }
    return types;
  }

  if (key === 'currency') {
    const currency = String(value || '').toUpperCase();
    if (!['USD', 'INR'].includes(currency)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Currency must be USD or INR');
    }
    return currency;
  }

  if (key === 'paymentGateway') {
    const gateway = String(value || '').toLowerCase();
    if (!['paypal', 'bank_transfer'].includes(gateway)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment gateway must be PayPal or bank transfer');
    }
    return gateway;
  }

  return value;
};

const updateSetting = catchAsync(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value, description } = req.body;
  
  if (value === undefined) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Value is required');
  }
  
  const normalizedValue = normalizeSettingValue(key, value);

  const setting = await SettingsModel.findOneAndUpdate(
    { key },
    { value: normalizedValue, description },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  
  res.status(httpStatus.OK).json({
    success: true,
    data: setting,
  });
});

// Initialize default settings if they don't exist
const initializeDefaultSettings = async () => {
  const defaultSettings = [
    { 
      key: 'signupEnabled', 
      value: true, 
      description: 'Whether new user signups are enabled' 
    },
    { key: 'maintenanceMode', value: false, description: 'Whether user dashboard maintenance mode is enabled' },
    { key: 'maxUploadSize', value: 100, description: 'Maximum user audio upload size in MB' },
    { key: 'allowedFileTypes', value: ['mp3', 'wav', 'aac', 'flac'], description: 'Allowed user audio file extensions' },
    { key: 'currency', value: 'USD', description: 'Default payout currency' },
    { key: 'paymentGateway', value: 'paypal', description: 'Default payout method gateway' },
    { key: 'enableEmailNotifications', value: true, description: 'Whether email notifications are enabled' },
  ];

  for (const setting of defaultSettings) {
    await SettingsModel.findOneAndUpdate(
      { key: setting.key },
      { $setOnInsert: setting },
      { upsert: true, new: true }
    );
  }
};

export default {
  getSettings,
  getSetting,
  getSignupEnabled,
  getMaintenanceMode,
  getUploadLimit,
  updateSetting,
  initializeDefaultSettings,
};
