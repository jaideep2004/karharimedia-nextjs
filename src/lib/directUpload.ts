import Cookies from 'js-cookie';
import { getConfiguredApiBaseUrl } from './urlConfig';

type UploadType = 'artwork' | 'audio' | 'support' | 'knowledge-base';

interface SignedUploadResponse {
  success: boolean;
  uploadUrl: string;
  publicUrl: string;
  key: string;
  filename: string;
  directory: string;
}

async function getSignedUploadUrl(
  filename: string,
  type: UploadType
): Promise<SignedUploadResponse> {
  const token = Cookies.get('token');
  const baseUrl = getConfiguredApiBaseUrl();
  const res = await fetch(`${baseUrl}/storage/r2-signed-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename, type }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to get signed upload URL');
  }
  return res.json();
}

export async function uploadDirectlyToR2(
  file: File,
  type: UploadType,
  onProgress?: (percent: number) => void
): Promise<{ url: string; filename: string }> {
  const { uploadUrl, publicUrl, filename } = await getSignedUploadUrl(file.name, type);

  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.min(100, Math.round((100 * ev.loaded) / ev.total)));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ url: publicUrl, filename });
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });
  }

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
  return { url: publicUrl, filename };
}
