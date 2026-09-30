import { config } from "../lib/config";
import { requestMetaGraph, type MetaResponseCategory } from "./metaGraphService";

const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const PAGE_SIZE = 100;
export const META_ADS_MAX_PAGES = 5;

export type MetaAdsCollectionStatus =
  | "ok"
  | "empty"
  | "not_configured"
  | "permission_denied"
  | "partial"
  | "error";

export interface MetaAdsCollection<T> {
  items: T[];
  status: MetaAdsCollectionStatus;
  category: MetaResponseCategory;
  statusCode: number | null;
  error: { code: MetaResponseCategory; message: string } | null;
  pagination: {
    pagesFetched: number;
    complete: boolean;
    hasMore: boolean;
    limitReached: boolean;
  };
}

export interface MetaCampaign {
  id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  buying_type: string | null;
  created_time: string | null;
  updated_time: string | null;
}

export interface MetaAdSet {
  id: string;
  name: string | null;
  campaign_id: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  billing_event: string | null;
  optimization_goal: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface MetaAd {
  id: string;
  name: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  status: string | null;
  effective_status: string | null;
  created_time: string | null;
  updated_time: string | null;
}

export interface MetaAdsDiscovery {
  adAccountId: string | null;
  campaigns: MetaAdsCollection<MetaCampaign>;
  adsets: MetaAdsCollection<MetaAdSet>;
  ads: MetaAdsCollection<MetaAd>;
}

type ResourceName = "campaigns" | "adsets" | "ads";

const RESOURCE_FIELDS: Record<ResourceName, string> = {
  campaigns: "id,name,status,effective_status,objective,buying_type,created_time,updated_time",
  adsets: "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,billing_event,optimization_goal,start_time,end_time",
  ads: "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function records(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isRecord);
}

function nextPageUrl(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.paging)) return null;
  return typeof body.paging.next === "string" ? body.paging.next : null;
}

function nextPageParams(nextUrl: string, resourcePath: string): Record<string, string> | null {
  try {
    const url = new URL(nextUrl);
    const expectedPath = `/${config.META_GRAPH_API_VERSION}${resourcePath}`;
    if (url.origin !== META_GRAPH_ORIGIN || url.pathname !== expectedPath) return null;

    const params: Record<string, string> = {};
    for (const key of ["after", "before", "fields", "limit"]) {
      const value = url.searchParams.get(key);
      if (value !== null) params[key] = value;
    }
    return params;
  } catch {
    return null;
  }
}

function errorMessage(category: MetaResponseCategory): string {
  switch (category) {
    case "missing_credentials":
      return "Meta access token is not configured";
    case "incomplete_configuration":
      return "Meta Ad Account is not configured";
    case "invalid_token":
      return "Meta access token is invalid or expired";
    case "forbidden":
      return "Meta denied permission to read this resource";
    case "rate_limited":
      return "Meta rate limit reached";
    case "timeout":
      return "Meta Graph API request timed out";
    case "network_error":
      return "Unable to reach the Meta Graph API";
    case "meta_unavailable":
      return "Meta Graph API is unavailable";
    default:
      return "Meta Graph API request failed";
  }
}

function graphErrorCategory(body: unknown, fallback: MetaResponseCategory): MetaResponseCategory {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== "number") {
    return fallback;
  }

  if (body.error.code === 190) return "invalid_token";
  if (body.error.code === 10 || body.error.code === 200) return "forbidden";
  if ([4, 17, 32, 613].includes(body.error.code)) return "rate_limited";
  return fallback;
}

function emptyCollection<T>(
  category: MetaResponseCategory,
  statusCode: number | null = null,
): MetaAdsCollection<T> {
  return {
    items: [],
    status: "not_configured",
    category,
    statusCode,
    error: { code: category, message: errorMessage(category) },
    pagination: { pagesFetched: 0, complete: false, hasMore: false, limitReached: false },
  };
}

