import Cookies from 'js-cookie';
import { getConfiguredApiBaseUrl } from './urlConfig';

type UploadType = 'artwork' | 'audio' | 'support' | 'knowledge-base';

const CHUNK_SIZE = 20 * 1024 * 1024;
const MAX_PARALLEL = 4;
const MIN_CHUNKED_SIZE = 50 * 1024 * 1024;

interface MultipartStartResult {
  success: boolean;
  uploadId: string;
  key: string;
  directory: string;
  filename: string;
  partSize: number;
  parallel: number;
}

interface PartUrlResult {
  success: boolean;
  partUrls: { partNumber: number; url: string }[];
}

interface MultipartCompleteResult {
  success: boolean;
  key: string;
  publicUrl: string;
  filename: string;
}

function getTokenHeader(): Record<string, string> {
  const token = Cookies.get('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiUrl(path: string): string {
  const base = getConfiguredApiBaseUrl().replace(/\/+$/, '');
  return `${base}${path}`;
}

async function startMultipart(
  filename: string,
  type: UploadType
): Promise<MultipartStartResult> {
  const res = await fetch(apiUrl('/storage/multipart/start'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
    body: JSON.stringify({ filename, type }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to start multipart upload');
  }
  return res.json();
}

async function getPartUrls(
  key: string,
  uploadId: string,
  totalParts: number
): Promise<PartUrlResult> {
  const res = await fetch(apiUrl('/storage/multipart/part-urls'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
    body: JSON.stringify({ key, uploadId, totalParts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to get part upload URLs');
  }
  return res.json();
}

async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<MultipartCompleteResult> {
  const res = await fetch(apiUrl('/storage/multipart/complete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
    body: JSON.stringify({ key, uploadId, parts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to complete multipart upload');
  }
  return res.json();
}

async function abortMultipart(key: string, uploadId: string): Promise<void> {
  await fetch(apiUrl('/storage/multipart/abort'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getTokenHeader() },
    body: JSON.stringify({ key, uploadId }),
  }).catch(() => {});
}

function uploadPart(
  url: string,
  blob: Blob
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (etag) {
          resolve(etag.replace(/"/g, ''));
        } else {
          reject(new Error('No ETag in response'));
        }
      } else {
        reject(new Error(`Part upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Part upload failed'));
    xhr.send(blob);
  });
}

export async function chunkedUploadToR2(
  file: File,
  type: UploadType,
  onProgress?: (percent: number) => void
): Promise<{ url: string; filename: string }> {
  if (file.size < MIN_CHUNKED_SIZE) {
    throw new Error('File too small for chunked upload');
  }

  const { uploadId, key, filename } = await startMultipart(file.name, type);
  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const { partUrls } = await getPartUrls(key, uploadId, totalParts);

  const parts: { PartNumber: number; ETag: string }[] = [];
  let completed = 0;
  let aborted = false;

  const uploadNext = async (index: number): Promise<void> => {
    if (aborted) return;
    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    try {
      const etag = await uploadPart(partUrls[index].url, blob);
      parts.push({ PartNumber: index + 1, ETag: etag });
      completed++;
      if (onProgress) {
        onProgress(Math.min(99, Math.round((completed / totalParts) * 100)));
      }
    } catch (err) {
      aborted = true;
      await abortMultipart(key, uploadId).catch(() => {});
      throw err;
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < totalParts; i += MAX_PARALLEL) {
    const batch = [];
    for (let j = i; j < Math.min(i + MAX_PARALLEL, totalParts); j++) {
      batch.push(uploadNext(j));
    }
    workers.push(...batch);
  }
  await Promise.all(workers);

  parts.sort((a, b) => a.PartNumber - b.PartNumber);
  const result = await completeMultipart(key, uploadId, parts);

  if (onProgress) onProgress(100);
  return { url: result.publicUrl, filename: result.filename };
}

export async function uploadWithAutoDetect(
  file: File,
  type: UploadType,
  onProgress?: (percent: number) => void
): Promise<{ url: string; filename: string }> {
  if (file.size >= MIN_CHUNKED_SIZE) {
    return chunkedUploadToR2(file, type, onProgress);
  }
  const { uploadDirectlyToR2 } = await import('./directUpload');
  return uploadDirectlyToR2(file, type, onProgress);
}
