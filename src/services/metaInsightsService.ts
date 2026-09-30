import { config } from "../lib/config";
import { requestMetaGraph, type MetaResponseCategory } from "./metaGraphService";

const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const PAGE_SIZE = 100;
export const META_INSIGHTS_MAX_PAGES = 5;

export type MetaInsightsBreakdown = "account" | "campaign" | "adset" | "ad";
export type MetaInsightsGranularity = "daily" | "summary";
export type MetaInsightsStatus = "ok" | "empty" | "not_configured" | "permission_denied" | "partial" | "error";

export interface MetaInsightsQuery {
  since: string;
  until: string;
  breakdown: MetaInsightsBreakdown;
  granularity: MetaInsightsGranularity;
}

export interface MetaInsightAction {
  action_type: string;
  value: number | null;
}

export interface MetaInsightRow {
  date_start: string | null;
  date_stop: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
  actions: MetaInsightAction[];
}

export interface MetaInsightsResult {
  adAccountId: string | null;
  breakdown: MetaInsightsBreakdown;
  dateRange: { since: string; until: string; granularity: MetaInsightsGranularity };
  status: MetaInsightsStatus;
  category: MetaResponseCategory;
  statusCode: number | null;
  error: { code: MetaResponseCategory; message: string } | null;
  rows: MetaInsightRow[];
  pagination: {
    pagesFetched: number;
    complete: boolean;
    hasMore: boolean;
    limitReached: boolean;
  };
}

export type MetaInsightsQueryErrorCode = "INVALID_QUERY" | "INVALID_DATE_RANGE";

export class MetaInsightsQueryError extends Error {
  constructor(public readonly code: MetaInsightsQueryErrorCode, message: string) {
    super(message);
    this.name = "MetaInsightsQueryError";
  }
}

