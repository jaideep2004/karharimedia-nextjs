import express from 'express';
import settingsController from '../controllers/settings.controller';
import { protect, authorizeAdminPermission } from '../middleware/auth.middleware';
import { AdminPermission } from '../config/constants';

const router = express.Router();

// Public route - no auth required
router.get('/signupEnabled', settingsController.getSignupEnabled);
router.get('/maintenanceMode', settingsController.getMaintenanceMode);
router.get('/uploadLimit', settingsController.getUploadLimit);

// Admin routes - require admin or settings subadmin authentication
router.use(protect);
router.use(authorizeAdminPermission(AdminPermission.SETTINGS));

// Get all settings 
router.get('/', settingsController.getSettings);

// Get a specific setting by key
router.get('/:key', settingsController.getSetting);

// Update a setting
router.put('/:key', settingsController.updateSetting);

export default router;
