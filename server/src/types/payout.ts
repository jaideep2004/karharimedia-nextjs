import { ObjectId } from 'mongodb';

export enum PayoutMethod {
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  WISE = 'wise',
  PAYONEER = 'payoneer',
  CRYPTO = 'crypto',
  CHECK = 'check',
  OTHER = 'other'
}

export enum PayoutStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed'
}

export enum PayoutCurrency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  JPY = 'JPY',
  // Add more currencies as needed
}

export interface IBankAccount {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  bankCode?: string;
  swiftCode?: string;
  iban?: string;
  routingNumber?: string;
  country: string;
  currency: string;
  isPrimary: boolean;
  isVerified: boolean;
}

export interface IPayPalDetails {
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface IPayoutRecipient {
  userId: ObjectId;
  name: string;
  email: string;
  taxId?: string;
  taxFormSubmitted: boolean;
  paymentMethod: PayoutMethod;
  bankAccount?: IBankAccount;
  paypal?: IPayPalDetails;
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  minimumPayoutAmount: number;
}

export interface IPayoutItem {
  royaltyId: ObjectId;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountInPayoutCurrency: number;
  taxAmount: number;
  feeAmount: number;
  netAmount: number;
  metadata?: Record<string, any>;
}

export interface IPayout {
  _id: ObjectId;
  recipientId: ObjectId;
  reference: string;
  status: PayoutStatus;
  amount: number;
  currency: PayoutCurrency;
  exchangeRate: number;
  feeAmount: number;
  taxAmount: number;
  netAmount: number;
  paymentMethod: PayoutMethod;
  paymentReference?: string;
  paymentDate?: Date;
  items: IPayoutItem[];
  notes?: string;
  metadata?: Record<string, any>;
  processedBy?: ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
