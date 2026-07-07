import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { updateReleaseTrackAcrCloudByFileId } from '../repositories/release.repository';
import {
  findCanonicalTracksByAcrCloudFileId,
  updateCanonicalTrackLegacyAcrCloudByFileId,
  updateStandaloneTrackAcrCloudByFileId,
  updateTrackAcrCloudById,
} from '../repositories/track.repository';
import { upsertAcrCloudFingerprintsForTracks } from '../repositories/fingerprint.repository';
import { createAcrCloudIssueTicket, hasAcrCloudIssue } from './support.service';
import {
  AcrCloudAiDetection,
  AcrCloudDataType,
  AcrCloudFingerprintMatch,
  AcrCloudIdentifyResult,
  AcrCloudScanState,
  AcrCloudScanSummary,
} from '../types/acrCloud';

const IDENTIFY_ENDPOINT = '/v1/identify';
const SIGNATURE_VERSION = '1';
const MAX_IDENTIFY_BYTES = 5 * 1024 * 1024;
const SCAN_SAMPLE_SECONDS = 30;

interface AcrCloudConfig {
  consoleToken?: string;
  fsRegion?: string;
  fsContainerId?: string;
  identifyHost?: string;
  identifyAccessKey?: string;
  identifyAccessSecret?: string;
}

