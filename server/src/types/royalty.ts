import { ObjectId } from 'mongodb';

export enum RoyaltyType {
  STREAM = 'stream',
  DOWNLOAD = 'download',
  YOUTUBE = 'youtube',
  SYNCHRONIZATION = 'sync',
  PERFORMANCE = 'performance',
  MECHANICAL = 'mechanical',
  PRINT = 'print',
  OTHER = 'other'
}

export enum RoyaltyStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  HOLD = 'hold',
  DISPUTED = 'disputed',
  VOID = 'void'
}

export interface IRoyaltySplit {
  recipientId: ObjectId;
  recipientType: 'user' | 'rightsHolder' | 'label' | 'publisher';
  name: string;
  email: string;
  percentage: number;
  amount: number;
  currency: string;
  isRecoupable: boolean;
  isAdvance: boolean;
  advanceAmount?: number;
  advanceRecouped?: number;
  taxRate?: number;
  taxAmount?: number;
  netAmount: number;
}

export interface IRoyalty {
  _id: ObjectId;
  trackId: ObjectId;
  storeId: ObjectId;
  storeName: string;
  type: RoyaltyType;
  status: RoyaltyStatus;
  quantity: number;
  rate: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountInSystemCurrency: number;
  systemCurrency: string;
  periodStart: Date;
  periodEnd: Date;
  reportingDate: Date;
  paymentDate?: Date;
  paymentId?: string;
  splits: IRoyaltySplit[];
  isRecouped: boolean;
  isTaxProcessed: boolean;
  taxRate?: number;
  taxAmount?: number;
  netAmount: number;
  metadata?: Record<string, any>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
