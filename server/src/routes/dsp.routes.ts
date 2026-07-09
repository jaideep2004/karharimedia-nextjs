import crypto from 'crypto';
import { NextFunction, Response, Router } from 'express';
import { AuthRequest, authorize, protect } from '../middleware/auth.middleware';
import { UserRole } from '../config/constants';
import * as dspController from '../controllers/dsp.controller';

const router = Router();
const adminOnly = authorize([UserRole.ADMIN]);

const timingSafeEqualString = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const protectAdminOrCronSecret = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const configuredSecret = process.env.DSP_DELIVERY_CRON_SECRET || process.env.CRON_SECRET;
  const incomingSecret = req.headers['x-cron-secret'];
  const headerSecret = Array.isArray(incomingSecret) ? incomingSecret[0] : incomingSecret;

  if (configuredSecret && headerSecret && timingSafeEqualString(headerSecret, configuredSecret)) {
    next();
    return;
  }

  protect(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    adminOnly(req, res, next);
  });
};

router.get('/providers', protect, authorize([UserRole.ADMIN]), dspController.listProviders);
router.post('/providers', protect, authorize([UserRole.ADMIN]), dspController.registerProvider);
router.post('/providers/bootstrap-phase1', protect, authorize([UserRole.ADMIN]), dspController.bootstrapPhase1Providers);
router.get('/broma/outlets', protect, authorize([UserRole.ADMIN]), dspController.listBromaOutlets);
router.post('/broma/outlets/sync', protectAdminOrCronSecret, dspController.syncBromaOutlets);
router.post('/broma/release-statuses/sync', protectAdminOrCronSecret, dspController.syncBromaReleaseStatuses);
router.get('/broma/release-statuses/sync/:syncId/progress', protect, authorize([UserRole.ADMIN]), dspController.getSyncProgress);
router.post('/broma/release-statuses/requeue-stuck', protectAdminOrCronSecret, dspController.requeueStuckBromaJobs);
router.post('/broma/drafts/cleanup', protectAdminOrCronSecret, dspController.cleanupBromaDrafts);
router.get('/broma/drafts', protect, authorize([UserRole.ADMIN]), dspController.listBromaDrafts);
router.get('/broma/drafts/diagnose', protect, authorize([UserRole.ADMIN]), dspController.diagnoseBromaApi);
router.post('/broma/drafts/retry-all', protect, authorize([UserRole.ADMIN]), dspController.retryBromaDrafts);
router.post('/broma/drafts/force-process', protect, authorize([UserRole.ADMIN]), dspController.forceProcessBromaDrafts);
router.delete('/broma/drafts/:draftType/:draftId', protect, authorize([UserRole.ADMIN]), dspController.deleteBromaDraft);
router.get('/broma/statistics/reports', protect, authorize([UserRole.ADMIN]), dspController.listBromaStatisticsReports);
router.post('/broma/statistics/reports', protectAdminOrCronSecret, dspController.createBromaStatisticsReport);
router.post('/broma/statistics/reports/:reportId/refresh', protectAdminOrCronSecret, dspController.refreshBromaStatisticsReport);
router.delete('/broma/statistics/reports/:reportId', protect, authorize([UserRole.ADMIN]), dspController.deleteBromaStatisticsReport);

router.get('/deliveries', protect, authorize([UserRole.ADMIN]), dspController.listDeliveries);
router.get('/deliveries/:jobId', protect, authorize([UserRole.ADMIN]), dspController.getDeliveryById);
router.post('/deliveries/dispatch', protect, authorize([UserRole.ADMIN]), dspController.dispatchDelivery);
router.post('/deliveries/process-due', protectAdminOrCronSecret, dspController.processDueDeliveries);
router.post('/deliveries/process-all', protect, authorize([UserRole.ADMIN]), dspController.processAllDeliveries);
router.post('/deliveries/:jobId/retry', protect, authorize([UserRole.ADMIN]), dspController.retryDelivery);
router.post('/deliveries/:jobId/refresh-status', protect, authorize([UserRole.ADMIN]), dspController.refreshDeliveryStatus);
router.delete('/deliveries/:jobId/logs', protect, authorize([UserRole.ADMIN]), dspController.clearDeliveryLogs);

router.post('/rights/claims', protect, authorize([UserRole.ADMIN]), dspController.createRightsClaim);
router.post('/rights/fingerprint-matches', protect, authorize([UserRole.ADMIN]), dspController.addFingerprintMatch);

router.post('/webhooks/:providerKey', dspController.processWebhook);

export default router;