function getConfig(): AcrCloudConfig {
  return {
    consoleToken: process.env.ACRCLOUD_CONSOLE_TOKEN,
    fsRegion: process.env.ACRCLOUD_FS_REGION,
    fsContainerId: process.env.ACRCLOUD_FS_CONTAINER_ID,
    identifyHost: process.env.ACRCLOUD_IDENTIFY_HOST,
    identifyAccessKey: process.env.ACRCLOUD_IDENTIFY_ACCESS_KEY,
    identifyAccessSecret: process.env.ACRCLOUD_IDENTIFY_ACCESS_SECRET,
  };
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getFsBaseUrl(region: string): string {
  return `https://api-${region}.acrcloud.com/api`;
}

function signIdentifyRequest(
  accessSecret: string,
  accessKey: string,
  dataType: AcrCloudDataType,
  timestamp: string
): string {
  const stringToSign = ['POST', IDENTIFY_ENDPOINT, accessKey, dataType, SIGNATURE_VERSION, timestamp].join('\n');
  return crypto.createHmac('sha1', accessSecret).update(Buffer.from(stringToSign, 'utf8')).digest('base64');
}

function mapScanState(state: unknown): AcrCloudScanState {
  if (state === 0 || state === '0') return 'pending';
  if (state === 1 || state === '1') return 'ready';
  if (state === -1 || state === '-1') return 'no_results';
  if (state === -2 || state === '-2' || state === -3 || state === '-3') return 'error';
  return 'pending';
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getFfmpegBinary(): string {
  const configuredPath = process.env.FFMPEG_PATH;
  if (configuredPath) return configuredPath;
  const ffmpegStaticPath = require('ffmpeg-static') as string | null;
  if (!ffmpegStaticPath) {
    throw new Error('FFmpeg binary is not available for ACRCloud sample creation');
  }
  return ffmpegStaticPath;
}

async function createThirtySecondSample(filePath: string): Promise<string> {
  const outputPath = path.join(
    os.tmpdir(),
    `acrcloud-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.mp3`
  );

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegBinary(), [
      '-y',
      '-i',
      filePath,
      '-t',
      String(SCAN_SAMPLE_SECONDS),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-b:a',
      '96k',
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg sample creation failed: ${stderr.trim() || `exit ${code}`}`));
    });
  });

  return outputPath;
}

function normalizeAiDetection(results: any): AcrCloudAiDetection[] {
  const detections = Array.isArray(results?.ai_detection) ? results.ai_detection : [];

  return detections.map((item: any) => ({
    start: toNumber(item.start),
    end: toNumber(item.end),
    prediction: item.prediction || '',
    likelySource: item.likely_source || item.likelySource || '',
    aiProbability: toNumber(item.ai_probability ?? item.aiProbability),
    duration: toNumber(item.duration),
    stem: item.stem,
    sourceProbabilities: Array.isArray(item.source_probabilities)
      ? item.source_probabilities.map((source: any) => ({
          source: source.source || '',
          probability: toNumber(source.probability),
        }))
      : [],
    segments: Array.isArray(item.segments)
      ? item.segments.map((segment: any) => ({
          start: toNumber(segment.start),
          end: toNumber(segment.end),
          prediction: segment.prediction || '',
          likelySource: segment.likely_source || segment.likelySource || '',
          aiProbability: toNumber(segment.ai_probability ?? segment.aiProbability),
        }))
      : undefined,
  }));
}

function extractTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeFingerprintMatches(results: any): AcrCloudFingerprintMatch[] {
  const musicMatches = Array.isArray(results?.music) ? results.music : [];
  const customMatches = Array.isArray(results?.custom_files) ? results.custom_files : [];
  const rawMatches = [...musicMatches, ...customMatches];

  return rawMatches.map((item: any) => {
    const result = item.result || item;
    const externalIds = result.external_ids || {};
    const artists = extractTextList(result.artists?.map?.((artist: any) => artist?.name) || result.artist);

    return {
      score: toOptionalNumber(item.score ?? result.score),
      title: result.title || result.name,
      artist: artists.join(', ') || undefined,
      album: result.album?.name,
      isrc: externalIds.isrc,
      upc: externalIds.upc,
      acrid: result.acrid,
      raw: item,
    };
  });
}

export function normalizeScanPayload(payload: any): AcrCloudScanSummary {
  const root = Array.isArray(payload) ? payload[0] : payload;
  const payloadData = root?.data;
  const data = Array.isArray(payloadData) ? payloadData[0] : payloadData || root;
  const results = data?.results || root?.results || {};

  return {
    fileId: data?.id || root?.file_id,
    state: mapScanState(data?.state ?? root?.state),
    aiDetection: normalizeAiDetection(results),
    fingerprintMatches: normalizeFingerprintMatches(results),
    rawResult: root,
  };
}

async function postMultipart(
  url: string,
  filePath: string,
  fields: Record<string, string | number>,
  headers: Record<string, string> = {},
  binaryField = 'file'
): Promise<any> {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append(binaryField, new Blob([new Uint8Array(buffer)]), path.basename(filePath));

  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: form,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `ACRCloud request failed with ${response.status}`);
  }

  return payload;
}

export function isAcrCloudFileScanningConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.consoleToken && config.fsRegion && config.fsContainerId);
}

export function isAcrCloudIdentifyConfigured(): boolean {
  const config = getConfig();
  return Boolean(config.identifyHost && config.identifyAccessKey && config.identifyAccessSecret);
}

export async function identifyAudioFile(filePath: string, dataType: 'audio' | 'fingerprint' = 'audio'): Promise<AcrCloudIdentifyResult> {
  const config = getConfig();
  const host = requireValue(config.identifyHost, 'ACRCLOUD_IDENTIFY_HOST');
  const accessKey = requireValue(config.identifyAccessKey, 'ACRCLOUD_IDENTIFY_ACCESS_KEY');
  const accessSecret = requireValue(config.identifyAccessSecret, 'ACRCLOUD_IDENTIFY_ACCESS_SECRET');
  const stats = await fs.stat(filePath);

  if (stats.size > MAX_IDENTIFY_BYTES) {
    throw new Error('ACRCloud identify sample must be below 5MB');
  }

  const timestamp = String(Date.now() / 1000);
  const signature = signIdentifyRequest(accessSecret, accessKey, dataType, timestamp);
  console.log('[ACRCloud] Identify request starting', {
    host,
    dataType,
    sampleBytes: stats.size,
  });
  const payload = await postMultipart(`https://${host}${IDENTIFY_ENDPOINT}`, filePath, {
    access_key: accessKey,
    sample_bytes: stats.size,
    timestamp,
    signature,
    data_type: dataType,
    signature_version: SIGNATURE_VERSION,
  }, {}, 'sample');

  const result = {
    statusCode: payload?.status?.code,
    statusMessage: payload?.status?.msg,
    raw: payload,
    fingerprintMatches: normalizeFingerprintMatches(payload?.metadata || payload?.results || payload),
  };
  console.log('[ACRCloud] Identify request completed', {
    statusCode: result.statusCode,
    statusMessage: result.statusMessage,
    fingerprintMatches: result.fingerprintMatches.length,
  });
  return result;
}

export async function identifyFirstThirtySeconds(filePath: string): Promise<AcrCloudScanSummary> {
  let samplePath: string | null = null;
  try {
    samplePath = await createThirtySecondSample(filePath);
    const result = await identifyAudioFile(samplePath, 'audio');

    return {
      state: result.fingerprintMatches.length > 0 ? 'ready' : 'no_results',
      aiDetection: [],
      fingerprintMatches: result.fingerprintMatches,
      rawResult: {
        scanMode: 'first_30_seconds_identification',
        sampleSeconds: SCAN_SAMPLE_SECONDS,
        ...((result.raw && typeof result.raw === 'object') ? result.raw as Record<string, unknown> : { raw: result.raw }),
      },
    };
  } finally {
    if (samplePath) {
      await fs.unlink(samplePath).catch(() => undefined);
    }
  }
}

export async function uploadFirstThirtySecondsForScan(filePath: string, name?: string, dataType: AcrCloudDataType = 'audio'): Promise<AcrCloudScanSummary> {
  let samplePath: string | null = null;
  try {
    samplePath = await createThirtySecondSample(filePath);
    const scan = await uploadFileForScan(samplePath, name ? `${name} (first ${SCAN_SAMPLE_SECONDS}s)` : undefined, dataType);
    return {
      ...scan,
      rawResult: {
        scanMode: 'first_30_seconds_file_scan',
        sampleSeconds: SCAN_SAMPLE_SECONDS,
        originalName: name,
        result: scan.rawResult,
      },
    };
  } finally {
    if (samplePath) {
      await fs.unlink(samplePath).catch(() => undefined);
    }
  }
}

export async function uploadFileForScan(filePath: string, name?: string, dataType: AcrCloudDataType = 'audio'): Promise<AcrCloudScanSummary> {
  const config = getConfig();
  const token = requireValue(config.consoleToken, 'ACRCLOUD_CONSOLE_TOKEN');
  const region = requireValue(config.fsRegion, 'ACRCLOUD_FS_REGION');
  const containerId = requireValue(config.fsContainerId, 'ACRCLOUD_FS_CONTAINER_ID');
  const url = `${getFsBaseUrl(region)}/fs-containers/${containerId}/files`;

  console.log('[ACRCloud] File scan upload starting', {
    region,
    containerId,
    name,
    dataType,
  });
  const payload = await postMultipart(
    url,
    filePath,
    {
      data_type: dataType,
      ...(name ? { name } : {}),
    },
    {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }
  );

  const scan = normalizeScanPayload(payload);
  console.log('[ACRCloud] File scan upload completed', {
    fileId: scan.fileId,
    state: scan.state,
    aiDetections: scan.aiDetection.length,
    fingerprintMatches: scan.fingerprintMatches.length,
  });
  return scan;
}

export async function getScanResult(fileId: string): Promise<AcrCloudScanSummary> {
  const config = getConfig();
  const token = requireValue(config.consoleToken, 'ACRCLOUD_CONSOLE_TOKEN');
  const region = requireValue(config.fsRegion, 'ACRCLOUD_FS_REGION');
  const containerId = requireValue(config.fsContainerId, 'ACRCLOUD_FS_CONTAINER_ID');
  const url = `${getFsBaseUrl(region)}/fs-containers/${containerId}/files/${fileId}`;

  console.log('[ACRCloud] Scan result fetch starting', { fileId, region, containerId });
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `ACRCloud scan result failed with ${response.status}`);
  }

  const scan = normalizeScanPayload(payload);
  console.log('[ACRCloud] Scan result fetch completed', {
    fileId: scan.fileId || fileId,
    state: scan.state,
    aiDetections: scan.aiDetection.length,
    fingerprintMatches: scan.fingerprintMatches.length,
  });
  return scan;
}

