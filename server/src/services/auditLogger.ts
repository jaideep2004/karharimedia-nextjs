import AuditLog, { IAuditLog } from '../models/auditLog.model';
import logger from '../utils/logger';

export async function logAudit({
  user,
  action,
  entity,
  entityId,
  details,
  status,
  error
}: {
  user: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: any;
  status: 'success' | 'error';
  error?: string;
}) {
  try {
    await AuditLog.create({
      user,
      action,
      entity,
      entityId,
      details,
      status,
      error
    });
  } catch (err) {
    logger.error('Failed to write audit log: %o', err);
  }
}
