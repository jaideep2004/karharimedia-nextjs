export type ReleaseTrack = Record<string, any>;
export type PublishingStage = 'pending' | 'approved' | 'completed';
export type TrackMetadataRow = Record<string, string> & {
  id: string;
  releaseId: string;
  publishingStatus: PublishingStage;
};

const publishingStages: PublishingStage[] = ['pending', 'approved', 'completed'];

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getReleaseOwnerQuery(user: {
  _id: string;
  name?: string;
  artistName?: string;
  email?: string;
}) {
  const userId = String(user._id);

  return {
    $or: [
      { ownerUserId: userId },
      { userId },
      { artistId: userId },
      { ownerId: userId },
      { createdBy: userId },
    ],
  };
}

export function asMusicPublishingStage(value: unknown): PublishingStage {
  const normalized = String(value || '').toLowerCase();
  return publishingStages.includes(normalized as PublishingStage)
    ? (normalized as PublishingStage)
    : 'pending';
}

export function getTrackPublishingStatus(track: ReleaseTrack): PublishingStage {
  return asMusicPublishingStage(track.publishingStatus || track.musicPublishingStatus);
}

export function asString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join(', ');
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const withHex = value as { toHexString?: () => string; toString?: () => string };
    if (typeof withHex.toHexString === 'function') return withHex.toHexString();
    if (typeof withHex.toString === 'function' && withHex.toString !== Object.prototype.toString) {
      return withHex.toString();
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function getMusicPublishingTrackKey(
  releaseId: string,
  track: ReleaseTrack,
  index: number
) {
  return asString(track._id || track.id || track.isrc || `${releaseId}-${index}`);
}

export function normalizeMusicPublishingTrack(
  release: Record<string, any>,
  track: ReleaseTrack,
  index: number
): TrackMetadataRow {
  const releaseId = asString(release._id);
  const trackKey = getMusicPublishingTrackKey(releaseId, track, index);
  const contributors = Array.isArray(track.contributors)
    ? track.contributors
        .map((contributor: any) => `${contributor.role || 'contributor'}:${contributor.name || ''}`)
        .filter(Boolean)
        .join(', ')
    : '';
  const lyricists = Array.isArray(track.contributors)
    ? track.contributors
        .filter((contributor: any) => contributor.role === 'lyricist' && contributor.name)
        .map((contributor: any) => contributor.name)
        .join(', ')
    : '';

  return {
    id: `${releaseId}:${trackKey}`,
    releaseId,
    publishingStatus: getTrackPublishingStatus(track),
    releaseTitle: asString(release.releaseTitle || release.title),
    releaseType: asString(release.releaseType),
    releaseStatus: asString(release.status),
    releaseDate: asString(release.releaseDate),
    originalReleaseDate: asString(track.originalReleaseDate || release.originalReleaseDate),
    label: asString(release.label),
    releaseUpc: asString(release.upc),
    ownerName: asString(release.ownerName || release.ownerArtistName || release.primaryArtist),
    ownerEmail: asString(release.ownerEmail),
    territories: asString(release.territories),
    stores: asString(release.stores),
    trackNumber: asString(track.trackNumber || index + 1),
    discNumber: asString(track.discNumber || 1),
    title: asString(track.title),
    version: asString(track.version),
    artist: asString(track.artist || release.primaryArtist),
    featuring: asString(track.featuring),
    remixer: asString(track.remixer),
    isrc: asString(track.isrc),
    trackUpc: asString(track.upc),
    duration: asString(track.duration),
    genre: asString(track.genre),
    subgenre: asString(track.subgenre),
    metadataLanguage: asString(track.metadataLanguage),
    audioLanguage: asString(track.audioLanguage || track.language),
    explicit: track.explicit ? 'Yes' : 'No',
    parentalAdvisory: asString(track.parentalAdvisory),
    instrumental: track.instrumental ? 'Yes' : 'No',
    composers: asString(track.composers),
    lyricists: asString(lyricists),
    publishers: asString(track.publishers),
    producers: asString(track.producers),
    copyrightC: asString(track.copyrightC),
    copyrightCYear: asString(track.copyrightCYear),
    copyrightP: asString(track.copyrightP),
    copyrightPYear: asString(track.copyrightPYear),
    recordingYear: asString(track.recordingYear),
    contributors,
    audioFile: asString(track.audioFile),
    audioUrl: asString(track.audioUrl),
    acrState: asString(track.acrCloud?.scanState || track.acrCloud?.state),
    acrSummary: asString(track.acrCloud?.fingerprintMatches?.[0]?.title),
    updatedAt: asString(release.updatedAt),
    createdAt: asString(release.createdAt),
  };
}

export function normalizeMusicPublishingTracks(releases: Record<string, any>[]) {
  return releases.flatMap((release) =>
    Array.isArray(release.tracks)
      ? release.tracks.map((track: ReleaseTrack, index: number) =>
          normalizeMusicPublishingTrack(release, track, index)
        )
      : []
  );
}
