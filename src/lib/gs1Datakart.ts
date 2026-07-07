const DEFAULT_BASE_URL = 'https://api.gs1datakart.org';
const PROVIDER = 'gs1-datakart';
const INDIA_ISO_ALPHA_2 = 'IN';
const INDIA_NUMERIC_CODE = '356';

const REQUIRED_CREATE_PRODUCT_FIELDS = [
  'activation_date',
  'brand',
  'category',
  'contact_country',
  'deactivation_date',
  'gcp',
  'product_description',
  'product_name',
  'sub_category',
] as const;

const GS1_MASS_UNITS = new Set(['', 'g', 'kg', 'mg', 'lb']);
const GS1_NET_CONTENT_UNITS = new Set(['g', 'kg', 'mg', 'lb', 'ml', 'l', 'each']);
const GS1_PRODUCT_CHANNELS = new Map([
  ['general trade', 'General Trade'],
  ['modern trade', 'Modern Trade'],
  ['ecommerce', 'Ecommerce'],
  ['institutional sale', 'Institutional Sale'],
]);
const GS1_UNIT_ALIASES: Record<string, string> = {
  each: 'each',
  ea: 'each',
  piece: 'each',
  pieces: 'each',
  unit: 'each',
  units: 'each',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  gms: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  milligram: 'mg',
  milligrams: 'mg',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  litre: 'l',
  liter: 'l',
  litres: 'l',
  liters: 'l',
  millilitre: 'ml',
  milliliter: 'ml',
  millilitres: 'ml',
  milliliters: 'ml',
};

type Gs1Config = {
  baseUrl: string;
  bearerToken: string;
  consumerId?: string;
  createProductPath: string;
  createBodyFormat: 'json' | 'form';
  createWrapperKey?: string;
  includeOptionalCreateFields: boolean;
  includeUiFieldAliases: boolean;
  gcp: string;
  categoryId: number;
  subCategoryId: number;
  contactCountry: string;
  defaultBrand?: string;
  deactivationDate: string;
  contactPerson?: string;
  contactNumber?: string;
  contactEmail?: string;
  contactAddress?: string;
  contactState?: string;
  contactPincode?: string;
  contactDistrict?: string;
  contactCity?: string;
  productPackaging: string;
  productChannel: string;
  targetMarket: string;
  netContent: string;
  netContentUnit: string;
  mrp?: string;
  hsCode?: string;
  igst?: string;
  targetLocation?: string;
  requestTimeoutMs: number;
  extraCreateFields: Record<string, unknown>;
};

type Gs1CreateProductInput = {
  releaseId: string;
  releaseTitle?: string;
  primaryArtist?: string;
  label?: string;
  releaseDate?: string | Date;
  mrp?: string | number;
  hsCode?: string | number;
  igst?: string | number;
  targetLocation?: string;
};

type Gs1ValidationRecord = {
  gtin?: string | number;
  gtinRecordStatus?: string;
  isComplete?: boolean;
};

type Gs1ValidationResponse = {
  status?: boolean;
  message?: string;
  data?: Gs1ValidationRecord[] | Gs1ValidationRecord | Record<string, unknown>;
};

type Gs1ProductListItem = {
  gtin?: string | number;
  product_sku?: string;
  sku_code?: string;
  name?: string;
  product_name?: string;
  approval_status?: string;
  product_status?: string;
};

type Gs1ProductListResponse = {
  status?: boolean;
  data?: Gs1ProductListItem[] | { items?: Gs1ProductListItem[] };
  items?: Gs1ProductListItem[];
};

export type Gs1ProductCreateResult = {
  gtin: string;
  approvalStatus?: string;
  recordStatus?: string;
  isComplete?: boolean;
  message?: string;
};

export type Gs1ExistingProductResult = {
  gtin: string;
  approvalStatus?: string;
  recordStatus?: string;
  isComplete?: boolean;
  message?: string;
};

export type Gs1ValidationResult = {
  gtin: string;
  recordStatus?: string;
  isComplete?: boolean;
  message?: string;
};

