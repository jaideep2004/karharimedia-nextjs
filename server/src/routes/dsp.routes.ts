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
router.post('/deliveries/:jobId/retry-individual', protect, authorize([UserRole.ADMIN]), dspController.retryIndividualDelivery);
router.post('/deliveries/:jobId/refresh-status', protect, authorize([UserRole.ADMIN]), dspController.refreshDeliveryStatus);
router.delete('/deliveries/:jobId/logs', protect, authorize([UserRole.ADMIN]), dspController.clearDeliveryLogs);
router.post('/deliveries/cleanup', protectAdminOrCronSecret, dspController.cleanupOldDeliveryJobs);

router.post('/rights/claims', protect, authorize([UserRole.ADMIN]), dspController.createRightsClaim);
router.post('/rights/fingerprint-matches', protect, authorize([UserRole.ADMIN]), dspController.addFingerprintMatch);

router.get('/auth/youtube', dspController.youtubeAuthUrl);
router.get('/auth/youtube/callback', dspController.youtubeAuthCallback);
router.get('/auth/youtube/verify', protect, authorize([UserRole.ADMIN]), dspController.verifyYoutubeConnection);

router.post('/webhooks/:providerKey', dspController.processWebhook);

// --- Social Upload (dedicated pipeline, independent from Broma) ---
import { startSocialUpload, getBatchProgress, cancelBatch } from '../services/socialUpload.service';
import DspProvider from '../models/dspProvider.model';
import { decryptCredentialMap } from '../services/dsp/dspCredentialVault';

router.post('/social-upload/start', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { releaseId, tracks, platform, config } = req.body;
    if (!releaseId || !tracks?.length || !platform || !config) {
      res.status(400).json({ success: false, message: 'Missing required fields: releaseId, tracks, platform, config' });
      return;
    }
    const result = await startSocialUpload({ releaseId, tracks, platform, config });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Social upload failed' });
  }
});

router.get('/social-upload/progress/:sessionId', protect, authorize([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const progress = getBatchProgress(req.params.sessionId);
  if (!progress) {
    res.status(404).json({ success: false, message: 'Session not found or expired' });
    return;
  }
  res.json({ success: true, data: progress });
});

router.post('/social-upload/cancel/:sessionId', protect, authorize([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const cancelled = cancelBatch(req.params.sessionId);
  res.json({ success: cancelled, message: cancelled ? 'Upload cancelled' : 'Session not found' });
});

router.get('/social-upload/status/:releaseId', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const TrackModel = mongoose.model('Track');
    const tracks = await TrackModel.find(
      { releaseId: req.params.releaseId },
      { title: 1, artistName: 1, socialDeliveries: 1 }
    );
    const result = await Promise.all(tracks.map(async (t: any) => {
      const deliveries = (t.socialDeliveries || []).map((d: any) => ({
        platform: d.platform,
        externalId: d.externalId,
        videoUrl: d.videoUrl,
        uploadedAt: d.uploadedAt,
      }));
      return { trackId: t._id, title: t.title, artistName: t.artistName, deliveries };
    }));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch social upload status' });
  }
});

// --- Facebook Page Management ---
router.get('/facebook/pages', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const provider = await DspProvider.findOne({ key: 'facebook' }).select('+credentials +credentialEnvelopeVersion');
    if (!provider) { res.json({ success: true, data: [] }); return; }
    const connectedPages = (provider as any).config?.connectedPages || [];
    res.json({ success: true, data: connectedPages });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch pages' });
  }
});

router.post('/facebook/pages', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { pages } = req.body;
    if (!Array.isArray(pages)) { res.status(400).json({ success: false, message: 'pages must be an array' }); return; }
    const provider = await DspProvider.findOne({ key: 'facebook' });
    if (!provider) { res.status(404).json({ success: false, message: 'Facebook provider not configured' }); return; }
    const config = { ...((provider as any).config || {}), connectedPages: pages };
    await DspProvider.updateOne({ key: 'facebook' }, { $set: { config } });
    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to save pages' });
  }
});

router.post('/facebook/fetch-pages', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { userAccessToken } = req.body;
    if (!userAccessToken) { res.status(400).json({ success: false, message: 'userAccessToken is required' }); return; }
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token, picture&access_token=${encodeURIComponent(userAccessToken)}`
    );
    if (!fbRes.ok) {
      const body = await fbRes.text().catch(() => '');
      res.status(400).json({ success: false, message: `Facebook API error (${fbRes.status}): ${body.slice(0, 300)}` });
      return;
    }
    const fbData = await fbRes.json();
    const pages = (fbData.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      picture: p.picture?.data?.url || '',
    }));
    res.json({ success: true, data: pages });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to fetch pages' });
  }
});

// Backfill social delivery status from YouTube API by searching track titles
router.post('/social-upload/backfill/:releaseId', protect, authorize([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const TrackModel = mongoose.model('Track');

    const provider = await DspProvider.findOne({ key: 'youtube' }).select('+credentials +credentialEnvelopeVersion');
    if (!provider) { res.json({ success: false, message: 'YouTube provider not configured' }); return; }

    let credentials = decryptCredentialMap(provider.get('credentials') || {});
    if (!credentials.accessToken) { res.json({ success: false, message: 'YouTube credentials missing' }); return; }

    const tracks = await TrackModel.find(
      { releaseId: req.params.releaseId },
      { title: 1, artistName: 1, socialDeliveries: 1 }
    );

    const results: any[] = [];
    for (const track of tracks) {
      const existing = (track as any).socialDeliveries?.find((d: any) => d.platform === 'youtube');
      if (existing) {
        results.push({ trackId: track._id, title: (track as any).title, found: true, videoUrl: existing.videoUrl, externalId: existing.externalId, source: 'stored' });
        continue;
      }

      const query = encodeURIComponent(`${(track as any).title} ${(track as any).artistName || ''}`);
      const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=3&order=relevance`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });
      if (!searchRes.ok) continue;

      const searchData = await searchRes.json();
      const video = searchData.items?.[0];
      if (video?.id?.videoId) {
        const videoUrl = `https://youtu.be/${video.id.videoId}`;
        await TrackModel.updateOne(
          { _id: track._id },
          { $push: { socialDeliveries: { platform: 'youtube', externalId: video.id.videoId, videoUrl, uploadedAt: new Date() } } }
        );
        results.push({ trackId: track._id, title: (track as any).title, found: true, videoUrl, externalId: video.id.videoId, source: 'youtube_search' });
      } else {
        results.push({ trackId: track._id, title: (track as any).title, found: false, source: 'not_found' });
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Backfill failed' });
  }
});

export default router;
