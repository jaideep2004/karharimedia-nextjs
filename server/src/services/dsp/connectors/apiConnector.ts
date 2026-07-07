import crypto from 'crypto';
import axios from 'axios';
import { BaseDspConnector } from './baseConnector';
import { DspCapability, DspConnectorContext, DspDeliveryPayload, DspDeliveryResult } from '../../../types/dsp';

type ApiConnectorConfig = {
  key: string;
  displayName: string;
  capabilities: DspCapability[];
  requiredCredentialKeys: string[];
  deliveryPath: string;
};

export class ApiConnector extends BaseDspConnector {
  key: string;
  displayName: string;
  capabilities: DspCapability[];
  private requiredCredentialKeys: string[];
  private deliveryPath: string;

  constructor(config: ApiConnectorConfig) {
    super();
    this.key = config.key;
    this.displayName = config.displayName;
    this.capabilities = config.capabilities;
    this.requiredCredentialKeys = config.requiredCredentialKeys;
    this.deliveryPath = config.deliveryPath;
  }

  async validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const missing = this.requiredCredentialKeys.filter((key) => !credentials[key]);
    if (missing.length > 0) {
      return { valid: false, error: `Missing credentials: ${missing.join(', ')}` };
    }
    return { valid: true };
  }

  async deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const validated = await this.validateTrack(payload);
    if (!validated.valid) {
      return { state: 'failed', message: validated.errors.join(', ') };
    }

    const integrationMode = String(context.config?.integrationMode || 'shell');
    const baseUrl = typeof context.config?.baseUrl === 'string' ? context.config.baseUrl.trim() : '';
    if (integrationMode === 'shell' || !baseUrl) {
      return {
        state: 'needs_attention',
        message: `${this.displayName} connector is ready for partner API details. Set config.integrationMode=sandbox/live and config.baseUrl after access is approved.`,
        metadata: {
          adapter: 'apiConnector',
          mode: integrationMode,
          deliveryPath: this.deliveryPath,
          requiredCredentialKeys: this.requiredCredentialKeys,
          ddexProfile: 'ddexProfile' in payload ? payload.ddexProfile || 'ERN-4' : 'ERN-4',
        },
      };
    }

    const response = await axios.post(`${baseUrl.replace(/\/+$/, '')}${this.deliveryPath}`, payload, {
      timeout: Number(context.config?.timeoutMs || 30_000),
      headers: this.buildHeaders(context),
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const responseBody = response.data as Record<string, unknown> | undefined;
    const externalId =
      typeof responseBody?.externalId === 'string'
        ? responseBody.externalId
        : typeof responseBody?.id === 'string'
          ? responseBody.id
          : undefined;

    return {
      state: response.status >= 200 && response.status < 300 ? 'processing' : 'failed',
      externalId,
      message:
        response.status >= 200 && response.status < 300
          ? `${this.displayName} accepted delivery request`
          : `${this.displayName} rejected delivery request with HTTP ${response.status}`,
      metadata: {
        endpoint: `${baseUrl}${this.deliveryPath}`,
        adapter: 'apiConnector',
        ddexProfile: 'ddexProfile' in payload ? payload.ddexProfile || 'ERN-4' : 'ERN-4',
        httpStatus: response.status,
        responseBody,
      },
    };
  }

  private buildHeaders(context: DspConnectorContext): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-dsp-provider': this.key,
    };

    const token = context.credentials.bearerToken || context.credentials.accessToken;
    if (typeof token === 'string' && token.trim()) {
      headers.authorization = `Bearer ${token.trim()}`;
    }

    const apiKey = context.credentials.apiKey || context.credentials.clientId;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      headers['x-api-key'] = apiKey.trim();
    }

    return headers;
  }

  validateWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    secret: string
  ): boolean {
    const signature = headers['x-dsp-signature'];
    if (!signature || !secret) return false;

    const payload = JSON.stringify(body || {});
    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const incoming = Array.isArray(signature) ? signature[0] : signature;
    const expected = Buffer.from(digest);
    const received = Buffer.from(incoming);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }
}