export class Gs1DatakartError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 502, details?: unknown) {
    super(message);
    this.name = 'Gs1DatakartError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getGs1DatakartApprovalErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'GS1 UPC assignment failed';
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRequiredEnv(name: string) {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Gs1DatakartError(`${name} is not configured`, 500);
  }
  return value;
}

function getRequiredIntEnv(name: string) {
  const value = getRequiredEnv(name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Gs1DatakartError(`${name} must be a positive integer`, 500);
  }
  return parsed;
}

function getOptionalIntEnv(name: string, fallback: number) {
  const value = getOptionalEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Gs1DatakartError(`${name} must be a positive integer`, 500);
  }
  return parsed;
}

function getCreateBodyFormat(): Gs1Config['createBodyFormat'] {
  const value = getOptionalEnv('GS1_DATAKART_CREATE_BODY_FORMAT');
  if (!value) return 'json';
  if (value === 'form' || value === 'json') return value;

  throw new Gs1DatakartError('GS1_DATAKART_CREATE_BODY_FORMAT must be form or json', 500);
}

function getCreateWrapperKey() {
  const value = getOptionalEnv('GS1_DATAKART_CREATE_WRAPPER_KEY');
  if (!value) return undefined;

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Gs1DatakartError(
      'GS1_DATAKART_CREATE_WRAPPER_KEY must be a simple object key',
      500
    );
  }

  return value;
}

function getBooleanEnv(name: string, fallback: boolean) {
  const value = getOptionalEnv(name);
  if (!value) return fallback;

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getJsonObjectEnv(name: string) {
  const value = getOptionalEnv(name);
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new Gs1DatakartError(`${name} must be a JSON object`, 500);
  }
}

function readConfig(): Gs1Config {
  return {
    baseUrl: (getOptionalEnv('GS1_DATAKART_BASE_URL') || DEFAULT_BASE_URL).replace(/\/$/, ''),
    bearerToken: getRequiredEnv('GS1_DATAKART_BEARER_TOKEN'),
    consumerId: getOptionalEnv('GS1_DATAKART_CONSUMER_ID'),
    createProductPath: getOptionalEnv('GS1_DATAKART_CREATE_PATH') || '/console/products/create',
    createBodyFormat: getCreateBodyFormat(),
    createWrapperKey: getCreateWrapperKey(),
    includeOptionalCreateFields: getBooleanEnv('GS1_DATAKART_INCLUDE_OPTIONAL_CREATE_FIELDS', false),
    includeUiFieldAliases: getBooleanEnv('GS1_DATAKART_INCLUDE_UI_FIELD_ALIASES', false),
    gcp: getRequiredEnv('GS1_DATAKART_GCP'),
    categoryId: getRequiredIntEnv('GS1_DATAKART_CATEGORY_ID'),
    subCategoryId: getRequiredIntEnv('GS1_DATAKART_SUB_CATEGORY_ID'),
    contactCountry: normalizeGs1ContactCountry(getRequiredEnv('GS1_DATAKART_CONTACT_COUNTRY')),
    defaultBrand: getOptionalEnv('GS1_DATAKART_BRAND'),
    deactivationDate: getOptionalEnv('GS1_DATAKART_DEACTIVATION_DATE') || '2099-12-31',
    contactPerson: getOptionalEnv('GS1_DATAKART_CONTACT_PERSON'),
    contactNumber: getOptionalEnv('GS1_DATAKART_CONTACT_NO'),
    contactEmail: getOptionalEnv('GS1_DATAKART_CONTACT_EMAIL'),
    contactAddress: getOptionalEnv('GS1_DATAKART_CONTACT_ADDRESS'),
    contactState: getOptionalEnv('GS1_DATAKART_CONTACT_STATE'),
    contactPincode: getOptionalEnv('GS1_DATAKART_CONTACT_PINCODE'),
    contactDistrict: getOptionalEnv('GS1_DATAKART_CONTACT_DISTRICT'),
    contactCity: getOptionalEnv('GS1_DATAKART_CONTACT_CITY'),
    productPackaging: getOptionalEnv('GS1_DATAKART_PRODUCT_PACKAGING') || 'Primary',
    productChannel: normalizeGs1ProductChannel(getOptionalEnv('GS1_DATAKART_PRODUCT_CHANNEL')),
    targetMarket: normalizeGs1TargetMarket(
      getOptionalEnv('GS1_DATAKART_TARGET_MARKET') || 'India'
    ),
    netContent: getOptionalEnv('GS1_DATAKART_NET_CONTENT') || '1',
    netContentUnit: getOptionalEnv('GS1_DATAKART_NET_CONTENT_UNIT') || 'EACH',
    mrp: getOptionalEnv('GS1_DATAKART_MRP'),
    hsCode: getOptionalEnv('GS1_DATAKART_HS_CODE'),
    igst: getOptionalEnv('GS1_DATAKART_IGST'),
    targetLocation: getOptionalEnv('GS1_DATAKART_TARGET_LOCATION'),
    requestTimeoutMs: getOptionalIntEnv('GS1_DATAKART_REQUEST_TIMEOUT_MS', 25000),
    extraCreateFields: getJsonObjectEnv('GS1_DATAKART_EXTRA_CREATE_FIELDS'),
  };
}

