import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MongoClient } from 'mongodb';

const args = process.argv.slice(2);
const write = args.includes('--write');
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length))) : 0;
const batchSize = Math.max(50, Number(process.env.DB_MIGRATION_BATCH_SIZE || 250));
const sampleLimit = Math.max(1, Number(process.env.MEDIA_HOST_REPLACE_SAMPLE_LIMIT || 25));

const legacyArg = args.find((arg) => arg.startsWith('--legacy='));
const targetArg = args.find((arg) => arg.startsWith('--target='));
const collectionsArg = args.find((arg) => arg.startsWith('--collections='));

const legacyOrigin = normalizeOrigin(legacyArg?.slice('--legacy='.length) || 'https://api.singleaudio.com');
const targetOrigin = normalizeOrigin(targetArg?.slice('--target='.length) || 'https://api.karharimedia.com');
const explicitCollections = collectionsArg
  ? collectionsArg
      .slice('--collections='.length)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : [];

function loadServerEnv() {
  const envPath = path.resolve(process.cwd(), 'server/.env');
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid origin: ${value}`);
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function rewriteMediaUrl(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('http://') && !value.startsWith('https://')) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const legacy = new URL(legacyOrigin);
  const target = new URL(targetOrigin);
  const sameLegacyHost = parsed.hostname === legacy.hostname;
  const mediaUpload = parsed.pathname.startsWith('/uploads/');

  if (!sameLegacyHost || !mediaUpload) return null;

  parsed.protocol = target.protocol;
  parsed.hostname = target.hostname;
  parsed.port = target.port;

  const next = parsed.toString();
  return next === value ? null : next;
}

function collectChanges(value, basePath = '') {
  const changes = [];

  if (typeof value === 'string') {
    const next = rewriteMediaUrl(value);
    if (next && basePath) changes.push({ path: basePath, from: value, to: next });
    return changes;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const childPath = basePath ? `${basePath}.${index}` : String(index);
      changes.push(...collectChanges(item, childPath));
    });
    return changes;
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (key === '_id') return;
      const childPath = basePath ? `${basePath}.${key}` : key;
      changes.push(...collectChanges(item, childPath));
    });
  }

  return changes;
}

async function collectionNames(db) {
  if (explicitCollections.length) return explicitCollections;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith('system.'));
}

async function scanCollection(db, name) {
  const collection = db.collection(name);
  const report = {
    collection: name,
    scanned: 0,
    matchedDocuments: 0,
    plannedFieldUpdates: 0,
    modifiedDocuments: 0,
    samples: [],
  };

  const cursor = collection.find({}).batchSize(batchSize);
  if (limit) cursor.limit(limit);

  for await (const doc of cursor) {
    report.scanned += 1;
    const changes = collectChanges(doc);
    if (!changes.length) continue;

    report.matchedDocuments += 1;
    report.plannedFieldUpdates += changes.length;

    if (report.samples.length < sampleLimit) {
      report.samples.push({
        id: String(doc._id),
        changes: changes.slice(0, 5),
      });
    }

    if (!write) continue;

    const $set = {};
    changes.forEach((change) => {
      $set[change.path] = change.to;
    });

    const result = await collection.updateOne({ _id: doc._id }, { $set });
    report.modifiedDocuments += result.modifiedCount;
  }

  return report;
}

async function main() {
  loadServerEnv();

  if (legacyOrigin === targetOrigin) {
    throw new Error('Legacy and target origins are identical. Refusing to run.');
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db();
    const names = await collectionNames(db);
    const collections = [];

    for (const name of names) {
      collections.push(await scanCollection(db, name));
    }

    const report = {
      mode: write ? 'write' : 'dry-run',
      legacyOrigin,
      targetOrigin,
      rule: 'Only whole-string http(s) URLs with host api.singleaudio.com and pathname starting /uploads/ are changed.',
      collections,
      totals: collections.reduce(
        (sum, collection) => ({
          scanned: sum.scanned + collection.scanned,
          matchedDocuments: sum.matchedDocuments + collection.matchedDocuments,
          plannedFieldUpdates: sum.plannedFieldUpdates + collection.plannedFieldUpdates,
          modifiedDocuments: sum.modifiedDocuments + collection.modifiedDocuments,
        }),
        { scanned: 0, matchedDocuments: 0, plannedFieldUpdates: 0, modifiedDocuments: 0 }
      ),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
