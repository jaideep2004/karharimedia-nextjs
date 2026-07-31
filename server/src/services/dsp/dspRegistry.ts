import { DspConnector } from '../../types/dsp';
import { MockDspConnector } from './connectors/mockDspConnector';
import { BromaConnector } from './connectors/bromaConnector';
import { YoutubeConnector } from './connectors/youtubeConnector';
import { FacebookConnector } from './connectors/facebookConnector';

const CONNECTORS: Record<string, DspConnector> = {
  broma: new BromaConnector(),
  mock_dsp: new MockDspConnector(),
  youtube: new YoutubeConnector(),
  facebook: new FacebookConnector(),
};

export const dspRegistry = {
  get(providerKey: string): DspConnector {
    const connector = CONNECTORS[providerKey];
    if (!connector) {
      throw new Error(`Unsupported DSP connector: ${providerKey}`);
    }
    return connector;
  },
  list(): DspConnector[] {
    return Object.values(CONNECTORS);
  },
};
