import { Router } from 'express';
import {
  getSignedUrl,
  getR2SignedUploadUrl,
  multipartStart,
  multipartGetPartUrls,
  multipartComplete,
  multipartAbort,
  saveFileMeta,
} from '../controllers/storage.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.post('/signed-url', getSignedUrl);
router.post('/r2-signed-upload-url', protect, getR2SignedUploadUrl);
router.post('/multipart/start', protect, multipartStart);
router.post('/multipart/part-urls', protect, multipartGetPartUrls);
router.post('/multipart/complete', protect, multipartComplete);
router.post('/multipart/abort', protect, multipartAbort);
router.post('/metadata', saveFileMeta);

export default router;
