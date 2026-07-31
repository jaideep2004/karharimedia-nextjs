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

export class YoutubeConnector extends BaseDspConnector implements DspConnector {
  key = 'youtube';
  displayName = 'YouTube';
  capabilities: DspCapability[] = ['video_delivery'];

  async validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    if (!credentials.accessToken) {
      return { valid: false, error: 'Missing YouTube access token. Connect a YouTube channel first.' };
    }
    return { valid: true };
  }

  async validateTrack(payload: DspDeliveryPayload): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if ('releaseId' in payload) {
      if (!payload.releaseTitle) errors.push('Missing release title');
      if (!Array.isArray(payload.tracks) || payload.tracks.length === 0) errors.push('Missing release tracks');
      if (!payload.tracks?.[0]?.artwork) warnings.push('No artwork — video will use black background');
    } else {
      if (!payload.title) errors.push('Missing track title');
      if (!payload.artistName) errors.push('Missing artist name');
      if (!payload.artwork) warnings.push('No artwork — video will use black background');
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
    const visibility = (context.config?.visibility as string) || 'public';
    const scheduleAt = context.config?.scheduleAt as string | undefined;

    const accessToken = String(context.credentials.accessToken || '');
    if (!accessToken) {
      const err = new Error('YouTube access token not available. Reconnect the channel.') as any;
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
        ? (payload as DspReleasePayload).releaseTitle || ''
        : `${(payload as DspTrackPayload).title} by ${(payload as DspTrackPayload).artistName}`;

      const videoId = await this.uploadToYouTubeFromUrl(localVideoPath, title, description, accessToken, visibility, scheduleAt, context.onProgress, context.signal);
      const videoUrl = `https://youtu.be/${videoId}`;

      const metadata: Record<string, unknown> = {
        preset,
        visibility,
        scheduleAt: scheduleAt,
        videoUrl,
        videoId,
      };

      // Poll processing status briefly to detect early failures
      const status = await this.pollProcessingStatus(videoId, context, 5, 5000);
      if (status.state === 'failed') {
        return { externalId: videoId, state: 'failed', message: status.message || 'YouTube processing failed', metadata };
      }

      if (status.state === 'processing') {
        console.log(`[YouTube] deliver returning externalId=${videoId} state=processing (still processing on YouTube)`);
        return {
          externalId: videoId,
          state: 'processing',
          message: 'Video uploaded but still processing on YouTube',
          metadata: {
            ...metadata,
            videoUrl,
            videoId,
            nextPollAt: new Date(Date.now() + 30_000).toISOString(),
          },
        };
      }

      console.log(`[YouTube] deliver returning externalId=${videoId} state=delivered`);
      return {
        externalId: videoId,
        state: 'delivered',
        message: status.message || 'Video processed and live on YouTube',
        metadata: {
          ...metadata,
          videoUrl,
          videoId,
        },
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error;
      const apiError = error as any;
      if (apiError?.response?.status) {
        const wrapped = new Error(apiError.message || 'YouTube API error') as any;
        wrapped.statusCode = apiError.response.status;
        wrapped.retryAfter = apiError.response.headers?.['retry-after']
          ? parseInt(apiError.response.headers['retry-after'], 10)
          : undefined;
        wrapped.responseBody = apiError.response.body;
        throw wrapped;
      }
      const wrapped = new Error(error instanceof Error ? error.message : 'YouTube upload failed') as any;
      wrapped.statusCode = 500;
      throw wrapped;
    }
  }

  private async uploadToYouTubeFromUrl(
    videoPath: string,
    title: string,
    description: string,
    accessToken: string,
    visibility: string,
    scheduleAt?: string,
    onProgress?: (pct: number, bytes?: number, total?: number) => void,
    signal?: AbortSignal
  ): Promise<string> {
    return await this.resumableUpload(videoPath, title, description, accessToken, visibility, scheduleAt, onProgress, signal);
  }

  private async resumableUpload(
    videoPath: string,
    title: string,
    description: string,
    accessToken: string,
    visibility: string,
    scheduleAt?: string,
    onProgress?: (pct: number, bytes?: number, total?: number) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const [fsPromises, { request: httpsRequest }] = await Promise.all([
      import('fs/promises'),
      import('https'),
    ]);
    const stat = await fsPromises.stat(videoPath);
    const fileSize = stat.size;

    const TAG = '[YouTube]';
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
    console.log(`${TAG} Starting chunked upload of ${fileSize} bytes (${Math.ceil(fileSize / CHUNK_SIZE)} chunks of ${CHUNK_SIZE / 1024 / 1024}MB)`);

    // 1. Initiate upload session
    const uploadUrlStr = await this.initiateUpload(accessToken, fileSize, title, description, visibility, scheduleAt, TAG);
    const uploadUrl = new URL(uploadUrlStr);
    console.log(`${TAG} Initiation OK, got upload URL`);

    // 2. Open file for chunked reading
    const fd = await fsPromises.open(videoPath, 'r');

    try {
      // 3. Check if a previous upload session has partial data (resume support)
      let uploadedBytes = await this.queryUploadStatus(uploadUrl, httpsRequest, TAG, 2, fileSize);
      console.log(`${TAG} Starting from byte ${uploadedBytes}/${fileSize}`);

      // 4. Upload chunks
      while (uploadedBytes < fileSize) {
        if (signal?.aborted) throw new Error('Upload cancelled');
        const chunkEnd = Math.min(uploadedBytes + CHUNK_SIZE, fileSize);
        const chunkSize = chunkEnd - uploadedBytes;
        const buf = Buffer.alloc(chunkSize);
        await fd.read(buf, 0, chunkSize, uploadedBytes);

        // Upload this chunk — retry on failure
        const result = await this.sendChunkWithRetry(
          uploadUrl, buf, uploadedBytes, chunkEnd - 1, fileSize,
          httpsRequest, TAG, 3, signal
        );

        if (result.complete) {
          onProgress?.(100, fileSize, fileSize);
          const videoId = result.videoId;
          if (!videoId || typeof videoId !== 'string' || videoId.length < 5) {
            throw new Error(`YouTube returned unexpected video ID: ${JSON.stringify(videoId)}`);
          }
          return videoId;
        }

        // If a retry detected more bytes were received, adjust position
        if (result.resumeAt != null) {
          uploadedBytes = result.resumeAt;
        } else {
          uploadedBytes = chunkEnd;
        }
        // Real byte-level progress
        const pct = Math.round((uploadedBytes / fileSize) * 100);
        onProgress?.(pct, uploadedBytes, fileSize);
        console.log(`${TAG} Uploaded ${uploadedBytes}/${fileSize} (${pct}%)`);
      }

      throw new Error('Upload finished but no video ID was returned');
    } finally {
      await fd.close();
    }
  }

  /** Initiate a resumable upload session, returning the upload URL. */
  private async initiateUpload(
    accessToken: string,
    fileSize: number,
    title: string,
    description: string,
    visibility: string,
    scheduleAt: string | undefined,
    tag: string
  ): Promise<string> {
    const metadata = {
      snippet: { title, description },
      status: {
        privacyStatus: visibility,
        selfDeclaredMadeForKids: false,
        notifySubscribers: false,
        ...(scheduleAt ? { publishAt: new Date(scheduleAt).toISOString() } : {}),
      },
    };

    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Length': String(fileSize),
            },
            body: JSON.stringify(metadata),
          }
        );

        if (response.status === 401) {
          throw new Error('YouTube access token expired or invalid. Reconnect the channel.');
        }
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`YouTube upload initiation failed (${response.status}): ${body}`);
        }

        const location = response.headers.get('Location');
        if (!location) throw new Error('YouTube did not return an upload URL');
        return location;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        console.error(`${tag} Initiation attempt ${attempt}/3 failed:`, lastErr.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 5000));
        }
      }
    }
    throw lastErr!;
  }

  /** Query YouTube how many bytes it has received so far (returns 0 for fresh upload). */
  private async queryUploadStatus(
    uploadUrl: URL,
    httpsRequest: typeof import('https').request,
    tag: string,
    retries = 2,
    fileSize?: number
  ): Promise<number> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Length': '0',
          'Content-Type': 'video/*',
        };
        if (fileSize) {
          headers['Content-Range'] = `bytes */${fileSize}`;
        }
        const result = await this.httpsRequestPromise(uploadUrl, httpsRequest, {
          method: 'PUT',
          headers,
          timeout: 0,
        }, 30_000, null);

        // YouTube returns 308 with Range header, or 200/201 if complete
        if (result.statusCode === 308) {
          const range = result.headers['range'] || result.headers['Range'] || '';
          const match = range.match(/bytes=0-(\d+)/);
          if (match) {
            return parseInt(match[1], 10) + 1;
          }
          return 0;
        }

        // If we got 200/201 without having uploaded, upload is already complete
        if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
          return Infinity; // signal already complete
        }

        return 0;
      } catch (err) {
        console.warn(`${tag} Status query attempt ${attempt}/${retries} failed:`, err instanceof Error ? err.message : String(err));
        if (attempt < retries) await new Promise(r => setTimeout(r, 3000));
      }
    }
    return 0; // default to 0 on failure
  }

  /** Upload a single chunk with retries. */
  private async sendChunkWithRetry(
    uploadUrl: URL,
    buffer: Buffer,
    startByte: number,
    endByte: number,
    fileSize: number,
    httpsRequest: typeof import('https').request,
    tag: string,
    retries = 3,
    signal?: AbortSignal
  ): Promise<{ complete: boolean; videoId?: string; resumeAt?: number }> {
    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      if (signal?.aborted) throw new Error('Upload cancelled');
      try {
        const result = await this.httpsRequestPromise(uploadUrl, httpsRequest, {
          method: 'PUT',
          headers: {
            'Content-Length': String(buffer.length),
            'Content-Type': 'video/*',
            'Content-Range': `bytes ${startByte}-${endByte}/${fileSize}`,
          },
          timeout: 0,
        }, 240_000, buffer, signal); // 4 min per chunk

        if (result.statusCode === 308) {
          return { complete: false };
        }

        if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) {
          const parsed = JSON.parse(result.body);
          return { complete: true, videoId: parsed.id };
        }

        throw new Error(`YouTube chunk upload failed (${result.statusCode}): ${result.body.slice(0, 500)}`);
      } catch (err) {
        if (signal?.aborted) throw new Error('Upload cancelled');
        lastErr = err instanceof Error ? err : new Error(String(err));
        console.error(`${tag} Chunk ${startByte}-${endByte} attempt ${attempt}/${retries} failed:`, lastErr.message);

        if (attempt < retries) {
          // Query current status and resume from there instead of starting over
          const uploadedBytes = await this.queryUploadStatus(uploadUrl, httpsRequest, tag, 1, fileSize);
          if (uploadedBytes > startByte || uploadedBytes === Infinity) {
            console.log(`${tag} Resuming from byte ${uploadedBytes} (was at ${startByte})`);
            return { complete: false, resumeAt: uploadedBytes };
          }
          await new Promise(r => setTimeout(r, attempt * 5000));
        }
      }
    }
    throw lastErr!;
  }

  /** Wrapper around https.request that returns parsed response. */
  private httpsRequestPromise(
    url: URL,
    httpsRequest: typeof import('https').request,
    options: import('http').RequestOptions,
    timeoutMs: number,
    body: Buffer | number | null,
    signal?: AbortSignal
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(url, options, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          const headers: Record<string, string> = {};
          if (typeof res.headers === 'object') {
            for (const [k, v] of Object.entries(res.headers)) {
              headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
            }
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers,
            body,
          });
        });
      });

      req.on('error', (err: Error) => reject(new Error(`https.request failed: ${err.message}`)));
      req.on('timeout', () => { req.destroy(); reject(new Error('chunk timed out')); });
      req.setTimeout(timeoutMs);

      const onAbort = () => { req.destroy(new Error('Upload cancelled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      const detach = () => signal?.removeEventListener('abort', onAbort);
      req.on('close', detach);

      if (typeof body === 'number' && body === 0) {
        req.end();
      } else if (body instanceof Buffer) {
        req.write(body);
        req.end();
      } else {
        req.end();
      }
    });
  }

  private async pollProcessingStatus(
    videoId: string,
    context: DspConnectorContext,
    maxAttempts: number = 5,
    delayMs: number = 5000
  ): Promise<{ state: string; message?: string }> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, delayMs));
      try {
        const status = await this.getDeliveryStatus(videoId, context);
        if (status.state === 'delivered' || status.state === 'failed') {
          return { state: status.state, message: status.message };
        }
      } catch {
        // transient errors — keep polling
      }
    }
    return { state: 'processing', message: 'Video uploaded but still processing on YouTube' };
  }

  async getDeliveryStatus(externalId: string, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const accessToken = String(context.credentials.accessToken || '');
    if (!accessToken) {
      const err = new Error('YouTube access token not available') as any;
      err.statusCode = 401;
      throw err;
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${externalId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const err = new Error(`YouTube API error: ${response.status}`) as any;
      err.statusCode = response.status;
      throw err;
    }

    const data = await response.json();
    const video = data.items?.[0];
    if (!video) {
      const err = new Error('Video not found on YouTube') as any;
      err.statusCode = 404;
      throw err;
    }

    const processingStatus = video.processingDetails?.processingStatus || 'succeeded';
    const uploadStatus = video.status?.uploadStatus || 'processed';

    if (uploadStatus === 'rejected') {
      return { state: 'failed', message: 'YouTube rejected the video', metadata: { rejectionReason: video.status?.rejectionReason } };
    }

    if (processingStatus === 'failed') {
      return { state: 'failed', message: 'YouTube processing abandoned — video could not be processed' };
    }

    if (processingStatus === 'processing' || processingStatus === 'pending') {
      return { state: 'processing', message: 'YouTube is still processing the video' };
    }

    return {
      state: 'delivered',
      message: 'Video processed and live on YouTube',
      metadata: { videoUrl: `https://youtu.be/${externalId}`, privacyStatus: video.status?.privacyStatus },
    };
  }

  async takedown(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const accessToken = String(context.credentials.accessToken || '');
    if (!accessToken) {
      const err = new Error('YouTube access token not available') as any;
      err.statusCode = 401;
      throw err;
    }

    const meta = context.jobMetadata || {};
    const externalId = String(meta['externalId'] || meta['videoId'] || '');
    if (!externalId) {
      const err = new Error('No YouTube video ID found for takedown') as any;
      err.statusCode = 400;
      throw err;
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${externalId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: externalId,
          status: { privacyStatus: 'private' },
        }),
      }
    );

    if (!response.ok) {
      const err = new Error(`Failed to make video private: ${response.status}`) as any;
      err.statusCode = response.status;
      throw err;
    }

    return { state: 'delivered', message: 'Video set to private on YouTube' };
  }
}