const BREAKDOWNS = new Set<MetaInsightsBreakdown>(["account", "campaign", "adset", "ad"]);
const GRANULARITIES = new Set<MetaInsightsGranularity>(["daily", "summary"]);
const METRIC_FIELDS = [
  "date_start", "date_stop", "spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "frequency", "actions",
];
const DIMENSION_FIELDS: Record<MetaInsightsBreakdown, string[]> = {
  account: [],
  campaign: ["campaign_id", "campaign_name"],
  adset: ["campaign_id", "campaign_name", "adset_id", "adset_name"],
  ad: ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"],
};
const ALLOWED_QUERY_KEYS = new Set(["since", "until", "breakdown", "granularity"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strictDate(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MetaInsightsQueryError("INVALID_DATE_RANGE", `${name} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MetaInsightsQueryError("INVALID_DATE_RANGE", `${name} is not a valid calendar date`);
  }
  return value;
}

export function parseMetaInsightsQuery(input: unknown): MetaInsightsQuery {
  if (!isRecord(input)) {
    throw new MetaInsightsQueryError("INVALID_QUERY", "Insights query must be an object");
  }

  if (Object.keys(input).some((key) => !ALLOWED_QUERY_KEYS.has(key))) {
    throw new MetaInsightsQueryError("INVALID_QUERY", "Only since, until, breakdown, and granularity are supported");
  }

  const since = strictDate(input.since, "since");
  const until = strictDate(input.until, "until");
  if (since > until) {
    throw new MetaInsightsQueryError("INVALID_DATE_RANGE", "since must be on or before until");
  }

  const breakdown = input.breakdown === undefined ? "account" : input.breakdown;
  if (typeof breakdown !== "string" || !BREAKDOWNS.has(breakdown as MetaInsightsBreakdown)) {
    throw new MetaInsightsQueryError("INVALID_QUERY", "breakdown must be account, campaign, adset, or ad");
  }

  const granularity = input.granularity === undefined ? "daily" : input.granularity;
  if (typeof granularity !== "string" || !GRANULARITIES.has(granularity as MetaInsightsGranularity)) {
    throw new MetaInsightsQueryError("INVALID_QUERY", "granularity must be daily or summary");
  }

  return {
    since,
    until,
    breakdown: breakdown as MetaInsightsBreakdown,
    granularity: granularity as MetaInsightsGranularity,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeActions(value: unknown): MetaInsightAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.action_type === "string" && Boolean(item.action_type.trim()))
    .map((item) => ({
      action_type: (item.action_type as string).trim(),
      value: numberValue(item.value),
    }));
}

function normalizeRow(item: Record<string, unknown>): MetaInsightRow {
  return {
    date_start: stringValue(item.date_start),
    date_stop: stringValue(item.date_stop),
    campaign_id: stringValue(item.campaign_id),
    campaign_name: stringValue(item.campaign_name),
    adset_id: stringValue(item.adset_id),
    adset_name: stringValue(item.adset_name),
    ad_id: stringValue(item.ad_id),
    ad_name: stringValue(item.ad_name),
    spend: numberValue(item.spend),
    impressions: numberValue(item.impressions),
    reach: numberValue(item.reach),
    clicks: numberValue(item.clicks),
    ctr: numberValue(item.ctr),
    cpc: numberValue(item.cpc),
    cpm: numberValue(item.cpm),
    frequency: numberValue(item.frequency),
    actions: normalizeActions(item.actions),
  };
}

function responseRows(body: unknown): MetaInsightRow[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isRecord).map(normalizeRow);
}

function nextPageUrl(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.paging)) return null;
  return typeof body.paging.next === "string" ? body.paging.next : null;
}

function nextCursor(nextUrl: string, expectedPath: string): Record<string, string> | null {
  try {
    const url = new URL(nextUrl);
    if (url.origin !== META_GRAPH_ORIGIN || url.pathname !== expectedPath) return null;
    const cursor: Record<string, string> = {};
    for (const key of ["after", "before"]) {
      const value = url.searchParams.get(key);
      if (value !== null) cursor[key] = value;
    }
    return Object.keys(cursor).length ? cursor : null;
  } catch {
    return null;
  }
}

function graphErrorCategory(body: unknown, fallback: MetaResponseCategory): MetaResponseCategory {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== "number") return fallback;
  if (body.error.code === 190) return "invalid_token";
  if (body.error.code === 10 || body.error.code === 200) return "forbidden";
  if ([4, 17, 32, 613].includes(body.error.code)) return "rate_limited";
  return fallback;
}

function errorMessage(category: MetaResponseCategory): string {
  switch (category) {
    case "missing_credentials": return "Meta access token is not configured";
    case "incomplete_configuration": return "Meta Ad Account is not configured";
    case "invalid_token": return "Meta access token is invalid or expired";
    case "forbidden": return "Meta denied permission to read Insights";
    case "rate_limited": return "Meta rate limit reached";
    case "timeout": return "Meta Graph API request timed out";
    case "network_error": return "Unable to reach the Meta Graph API";
    case "meta_unavailable": return "Meta Graph API is unavailable";
    default: return "Meta Insights request failed";
  }
}

function baseResult(
  accountId: string | null,
  query: MetaInsightsQuery,
  category: MetaResponseCategory,
  status: MetaInsightsStatus,
  statusCode: number | null = null,
): MetaInsightsResult {
  return {
    adAccountId: accountId,
    breakdown: query.breakdown,
    dateRange: { since: query.since, until: query.until, granularity: query.granularity },
    status,
    category,
    statusCode,
    error: category === "ok" ? null : { code: category, message: errorMessage(category) },
    rows: [],
    pagination: { pagesFetched: 0, complete: false, hasMore: false, limitReached: false },
  };
}

function permissionFailure(category: MetaResponseCategory): boolean {
  return category === "invalid_token" || category === "forbidden";
}

export async function getMetaInsights(input: unknown): Promise<MetaInsightsResult> {
  const query = parseMetaInsightsQuery(input);
  const configuredAccountId = config.META_AD_ACCOUNT_ID?.trim();
  const adAccountId = configuredAccountId
    ? configuredAccountId.startsWith("act_") ? configuredAccountId : `act_${configuredAccountId}`
    : null;

  if (!config.META_ACCESS_TOKEN) {
    return baseResult(adAccountId, query, "missing_credentials", "not_configured");
  }
  if (!adAccountId) {
    return baseResult(null, query, "incomplete_configuration", "not_configured");
  }

  const accountPath = `/${encodeURIComponent(adAccountId)}/insights`;
  const graphPath = `/${config.META_GRAPH_API_VERSION}${accountPath}`;
  const params: Record<string, string> = {
    fields: [...METRIC_FIELDS, ...DIMENSION_FIELDS[query.breakdown]].join(","),
    level: query.breakdown,
    time_range: JSON.stringify({ since: query.since, until: query.until }),
    limit: String(PAGE_SIZE),
  };
  if (query.granularity === "daily") params.time_increment = "1";

  const rows: MetaInsightRow[] = [];
  const seenCursors = new Set<string>();
  let pagesFetched = 0;
  let complete = false;
  let hasMore = false;
  let limitReached = false;
  let category: MetaResponseCategory = "ok";
  let statusCode: number | null = null;
  let failed = false;

  while (pagesFetched < META_INSIGHTS_MAX_PAGES) {
    let result;
    try {
      result = await requestMetaGraph(accountPath, params);
    } catch {
      category = "unknown_error";
      failed = true;
      break;
    }

    if (!result.ok) {
      category = graphErrorCategory(result.body, result.category);
      statusCode = result.statusCode;
      failed = true;
      break;
    }

    pagesFetched += 1;
    rows.push(...responseRows(result.body));

    const next = nextPageUrl(result.body);
    if (!next) {
      complete = true;
      hasMore = false;
      break;
    }

    hasMore = true;
    if (pagesFetched >= META_INSIGHTS_MAX_PAGES) {
      limitReached = true;
      break;
    }

    const cursor = nextCursor(next, graphPath);
    if (!cursor) {
      category = "invalid_request";
      failed = true;
      break;
    }
    const cursorKey = JSON.stringify(cursor);
    if (seenCursors.has(cursorKey)) {
      category = "invalid_request";
      failed = true;
      break;
    }
    seenCursors.add(cursorKey);
    Object.keys(params).filter((key) => key === "after" || key === "before").forEach((key) => delete params[key]);
    Object.assign(params, cursor);
  }

  const status: MetaInsightsStatus = failed
    ? rows.length > 0 ? "partial" : permissionFailure(category) ? "permission_denied" : "error"
    : hasMore ? "partial" : rows.length > 0 ? "ok" : "empty";

  return {
    ...baseResult(adAccountId, query, category, status, statusCode),
    error: failed ? { code: category, message: errorMessage(category) } : null,
    rows,
    pagination: { pagesFetched, complete, hasMore, limitReached },
  };
}