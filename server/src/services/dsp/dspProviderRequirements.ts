import {
  DspCapability,
  DspIntegrationMode,
  DspProviderRequirement,
  DspReadinessReport,
} from '../../types/dsp';

type ProviderInput = {
  key: string;
  displayName?: string;
  capabilities?: DspCapability[];
  enabled?: boolean;
  maintenanceMode?: boolean;
  integrationMode?: DspIntegrationMode;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
};

const PARTNER_DELIVERY_DOCS = 'Delivery API docs are partner-only. Keep shell ready until contract and endpoint are issued.';

const baseRequirement = (
  key: string,
  displayName: string,
  options: Partial<DspProviderRequirement> = {}
): DspProviderRequirement => ({
  key,
  displayName,
  docsStatus: options.docsStatus || 'partner_only',
  docsUrl: options.docsUrl,
  payloadStandard: options.payloadStandard || 'ddex_ern',
  requiredCredentialKeys: options.requiredCredentialKeys || ['partnerContractId', 'apiKey'],
  requiredConfigKeys: options.requiredConfigKeys || ['baseUrl', 'webhookSecret'],
  readinessChecks: options.readinessChecks || ['partner_contract', 'credentials', 'delivery_endpoint', 'webhook_secret'],
  notes: options.notes || PARTNER_DELIVERY_DOCS,
});

const REQUIREMENTS: Record<string, DspProviderRequirement> = {
  broma: baseRequirement('broma', 'Broma', {
    docsStatus: 'official_public',
    docsUrl: 'https://broma16.com/partner-api/partner-api.en.html',
    payloadStandard: 'platform_api',
    requiredCredentialKeys: ['email', 'password'],
    requiredConfigKeys: ['baseUrl', 'accountId', 'createdCountryId'],
    readinessChecks: ['credentials', 'account_id', 'outlet_mapping'],
    notes: 'Broma is the live mediator for release delivery to DSP outlets.',
  }),
  mock_dsp: baseRequirement('mock_dsp', 'Mock DSP', {
    docsStatus: 'official_public',
    payloadStandard: 'platform_api',
    requiredCredentialKeys: [],
    requiredConfigKeys: ['webhookSecret'],
    readinessChecks: ['webhook_secret'],
    notes: 'Internal sandbox connector for end-to-end delivery flow verification.',
  }),
  spotify: baseRequirement('spotify', 'Spotify', {
    docsUrl: 'https://support.spotify.com/st-en/artists/article/getting-music-on-spotify/',
  }),
  apple_music: baseRequirement('apple_music', 'Apple Music', {
    docsUrl: 'https://developer.apple.com/documentation/AppleMusicAPI',
  }),
  amazon_music: baseRequirement('amazon_music', 'Amazon Music', {
    docsUrl: 'https://artists.amazonmusic.com/faqs',
  }),
  youtube_music: baseRequirement('youtube_music', 'YouTube Music', {
    docsUrl: 'https://developers.google.com/youtube/partner',
  }),
  youtube_content_id: baseRequirement('youtube_content_id', 'YouTube Content ID', {
    docsUrl: 'https://developers.google.com/youtube/partner',
    payloadStandard: 'rights_feed',
    requiredCredentialKeys: ['partnerContractId', 'clientId', 'clientSecret'],
    readinessChecks: ['partner_contract', 'credentials', 'reference_policy', 'webhook_secret'],
  }),
  youtube_music_video: baseRequirement('youtube_music_video', 'YouTube Music Video', {
    docsUrl: 'https://support.google.com/youtube/answer/2822002?hl=en-GB',
  }),
  youtube_art_track: baseRequirement('youtube_art_track', 'YouTube Art Track', {
    docsUrl: 'https://support.google.com/youtube/answer/2822002?hl=en-GB',
  }),
  tiktok: baseRequirement('tiktok', 'TikTok', {
    docsUrl: 'https://newsroom.tiktok.com/sound-on-the-new-platform-for-tiktok-music-marketing-and-global-track-distribution?lang=en',
    payloadStandard: 'platform_api',
  }),
  deezer: baseRequirement('deezer', 'Deezer', {
    docsUrl: 'https://developers.deezer.com/api',
  }),
  soundcloud: baseRequirement('soundcloud', 'SoundCloud', {
    docsStatus: 'official_public',
    docsUrl: 'https://developers.soundcloud.com/docs/api/guide?from=20423',
    payloadStandard: 'platform_api',
    requiredCredentialKeys: ['clientId', 'clientSecret', 'accessToken'],
    requiredConfigKeys: ['baseUrl', 'webhookSecret'],
    notes: 'Public API supports track upload. Distribution/monetization terms may still require partner approval.',
  }),
  tidal: baseRequirement('tidal', 'TIDAL', {
    docsUrl: 'https://developer.tidal.com/documentation',
  }),
  pandora: baseRequirement('pandora', 'Pandora', {
    docsUrl: 'https://help.pandora.com/s/article/Information-about-Pandora-AMP-1519949298654',
    payloadStandard: 'manual_partner_feed',
  }),
  facebook_audio_library: baseRequirement('facebook_audio_library', 'Facebook Audio Library', {
    docsUrl: 'https://www.facebook.com/help/348831205149904/',
    payloadStandard: 'rights_feed',
  }),
  facebook_rights_manager: baseRequirement('facebook_rights_manager', 'Facebook Rights Manager', {
    docsUrl: 'https://www.facebook.com/help/348831205149904/',
    payloadStandard: 'rights_feed',
    requiredCredentialKeys: ['partnerContractId', 'apiKey'],
    requiredConfigKeys: ['baseUrl', 'webhookSecret', 'defaultPolicy'],
  }),
  instagram: baseRequirement('instagram', 'Instagram Music', {
    docsUrl: 'https://www.facebook.com/help/348831205149904/',
    payloadStandard: 'rights_feed',
  }),
  audiomack: baseRequirement('audiomack', 'Audiomack', {
    docsStatus: 'official_public',
    docsUrl: 'https://audiomack.com/data-api/docs',
    payloadStandard: 'platform_api',
    requiredCredentialKeys: ['consumerKey', 'consumerSecret', 'accessToken', 'accessTokenSecret'],
    notes: 'Public data API exists. Confirm partner upload/delivery access before live dispatch.',
  }),
  jiosaavn: baseRequirement('jiosaavn', 'JioSaavn', { docsStatus: 'no_public_docs' }),
  gaana: baseRequirement('gaana', 'Gaana', { docsStatus: 'no_public_docs' }),
  wynk_music: baseRequirement('wynk_music', 'Wynk Music', { docsStatus: 'no_public_docs' }),
  hungama_music: baseRequirement('hungama_music', 'Hungama Music', { docsStatus: 'no_public_docs' }),
  boomplay: baseRequirement('boomplay', 'Boomplay', { docsStatus: 'no_public_docs' }),
  anghami: baseRequirement('anghami', 'Anghami', { docsStatus: 'no_public_docs' }),
  kkbox: baseRequirement('kkbox', 'KKBOX', { docsStatus: 'no_public_docs' }),
  netease_cloud_music: baseRequirement('netease_cloud_music', 'NetEase Cloud Music', { docsStatus: 'no_public_docs' }),
  qobuz: baseRequirement('qobuz', 'Qobuz', { docsStatus: 'no_public_docs' }),
  iheartradio: baseRequirement('iheartradio', 'iHeartRadio', { docsStatus: 'no_public_docs' }),
};

