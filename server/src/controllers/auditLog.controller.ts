import { Request, Response } from 'express';
import AuditLog from '../models/auditLog.model';

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const { user, action, entity, status, limit = 50, skip = 0 } = req.query;
    const filter: any = {};
    if (user) filter.user = user;
    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (status) filter.status = status;
    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
