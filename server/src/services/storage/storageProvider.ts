export interface StorageProvider {
  uploadFile(params: {
    filePath: string;
    destination: string;
    contentType?: string;
  }): Promise<{ url: string; key: string; provider: string }>;

  generateSignedUrl(params: {
    key: string;
    expiresInSeconds?: number;
    operation?: 'getObject' | 'putObject';
  }): Promise<string>;
}
