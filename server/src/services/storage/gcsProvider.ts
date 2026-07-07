import { Storage } from '@google-cloud/storage';
import { StorageProvider } from './storageProvider';

export class GCSProvider implements StorageProvider {
  private storage: Storage;
  private bucket: string;

  constructor(options: { projectId: string; keyFilename: string; bucket: string }) {
    this.storage = new Storage({
      projectId: options.projectId,
      keyFilename: options.keyFilename,
    });
    this.bucket = options.bucket;
  }

  async uploadFile({ filePath, destination, contentType }: { filePath: string; destination: string; contentType?: string; }) {
    const [file] = await this.storage.bucket(this.bucket).upload(filePath, {
      destination,
      contentType,
      resumable: false,
    });
    return {
      url: `https://storage.googleapis.com/${this.bucket}/${destination}`,
      key: destination,
      provider: 'gcs',
    };
  }

  async generateSignedUrl({ key, expiresInSeconds = 3600, operation = 'getObject' }: { key: string; expiresInSeconds?: number; operation?: 'getObject' | 'putObject'; }) {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .getSignedUrl({
        action: operation === 'putObject' ? 'write' : 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
    return url;
  }
}
