import crypto from 'crypto';
import { Db, ObjectId } from 'mongodb';
import {
  createGs1ProductForRelease,
  findGs1ProductForRelease,
  Gs1DatakartError,
  GS1_DATAKART_PROVIDER,
  validateGs1Gtin,
} from '@/lib/gs1Datakart';
import type { Gs1ValidationResult } from '@/lib/gs1Datakart';
import { releasesCollection } from '@/lib/repositories/releases';

type ReleaseLike = Record<string, any> & {
  releaseTitle?: string;
  title?: string;
  primaryArtist?: string;
  artist?: string;
  ownerArtistName?: string;
  ownerName?: string;
  label?: string;
  releaseDate?: string | Date;
  originalReleaseDate?: string | Date;
  upc?: string;
  upcAssignedAt?: Date;
  tracks?: Record<string, any>[];
};

type AssignmentAction = 'created' | 'validated-existing';
const UPC_LOCK_TTL_MS = 10 * 60 * 1000;

export class UpcAssignmentLockError extends Error {
  statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'UpcAssignmentLockError';
  }
}

export type ReleaseUpcAssignment = {
  provider: typeof GS1_DATAKART_PROVIDER;
  action: AssignmentAction;
  gtin: string;
  recordStatus?: string;
  isComplete?: boolean;
  message?: string;
  createdAt?: Date;
  validatedAt: Date;
};

export type ReleaseCodeAssignmentResult = {
  releaseUpc: string;
  tracksWithUpc: Record<string, any>[];
  releaseUpdate: {
    upc: string;
    upcProvider: typeof GS1_DATAKART_PROVIDER;
    upcAssignedAt: Date;
    upcAssignment: ReleaseUpcAssignment;
  };
};

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeGtin(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function getReleaseTitle(release: ReleaseLike) {
  return cleanString(release.releaseTitle) || cleanString(release.title) || 'Untitled release';
}

function getPrimaryArtist(release: ReleaseLike) {
  return (
    cleanString(release.primaryArtist) ||
    cleanString(release.artist) ||
    cleanString(release.ownerArtistName) ||
    cleanString(release.ownerName)
  );
}

function getReleaseDate(release: ReleaseLike) {
  return release.releaseDate || release.originalReleaseDate;
}

function pickReleaseValue(release: ReleaseLike, keys: string[]) {
  for (const key of keys) {
    const direct = cleanString(release[key]);
    if (direct) return direct;

    const gs1Value = cleanString(release.gs1Datakart?.[key]);
    if (gs1Value) return gs1Value;

    const datakartValue = cleanString(release.datakart?.[key]);
    if (datakartValue) return datakartValue;
  }

  return undefined;
}

function buildGs1CreateInput(release: ReleaseLike, releaseId: string) {
  return {
    releaseId,
    releaseTitle: getReleaseTitle(release),
    primaryArtist: getPrimaryArtist(release),
    label: release.label,
    releaseDate: getReleaseDate(release),
    mrp: pickReleaseValue(release, ['mrp', 'gs1Mrp', 'datakartMrp']),
    hsCode: pickReleaseValue(release, ['hsCode', 'hs_code', 'gs1HsCode', 'datakartHsCode']),
    igst: pickReleaseValue(release, ['igst', 'gs1Igst', 'datakartIgst']),
    targetLocation: pickReleaseValue(release, [
      'targetLocation',
      'target_location',
      'gs1TargetLocation',
      'datakartTargetLocation',
    ]),
  };
}

function hasReviewHeldUpcAssignment(release: ReleaseLike) {
  return (
    release.upcAssignmentLock?.needsReview === true ||
    cleanString(release.upcAssignment?.status) === 'needs_review'
  );
}

function shouldHoldForGs1Review(error: unknown) {
  return (
    error instanceof Gs1DatakartError &&
    error.statusCode >= 500 &&
    error.details !== undefined
  );
}

function tracksWithReleaseUpc(tracks: Record<string, any>[], releaseUpc: string) {
  return tracks.map((track) => ({
    ...track,
    upc: cleanString(track?.upc) || releaseUpc,
  }));
}

async function acquireUpcAssignmentLock(db: Db, releaseId: string) {
  const _id = ObjectId.isValid(releaseId) ? new ObjectId(releaseId) : null;
  if (!_id) throw new Error('Invalid release id for UPC assignment');

  const now = new Date();
  const lockId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + UPC_LOCK_TTL_MS);
  const res = await releasesCollection(db).findOneAndUpdate(
    {
      _id,
      $and: [
        { $or: [{ upc: { $exists: false } }, { upc: null }, { upc: '' }] },
        {
          $or: [
            { upcAssignmentLock: { $exists: false } },
            { 'upcAssignmentLock.expiresAt': { $lt: now } },
            {
              'upcAssignmentLock.needsReview': true,
              'upcAssignment.status': 'needs_review',
            },
          ],
        },
      ],
    },
    {
      $set: {
        upcAssignmentLock: {
          lockId,
          provider: GS1_DATAKART_PROVIDER,
          startedAt: now,
          expiresAt,
        },
      },
    },
    { returnDocument: 'after' }
  );

  if (!res.value) {
    throw new UpcAssignmentLockError(
      'UPC assignment is already in progress for this release. Wait before retrying.'
    );
  }

  return { lockId, startedAt: now };
}

