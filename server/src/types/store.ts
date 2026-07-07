export enum StoreType {
  STREAMING = 'streaming',
  DOWNLOAD = 'download',
  SOCIAL = 'social',
  YOUTUBE = 'youtube',
  OTHER = 'other'
}

export enum StoreStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance'
}

export interface IStoreCredentials {
  apiKey: string;
  apiSecret: string;
  additionalData?: Record<string, any>;
}

export interface IStore {
  _id: string;
  name: string;
  type: StoreType;
  status: StoreStatus;
  credentials: IStoreCredentials;
  isActive: boolean;
  lastSyncedAt?: Date;
  syncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string;
}

export interface IStoreDelivery {
  storeId: string;
  trackId: string;
  status: 'pending' | 'delivered' | 'failed' | 'processing';
  externalId?: string;
  deliveryDate: Date;
  lastChecked: Date;
  metadata?: Record<string, any>;
  error?: string;
}

export interface IStoreDeliveryReport {
  deliveryId: string;
  storeId: string;
  trackId: string;
  reportDate: Date;
  streams: number;
  downloads: number;
  revenue: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
}
