import { Db } from 'mongodb';

export class RateLimitError extends Error {
  statusCode = 429;

  constructor(message = 'Too many requests. Try again shortly.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitDocument {
  _id: string;
  key: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

let indexesReady: Promise<void> | null = null;

async function ensureRateLimitIndexes(db: Db) {
  if (!indexesReady) {
    indexesReady = db
      .collection<RateLimitDocument>('apiRateLimits')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .then(() => undefined);
  }
  await indexesReady;
}

export async function enforceMongoRateLimit(db: Db, options: RateLimitOptions) {
  await ensureRateLimitIndexes(db);

  const now = Date.now();
  const windowStartMs = Math.floor(now / options.windowMs) * options.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + options.windowMs);
  const _id = `${options.key}:${windowStartMs}`;

  const result = await db.collection<RateLimitDocument>('apiRateLimits').findOneAndUpdate(
    { _id },
    {
      $setOnInsert: {
        _id,
        key: options.key,
        windowStart,
        expiresAt,
      },
      $inc: { count: 1 },
    },
    { upsert: true, returnDocument: 'after' }
  );

  if ((result.value?.count ?? 0) > options.limit) {
    throw new RateLimitError();
  }
}