function cleanString(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getRecordString(record: Record<string, unknown> | undefined, key: string) {
  return record ? cleanString(record[key]) || undefined : undefined;
}

function normalizeGs1Unit(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return '';

  const key = raw.toLowerCase();
  return GS1_UNIT_ALIASES[key] || key;
}

function normalizeGs1ContactCountry(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) return '';

  const key = normalized.toLowerCase();
  if (key === 'india' || key === 'bharat' || key === INDIA_NUMERIC_CODE) {
    return INDIA_ISO_ALPHA_2;
  }

  return normalized.length === 2 ? normalized.toUpperCase() : normalized;
}

function normalizeGs1TargetMarket(value: unknown) {
  const normalized = cleanString(value);
  if (!normalized) return '';

  const key = normalized.toLowerCase();
  if (key === 'india' || key === 'bharat' || key === INDIA_ISO_ALPHA_2.toLowerCase()) {
    return INDIA_NUMERIC_CODE;
  }

  return normalized;
}

function normalizeGs1ProductChannel(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return 'General Trade';

  const channels = raw
    .split(',')
    .map((entry) => GS1_PRODUCT_CHANNELS.get(entry.trim().toLowerCase()))
    .filter(Boolean) as string[];

  if (!channels.length) {
    throw new Gs1DatakartError(
      'GS1_DATAKART_PRODUCT_CHANNEL must be one or more of: General Trade, Modern Trade, Ecommerce, Institutional Sale',
      500
    );
  }

  return Array.from(new Set(channels)).join(',');
}

function toDateOnly(value: unknown, fallback = new Date()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = cleanString(value);
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return fallback.toISOString().slice(0, 10);
}

function normalizeGtin(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : '';
}

function collectNamedGtins(value: unknown, matches: string[] = []) {
  if (!value || matches.length > 0) return matches;

  if (Array.isArray(value)) {
    for (const entry of value) collectNamedGtins(entry, matches);
    return matches;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['gtin', 'upc', 'barcode', 'GTIN', 'UPC']) {
      const normalized = normalizeGtin(record[key]);
      if (normalized) {
        matches.push(normalized);
        return matches;
      }
    }
    for (const entry of Object.values(record)) collectNamedGtins(entry, matches);
  }

  return matches;
}

function collectFallbackGtins(value: unknown, matches: string[] = []) {
  if (!value || matches.length > 0) return matches;

  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = normalizeGtin(value);
    if (normalized) matches.push(normalized);
    return matches;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectFallbackGtins(entry, matches);
    return matches;
  }

  if (typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectFallbackGtins(entry, matches);
    }
  }

  return matches;
}

function extractGtin(value: unknown) {
  return collectNamedGtins(value)[0] || collectFallbackGtins(value)[0] || '';
}

function collectValidationRecords(value: unknown, records: Gs1ValidationRecord[] = []) {
  if (!value) return records;

  if (Array.isArray(value)) {
    for (const entry of value) collectValidationRecords(entry, records);
    return records;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const gtin = normalizeGtin(record.gtin);
    if (gtin) {
      records.push({
        gtin,
        gtinRecordStatus:
          typeof record.gtinRecordStatus === 'string' ? record.gtinRecordStatus : undefined,
        isComplete: typeof record.isComplete === 'boolean' ? record.isComplete : undefined,
      });
      return records;
    }

    for (const entry of Object.values(record)) collectValidationRecords(entry, records);
  }

  return records;
}

