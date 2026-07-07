import { Router } from 'express';
import { uploadAudio, uploadImage, getFileUrl } from '../utils/fileUpload';
import { protect, authorize } from '../middleware/auth.middleware';
import { UserRole } from '../config/constants';
import { isAcrCloudFileScanningConfigured, uploadFirstThirtySecondsForScan } from '../services/acrCloud.service';
import SettingsModel from '../models/settings.model';
import fs from 'fs/promises';

const router = Router();

// Upload artwork image
router.post(
  '/artwork',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  uploadImage.single('artwork'),
  (req, res) => {
  // @ts-ignore multer adds file
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ success: false, error: 'No artwork file provided' });
  }
  const filename = file.filename;
  const url = getFileUrl(filename, 'image');
  return res.json({ success: true, filename, originalName: file.originalname, url });
  }
);

// Upload audio file
router.post(
  '/audio',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  uploadAudio.single('audio'),
  async (req, res) => {
  // @ts-ignore multer adds file
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ success: false, error: 'No audio file provided' });
  }
  const maxUploadSizeMb = Math.min(
    200,
    Math.max(1, Number((await SettingsModel.findOne({ key: 'maxUploadSize' }).lean())?.value || 100))
  );
  if (file.size > maxUploadSizeMb * 1024 * 1024) {
    await fs.unlink(file.path).catch(() => undefined);
    return res.status(413).json({
      success: false,
      error: `Audio file exceeds the ${maxUploadSizeMb} MB admin upload limit`,
    });
  }
  const filename = file.filename;
  const url = getFileUrl(filename, 'audio');
  let acrCloud;

  if (isAcrCloudFileScanningConfigured()) {
    try {
      console.log('[ACRCloud] Upload scan starting', {
        filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        sampleSeconds: 30,
      });
      acrCloud = await uploadFirstThirtySecondsForScan(file.path, file.originalname, 'audio');
      console.log('[ACRCloud] Upload scan submitted', {
        filename,
        fileId: acrCloud.fileId,
        state: acrCloud.state,
        aiDetections: acrCloud.aiDetection?.length ?? 0,
        fingerprintMatches: acrCloud.fingerprintMatches?.length ?? 0,
      });
    } catch (error) {
      console.error('[ACRCloud] Upload scan failed', {
        filename,
        originalName: file.originalname,
        error: error instanceof Error ? error.message : error,
      });
      acrCloud = {
        state: 'error',
        lastError: error instanceof Error ? error.message : 'ACRCloud scan failed'
      };
    }
  } else {
    console.warn('[ACRCloud] Upload scan skipped: file scanning is not configured', {
      filename,
      requiredEnv: ['ACRCLOUD_CONSOLE_TOKEN', 'ACRCLOUD_FS_REGION', 'ACRCLOUD_FS_CONTAINER_ID'],
    });
    acrCloud = {
      state: 'not_configured',
      lastError: 'ACRCloud 30-second file scanning is not configured'
    };
  }

  return res.json({ success: true, filename, originalName: file.originalname, url, acrCloud });
  }
);

export default router;