export async function startTrackAcrCloudScan(trackId: string, audioPath: string, name: string): Promise<void> {
  if (!isAcrCloudFileScanningConfigured()) {
    console.warn('[ACRCloud] Track scan skipped: file scanning is not configured', {
      trackId,
      requiredEnv: ['ACRCLOUD_CONSOLE_TOKEN', 'ACRCLOUD_FS_REGION', 'ACRCLOUD_FS_CONTAINER_ID'],
    });
    await updateTrackAcrCloudById(trackId, {
      'acrCloud.scanState': 'not_configured',
      'acrCloud.lastError': 'ACRCloud 30-second file scanning is not configured',
      'acrCloud.checkedAt': new Date(),
    });
    return;
  }

  try {
    console.log('[ACRCloud] Track scan starting', { trackId, name, audioPath });
    await updateTrackAcrCloudById(trackId, {
      'acrCloud.scanState': 'pending',
      'acrCloud.lastError': undefined,
      'acrCloud.checkedAt': new Date(),
    });

    const scan = await uploadFirstThirtySecondsForScan(audioPath, name, 'audio');
    await updateTrackAcrCloudById(trackId, {
      'acrCloud.fileId': scan.fileId,
      'acrCloud.scanState': scan.state,
      'acrCloud.aiDetection': scan.aiDetection,
      'acrCloud.fingerprintMatches': scan.fingerprintMatches,
      'acrCloud.rawResult': scan.rawResult,
      'acrCloud.checkedAt': new Date(),
    });
    console.log('[ACRCloud] Track scan stored', {
      trackId,
      fileId: scan.fileId,
      state: scan.state,
    });
  } catch (error) {
    console.error('[ACRCloud] Track scan failed', {
      trackId,
      name,
      error: error instanceof Error ? error.message : error,
    });
    await updateTrackAcrCloudById(trackId, {
      'acrCloud.scanState': 'error',
      'acrCloud.lastError': error instanceof Error ? error.message : 'ACRCloud scan failed',
      'acrCloud.checkedAt': new Date(),
    });
  }
}

