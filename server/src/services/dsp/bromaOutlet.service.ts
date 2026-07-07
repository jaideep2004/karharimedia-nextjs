import BromaOutlet from '../../models/bromaOutlet.model';
import { BromaClient } from './connectors/bromaClient';

const normalize = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const firstString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

function mapOutlet(raw: Record<string, any>) {
  const outletId = String(raw.id ?? raw.outlet_id ?? raw.code ?? raw.key ?? '');
  const name = firstString(raw.title_en, raw.title, raw.name, raw.outlet, raw.description_en) || outletId;
  const aliases = Array.from(
    new Set(
      [name, raw.title_ru, raw.title_en, raw.outlet, raw.code]
        .map(normalize)
        .filter(Boolean)
    )  
  );

  return {
    outletId,
    name,
    normalizedName: normalize(name),
    aliases,
    releaseTypes: Array.isArray(raw.release_types) ? raw.release_types.map(String) : [],
    active: raw.active !== false && raw.disabled !== true,
    raw,
    syncedAt: new Date(),
  };
}

type BromaOutletRow = Record<string, any>;
type NormalizedBromaOutlet = ReturnType<typeof mapOutlet>;

export async function syncBromaOutlets(input: {
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
}) {
  const client = new BromaClient({ credentials: input.credentials, config: input.config });
  const response = await client.getOutlets();
  const rows: unknown[] = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.items)
      ? response.data.items
      : Array.isArray(response.data?.outlets)
        ? response.data.outlets
        : Array.isArray(response.items)
          ? response.items
          : Array.isArray(response.outlets)
            ? response.outlets
            : Array.isArray(response)
              ? response
              : [];
  const mapped: NormalizedBromaOutlet[] = rows
    .filter((row: unknown): row is BromaOutletRow => row !== null && typeof row === 'object')
    .map(mapOutlet)
    .filter((outlet: NormalizedBromaOutlet) => outlet.outletId);

  if (mapped.length > 0) {
    await BromaOutlet.bulkWrite(
      mapped.map((outlet: NormalizedBromaOutlet) => ({
        updateOne: {
          filter: { outletId: outlet.outletId },
          update: { $set: outlet },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  return {
    synced: mapped.length,
    outlets: mapped.map((outlet) => ({
      outletId: outlet.outletId,
      name: outlet.name,
      releaseTypes: outlet.releaseTypes,
      active: outlet.active,
      syncedAt: outlet.syncedAt,
    })),
    syncedAt: new Date(),
  };
}

export async function listBromaOutlets() {
  const outlets = await BromaOutlet.find({ active: true })
    .sort({ name: 1 })
    .select('outletId name aliases releaseTypes active syncedAt')
    .lean();

  return outlets.map((outlet) => ({
    outletId: outlet.outletId,
    name: outlet.name,
    aliases: outlet.aliases || [],
    releaseTypes: outlet.releaseTypes || [],
    active: outlet.active,
    syncedAt: outlet.syncedAt,
  }));
}
