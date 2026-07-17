const PROVIDERS: Record<string, { baseUrl: () => string; directories: Record<string, string> }> = {
  r2: {
    baseUrl: () => {
      const domain = process.env.R2_PUBLIC_DOMAIN || '';
      return domain ? `https://${domain}` : '';
    },
    directories: { audio: 'tracks', image: 'artwork', support: 'support', 'knowledge-base': 'knowledge-base' },
  },
  local: {
    baseUrl: () => {
      const configured = process.env.API_URL || process.env.BACKEND_URL || process.env.PUBLIC_API_URL || '';
      return configured
        ? configured.replace(/\/api\/?$/, '').replace(/\/+$/, '') + '/uploads'
        : process.env.NODE_ENV === 'production'
          ? ''
          : `http://localhost:${process.env.PORT || 5000}/uploads`;
    },
    directories: { audio: 'tracks', image: 'artwork', support: 'support', 'knowledge-base': 'knowledge-base' },
  },
};

export function resolveAssetUrl(filename: string, type: 'audio' | 'image' | 'support' | 'knowledge-base', provider?: string): string {
  if (!filename) return '';
  const p = provider && PROVIDERS[provider] ? PROVIDERS[provider] : PROVIDERS.r2;
  const base = p.baseUrl();
  if (!base) return '';
  const dir = p.directories[type] || type;
  return `${base}/${dir}/${filename}`;
}

export function getStorageProvider(doc: { storageProvider?: string }): string {
  if (doc.storageProvider) return doc.storageProvider;
  const r2Configured = !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
  return r2Configured ? 'r2' : 'local';
}

export function extractFilenameFromUrl(value?: string | null): string {
  if (!value) return '';
  const s = String(value).trim();
  if (/^https?:\/\//i.test(s)) {
    try { return decodeURIComponent(s.split('/').pop() || s); }
    catch { return s.split('/').pop() || s; }
  }
  return s.split('/').pop() || s;
}
