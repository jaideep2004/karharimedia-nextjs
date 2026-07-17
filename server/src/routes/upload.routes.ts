import { Router } from 'express';
import { uploadAudio, uploadImage, getFileUrl, uploadToR2, getDirectoryForType } from '../utils/fileUpload';
import { protect, authorize } from '../middleware/auth.middleware';
import { UserRole } from '../config/constants';
import { isAcrCloudFileScanningConfigured, uploadFirstThirtySecondsForScan } from '../services/acrCloud.service';
import SettingsModel from '../models/settings.model';
import fs from 'fs/promises';

const router = Router();

router.post(
  '/artwork',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  uploadImage.single('artwork'),
  async (req, res) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    return res.status(400).json({ success: false, error: 'No artwork file provided' });
  }
  const filename = file.filename;
  await uploadToR2(file, 'artwork');
  const url = getFileUrl(filename, 'image');
  return res.json({ success: true, filename, originalName: file.originalname, url });
  }
);

router.post(
  '/audio',
  protect,
  authorize([UserRole.ARTIST, UserRole.LABEL, UserRole.ADMIN]),
  uploadAudio.single('audio'),
  async (req, res) => {
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
  let acrCloud;

  if (isAcrCloudFileScanningConfigured()) {
    try {
      acrCloud = await uploadFirstThirtySecondsForScan(file.path, file.originalname, 'audio');
    } catch (error) {
      acrCloud = {
        state: 'error',
        lastError: error instanceof Error ? error.message : 'ACRCloud scan failed'
      };
    }
  } else {
    acrCloud = {
      state: 'not_configured',
      lastError: 'ACRCloud 30-second file scanning is not configured'
    };
  }

  await uploadToR2(file, 'tracks');
  const url = getFileUrl(filename, 'audio');

  return res.json({ success: true, filename, originalName: file.originalname, url, acrCloud });
  }
);

export default router;
