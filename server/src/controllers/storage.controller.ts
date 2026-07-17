import { Request, Response } from 'express';
import { S3Provider } from '../services/storage/s3Provider';
import { GCSProvider } from '../services/storage/gcsProvider';
import { logAudit } from '../services/auditLogger';
import FileMeta from '../models/fileMeta.model';
import { r2 } from '../services/storage/r2Provider';

// Choose provider based on config/env (example logic)
function getProvider() {
  if (process.env.STORAGE_PROVIDER === 'gcs') {
    return new GCSProvider({
      projectId: process.env.GCS_PROJECT_ID!,
      keyFilename: process.env.GCS_KEY_FILE!,
      bucket: process.env.GCS_BUCKET!
    });
  }
  return new S3Provider({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_BUCKET!
  });
}

const DIRECTORY_MAP: Record<string, string> = {
  artwork: 'artwork',
  audio: 'tracks',
  support: 'support',
  'knowledge-base': 'knowledge-base',
};

export const getSignedUrl = async (req: Request, res: Response) => {
  try {
    const { key, operation, expiresInSeconds } = req.body;
    const provider = getProvider();
    const url = await provider.generateSignedUrl({ key, operation, expiresInSeconds });
    await logAudit({
      user: req.user?.id || 'anonymous',
      action: 'generate_signed_url',
      entity: 'file',
      entityId: key,
      details: { operation },
      status: 'success'
    });
    res.json({ url });
  } catch (error: any) {
    await logAudit({
      user: req.user?.id || 'anonymous',
      action: 'generate_signed_url',
      entity: 'file',
      details: req.body,
      status: 'error',
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
};

export const getR2SignedUploadUrl = async (req: Request, res: Response) => {
  try {
    const { filename, type } = req.body;
    if (!filename || !type) {
      res.status(400).json({ error: 'filename and type are required' });
      return;
    }
    const directory = DIRECTORY_MAP[type];
    if (!directory) {
      res.status(400).json({ error: `Invalid type: ${type}. Must be one of: ${Object.keys(DIRECTORY_MAP).join(', ')}` });
      return;
    }
    const key = r2.getR2Key(filename, directory);
    const uploadUrl = await r2.generateSignedUploadUrl(key, 3600);
    const publicUrl = r2.getPublicUrl(filename, directory);
    res.json({ success: true, uploadUrl, publicUrl, key, filename, directory });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const multipartStart = async (req: Request, res: Response) => {
  try {
    const { filename, type, partSize = 20 * 1024 * 1024, parallel = 4 } = req.body;
    if (!filename || !type) {
      res.status(400).json({ error: 'filename and type are required' });
      return;
    }
    const directory = DIRECTORY_MAP[type];
    if (!directory) {
      res.status(400).json({ error: `Invalid type: ${type}` });
      return;
    }
    const key = r2.getR2Key(filename, directory);
    const uploadId = await r2.createMultipartUpload(key);
    if (!uploadId) {
      res.status(500).json({ error: 'Failed to initiate multipart upload' });
      return;
    }
    res.json({ success: true, uploadId, key, directory, filename, partSize, parallel });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const multipartGetPartUrls = async (req: Request, res: Response) => {
  try {
    const { key, uploadId, totalParts } = req.body;
    if (!key || !uploadId || !totalParts) {
      res.status(400).json({ error: 'key, uploadId, and totalParts are required' });
      return;
    }
    const partUrls: { partNumber: number; url: string }[] = [];
    for (let i = 1; i <= totalParts; i++) {
      const url = await r2.getPartUploadUrl(key, uploadId, i);
      partUrls.push({ partNumber: i, url });
    }
    res.json({ success: true, partUrls });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const multipartComplete = async (req: Request, res: Response) => {
  try {
    const { key, uploadId, parts } = req.body;
    if (!key || !uploadId || !Array.isArray(parts)) {
      res.status(400).json({ error: 'key, uploadId, and parts array are required' });
      return;
    }
    await r2.completeMultipartUpload(key, uploadId, parts);
    const filename = key.split('/').pop() || '';
    const directory = key.includes('/') ? key.split('/')[0] : '';
    const publicUrl = r2.getPublicUrl(filename, directory);
    res.json({ success: true, key, publicUrl, filename });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const multipartAbort = async (req: Request, res: Response) => {
  try {
    const { key, uploadId } = req.body;
    if (!key || !uploadId) {
      res.status(400).json({ error: 'key and uploadId are required' });
      return;
    }
    await r2.abortMultipartUpload(key, uploadId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const saveFileMeta = async (req: Request, res: Response) => {
  try {
    const { key, provider, contentType, size } = req.body;
    const fileMeta = await FileMeta.create({ key, url: key, provider, contentType, size, uploadedBy: req.user?.id });
    await logAudit({
      user: req.user?.id || 'anonymous',
      action: 'save_file_meta',
      entity: 'file',
      entityId: fileMeta._id.toString(),
      details: { key, provider },
      status: 'success'
    });
    res.json(fileMeta);
  } catch (error: any) {
    await logAudit({
      user: req.user?.id || 'anonymous',
      action: 'save_file_meta',
      entity: 'file',
      details: req.body,
      status: 'error',
      error: error.message
    });
    res.status(500).json({ error: error.message });
  }
};
