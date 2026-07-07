import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditLog.controller';

const router = Router();

router.get('/', getAuditLogs);

export default router;