function collectProductListItems(value: unknown, items: Gs1ProductListItem[] = []) {
  if (!value) return items;

  if (Array.isArray(value)) {
    for (const entry of value) collectProductListItems(entry, items);
    return items;
  }

  if (typeof value === 'object') {
    const record = value as Gs1ProductListItem & Record<string, unknown>;
    if (record.gtin || record.product_sku || record.sku_code || record.product_name || record.name) {
      items.push(record);
      return items;
    }

    for (const entry of Object.values(record)) collectProductListItems(entry, items);
  }

  return items;
}

function findMissingFields(payload: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((key) => {
    const value = payload[key];
    return typeof value === 'string' ? !value.trim() : value === undefined || value === null;
  });
}

function validateCreateProductPayload(payload: Record<string, unknown>) {
  const missing = findMissingFields(payload, REQUIRED_CREATE_PRODUCT_FIELDS);

  if (missing.length) {
    throw new Gs1DatakartError(
      `GS1 DataKart create payload missing required fields: ${missing.join(', ')}`,
      500,
      { missingFields: missing }
    );
  }
}

function normalizeExtraCreateFieldUnits(payload: Record<string, unknown>, config: Gs1Config) {
  const weights = getRecord(payload.weights_and_measures);
  const measurementUnit = getRecord(weights?.measurement_unit);
  if (!measurementUnit) return;

  const massUnit = normalizeGs1Unit(measurementUnit.mass_msu_id);
  if (massUnit && !GS1_MASS_UNITS.has(massUnit)) {
    throw new Gs1DatakartError(
      `GS1_DATAKART_EXTRA_CREATE_FIELDS weights_and_measures.measurement_unit.mass_msu_id must be one of: "", g, kg, mg, lb`,
      500
    );
  }
  measurementUnit.mass_msu_id = massUnit;

  let netContentUnit = normalizeGs1Unit(measurementUnit.net_content);
  if (!netContentUnit || /^\d+(\.\d+)?$/.test(netContentUnit)) {
    netContentUnit = normalizeGs1Unit(config.netContentUnit) || 'each';
  }
  if (!GS1_NET_CONTENT_UNITS.has(netContentUnit)) {
    throw new Gs1DatakartError(
      'GS1_DATAKART_EXTRA_CREATE_FIELDS weights_and_measures.measurement_unit.net_content must be one of: g, kg, mg, lb, ml, l, each',
      500
    );
  }
  measurementUnit.net_content = netContentUnit;
}

function summarizeCreateProductPayload(payload: Record<string, unknown>) {
  const summary = REQUIRED_CREATE_PRODUCT_FIELDS.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = payload[key];
    return acc;
  }, {});

  for (const key of [
    'packaging_type',
    'product_channel',
    'sku_id',
    'target_market',
    'country_of_origin',
    'channel',
    'sku_number',
    'net_content',
    'net_content_unit',
    'hs_code',
    'igst',
  ]) {
    if (payload[key] !== undefined) summary[key] = payload[key];
  }

  return summary;
}

function summarizeOptionalCreateProductPayload(payload: Record<string, unknown>) {
  return {
    mrp: Array.isArray(payload.mrp) ? payload.mrp : undefined,
  };
}

type MrpEntry = {
  target_market: string;
  location: string;
  activation_date: string;
  mrp: string;
};

function buildMrpPayload(
  input: Gs1CreateProductInput,
  config: Gs1Config
): { mrpArray: MrpEntry[]; hsCode?: string; igst?: string } | undefined {
  const value = cleanString(input.mrp) || config.mrp;
  const hsCode = cleanString(input.hsCode) || config.hsCode;
  const igst = cleanString(input.igst) || config.igst;
  const targetLocation =
    cleanString(input.targetLocation) || config.targetLocation || config.targetMarket;

  if (!value || !hsCode || !igst || !targetLocation) return undefined;

  return {
    mrpArray: [
      {
        target_market: config.targetMarket,
        location: targetLocation,
        activation_date: toDateOnly(input.releaseDate),
        mrp: value,
        // hs_code and igst moved to top-level per GS1 DataKart API schema
      },
    ],
    hsCode,
    igst,
  };
}