function normalizeRecord<T extends { id: string }>(
  item: Record<string, unknown>,
  fields: readonly (keyof T)[],
): T | null {
  if (typeof item.id !== "string" || !item.id) return null;
  const normalized: Record<string, unknown> = { id: item.id };
  for (const field of fields as readonly string[]) {
    if (field === "id") continue;
    normalized[field] = stringValue(item[field]);
  }
  return normalized as T;
}

const NORMALIZERS: Record<ResourceName, (item: Record<string, unknown>) => unknown | null> = {
  campaigns: (item) => normalizeRecord<MetaCampaign>(item, [
    "id", "name", "status", "effective_status", "objective", "buying_type", "created_time", "updated_time",
  ]),
  adsets: (item) => normalizeRecord<MetaAdSet>(item, [
    "id", "name", "campaign_id", "status", "effective_status", "daily_budget", "lifetime_budget",
    "billing_event", "optimization_goal", "start_time", "end_time",
  ]),
  ads: (item) => normalizeRecord<MetaAd>(item, [
    "id", "name", "adset_id", "campaign_id", "status", "effective_status", "created_time", "updated_time",
  ]),
};

function permissionFailure(category: MetaResponseCategory): boolean {
  return category === "invalid_token" || category === "forbidden";
}

async function discoverCollection<T>(
  accountPath: string,
  resource: ResourceName,
): Promise<MetaAdsCollection<T>> {
  const resourcePath = `${accountPath}/${resource}`;
  const items: T[] = [];
  let params: Record<string, string> = {
    fields: RESOURCE_FIELDS[resource],
    limit: String(PAGE_SIZE),
  };
  let pagesFetched = 0;
  let complete = false;
  let hasMore = false;
  let limitReached = false;
  let category: MetaResponseCategory = "ok";
  let statusCode: number | null = null;
  let failed = false;

  while (pagesFetched < META_ADS_MAX_PAGES) {
    let result;
    try {
      result = await requestMetaGraph(resourcePath, params);
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
    for (const item of records(result.body)) {
      const normalized = NORMALIZERS[resource](item);
      if (normalized) items.push(normalized as T);
    }

    const next = nextPageUrl(result.body);
    if (!next) {
      complete = true;
      hasMore = false;
      break;
    }

    hasMore = true;
    if (pagesFetched >= META_ADS_MAX_PAGES) {
      limitReached = true;
      break;
    }

    const parsedParams = nextPageParams(next, resourcePath);
    if (!parsedParams) {
      category = "invalid_request";
      failed = true;
      break;
    }
    params = parsedParams;
  }

  const status: MetaAdsCollectionStatus = failed
    ? items.length > 0
      ? "partial"
      : permissionFailure(category)
        ? "permission_denied"
        : "error"
    : hasMore
      ? "partial"
      : items.length > 0
        ? "ok"
        : "empty";

  return {
    items,
    status,
    category,
    statusCode,
    error: failed ? { code: category, message: errorMessage(category) } : null,
    pagination: { pagesFetched, complete, hasMore, limitReached },
  };
}

export async function discoverMetaAds(): Promise<MetaAdsDiscovery> {
  const accountId = config.META_AD_ACCOUNT_ID?.trim();
  const adAccountId = accountId
    ? accountId.startsWith("act_") ? accountId : `act_${accountId}`
    : null;

  if (!config.META_ACCESS_TOKEN) {
    return {
      adAccountId,
      campaigns: emptyCollection("missing_credentials"),
      adsets: emptyCollection("missing_credentials"),
      ads: emptyCollection("missing_credentials"),
    };
  }

  if (!adAccountId) {
    return {
      adAccountId: null,
      campaigns: emptyCollection("incomplete_configuration"),
      adsets: emptyCollection("incomplete_configuration"),
      ads: emptyCollection("incomplete_configuration"),
    };
  }

  const accountPath = `/${encodeURIComponent(adAccountId)}`;
  const [campaigns, adsets, ads] = await Promise.all([
    discoverCollection<MetaCampaign>(accountPath, "campaigns"),
    discoverCollection<MetaAdSet>(accountPath, "adsets"),
    discoverCollection<MetaAd>(accountPath, "ads"),
  ]);

  return { adAccountId, campaigns, adsets, ads };
}