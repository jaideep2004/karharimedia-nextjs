import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_VERSION = 'v1';
const ENVELOPE_VERSION = 'dsp-v1';

export type EncryptedCredentialMap = {
  __encrypted: true;
  version: typeof ENVELOPE_VERSION;
  values: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const getEncryptionKey = () => {
  const encoded = process.env.DSP_CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error('DSP_CREDENTIAL_ENCRYPTION_KEY is not configured');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('DSP_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 value');
  }
  return key;
};

const encryptValue = (value: unknown) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SECRET_VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptValue = (payload: string) => {
  const [version, iv, tag, encrypted] = payload.split(':');
  if (version !== SECRET_VERSION || !iv || !tag || !encrypted) {
    throw new Error('Unsupported DSP credential secret format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const raw = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(raw) as unknown;
};

export const isEncryptedCredentialMap = (value: unknown): value is EncryptedCredentialMap =>
  isRecord(value) &&
  value.__encrypted === true &&
  value.version === ENVELOPE_VERSION &&
  isRecord(value.values);

export const encryptCredentialMap = (credentials: Record<string, unknown> = {}): EncryptedCredentialMap => {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (value === undefined || value === null || value === '') continue;
    values[key] = encryptValue(value);
  }
  return {
    __encrypted: true,
    version: ENVELOPE_VERSION,
    values,
  };
};

export const decryptCredentialMap = (credentials: Record<string, unknown> = {}): Record<string, unknown> => {
  if (!isEncryptedCredentialMap(credentials)) return { ...credentials };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials.values)) {
    out[key] = decryptValue(value);
  }
  return out;
};

export const getConfiguredCredentialKeys = (credentials: Record<string, unknown> = {}) => {
  if (isEncryptedCredentialMap(credentials)) return Object.keys(credentials.values).sort();
  return Object.entries(credentials)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key]) => key)
    .sort();
};

export const isPlainCredentialMap = (credentials: Record<string, unknown> = {}) =>
  Object.keys(credentials).length > 0 && !isEncryptedCredentialMap(credentials);
