import { Request, Response } from 'express';
import fs from 'fs/promises';
import { analyzeAudio } from '../services/audioAnalysisService';
import { errorResponse, successResponse } from '../utils/apiResponse';
import {
  getScanResult,
  identifyAudioFile,
  normalizeScanPayload,
  persistScanResult,
  uploadFirstThirtySecondsForScan,
} from '../services/acrCloud.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { LOCAL_FFMPEG_ENABLED, UserRole } from '../config/constants';
import { findTrackByAcrCloudFileId } from '../repositories/track.repository';

export async function analyzeAudioHandler(req: Request, res: Response) {
  try {
    if (!LOCAL_FFMPEG_ENABLED) {
      return res.status(503).json({ error: 'Local ffmpeg analysis is disabled in this environment' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const result = await analyzeAudio(filePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

async function deleteTempFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // Multer temp cleanup is best-effort.
  }
}

export async function identifyWithAcrCloudHandler(req: Request, res: Response) {
  const filePath = req.file?.path;
  try {
    if (!filePath) {
      return errorResponse(res, 'No file uploaded', undefined, 400);
    }

    console.log('[ACRCloud] Manual identify requested', {
      originalName: req.file?.originalname,
      size: req.file?.size,
      mimetype: req.file?.mimetype,
    });
    const result = await identifyAudioFile(filePath, 'audio');
    console.log('[ACRCloud] Manual identify completed', {
      originalName: req.file?.originalname,
      statusCode: result.statusCode,
      fingerprintMatches: result.fingerprintMatches.length,
    });
    successResponse(res, result, 'ACRCloud identification completed');
  } catch (err) {
    console.error('[ACRCloud] Manual identify failed', {
      originalName: req.file?.originalname,
      error: err instanceof Error ? err.message : err,
    });
    errorResponse(res, 'ACRCloud identification failed', err, 502);
  } finally {
    await deleteTempFile(filePath);
  }
}

export async function scanWithAcrCloudHandler(req: Request, res: Response) {
  const filePath = req.file?.path;
  try {
    if (!filePath) {
      return errorResponse(res, 'No file uploaded', undefined, 400);
    }

    console.log('[ACRCloud] Manual scan requested', {
      originalName: req.file?.originalname,
      size: req.file?.size,
      mimetype: req.file?.mimetype,
    });
    const result = await uploadFirstThirtySecondsForScan(filePath, req.file?.originalname, 'audio');
    console.log('[ACRCloud] Manual scan submitted', {
      originalName: req.file?.originalname,
      fileId: result.fileId,
      state: result.state,
    });
    successResponse(res, result, 'ACRCloud scan started');
  } catch (err) {
    console.error('[ACRCloud] Manual scan failed', {
      originalName: req.file?.originalname,
      error: err instanceof Error ? err.message : err,
    });
    errorResponse(res, 'ACRCloud scan failed', err, 502);
  } finally {
    await deleteTempFile(filePath);
  }
}

export async function getAcrCloudScanResultHandler(req: Request, res: Response) {
  try {
    const authReq = req as AuthRequest;
    const track = await findTrackByAcrCloudFileId(req.params.fileId);
    if (track && authReq.user?.role !== UserRole.ADMIN && track.artistId.toString() !== authReq.user?._id?.toString()) {
      return errorResponse(res, 'Not authorized to access this ACRCloud scan', undefined, 403);
    }

    console.log('[ACRCloud] Scan result requested', {
      fileId: req.params.fileId,
      userId: authReq.user?._id?.toString(),
    });
    const result = await getScanResult(req.params.fileId);
    await persistScanResult(req.params.fileId, result);
    console.log('[ACRCloud] Scan result refreshed', {
      fileId: req.params.fileId,
      state: result.state,
    });
    successResponse(res, result, 'ACRCloud scan result retrieved');
  } catch (err) {
    console.error('[ACRCloud] Scan result failed', {
      fileId: req.params.fileId,
      error: err instanceof Error ? err.message : err,
    });
    errorResponse(res, 'ACRCloud scan result failed', err, 502);
  }
}

export async function acrCloudCallbackHandler(req: Request, res: Response) {
  try {
    const expectedSecret = process.env.ACRCLOUD_CALLBACK_SECRET;
    if (!expectedSecret) {
      return errorResponse(res, 'ACRCloud callback secret is not configured', undefined, 503);
    }

    const providedSecret = req.headers['x-acrcloud-callback-secret'] || req.query.secret || req.body?.secret;
    if (providedSecret !== expectedSecret) {
      return errorResponse(res, 'Invalid ACRCloud callback secret', undefined, 401);
    }

    const body = {
      ...req.body,
      results: typeof req.body?.results === 'string' ? JSON.parse(req.body.results) : req.body?.results,
    };
    const fileId = body.file_id || body.fileId;
    if (!fileId) {
      return errorResponse(res, 'ACRCloud callback missing file id', undefined, 400);
    }

    await persistScanResult(fileId, normalizeScanPayload(body));
    console.log('[ACRCloud] Callback persisted', {
      fileId,
      state: normalizeScanPayload(body).state,
    });
    successResponse(res, null, 'ACRCloud callback accepted');
  } catch (err) {
    console.error('[ACRCloud] Callback failed', {
      error: err instanceof Error ? err.message : err,
    });
    errorResponse(res, 'ACRCloud callback failed', err, 500);
  }
}
