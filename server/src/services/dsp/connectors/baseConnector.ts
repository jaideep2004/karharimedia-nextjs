import { DspConnector, DspConnectorContext, DspDeliveryPayload, DspDeliveryResult } from '../../../types/dsp';

export abstract class BaseDspConnector implements DspConnector {
  abstract key: string;
  abstract displayName: string;
  abstract capabilities: DspConnector['capabilities'];

  async validateCredentials(credentials: Record<string, unknown>): Promise<{ valid: boolean; error?: string }> {
    const hasApiKey = Boolean(credentials.apiKey || credentials.clientId);
    return hasApiKey ? { valid: true } : { valid: false, error: 'Missing apiKey/clientId' };
  }

  async validateTrack(payload: DspDeliveryPayload): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if ('releaseId' in payload) {
      if (!payload.releaseTitle) errors.push('Missing release title');
      if (!Array.isArray(payload.tracks) || payload.tracks.length === 0) errors.push('Missing release tracks');
      if (!Array.isArray(payload.stores) || payload.stores.length === 0) errors.push('Missing release stores');
    } else {
      if (!payload.title) errors.push('Missing track title');
      if (!payload.artistName) errors.push('Missing artist name');
      if (!payload.audioFile) errors.push('Missing audio file');
      if (!payload.artwork) errors.push('Missing artwork');
    }
    return { valid: errors.length === 0, errors };
  }

  async deliver(payload: DspDeliveryPayload, context: DspConnectorContext): Promise<DspDeliveryResult> {
    const validation = await this.validateTrack(payload);
    if (!validation.valid) {
      return { state: 'failed', message: validation.errors.join(', ') };
    }

    return {
      state: 'needs_attention',
      message: `${this.displayName} connector is registered as a shell. Add partner credentials and a live connector before dispatch.`,
      metadata: {
        adapter: 'shellConnector',
        providerKey: context.providerKey,
        operation: context.operation || 'deliver',
      },
    };
  }
}
