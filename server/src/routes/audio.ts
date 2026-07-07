import express from 'express';
import multer from 'multer';
import path from 'path';
import {
  acrCloudCallbackHandler,
  analyzeAudioHandler,
  getAcrCloudScanResultHandler,
  identifyWithAcrCloudHandler,
  scanWithAcrCloudHandler,
} from '../controllers/audioController';
import { protect, authorize } from '../middleware/auth.middleware';
import { UPLOAD_DIR, UserRole } from '../config/constants';

const router = express.Router();

// Use multer for file uploads
const upload = multer({ dest: path.join(UPLOAD_DIR, 'tmp') });

// POST /api/audio/analyze
router.post('/analyze', upload.single('file'), analyzeAudioHandler);

router.post(
  '/acr/identify',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  upload.single('file'),
  identifyWithAcrCloudHandler
);

router.post(
  '/acr/scan',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  upload.single('file'),
  scanWithAcrCloudHandler
);

router.get(
  '/acr/scan/:fileId',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  getAcrCloudScanResultHandler
);

router.post('/acr/callback', acrCloudCallbackHandler);

export default router;
    
