import crypto from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../utils/apiResponse';
import { dspDeliveryService, getSyncProgress as getBromaSyncProgress } from '../services/dsp/dspDelivery.service';

export const listProviders = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const providers = await dspDeliveryService.listProviders();
    successResponse(res, providers, 'DSP providers fetched');
  } catch (error) {
    errorResponse(res, 'Failed to fetch DSP providers', error);
  }
};

export const registerProvider = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const provider = await dspDeliveryService.registerProvider(req.body);
    successResponse(res, provider, 'DSP provider registered');
  } catch (error) {
    errorResponse(
      res,
      error instanceof Error ? error.message : 'Failed to register DSP provider',
      error
    );
  }
};

export const bootstrapPhase1Providers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const providers = await dspDeliveryService.bootstrapPhase1Providers();
    successResponse(res, providers, 'Phase-1 DSP providers bootstrapped');
  } catch (error) {
    errorResponse(res, 'Failed to bootstrap phase-1 providers', error);
  }
};

export const syncBromaOutlets = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.syncBromaOutlets();
    successResponse(res, result, 'Broma outlets synced');
  } catch (error) {
    errorResponse(res, 'Failed to sync Broma outlets', error);
  }
};

export const listBromaOutlets = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.listBromaOutlets();
    successResponse(res, result, 'Broma outlets fetched');
  } catch (error) {
    errorResponse(res, 'Failed to fetch Broma outlets', error);
  }
};

export const deleteBromaDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const draftType = req.params.draftType === 'composition' ? 'composition' : 'release';
    const result = await dspDeliveryService.deleteBromaDraft({
      draftType,
      draftId: req.params.draftId,
    });
    successResponse(res, result, 'Broma draft deleted');
  } catch (error) {
    errorResponse(res, 'Failed to delete Broma draft', error);
  }
};

export const createBromaStatisticsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.createBromaStatisticsReport({
      payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
      reportKind: req.body?.reportKind === 'detail' ? 'detail' : 'summary',
      requestedBy: req.user?._id?.toString(),
    });
    successResponse(res, result, 'Broma statistics report queued', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create Broma statistics report', error);
  }
};

export const listBromaStatisticsReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await dspDeliveryService.listBromaStatisticsReports(limit);
    successResponse(res, result, 'Broma statistics reports fetched');
  } catch (error) {
    errorResponse(res, 'Failed to fetch Broma statistics reports', error);
  }
};

export const refreshBromaStatisticsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.refreshBromaStatisticsReport(req.params.reportId);
    successResponse(res, result, 'Broma statistics report refreshed');
  } catch (error) {
    errorResponse(res, 'Failed to refresh Broma statistics report', error);
  }
};

export const deleteBromaStatisticsReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.deleteBromaStatisticsReport(req.params.reportId);
    successResponse(res, result, 'Broma statistics report deleted');
  } catch (error) {
    errorResponse(res, 'Failed to delete Broma statistics report', error);
  }
};

export const dispatchDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { trackId, providerKey, operation = 'deliver' } = req.body;
    const job = await dspDeliveryService.dispatchDelivery(trackId, providerKey, operation, req.user?._id?.toString());
    successResponse(res, job, 'Delivery job queued', 201);
  } catch (error) {
    errorResponse(res, 'Failed to queue delivery job', error);
  }
};

export const listDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.listJobs({
      providerKey: typeof req.query.providerKey === 'string' ? req.query.providerKey : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    successResponse(res, result, 'Delivery jobs fetched');
  } catch (error) {
    errorResponse(res, 'Failed to fetch delivery jobs', error);
  }
};

export const getDeliveryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await dspDeliveryService.getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ success: false, message: 'Delivery job not found', data: null });
      return;
    }
    successResponse(res, job, 'Delivery job fetched');
  } catch (error) {
    errorResponse(res, 'Failed to fetch delivery job', error);
  }
};

export const retryDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await dspDeliveryService.retryJob(req.params.jobId);
    successResponse(res, job, 'Delivery retry queued');
  } catch (error) {
    errorResponse(res, 'Failed to retry delivery job', error);
  }
};

export const diagnoseBromaApi = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.diagnoseBromaApi();
    successResponse(res, result, 'Broma API diagnostic');
  } catch (error) {
    errorResponse(res, 'Diagnostic failed', error);
  }
};

export const listBromaDrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = req.query.page ? Math.max(1, Number(req.query.page)) : undefined;
    const drafts = await dspDeliveryService.listBromaDrafts(page);
    successResponse(res, drafts, 'Broma draft jobs fetched');
  } catch (error) {
    errorResponse(res, 'Failed to list Broma drafts', error);
  }
};

export const retryBromaDrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workerId = typeof req.body?.workerId === 'string' ? req.body.workerId : undefined;
    const result = await dspDeliveryService.retryAllBromaDrafts(workerId);
    successResponse(res, result, 'Broma drafts retried');
  } catch (error) {
    errorResponse(res, 'Failed to retry Broma drafts', error);
  }
};

