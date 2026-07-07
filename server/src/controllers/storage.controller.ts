import { Request, Response } from 'express';
import { S3Provider } from '../services/storage/s3Provider';
import { GCSProvider } from '../services/storage/gcsProvider';
import { logAudit } from '../services/auditLogger';
import FileMeta from '../models/fileMeta.model';

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

export const saveFileMeta = async (req: Request, res: Response) => {
  try {
    const { key, url, provider, contentType, size } = req.body;
    const fileMeta = await FileMeta.create({ key, url, provider, contentType, size, uploadedBy: req.user?.id });
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
