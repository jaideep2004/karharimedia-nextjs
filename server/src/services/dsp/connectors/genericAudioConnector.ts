import { DspCapability } from '../../../types/dsp';
import { BaseDspConnector } from './baseConnector';

export class GenericAudioConnector extends BaseDspConnector {
  key: string;
  displayName: string;
  capabilities: DspCapability[];

  constructor(key: string, displayName: string, capabilities: DspCapability[] = ['audio_delivery', 'reporting']) {
    super();
    this.key = key;
    this.displayName = displayName;
    this.capabilities = capabilities;
  }
}