export const refreshDeliveryStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await dspDeliveryService.refreshJobStatus(req.params.jobId);
    successResponse(res, job, 'Delivery status refreshed');
  } catch (error) {
    errorResponse(res, 'Failed to refresh delivery status', error);
  }
};

export const syncBromaReleaseStatuses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const releaseIds = Array.isArray(req.body?.releaseIds)
      ? req.body.releaseIds.map((id: unknown) => String(id)).filter(Boolean)
      : undefined;
    const limit = req.body?.limit ? Number(req.body.limit) : undefined;
    const skip = req.body?.skip ? Number(req.body.skip) : undefined;
    const syncId = req.body?.syncId || crypto.randomUUID();
    // Fire in background — no timeout
    dspDeliveryService.syncBromaReleaseStatuses({ releaseIds, limit, skip, syncId }).catch((err) =>
      console.error('[syncBromaReleaseStatuses] Background sync failed:', err)
    );
    successResponse(res, { syncId }, 'Broma release statuses sync started');
  } catch (error) {
    console.error('[syncBromaReleaseStatuses] Unhandled error:', error);
    errorResponse(res, 'Failed to start Broma release statuses sync', error);
  }
};

export const getSyncProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const syncId = req.params.syncId;
    if (!syncId) { errorResponse(res, 'syncId required', null); return; }
    const progress = getBromaSyncProgress(syncId);
    if (!progress) { successResponse(res, null, 'No sync in progress'); return; }
    successResponse(res, progress, 'Sync progress');
  } catch (error) {
    errorResponse(res, 'Failed to get sync progress', error);
  }
};

export const requeueStuckBromaJobs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const maxJobs = req.body?.maxJobs ? Number(req.body.maxJobs) : undefined;
    const olderThanMinutes = req.body?.olderThanMinutes ? Number(req.body.olderThanMinutes) : undefined;
    const result = await dspDeliveryService.requeueStuckBromaJobs({ maxJobs, olderThanMinutes });
    successResponse(res, result, 'Stuck Broma jobs requeued');
  } catch (error) {
    errorResponse(res, 'Failed to requeue stuck Broma jobs', error);
  }
};

export const cleanupBromaDrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const action = req.body?.action === 'delete_orphans' || req.body?.action === 'resume_orphans' ? req.body.action : 'list';
    const maxDrafts = req.body?.maxDrafts ? Number(req.body.maxDrafts) : undefined;
    const result = await dspDeliveryService.cleanupBromaDrafts({ action, maxDrafts });
    successResponse(res, result, 'Broma drafts processed');
  } catch (error) {
    errorResponse(res, 'Failed to process Broma drafts', error);
  }
};

export const clearDeliveryLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.clearJobLogs(req.params.jobId, req.user?._id?.toString());
    successResponse(
      res,
      result,
      result.releaseMissing
        ? 'Delivery log cleared. Release record no longer exists.'
        : 'Delivery log cleared and release moved back to pending'
    );
  } catch (error) {
    errorResponse(res, 'Failed to clear delivery logs', error);
  }
};

export const processAllDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await dspDeliveryService.processAllQueuedJobs(
      typeof req.body?.workerId === 'string' ? req.body.workerId : undefined
    );
    successResponse(res, result, 'All queued delivery jobs processed');
  } catch (error) {
    errorResponse(res, 'Failed to process all delivery jobs', error);
  }
};

export const processDueDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const maxJobs = req.body?.maxJobs ? Number(req.body.maxJobs) : undefined;
    const result = await dspDeliveryService.processDueDeliveryJobs({
      maxJobs,
      workerId: typeof req.body?.workerId === 'string' ? req.body.workerId : undefined,
      dispatchOnly: req.body?.dispatchOnly === true,
    });
    successResponse(res, result, req.body?.dispatchOnly === true ? 'Due delivery jobs started' : 'Due delivery jobs processed');
  } catch (error) {
    errorResponse(res, 'Failed to process due delivery jobs', error);
  }
};

export const processWebhook = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const event = await dspDeliveryService.processWebhook(
      req.params.providerKey.toLowerCase(),
      req.body || {},
      req.headers as unknown as Record<string, unknown>
    );
    successResponse(res, event, 'Webhook processed');
  } catch (error) {
    errorResponse(res, 'Failed to process webhook', error);
  }
};

export const createRightsClaim = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const claim = await dspDeliveryService.createRightsClaim(req.body);
    successResponse(res, claim, 'Rights claim created', 201);
  } catch (error) {
    errorResponse(res, 'Failed to create rights claim', error);
  }
};

export const addFingerprintMatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const match = await dspDeliveryService.addFingerprintMatch(req.body);
    successResponse(res, match, 'Fingerprint match stored', 201);
  } catch (error) {
    errorResponse(res, 'Failed to store fingerprint match', error);
  }
};
