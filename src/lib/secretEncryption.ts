import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

function getEncryptionKey() {
  const encoded = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY is not configured');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value');
  }

  return key;
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) return null;

  const [version, iv, tag, encrypted] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error('Unsupported encrypted secret format');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