async function markUpcAssignmentNeedsReview(
  db: Db,
  releaseId: string,
  lockId: string,
  error: unknown
) {
  const _id = ObjectId.isValid(releaseId) ? new ObjectId(releaseId) : null;
  if (!_id) return;

  const message = error instanceof Error ? error.message : 'GS1 UPC assignment failed';
  await releasesCollection(db).updateOne(
    { _id, 'upcAssignmentLock.lockId': lockId },
    {
      $set: {
        upcAssignment: {
          provider: GS1_DATAKART_PROVIDER,
          action: 'created',
          status: 'needs_review',
          message,
          failedAt: new Date(),
        },
        'upcAssignmentLock.needsReview': true,
        'upcAssignmentLock.expiresAt': new Date('9999-12-31T00:00:00.000Z'),
      },
    }
  );
}

async function clearUpcAssignmentLock(db: Db, releaseId: string, lockId: string) {
  const _id = ObjectId.isValid(releaseId) ? new ObjectId(releaseId) : null;
  if (!_id) return;

  await releasesCollection(db).updateOne(
    { _id, 'upcAssignmentLock.lockId': lockId },
    { $unset: { upcAssignmentLock: '' } }
  );
}

async function persistAssignedUpc(
  db: Db,
  releaseId: string,
  lockId: string,
  releaseUpdate: ReleaseCodeAssignmentResult['releaseUpdate']
) {
  const _id = ObjectId.isValid(releaseId) ? new ObjectId(releaseId) : null;
  if (!_id) throw new Error('Invalid release id for UPC persistence');

  const res = await releasesCollection(db).updateOne(
    { _id, 'upcAssignmentLock.lockId': lockId },
    {
      $set: releaseUpdate,
      $unset: { upcAssignmentLock: '' },
    }
  );

  if (res.matchedCount !== 1) {
    throw new Error('Failed to persist assigned GS1 UPC before approval update.');
  }
}

