import { Router } from 'express';
import { getSignedUrl, saveFileMeta } from '../controllers/storage.controller';

const router = Router();

router.post('/signed-url', getSignedUrl);
router.post('/metadata', saveFileMeta);

export default router;
