import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as s3GetSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs/promises';

const R2_ENDPOINT = () => process.env.R2_ENDPOINT || '';
const R2_ACCESS_KEY_ID = () => process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = () => process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = () => process.env.R2_BUCKET_NAME || '';
const R2_PUBLIC_DOMAIN = () => (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/+$/, '');

export class R2Provider {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT(),
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID(),
        secretAccessKey: R2_SECRET_ACCESS_KEY(),
      },
      requestHandler: {
        requestTimeout: 300_000,
      },
    });
  }

  get isConfigured(): boolean {
    return !!(R2_ENDPOINT() && R2_ACCESS_KEY_ID() && R2_SECRET_ACCESS_KEY() && R2_BUCKET_NAME());
  }

  get publicDomain(): string {
    return R2_PUBLIC_DOMAIN();
  }

  get bucketName(): string {
    return R2_BUCKET_NAME();
  }

  get publicUrl(): string {
    const domain = this.publicDomain;
    if (domain) return `https://${domain}`;
    return '';
  }

  getR2Key(filename: string, directory: string): string {
    return `${directory}/${filename}`;
  }

  getPublicUrl(filename: string, directory: string): string {
    const base = this.publicUrl;
    if (!base) return '';
    return `${base}/${directory}/${filename}`;
  }

  async uploadFile(filePath: string, key: string, contentType?: string): Promise<{ url: string; key: string }> {
    const body = await fs.readFile(filePath);

    await this.client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }));

    const domain = this.publicDomain;
    const url = domain ? `https://${domain}/${key}` : '';
    return { url, key };
  }

  async uploadAndCleanup(filePath: string, key: string, contentType?: string): Promise<{ url: string; key: string }> {
    const result = await this.uploadFile(filePath, key, contentType);
    await fs.unlink(filePath).catch(() => {});
    return result;
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
    }));
  }

  async generateSignedUploadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
    });
    return s3GetSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async generateSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
    });
    return s3GetSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async createMultipartUpload(key: string, contentType?: string): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });
    const result = await this.client.send(command);
    return result.UploadId || '';
  }

  async getPartUploadUrl(key: string, uploadId: string, partNumber: number, expiresInSeconds = 3600): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return s3GetSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[]
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    await this.client.send(command);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET_NAME(),
      Key: key,
      UploadId: uploadId,
    });
    await this.client.send(command);
  }
}

export const r2 = new R2Provider();