export function getDspRequirement(provider: Pick<ProviderInput, 'key' | 'displayName' | 'capabilities'>): DspProviderRequirement {
  return (
    REQUIREMENTS[provider.key] ||
    baseRequirement(provider.key, provider.displayName || provider.key, {
      docsStatus: 'unknown',
      payloadStandard: provider.capabilities?.includes('rights_management') ? 'rights_feed' : 'ddex_ern',
    })
  );
}

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null && value !== false;
};

const isIntegerLike = (value: unknown) => {
  if (!hasValue(value)) return false;
  if (Number.isInteger(Number(value))) return true;
  return String(value).trim().toUpperCase() === 'IN';
};

export function evaluateDspReadiness(provider: ProviderInput): DspReadinessReport {
  const requirement = getDspRequirement(provider);
  const config = provider.config || {};
  const credentials = provider.credentials || {};
  const mode = provider.integrationMode || (typeof config.integrationMode === 'string' ? config.integrationMode : 'shell');

  if (provider.maintenanceMode || provider.enabled === false) {
    return { state: 'paused', missing: [], warnings: ['Provider disabled or in maintenance mode'], canDispatch: false };
  }

  if (mode === 'shell') {
    return {
      state: 'shell_ready',
      missing: ['partner_contract', ...requirement.requiredCredentialKeys, ...requirement.requiredConfigKeys],
      warnings: [requirement.notes || PARTNER_DELIVERY_DOCS],
      canDispatch: false,
    };
  }

  const missingCredentials = requirement.requiredCredentialKeys.filter((key) => !hasValue(credentials[key]));
  const missingConfig = requirement.requiredConfigKeys.filter((key) => {
    if (key === 'webhookSecret') return !hasValue(config[key]) && !hasValue(credentials.webhookSecret);
    return !hasValue(config[key]);
  });
  const missing = [...missingCredentials, ...missingConfig];

  if (missingCredentials.includes('partnerContractId')) {
    return { state: 'missing_contract', missing, warnings: [requirement.notes || PARTNER_DELIVERY_DOCS], canDispatch: false };
  }

  if (missing.length > 0) {
    return { state: 'missing_credentials', missing, warnings: [], canDispatch: false };
  }

  if (provider.key === 'broma' && !isIntegerLike(config.createdCountryId)) {
    return { state: 'missing_credentials', missing: ['createdCountryId'], warnings: [], canDispatch: false };
  }

  return {
    state: mode === 'live' ? 'live_ready' : 'sandbox_ready',
    missing: [],
    warnings: mode === 'sandbox' ? ['Sandbox mode: no real delivery/live status guarantee'] : [],
    canDispatch: true,
  };
}

export const DSP_PROVIDER_REQUIREMENTS = REQUIREMENTS;
