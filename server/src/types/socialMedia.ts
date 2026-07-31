export type VisualizerPreset = 'bars' | 'spectrum' | 'circular';
export type VisualizerColor = 'cyan' | 'green' | 'pink' | 'purple' | 'red' | 'white';
export type SocialPlatform = 'youtube' | 'facebook';
export type AlbumMode = 'individual' | 'album' | 'both';

export interface SocialVideoConfig {
  title: string;
  description: string;
  visibility: 'public' | 'unlisted' | 'private';
  scheduleAt?: Date;
  preset: VisualizerPreset;
  color?: VisualizerColor;
  albumMode?: AlbumMode;
  trackIds?: string[];
  targetPageId?: string;
}

export interface SocialDeliveryMetadata {
  r2VideoUrl?: string;
  videoUrl?: string;
  videoId?: string;
  playlistUrl?: string;
  trackIds: string[];
  albumMode?: AlbumMode;
  preset: VisualizerPreset;
  color?: VisualizerColor;
  videoDuration?: number;
  fileSize?: number;
}