export async function persistScanResult(fileId: string, scan: AcrCloudScanSummary): Promise<void> {
  console.log('[ACRCloud] Persisting scan result', {
    fileId,
    state: scan.state,
    aiDetections: scan.aiDetection.length,
    fingerprintMatches: scan.fingerprintMatches.length,
  });
  const standaloneTrack = await updateStandaloneTrackAcrCloudByFileId(fileId, scan);

  await updateCanonicalTrackLegacyAcrCloudByFileId(fileId, scan);

  const canonicalTracks = await findCanonicalTracksByAcrCloudFileId(fileId);
  await upsertAcrCloudFingerprintsForTracks(canonicalTracks as Array<{ _id: unknown; releaseId?: unknown }>, fileId, scan);

  await updateReleaseTrackAcrCloudByFileId(fileId, scan);

  if (hasAcrCloudIssue(scan)) {
    const canonicalTrack = canonicalTracks[0] as any;
    const ownerId =
      standaloneTrack?.ownerUserId?.toString?.() ||
      standaloneTrack?.artistId?.toString?.() ||
      canonicalTrack?.ownerUserId?.toString?.() ||
      canonicalTrack?.artistId?.toString?.();

    await createAcrCloudIssueTicket({
      ownerId,
      trackId: (standaloneTrack?._id || canonicalTrack?._id)?.toString?.(),
      releaseId: (standaloneTrack?.releaseId || canonicalTrack?.releaseId)?.toString?.(),
      fileId,
      summary: [
        `ACRCloud flagged uploaded audio file ${fileId}.`,
        `AI detections: ${scan.aiDetection.length}.`,
        `Fingerprint matches: ${scan.fingerprintMatches.length}.`,
        'Admin review is required before release approval or delivery.',
      ].join(' '),
    });
  }
}
