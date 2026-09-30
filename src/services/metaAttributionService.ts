export const META_ATTRIBUTION_MAX_PAGE_SIZE = 200;
const MAX_PAGE = 10_000;

export type MetaAttributionResolution =
  | "none"
  | "unresolved"
  | "campaign_resolved"
  | "campaign_adset_resolved"
  | "campaign_adset_ad_resolved";

export interface WebinarAttributionSource {
  status?: string | null;
  createdAt?: Date | string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdId?: string | null;
}

export interface MetaAttributionResolutionResult {
  attributed: boolean;
  resolution: MetaAttributionResolution;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
}

export interface MetaAttributionQuery {
  since?: string;
  until?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  page: number;
  limit: number;
  skip: number;
}

export type MetaAttributionQueryErrorCode = "INVALID_QUERY" | "INVALID_DATE_RANGE";

export class MetaAttributionQueryError extends Error {
  constructor(public readonly code: MetaAttributionQueryErrorCode, message: string) {
    super(message);
    this.name = "MetaAttributionQueryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasText(value: unknown): boolean {
  return textValue(value) !== null;
}

function strictDate(value: unknown, key: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MetaAttributionQueryError("INVALID_DATE_RANGE", `${key} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MetaAttributionQueryError("INVALID_DATE_RANGE", `${key} is not a valid calendar date`);
  }
  return value;
}

function optionalId(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = textValue(value);
  if (!normalized || normalized.length > 200) {
    throw new MetaAttributionQueryError("INVALID_QUERY", `${key} must be a non-empty identifier of at most 200 characters`);
  }
  return normalized;
}

function positiveInteger(value: unknown, key: string, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new MetaAttributionQueryError("INVALID_QUERY", `${key} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new MetaAttributionQueryError("INVALID_QUERY", `${key} must be between 1 and ${maximum}`);
  }
  return parsed;
}

export function parseMetaAttributionQuery(input: unknown): MetaAttributionQuery {
  if (!isRecord(input)) {
    throw new MetaAttributionQueryError("INVALID_QUERY", "Attribution filters must be an object");
  }

  const allowed = new Set(["since", "until", "campaign_id", "adset_id", "ad_id", "page", "limit"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new MetaAttributionQueryError("INVALID_QUERY", "Unsupported attribution filter");
  }

  const since = input.since === undefined ? undefined : strictDate(input.since, "since");
  const until = input.until === undefined ? undefined : strictDate(input.until, "until");
  if (since && until && since > until) {
    throw new MetaAttributionQueryError("INVALID_DATE_RANGE", "since must be on or before until");
  }

  const page = positiveInteger(input.page, "page", 1, MAX_PAGE);
  const limit = positiveInteger(input.limit, "limit", 50, META_ATTRIBUTION_MAX_PAGE_SIZE);

  return {
    since,
    until,
    campaignId: optionalId(input.campaign_id, "campaign_id"),
    adsetId: optionalId(input.adset_id, "adset_id"),
    adId: optionalId(input.ad_id, "ad_id"),
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function resolveMetaAttribution(registration: WebinarAttributionSource): MetaAttributionResolutionResult {
  const metaCampaignId = textValue(registration.metaCampaignId);
  const metaAdsetId = textValue(registration.metaAdsetId);
  const metaAdId = textValue(registration.metaAdId);
  // Google click IDs are not evidence of Meta attribution.
  const hasAttributionSignal = [
    registration.utmSource,
    registration.utmMedium,
    registration.utmCampaign,
    registration.utmContent,
    registration.utmTerm,
    registration.fbclid,
    registration.fbp,
    registration.fbc,
    metaCampaignId,
    metaAdsetId,
    metaAdId,
  ].some(hasText);

  let resolution: MetaAttributionResolution = "none";
  if (hasAttributionSignal) {
    if (!metaCampaignId) resolution = "unresolved";
    else if (metaAdsetId && metaAdId) resolution = "campaign_adset_ad_resolved";
    else if (metaAdsetId) resolution = "campaign_adset_resolved";
    else resolution = "campaign_resolved";
  }

  return {
    attributed: hasAttributionSignal,
    resolution,
    metaCampaignId,
    metaAdsetId,
    metaAdId,
  };
}

export function isMetaAttributed(registration: WebinarAttributionSource): boolean {
  return resolveMetaAttribution(registration).attributed;
}

export function isMetaAttributionUnresolved(registration: WebinarAttributionSource): boolean {
  const result = resolveMetaAttribution(registration);
  return result.attributed && result.resolution === "unresolved";
}

export function isPaidRegistration(registration: WebinarAttributionSource): boolean {
  return textValue(registration.status)?.toUpperCase() === "PAID";
}

export function toMetaAttributionRow(registration: WebinarAttributionSource & {
  id: string;
  createdAt: Date;
}): {
  registrationId: string;
  createdAt: string;
  paymentStatus: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclidPresent: boolean;
  fbpPresent: boolean;
  fbcPresent: boolean;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  resolution: MetaAttributionResolution;
} {
  const attribution = resolveMetaAttribution(registration);
  return {
    registrationId: registration.id,
    createdAt: registration.createdAt.toISOString(),
    paymentStatus: textValue(registration.status),
    utmSource: textValue(registration.utmSource),
    utmMedium: textValue(registration.utmMedium),
    utmCampaign: textValue(registration.utmCampaign),
    utmContent: textValue(registration.utmContent),
    utmTerm: textValue(registration.utmTerm),
    fbclidPresent: hasText(registration.fbclid),
    fbpPresent: hasText(registration.fbp),
    fbcPresent: hasText(registration.fbc),
    metaCampaignId: attribution.metaCampaignId,
    metaAdsetId: attribution.metaAdsetId,
    metaAdId: attribution.metaAdId,
    resolution: attribution.resolution,
  };
}

export function buildMetaAttributionWhere(query: MetaAttributionQuery): Record<string, unknown> {
  const filters: Record<string, unknown>[] = [];
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (query.since) createdAt.gte = new Date(`${query.since}T00:00:00.000Z`);
  if (query.until) createdAt.lte = new Date(`${query.until}T23:59:59.999Z`);
  if (Object.keys(createdAt).length) filters.push({ createdAt });
  if (query.campaignId) filters.push({ metaCampaignId: query.campaignId });
  if (query.adsetId) filters.push({ metaAdsetId: query.adsetId });
  if (query.adId) filters.push({ metaAdId: query.adId });
  return filters.length ? { AND: filters } : {};
}

export function metaAttributionSignalWhere(): Record<string, unknown> {
  return {
    OR: [
      { utmSource: { not: null } },
      { utmMedium: { not: null } },
      { utmCampaign: { not: null } },
      { utmContent: { not: null } },
      { utmTerm: { not: null } },
      { fbclid: { not: null } },
      { fbp: { not: null } },
      { fbc: { not: null } },
      { metaCampaignId: { not: null } },
      { metaAdsetId: { not: null } },
      { metaAdId: { not: null } },
    ],
  };
}

export function metaAttributionUnresolvedWhere(): Record<string, unknown> {
  return {
    AND: [
      metaAttributionSignalWhere(),
      { OR: [{ metaCampaignId: null }, { metaCampaignId: "" }] },
    ],
  };
}

export function buildMetaAttributionSummary(counts: {
  totalRegistrations: number;
  attributedRegistrations: number;
  unresolvedAttributions: number;
  paidRegistrations: number;
  paidAttributedRegistrations: number;
}) {
  return counts;
}

export function buildMetaAttributionPagination(page: number, limit: number, totalRows: number) {
  const hasMore = page * limit < totalRows;
  return {
    page,
    pageSize: limit,
    totalRows,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  };
}