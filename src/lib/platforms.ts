export type DspKey = string;

export const ALL_DSP_KEYS: DspKey[] = [
  'spotify',
  'apple',
  'amazon',
  'youtube',
  'deezer',
  'tidal',
  'pandora',
  'soundcloud',
  'facebook',
  'instagram',
  'tiktok',
  'snapchat',
  'audiomack',
  'boomplay',
  'joox',
  'anghami',
  'iheartradio',
  'napster',
  'qobuz',
  'kkbox',
  'netease',
  'tencent',
  'kuwo',
  'kugou',
  'resso',
  'gaana',
  'jiosaavn',
  'wynk',
  'hungama',
  'yandex',
  'vk',
  'awa',
  'line',
  'melon',
  'genie',
  'flo',
  'bugs',
  'zvuk',
  'boom',
  'unitedmedia',
  'peloton',
  'whatsapp',
  'facebook-delivery',
  'acr-cloud',
  'facebook-rights-management',
  'youtube-delivery',
];

export const SOCIAL_RIGHTS_DSP_KEYS: DspKey[] = [
  'facebook-rights-management',
  'youtube-delivery',
];

export interface DspMeta {
  key: DspKey;
  name: string;
  logo: string;
  info: string;
}

const DSP_LOGOS = {
  acrCloud: '/images/dsp/acr-cloud.png',
  amazon: '/images/dsp/amazonmusic.png',
  anghami: '/images/dsp/anghami.png',
  apple: '/images/dsp/applemusic.png',
  audiomack: '/images/dsp/audiomack.png',
  awa: '/images/dsp/awamusic.png',
  boom: '/images/dsp/boom.png',
  boomplay: '/images/dsp/boomplay.png',
  bugs: '/images/dsp/bugs.png',
  deezer: '/images/dsp/deezer.png',
  facebook: '/images/dsp/facebook-audio-library.png',
  facebookDelivery: '/images/dsp/facebook.png',
  facebookRightsManagement: '/images/dsp/facebook-rights-management.png',
  flo: '/images/dsp/flomusic.png',
  gaana: '/images/dsp/gaana.png',
  genie: '/images/dsp/geniemusic.png',
  hungama: '/images/dsp/hungamamusic.png',
  iheartradio: '/images/dsp/iheartradio.png',
  instagram: '/images/dsp/instagram-music.png',
  jiosaavn: '/images/dsp/jiosaavan.png',
  joox: '/images/dsp/joox.png',
  kkbox: '/images/dsp/kkbox.png',
  kugou: '/images/dsp/kugoumusic.png',
  kuwo: '/images/dsp/kuwomusic.png',
  line: '/images/dsp/linemusic.png',
  melon: '/images/dsp/melonmusic.png',
  napster: '/images/dsp/napster.png',
  netease: '/images/dsp/neteasecloud.png',
  pandora: '/images/dsp/pandora.png',
  peloton: '/images/dsp/peloton.png',
  qobuz: '/images/dsp/qobuz.png',
  resso: '/images/dsp/resso.png',
  snapchat: '/images/dsp/snapchat-sounds.png',
  soundcloud: '/images/dsp/soundcloud.png',
  spotify: '/images/dsp/spotify.png',
  tencent: '/images/dsp/tencentmusic.png',
  tidal: '/images/dsp/tidal.png',
  tiktok: '/images/dsp/tiktok-music-library.png',
  unitedmedia: '/images/dsp/umamusic.png',
  vk: '/images/dsp/vkmusic.png',
  wynk: '/images/dsp/wynkmusic.png',
  yandex: '/images/dsp/yandexmusic.png',
  youtube: '/images/dsp/ytmusic.png',
  youtubeDelivery: '/images/dsp/youtube-content-id.png',
  whatsapp: '/images/dsp/whatsapp.png',
  zvuk: '/images/dsp/zvuk.png',
} as const;