function buildCreateProductRequest(payload: Record<string, unknown>, config: Gs1Config) {
  const requestPayload = config.createWrapperKey
    ? { [config.createWrapperKey]: payload }
    : payload;

  if (config.createBodyFormat === 'json') {
    return {
      body: JSON.stringify(requestPayload),
      headers: undefined,
    };
  }

  if (config.createWrapperKey) {
    throw new Gs1DatakartError(
      'GS1_DATAKART_CREATE_WRAPPER_KEY requires GS1_DATAKART_CREATE_BODY_FORMAT=json',
      500
    );
  }

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }

  return {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Gs1DatakartError('GS1 DataKart returned an invalid JSON response', 502);
  }
}

async function gs1Fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = readConfig();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${config.bearerToken}`);
  headers.set('Accept', 'application/json');
  if (config.consumerId) {
    headers.set('consumer_id', config.consumerId);
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Gs1DatakartError(
        `GS1 DataKart request timed out after ${Math.round(config.requestTimeoutMs / 1000)} seconds`,
        504,
        { message: 'request_timeout' }
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `GS1 DataKart request failed with status ${response.status}`;
    throw new Gs1DatakartError(message, response.status, sanitizeDetails(payload));
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'status' in payload &&
    (payload as { status?: unknown }).status === false
  ) {
    const message =
      'message' in payload && typeof (payload as { message?: unknown }).message === 'string'
        ? String((payload as { message?: unknown }).message)
        : 'GS1 DataKart rejected the request';
    throw new Gs1DatakartError(message, 502, sanitizeDetails(payload));
  }

  return payload as T;
}

function sanitizeDetails(payload: unknown) {
  if (!payload || typeof payload !== 'object') return payload;
  const record = payload as Record<string, unknown>;
  return {
    status: record.status,
    message: record.message,
    error: record.error,
    errors: record.errors,
  };
}

function buildCreateProductPayload(input: Gs1CreateProductInput) {
  const config = readConfig();
  const productName = cleanString(input.releaseTitle) || 'Untitled release';
  const artist = cleanString(input.primaryArtist);
  const brand = config.defaultBrand || cleanString(input.label);

  if (!brand) {
    throw new Gs1DatakartError(
      'Release label or GS1_DATAKART_BRAND is required for GS1 product creation',
      500
    );
  }

  const payload: Record<string, unknown> = {
    product_name: productName,
    product_description: artist ? `${productName} by ${artist}` : productName,
    brand,
    gcp: config.gcp,
    category: config.categoryId,
    sub_category: config.subCategoryId,
    contact_country: config.contactCountry,
    activation_date: toDateOnly(input.releaseDate),
    deactivation_date: toDateOnly(config.deactivationDate, new Date('2099-12-31T00:00:00.000Z')),
  };

  if (config.includeOptionalCreateFields) {
    payload.packaging_type = config.productPackaging;
    payload.product_channel = config.productChannel;
    payload.target_market = config.targetMarket;
    payload.sku_id = input.releaseId;

    if (config.includeUiFieldAliases) {
      Object.assign(payload, {
        channel: config.productChannel,
        country_of_origin: config.contactCountry,
        sku_number: input.releaseId,
        count: config.netContent,
        net_content_uom: config.netContentUnit,
        netContent: config.netContent,
        netContentUnit: config.netContentUnit,
      });
    }

    const optionalFields: Record<string, string | undefined> = {
      contact_person: config.contactPerson,
      contact_no: config.contactNumber,
      contact_email: config.contactEmail,
      contact_address: config.contactAddress,
      contact_state: config.contactState,
      contact_pincode: config.contactPincode,
      contact_district: config.contactDistrict,
      contact_city: config.contactCity,
    };

    for (const [key, value] of Object.entries(optionalFields)) {
      if (value) payload[key] = value;
    }

  }

  const mrpResult = buildMrpPayload(input, config);
  if (mrpResult) {
    payload.mrp = mrpResult.mrpArray;
    if (mrpResult.hsCode) payload.hs_code = mrpResult.hsCode;
    if (mrpResult.igst) payload.igst = mrpResult.igst;
  }

  Object.assign(payload, config.extraCreateFields);
  normalizeExtraCreateFieldUnits(payload, config);

  validateCreateProductPayload(payload);

  return payload;
}

export async function createGs1ProductForRelease(
  input: Gs1CreateProductInput
): Promise<Gs1ProductCreateResult> {
  const config = readConfig();
  const payload = buildCreateProductPayload(input);
  const request = buildCreateProductRequest(payload, config);
  console.info('GS1 DataKart create payload prepared:', {
    path: config.createProductPath,
    bodyFormat: config.createBodyFormat,
    wrapperKey: config.createWrapperKey,
    keys: Object.keys(payload).sort(),
    required: summarizeCreateProductPayload(payload),
    optional: summarizeOptionalCreateProductPayload(payload),
  });
  const response = await gs1Fetch<unknown>(config.createProductPath, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  console.info('GS1 DataKart raw create response:', JSON.stringify(response));
  const gtin = extractGtin(response);
  const responseRecord = getRecord(response);
  const dataRecord = getRecord(responseRecord?.data);

  if (!gtin) {
    throw new Gs1DatakartError('GS1 DataKart did not return a GTIN for the created product', 502);
  }

  return {
    gtin,
    approvalStatus: getRecordString(dataRecord, 'approval_status'),
    recordStatus: getRecordString(dataRecord, 'product_status'),
    isComplete: getRecordString(dataRecord, 'approval_status') === 'approved',
    message: getRecordString(responseRecord, 'message'),
  };
}

export async function findGs1ProductForRelease(
  input: Gs1CreateProductInput
): Promise<Gs1ExistingProductResult | null> {
  const config = readConfig();
  const productName = cleanString(input.releaseTitle) || 'Untitled release';
  const response = await gs1Fetch<Gs1ProductListResponse>('/console/products', {
    method: 'POST',
    body: JSON.stringify({
      product_name: productName,
      gcp: [config.gcp],
      page: 1,
    }),
  });

  const items = collectProductListItems(response);
  const exact = items.find((item) => {
    const sku = cleanString(item.product_sku) || cleanString(item.sku_code);
    const name = cleanString(item.name || item.product_name);
    return sku === input.releaseId || name.toLowerCase() === productName.toLowerCase();
  });
  const gtin = exact ? normalizeGtin(exact.gtin) : '';

  return gtin
    ? {
        gtin,
        approvalStatus: cleanString(exact?.approval_status) || undefined,
        recordStatus: cleanString(exact?.product_status) || undefined,
        isComplete: cleanString(exact?.approval_status) === 'approved',
        message: 'Existing GS1 DataKart product found after create failure',
      }
    : null;
}

export async function validateGs1Gtin(gtin: string): Promise<Gs1ValidationResult> {
  const normalized = normalizeGtin(gtin);
  if (!normalized) {
    throw new Gs1DatakartError('GTIN must be 8 to 14 digits before GS1 validation', 400);
  }

  const params = new URLSearchParams({ gtin: normalized });
  const response = await gs1Fetch<Gs1ValidationResponse>(`/console/gtin/validate?${params.toString()}`);
  const records = collectValidationRecords(response?.data);
  const record = records.find((entry) => normalizeGtin(entry.gtin) === normalized);

  if (!record) {
    const responseGtin = extractGtin(response);
    if (responseGtin === normalized) {
      return {
        gtin: normalized,
        message: response?.message,
      };
    }

    throw new Gs1DatakartError(
      response?.message && response.message.toLowerCase() !== 'success'
        ? response.message
        : `GS1 DataKart did not validate GTIN ${normalized}`,
      502,
      sanitizeDetails(response)
    );
  }

  return {
    gtin: normalized,
    recordStatus: record.gtinRecordStatus,
    isComplete: record.isComplete,
    message: response.message,
  };
}

export { PROVIDER as GS1_DATAKART_PROVIDER };
