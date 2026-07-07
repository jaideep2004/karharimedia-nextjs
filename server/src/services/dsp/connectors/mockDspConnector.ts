import crypto from 'crypto';
import { BaseDspConnector } from './baseConnector';
import { DspCapability, DspConnectorContext, DspDeliveryPayload, DspDeliveryResult } from '../../../types/dsp';

const payloadId = (payload: DspDeliveryPayload) => {
  const rawId = 'releaseId' in payload ? payload.releaseId : payload.trackId;
  return crypto.createHash('sha256').update(`${rawId}:${JSON.stringify(payload)}`).digest('hex').slice(0, 18);
};

export class MockDspConnector extends BaseDspConnector {
  key: string;
  displayName: string;
  capabilities: DspCapability[];

  constructor(key = 'mock_dsp', displayName = 'Mock DSP', capabilities: DspCapability[] = ['audio_delivery', 'reporting', 'takedown']) {
    super();
    this.key = key;
    this.displayName = displayName;
    this.capabilities = capabilities;
  }

  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    return { valid: true };
  }

  async deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const validation = await this.validateTrack(payload);
    if (!validation.valid) return { state: 'failed', message: validation.errors.join(', ') };

    return {
      state: 'processing',
      externalId: `mock_${context.providerKey}_${payloadId(payload)}`,
      message: `${this.displayName} accepted ${'releaseId' in payload ? 'release' : 'track'} delivery`,
      metadata: {
        adapter: 'mockDspConnector',
        operation: context.operation || 'deliver',
        acceptedAt: new Date().toISOString(),
      },
    };
  }

  async update(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const result = await this.deliver(payload, { ...context, operation: 'update' });
    return { ...result, message: `${this.displayName} accepted update` };
  }

  async takedown(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    return {
      state: 'processing',
      externalId: `mock_${context.providerKey}_${payloadId(payload)}`,
      message: `${this.displayName} accepted takedown`,
      metadata: {
        adapter: 'mockDspConnector',
        operation: 'takedown',
        acceptedAt: new Date().toISOString(),
      },
    };
  }

  async getDeliveryStatus(externalId: string): Promise<DspDeliveryResult> {
    return {
      externalId,
      state: 'delivered',
      message: `${this.displayName} mock status delivered`,
      metadata: { adapter: 'mockDspConnector' },
    };
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