export async function assignReleaseUpcWithGs1(
  db: Db,
  release: ReleaseLike,
  releaseId: string,
  tracks: Record<string, any>[]
): Promise<ReleaseCodeAssignmentResult> {
  const now = new Date();
  const existingUpc = normalizeGtin(release.upc);
  let action: AssignmentAction = 'validated-existing';
  let releaseUpc = existingUpc;
  let createdAt: Date | undefined;
  let providerConfirmedAssignment: Gs1ValidationResult | undefined;
  let lockId: string | null = null;
  const gs1Input = buildGs1CreateInput(release, releaseId);
  const trustedExistingAssignment =
    Boolean(existingUpc) &&
    cleanString(release.upcProvider) === GS1_DATAKART_PROVIDER &&
    Boolean(release.upcAssignedAt);

  if (!releaseUpc) {
    const shouldRecoverFromReviewHold = hasReviewHeldUpcAssignment(release);
    const lock = await acquireUpcAssignmentLock(db, releaseId);
    lockId = lock.lockId;

    try {
      if (shouldRecoverFromReviewHold) {
        const existing = await findGs1ProductForRelease(gs1Input);
        if (existing) {
          releaseUpc = existing.gtin;
          action = 'created';
          createdAt = now;
          providerConfirmedAssignment = {
            gtin: existing.gtin,
            recordStatus: existing.recordStatus || existing.approvalStatus,
            isComplete: existing.isComplete,
            message: existing.message,
          };
        }
      }

      if (!releaseUpc) {
        const created = await createGs1ProductForRelease(gs1Input);
        releaseUpc = created.gtin;
        action = 'created';
        createdAt = now;
        providerConfirmedAssignment = {
          gtin: created.gtin,
          recordStatus: created.recordStatus || created.approvalStatus,
          isComplete: created.isComplete,
          message: created.message,
        };
      }
    } catch (error) {
      const shouldSearchGs1 = shouldHoldForGs1Review(error);

      if (shouldSearchGs1) {
        const existing = await findGs1ProductForRelease(gs1Input);
        if (existing) {
          releaseUpc = existing.gtin;
          action = 'created';
          createdAt = now;
          providerConfirmedAssignment = {
            gtin: existing.gtin,
            recordStatus: existing.recordStatus || existing.approvalStatus,
            isComplete: existing.isComplete,
            message: existing.message,
          };
        } else {
          await markUpcAssignmentNeedsReview(db, releaseId, lockId, error);
          throw error;
        }
      } else {
        if (error instanceof Gs1DatakartError && error.statusCode === 500) {
          await clearUpcAssignmentLock(db, releaseId, lockId);
        } else {
          await markUpcAssignmentNeedsReview(db, releaseId, lockId, error);
        }
        throw error;
      }
    }
  }

  let validation: Gs1ValidationResult;
  try {
    if (providerConfirmedAssignment) {
      validation = providerConfirmedAssignment;
    } else if (trustedExistingAssignment) {
      validation = {
        gtin: releaseUpc,
        recordStatus: cleanString(release.upcAssignment?.recordStatus) || 'validated',
        isComplete: typeof release.upcAssignment?.isComplete === 'boolean' ? release.upcAssignment.isComplete : true,
        message: cleanString(release.upcAssignment?.message) || 'Previously assigned GS1 UPC trusted for re-approval.',
      };
    } else {
      validation = await validateGs1Gtin(releaseUpc);
    }
  } catch (error) {
    if (lockId) {
      await markUpcAssignmentNeedsReview(db, releaseId, lockId, error);
    }
    throw error;
  }
  const assignment: ReleaseUpcAssignment = {
    provider: GS1_DATAKART_PROVIDER,
    action,
    gtin: validation.gtin,
    recordStatus: validation.recordStatus,
    isComplete: validation.isComplete,
    message: validation.message,
    createdAt,
    validatedAt: new Date(),
  };
  const releaseUpdate: ReleaseCodeAssignmentResult['releaseUpdate'] = {
    upc: validation.gtin,
    upcProvider: GS1_DATAKART_PROVIDER,
    upcAssignedAt: release.upcAssignedAt || now,
    upcAssignment: assignment,
  };

  if (lockId) {
    await persistAssignedUpc(db, releaseId, lockId, releaseUpdate);
  }

  return {
    releaseUpc: validation.gtin,
    tracksWithUpc: tracksWithReleaseUpc(tracks, validation.gtin),
    releaseUpdate,
  };
}
