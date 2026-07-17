const DIR_MAP: Record<string, string> = {
  audio: 'tracks',
  image: 'artwork',
  support: 'support',
  'knowledge-base': 'knowledge-base',
};

export function getFileUrl(
  filename: string | null | undefined,
  type: 'audio' | 'image' | 'support' | 'knowledge-base'
): string {
  if (!filename) return '';
  const dir = DIR_MAP[type] || type;
  const r2Domain = process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN;
  if (r2Domain) return `https://${r2Domain}/${dir}/${filename}`;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const base = apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${base}/uploads/${dir}/${filename}`;
}

export function extractFilename(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    return decodeURIComponent(s.split('/').pop() || s);
  } catch {
    return s.split('/').pop() || s;
  }
}
