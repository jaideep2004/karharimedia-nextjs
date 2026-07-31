import { BaseDspConnector } from './baseConnector';
import {
  DspCapability,
  DspConnector,
  DspConnectorContext,
  DspDeliveryPayload,
  DspDeliveryResult,
  DspTrackPayload,
  DspReleasePayload,
} from '../../../types/dsp';
import { VisualizerPreset, SocialVideoConfig } from '../../../types/socialMedia';
import { r2 } from '../../storage/r2Provider';
import https from 'https';
import path from 'path';

const FB_GRAPH_API = 'https://graph.facebook.com/v19.0';

export class FacebookConnector extends BaseDspConnector implements DspConnector {
  key = 'facebook';
  displayName = 'Facebook';
  capabilities: DspCapability[] = ['video_delivery'];

  async validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.pageAccessToken) {
      return { valid: false, error: 'Missing Facebook page access token' };
    }
    if (!credentials.pageId) {
      return { valid: false, error: 'Missing Facebook page ID' };
    }
    return { valid: true };
  }

  async validateTrack(payload: DspDeliveryPayload): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if ('releaseId' in payload) {
      if (!payload.releaseTitle) errors.push('Missing release title');
      if (!Array.isArray(payload.tracks) || payload.tracks.length === 0) errors.push('Missing release tracks');
    } else {
      if (!payload.title) errors.push('Missing track title');
      if (!payload.artistName) errors.push('Missing artist name');
    }

    return { valid: errors.length === 0, errors };
  }

  async deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const validation = await this.validateTrack(payload);
    if (!validation.valid) {
      return { state: 'failed', message: validation.errors.join(', ') };
    }

    const config = (context.jobMetadata?.config || {}) as Partial<SocialVideoConfig>;
    const preset = config.preset || 'bars';

    const pageAccessToken = String(context.credentials.pageAccessToken || '');
    const pageId = String(context.credentials.pageId || '');
    const connectedPages = context.config?.connectedPages as Array<{ id: string; name: string; accessToken: string }> | undefined;
    const targetPageId = context.config?.targetPageId as string | undefined;

    // Resolve active page from connectedPages first, fall back to default credentials
    let activePageId = pageId;
    let activeToken = pageAccessToken;

    if (targetPageId && connectedPages?.length) {
      const match = connectedPages.find(p => p.id === targetPageId);
      if (match) {
        activePageId = match.id;
        activeToken = match.accessToken;
        console.log(`[Facebook] Using page "${match.name}" (${activePageId})`);
      }
    } else if (connectedPages?.length && !pageId) {
      // No default credentials, but pages are configured — use the first one
      activePageId = connectedPages[0].id;
      activeToken = connectedPages[0].accessToken;
      console.log(`[Facebook] No default creds, using first page "${connectedPages[0].name}"`);
    }

    if (!activePageId || !activeToken) {
      const err = new Error('Facebook page credentials not configured') as any;
      err.statusCode = 401;
      throw err;
    }

    try {
      if (context.signal?.aborted) throw new Error('Upload cancelled');
      const localVideoPath = (context.config?.videoLocalPath as string) || '';
      if (!localVideoPath) {
        throw new Error('No local video path provided. Generate the video first.');
      }

      const title = 'releaseId' in payload
        ? (payload as DspReleasePayload).releaseTitle
        : (payload as DspTrackPayload).title;
      const description = 'releaseId' in payload
        ? `Full album: ${(payload as DspReleasePayload).releaseTitle}`
        : `${(payload as DspTrackPayload).title} by ${(payload as DspTrackPayload).artistName}`;

      const onProgress = context.onProgress;
      const videoId = await this.uploadToFacebook(localVideoPath, title, description, activePageId, activeToken, onProgress, context.signal);

      const metadata: Record<string, unknown> = {
        videoUrl: `https://facebook.com/${activePageId}/videos/${videoId}`,
        videoId,
        preset,
      };

      return {
        externalId: videoId,
        state: 'delivered',
        message: 'Video uploaded to Facebook successfully',
        metadata,
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error;
      const apiError = error as any;
      if (apiError?.response?.status) {
        const wrapped = new Error(apiError.message || 'Facebook API error') as any;
        wrapped.statusCode = apiError.response.status;
        wrapped.retryAfter = apiError.response.headers?.['retry-after']
          ? parseInt(apiError.response.headers['retry-after'], 10)
          : undefined;
        wrapped.responseBody = apiError.response.body;
        throw wrapped;
      }
      const wrapped = new Error(error instanceof Error ? error.message : 'Facebook upload failed') as any;
      wrapped.statusCode = 500;
      throw wrapped;
    }
  }

  private async uploadToFacebook(
    videoPath: string,
    title: string,
    description: string,
    pageId: string,
    pageAccessToken: string,
    onProgress?: (pct: number, bytes?: number, total?: number) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const tag = `[FB:${pageId.slice(0, 6)}]`;
    const filename = path.basename(videoPath);
    const r2Key = `temp-facebook/${Date.now()}_${filename}`;

    console.log(`${tag} Uploading ${filename} to R2 for Facebook delivery...`);
    if (onProgress) onProgress(10);

    // 1. Upload to R2 (via pre-signed URL + streaming for real-time progress)
    if (!r2.isConfigured) {
      throw new Error('R2 is not configured — cannot upload video for Facebook');
    }
    const signedUrl = await r2.generateSignedUploadUrl(r2Key, 3600);
    const fs = await import('fs');
    const { stat } = await import('fs/promises');
    const fileStat = await stat(videoPath);
    const totalBytes = fileStat.size;
    const r2PublicUrl = `https://${r2.publicDomain}/${r2Key}`;

    await new Promise<void>((resolve, reject) => {
      const u = new URL(signedUrl);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: 'PUT', timeout: 600_000,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': totalBytes,
        },
      }, (res) => {
        let body = '';
        res.on('data', (c: any) => body += typeof c === 'string' ? c : c.toString());
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`R2 upload failed (${res.statusCode}): ${body.slice(0, 200)}`));
            return;
          }
          resolve();
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('R2 upload timed out')); });

      const onAbort = () => { req.destroy(new Error('Upload cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const detach = () => signal?.removeEventListener('abort', onAbort);
      req.on('close', detach);

      // Stream file with byte-level progress 10% → 60%
      const stream = fs.createReadStream(videoPath, { highWaterMark: 256 * 1024 }); // 256KB chunks
      let bytesDone = 0;
      stream.on('data', (chunk: any) => {
        bytesDone += chunk.length;
        const pct = Math.round((bytesDone / totalBytes) * 50) + 10; // 10% → 60%
        if (onProgress) onProgress(Math.min(pct, 59), bytesDone, totalBytes);
        const canContinue = req.write(chunk);
        if (!canContinue) stream.pause();
      });
      stream.on('end', () => req.end());
      stream.on('error', reject);
      req.on('drain', () => stream.resume());
    });

    if (signal?.aborted) throw new Error('Upload cancelled');

    console.log(`${tag} R2 upload complete: ${r2PublicUrl}`);
    if (onProgress) onProgress(60);

    try {
      // 2. Tell Facebook to download from R2 URL
      console.log(`${tag} Calling Facebook API with file_url...`);
      const qs = `file_url=${encodeURIComponent(r2PublicUrl)}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}&published=true&access_token=${encodeURIComponent(pageAccessToken)}`;
      const result = await this.fbGetSimple(`/${pageId}/videos`, qs, tag, signal);
      const videoId = (result.id || '') as string;
      if (!videoId) throw new Error(`Facebook did not return video ID: ${JSON.stringify(result)}`);
      console.log(`${tag} Facebook accepted: video_id=${videoId}`);

      if (onProgress) onProgress(100);
      return videoId;
    } finally {
      // 3. Clean up R2 — don't block on failure
      r2.deleteFile(r2Key).catch((err: Error) => console.warn(`${tag} Failed to clean up R2: ${err.message}`));
    }
  }

  /** POST to Facebook Graph API with JSON response (params in query string, no body) */
  private fbGetSimple(path: string, queryString: string, tag?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const u = new URL(FB_GRAPH_API + path);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + '?' + queryString,
        method: 'POST', timeout: 300_000,
        headers: { 'Content-Length': '0' },
      }, (res) => {
        let body = '';
        res.on('data', (c: any) => body += typeof c === 'string' ? c : c.toString());
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Facebook API error (${res.statusCode}): ${body.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error(`Facebook invalid JSON: ${body.slice(0, 300)}`)); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Facebook API timed out')); });
      const onAbort = () => { req.destroy(new Error('Upload cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const detach = () => signal?.removeEventListener('abort', onAbort);
      req.on('close', detach);
      req.end();
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async takedown(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const pageAccessToken = String(context.credentials.pageAccessToken || '');
    if (!pageAccessToken) {
      const err = new Error('Facebook page access token not available') as any;
      err.statusCode = 401;
      throw err;
    }

    const meta = context.jobMetadata || {};
    const externalId = String(meta['externalId'] || meta['videoId'] || '');
    if (!externalId) {
      const err = new Error('No Facebook video ID found for takedown') as any;
      err.statusCode = 400;
      throw err;
    }

    const response = await fetch(
      `${FB_GRAPH_API}/${externalId}?access_token=${pageAccessToken}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const err = new Error(`Facebook takedown failed: ${response.status}`) as any;
      err.statusCode = response.status;
      throw err;
    }

    return { state: 'delivered', message: 'Video removed from Facebook' };
  }

  async getDeliveryStatus(externalId: string, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const pageAccessToken = String(context.credentials.pageAccessToken || '');
    if (!pageAccessToken) {
      const err = new Error('Facebook page access token not available') as any;
      err.statusCode = 401;
      throw err;
    }

    const response = await fetch(
      `${FB_GRAPH_API}/${externalId}?fields=status,permalink_url&access_token=${pageAccessToken}`
    );

    if (!response.ok) {
      const err = new Error(`Facebook API error: ${response.status}`) as any;
      err.statusCode = response.status;
      throw err;
    }

    const data = await response.json() as { status?: { publishing_status?: string }; permalink_url?: string };
    const publishStatus = data.status?.publishing_status;

    if (publishStatus === 'processing' || publishStatus === 'pending') {
      return { state: 'processing', message: 'Facebook is still processing the video' };
    }

    return {
      state: 'delivered',
      message: 'Video published on Facebook',
      metadata: { videoUrl: data.permalink_url },
    };
  }
}
