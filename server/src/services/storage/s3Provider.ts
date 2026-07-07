import { S3 } from 'aws-sdk';
import { StorageProvider } from './storageProvider';

export class S3Provider implements StorageProvider {
  private s3: S3;
  private bucket: string;

  constructor(options: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string }) {
    this.s3 = new S3({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      region: options.region,
      signatureVersion: 'v4',
    });
    this.bucket = options.bucket;
  }

  async uploadFile({ filePath, destination, contentType }: { filePath: string; destination: string; contentType?: string; }) {
    const fs = await import('fs');
    const fileStream = fs.createReadStream(filePath);
    const params: S3.PutObjectRequest = {
      Bucket: this.bucket,
      Key: destination,
      Body: fileStream,
      ContentType: contentType,
    };
    await this.s3.upload(params).promise();
    return {
      url: `https://${this.bucket}.s3.amazonaws.com/${destination}`,
      key: destination,
      provider: 's3',
    };
  }

  async generateSignedUrl({ key, expiresInSeconds = 3600, operation = 'getObject' }: { key: string; expiresInSeconds?: number; operation?: 'getObject' | 'putObject'; }) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresInSeconds,
    };
    return this.s3.getSignedUrlPromise(operation, params);
  }
}