export const DSP_META: DspMeta[] = [
  {
    key: 'spotify',
    name: 'Spotify',
    logo: DSP_LOGOS.spotify,
    info: "World's largest streaming service.",
  },
  {
    key: 'apple',
    name: 'Apple Music',
    logo: DSP_LOGOS.apple,
    info: "Apple's music streaming.",
  },
  {
    key: 'amazon',
    name: 'Amazon Music',
    logo: DSP_LOGOS.amazon,
    info: "Amazon's music streaming.",
  },
  {
    key: 'youtube',
    name: 'YouTube Music',
    logo: DSP_LOGOS.youtube,
    info: "Google's streaming platform.",
  },
  {
    key: 'deezer',
    name: 'Deezer',
    logo: DSP_LOGOS.deezer,
    info: 'Popular in Europe.',
  },
  {
    key: 'tidal',
    name: 'Tidal',
    logo: DSP_LOGOS.tidal,
    info: 'High-fidelity audio.',
  },
  {
    key: 'pandora',
    name: 'Pandora',
    logo: DSP_LOGOS.pandora,
    info: 'US-based streaming.',
  },
  {
    key: 'soundcloud',
    name: 'SoundCloud',
    logo: DSP_LOGOS.soundcloud,
    info: 'Indie & creators.',
  },
  {
    key: 'facebook',
    name: 'Facebook Audio Library',
    logo: DSP_LOGOS.facebook,
    info: 'Meta music usage across Facebook surfaces.',
  },
  {
    key: 'instagram',
    name: 'Instagram Music',
    logo: DSP_LOGOS.instagram,
    info: 'Music for reels, stories, and creator tools.',
  },
  {
    key: 'tiktok',
    name: 'TikTok Music Library',
    logo: DSP_LOGOS.tiktok,
    info: 'Short-form discovery and creator sounds.',
  },
  {
    key: 'snapchat',
    name: 'Snapchat Sounds',
    logo: DSP_LOGOS.snapchat,
    info: 'Music for snaps and spotlight content.',
  },
  {
    key: 'audiomack',
    name: 'Audiomack',
    logo: DSP_LOGOS.audiomack,
    info: 'Streaming platform for emerging and global catalog.',
  },
  { key: 'boomplay', name: 'Boomplay', logo: DSP_LOGOS.boomplay, info: 'Major African music streaming platform.' },
  {
    key: 'joox',
    name: 'JOOX',
    logo: DSP_LOGOS.joox,
    info: 'Streaming across Southeast Asia and South Africa.',
  },
  { key: 'anghami', name: 'Anghami', logo: DSP_LOGOS.anghami, info: 'Middle East and North Africa streaming.' },
  {
    key: 'iheartradio',
    name: 'iHeartRadio',
    logo: DSP_LOGOS.iheartradio,
    info: 'Radio, playlists, and streaming distribution.',
  },
  { key: 'napster', name: 'Napster', logo: DSP_LOGOS.napster, info: 'Subscription music streaming service.' },
  { key: 'qobuz', name: 'Qobuz', logo: DSP_LOGOS.qobuz, info: 'Hi-res streaming and download store.' },
  { key: 'kkbox', name: 'KKBOX', logo: DSP_LOGOS.kkbox, info: 'East and Southeast Asian music platform.' },
  {
    key: 'netease',
    name: 'NetEase Cloud Music',
    logo: DSP_LOGOS.netease,
    info: 'Chinese music streaming and community.',
  },
  {
    key: 'tencent',
    name: 'Tencent Music',
    logo: DSP_LOGOS.tencent,
    info: 'QQ Music, Kugou, Kuwo ecosystem access.',
  },
  { key: 'kuwo', name: 'Kuwo Music', logo: DSP_LOGOS.kuwo, info: 'Chinese streaming destination.' },
  { key: 'kugou', name: 'Kugou Music', logo: DSP_LOGOS.kugou, info: 'Chinese music streaming platform.' },
  { key: 'resso', name: 'Resso', logo: DSP_LOGOS.resso, info: 'Social music streaming service.' },
  { key: 'gaana', name: 'Gaana', logo: DSP_LOGOS.gaana, info: 'Indian music and podcast streaming.' },
  {
    key: 'jiosaavn',
    name: 'JioSaavn',
    logo: DSP_LOGOS.jiosaavn,
    info: 'Indian and international catalog streaming.',
  },
  { key: 'wynk', name: 'Wynk Music', logo: DSP_LOGOS.wynk, info: 'Indian telecom-linked music streaming.' },
  {
    key: 'hungama',
    name: 'Hungama Music',
    logo: DSP_LOGOS.hungama,
    info: 'Indian digital music and entertainment.',
  },
  { key: 'yandex', name: 'Yandex Music', logo: DSP_LOGOS.yandex, info: 'Streaming across Yandex markets.' },
  { key: 'vk', name: 'VK Music', logo: DSP_LOGOS.vk, info: 'Social music platform for VK users.' },
  { key: 'awa', name: 'AWA', logo: DSP_LOGOS.awa, info: 'Japanese music streaming service.' },
  { key: 'line', name: 'LINE Music', logo: DSP_LOGOS.line, info: 'Music streaming for LINE markets.' },
  { key: 'melon', name: 'Melon', logo: DSP_LOGOS.melon, info: 'South Korean music streaming leader.' },
  { key: 'genie', name: 'Genie Music', logo: DSP_LOGOS.genie, info: 'South Korean streaming and charts.' },
  { key: 'flo', name: 'FLO', logo: DSP_LOGOS.flo, info: 'South Korean music streaming platform.' },
  { key: 'bugs', name: 'Bugs!', logo: DSP_LOGOS.bugs, info: 'South Korean music service.' },
  { key: 'zvuk', name: 'Zvuk', logo: DSP_LOGOS.zvuk, info: 'Music streaming for CIS markets.' },
  { key: 'boom', name: 'BOOM', logo: DSP_LOGOS.boom, info: 'Social and regional music streaming.' },
  {
    key: 'unitedmedia',
    name: 'United Media Agency',
    logo: DSP_LOGOS.unitedmedia,
    info: 'Additional delivery partner network.',
  },
  { key: 'peloton', name: 'Peloton', logo: DSP_LOGOS.peloton, info: 'Fitness and workout music usage.' },
  { key: 'whatsapp', name: 'WhatsApp', logo: DSP_LOGOS.whatsapp, info: 'Music usage across WhatsApp social products.' },
  { key: 'facebook-delivery', name: 'Facebook', logo: DSP_LOGOS.facebookDelivery, info: 'Delivery for Facebook music surfaces.' },
  { key: 'acr-cloud', name: 'ACRCloud', logo: DSP_LOGOS.acrCloud, info: 'Audio fingerprinting and content identification.' },
  {
    key: 'facebook-rights-management',
    name: 'Facebook Rights Management',
    logo: DSP_LOGOS.facebookRightsManagement,
    info: 'Rights management and protection across Facebook surfaces.',
  },
  { key: 'youtube-delivery', name: 'YouTube Content ID', logo: DSP_LOGOS.youtubeDelivery, info: 'Content ID protection for YouTube usage.' },
];

