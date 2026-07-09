import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { lookup } from 'dns/promises';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { UPLOAD_DIR } from '../../../config/constants';

type BromaClientInput = {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
};

const SENSITIVE_RESPONSE_KEYS = new Set([
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'password',
  'token',
  'secret',
]);
const MAX_REMOTE_UPLOAD_BYTES = 500 * 1024 * 1024;

function sanitizeBromaResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeBromaResponse);
  if (!value || typeof value !== 'object') return value;

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    acc[key] = SENSITIVE_RESPONSE_KEYS.has(key) ? '[redacted]' : sanitizeBromaResponse(entry);
    return acc;
  }, {});
}

function collectBromaMessages(value: unknown, path = '', messages: string[] = []): string[] {
  if (messages.length >= 8 || value === undefined || value === null) return messages;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    if (text) messages.push(path ? `${path}: ${text}` : text);
    return messages;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectBromaMessages(entry, path, messages);
    return messages;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      collectBromaMessages(entry, path ? `${path}.${key}` : key, messages);
    }
  }

  return messages;
}

function getBromaErrorMessage(status: number, data: unknown) {
  const messages = collectBromaMessages(data)
    .map((message) => message.replace(/\s+/g, ' ').slice(0, 220))
    .filter(Boolean);
  return messages.length ? `Broma HTTP ${status}: ${messages.join('; ')}` : `Broma HTTP ${status}`;
}