export const DSP_META_BY_KEY: Record<DspKey, DspMeta> = Object.fromEntries(
  DSP_META.map(meta => [meta.key, meta])
) as Record<DspKey, DspMeta>;

const DSP_ALIASES: Record<string, DspKey> = {
  apple_music: 'apple',
  applemusic: 'apple',
  amazon_music: 'amazon',
  amazonmusic: 'amazon',
  youtube_music: 'youtube',
  youtubemusic: 'youtube',
  yt_music: 'youtube',
  ytmusic: 'youtube',
  youtube_content_id: 'youtube',
  youtubecontentid: 'youtube',
  youtube_music_video: 'youtube',
  youtubemusicvideo: 'youtube',
  youtube_art_track: 'youtube',
  youtubearttrack: 'youtube',
  facebook_audio_library: 'facebook',
  facebookaudiolibrary: 'facebook',
  facebook_delivery: 'facebook-delivery',
  facebookdelivery: 'facebook-delivery',
  acr_cloud: 'acr-cloud',
  acrcloud: 'acr-cloud',
  facebook_rights_management: 'facebook-rights-management',
  facebookrightsmanagement: 'facebook-rights-management',
  youtube_delivery: 'youtube-delivery',
  youtubedelivery: 'youtube-delivery',
  instagram_music: 'instagram',
  instagrammusic: 'instagram',
  tiktok_music_library: 'tiktok',
  tiktokmusiclibrary: 'tiktok',
  snapchat_sounds: 'snapchat',
  snapchatsounds: 'snapchat',
};

export function normalizeDspName(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

export function humanizeDspKey(value: string) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function getDspMeta(value?: string | null): DspMeta | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const direct = DSP_META_BY_KEY[trimmed];
  if (direct) return direct;

  const normalized = normalizeDspName(trimmed);
  const aliasKey = DSP_ALIASES[normalized] || DSP_ALIASES[trimmed.toLowerCase()];
  if (aliasKey) return DSP_META_BY_KEY[aliasKey] || null;

  return (
    DSP_META.find(
      meta =>
        normalizeDspName(meta.key) === normalized ||
        normalizeDspName(meta.name) === normalized ||
        normalized.includes(normalizeDspName(meta.name)) ||
        normalizeDspName(meta.name).includes(normalized)
    ) || null
  );
}

export function getDspDisplayName(value?: string | null) {
  const meta = getDspMeta(value);
  return meta?.name || (value ? humanizeDspKey(value) : 'Other');
}

export function getDspInitials(value?: string | null) {
  const name = getDspDisplayName(value);
  return (name.match(/\b\w/g) || []).slice(0, 2).join('').toUpperCase();
}

export function sanitizeDspKeys(input: unknown): DspKey[] {
  if (!Array.isArray(input)) return ALL_DSP_KEYS;
  const allowed = new Set(ALL_DSP_KEYS);
  const out: DspKey[] = [];
  for (const v of input) {
    if (typeof v === 'string' && allowed.has(v as DspKey)) out.push(v as DspKey);
  }
  // if admin clears all, we respect empty list (user sees none)
  return Array.from(new Set(out));
}