function isPrivateAddress(address: string) {
  if (net.isIPv6(address)) {
    return address === '::1' || address.toLowerCase().startsWith('fc') || address.toLowerCase().startsWith('fd') || address.toLowerCase().startsWith('fe80:');
  }

  if (!net.isIPv4(address)) return false;
  const parts = address.split('.').map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function filenameFromUrl(url: URL, fallback: string) {
  const basename = path.basename(decodeURIComponent(url.pathname || ''));
  return basename && basename.includes('.') ? basename : fallback;
}

export class BromaClient {
  private http: AxiosInstance;
  private credentials: Record<string, unknown>;
  private accessToken?: string;
  private refreshToken?: string;
  private language: string;

  constructor(input: BromaClientInput) {
    const baseUrl = String(input.config.baseUrl || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
    this.credentials = input.credentials;
    this.accessToken = typeof input.credentials.accessToken === 'string' ? input.credentials.accessToken : undefined;
    this.refreshToken = typeof input.credentials.refreshToken === 'string' ? input.credentials.refreshToken : undefined;
    this.language = String(input.config.language || 'en');
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: Number(input.config.timeoutMs || 60_000),
      headers: { 'Content-Language': this.language },
      validateStatus: (status) => status >= 200 && status < 600,
    });
  }

  private authHeaders() {
    return this.accessToken ? { 'X-Access-Token': this.accessToken } : {};
  }

  private async login() {
    const response = await this.http.post('/auth/login', {
      email: this.credentials.email,
      password: this.credentials.password,
    });
    const data = response.data?.data || response.data || {};
    this.accessToken = data.access_token || data.accessToken;
    this.refreshToken = data.refresh_token || data.refreshToken || this.refreshToken;
    if (!this.accessToken) throw new Error('Broma authorization failed: missing access token');
  }

  private async refresh() {
    if (!this.refreshToken) {
      await this.login();
      return;
    }

    const response = await this.http.post('/auth/refresh', { refresh_token: this.refreshToken });
    if (response.status === 401) {
      await this.login();
      return;
    }
    const data = response.data?.data || response.data || {};
    this.accessToken = data.access_token || data.accessToken;
    this.refreshToken = data.refresh_token || data.refreshToken || this.refreshToken;
    if (!this.accessToken) throw new Error('Broma token refresh failed: missing access token');
  }

  private async request<T = any>(config: AxiosRequestConfig, retry = true): Promise<T> {
    if (!this.accessToken) await this.login();
    const response = await this.http.request({
      ...config,
      headers: {
        ...(config.headers || {}),
        ...this.authHeaders(),
      },
    });

    if (response.status === 401 && retry) {
      await this.refresh();
      return this.request<T>(config, false);
    }

    if (response.status >= 400) {
      const responseBody = sanitizeBromaResponse(response.data);
      const message = getBromaErrorMessage(response.status, responseBody);
      const error = new Error(message);
      (error as any).statusCode = response.status;
      (error as any).responseBody = responseBody;
      throw error;
    }

    return response.data as T;
  }

  async getOutlets(releaseTypeId?: number) {
    return this.request<any>({
      method: 'GET',
      url: '/dictionaries/outlets',
      params: releaseTypeId ? { release_type_id: releaseTypeId } : undefined,
    });
  }

  async getDrafts(accountId?: string | number, params: Record<string, unknown> = {}) {
    const url = accountId ? `/accounts/${accountId}/assets/drafts/all` : '/draft';
    return this.request<any>({ method: 'GET', url, params });
  }

  async getStatisticsOutlets() {
    return this.request<any>({ method: 'GET', url: '/stat/v1/statistics/outlets' });
  }

  async createStatisticsReport(accountId: string | number, payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'POST',
      url: `/stat/v1/statistics/accounts/${accountId}/report`,
      data: payload,
    });
  }

  async createStatisticsSummaryReport(accountId: string | number, payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'POST',
      url: `/stat/v1/statistics/accounts/${accountId}/report/summary`,
      data: payload,
    });
  }

  async getStatisticsReport(accountId: string | number, reportId: string | number) {
    return this.request<any>({
      method: 'GET',
      url: `/stat/v1/statistics/accounts/${accountId}/report/${reportId}`,
    });
  }

  async getAccountReleaseAssets(accountId: string | number, params: Record<string, unknown> = {}) {
    return this.request<any>({
      method: 'GET',
      url: `/accounts/${accountId}/assets/releases`,
      params,
    });
  }

  async getAccountAssetStatistics(accountId: string | number) {
    return this.request<any>({
      method: 'GET',
      url: `/accounts/${accountId}/asset-statistics`,
    });
  }

  async deleteDraft(draftType: 'composition' | 'release', draftId: string | number) {
    return this.request<any>({
      method: 'DELETE',
      url: `/assets/draft/${draftType}/${draftId}/remove`,
    });
  }

  async getReleaseModeration(accountId: string | number, assetId: string | number) {
    return this.request<any>({
      method: 'GET',
      url: `/accounts/${accountId}/releases/${assetId}/moderation`,
    });
  }

  async deleteStatisticsReport(accountId: string | number, reportId: string | number) {
    return this.request<any>({
      method: 'DELETE',
      url: `/stat/v1/statistics/accounts/${accountId}/report/${reportId}/`,
    });
  }

  async getReleaseTypes() {
    return this.request<any>({
      method: 'GET',
      url: '/dictionaries/release-types',
      params: { category: 'audio', language: this.language },
    });
  }

  async createRelease(payload: Record<string, unknown>) {
    return this.request<any>({ method: 'POST', url: '/repertoire/release/', data: payload });
  }

  async uploadRecording(releaseId: string, file: unknown) {
    const form = await this.buildUploadForm(file, 'tracks');
    return this.request<any>({
      method: 'POST',
      url: `/repertoire/release/${releaseId}/recording/upload`,
      data: form,
    });
  }

  async updateRecording(releaseId: string, recordingId: string, payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'PUT',
      url: `/repertoire/release/${releaseId}/recording/${recordingId}`,
      data: payload,
    });
  }

  async addComposition(releaseId: string, recordingId: string, payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'POST',
      url: `/repertoire/release/${releaseId}/recording/${recordingId}/composition`,
      data: payload,
    });
  }

  async uploadCover(releaseId: string, file: unknown) {
    const form = await this.buildUploadForm(file, 'artwork');
    return this.request<any>({
      method: 'POST',
      url: `/repertoire/release/${releaseId}/cover/upload`,
      data: form,
    });
  }

  async updateDistribution(releaseId: string, payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'POST',
      url: `/repertoire/release/${releaseId}/distribution`,
      data: payload,
    });
  }

  async createAdditionalRelease(payload: Record<string, unknown>) {
    return this.request<any>({
      method: 'POST',
      url: '/repertoire/release/additional/',
      params: payload,
    });
  }

  async sendModeration(releaseId: string) {
    return this.request<any>({
      method: 'POST',
      url: `/repertoire/release/${releaseId}/send-moderate`,
    });
  }

  async getRelease(releaseId: string) {
    return this.request<any>({
      method: 'GET',
      url: `/repertoire/release/${releaseId}/data`,
    });
  }

  private async buildUploadForm(file: unknown, defaultDirectory: 'tracks' | 'artwork') {
    const source = typeof file === 'string' ? file.trim() : '';
    if (!source) throw new Error('Broma upload failed: missing file path');
    if (/^https?:\/\//i.test(source)) {
      const localPath = this.resolvePublicUploadUrl(source);
      return localPath
        ? this.buildLocalUploadForm(localPath)
        : this.buildRemoteUploadForm(source, defaultDirectory === 'tracks' ? 'recording.mp3' : 'cover.jpg');
    }

    const fullPath = this.resolveUploadPath(source, defaultDirectory);
    return this.buildLocalUploadForm(fullPath);
  }

  private async buildLocalUploadForm(fullPath: string) {
    const data = await fs.readFile(fullPath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)]), path.basename(fullPath));
    return form;
  }

  private async buildRemoteUploadForm(source: string, fallbackFilename: string) {
    const url = new URL(source);
    if (url.protocol !== 'https:') {
      throw new Error('Broma upload failed: remote audio URL must be HTTPS or a local /uploads URL');
    }

    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error('Broma upload failed: remote audio URL resolves to a private address');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Broma upload failed: remote audio download returned HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_UPLOAD_BYTES) {
      throw new Error('Broma upload failed: remote audio file is too large');
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const data = await response.arrayBuffer();
    if (data.byteLength === 0) throw new Error('Broma upload failed: remote audio file is empty');
    if (data.byteLength > MAX_REMOTE_UPLOAD_BYTES) {
      throw new Error('Broma upload failed: remote audio file is too large');
    }

    const form = new FormData();
    form.append('file', new Blob([data], { type: contentType }), filenameFromUrl(url, fallbackFilename));
    return form;
  }

  private resolvePublicUploadUrl(value: string) {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/\\/g, '/');
    const uploadsMatch = pathname.match(/(?:^|\/)(?:api\/)?uploads\/(.+)$/);
    if (!uploadsMatch) return null;
    return this.resolveUploadPath(uploadsMatch[1], undefined);
  }

  private resolveUploadPath(value: string, defaultDirectory: 'tracks' | 'artwork' | undefined) {
    const cleaned = value.replace(/\\/g, '/').replace(/^\/+/, '');
    const withoutPrefix = cleaned.startsWith('uploads/') ? cleaned.slice('uploads/'.length) : cleaned;
    const hasDirectory = withoutPrefix.includes('/');
    const relative = !hasDirectory && defaultDirectory ? path.join(defaultDirectory, withoutPrefix) : withoutPrefix;
    const uploadsRoot = path.resolve(UPLOAD_DIR);
    const fullPath = path.resolve(uploadsRoot, relative);
    if (!fullPath.startsWith(uploadsRoot)) throw new Error('Broma upload failed: invalid file path');
    return fullPath;
  }
}
