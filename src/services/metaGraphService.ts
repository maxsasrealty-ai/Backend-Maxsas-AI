import { config } from "../lib/config";

const META_GRAPH_BASE_URL = "https://graph.facebook.com";
const META_REQUEST_TIMEOUT_MS = 10_000;

export type MetaResponseCategory =
  | "ok"
  | "missing_credentials"
  | "incomplete_configuration"
  | "invalid_token"
  | "invalid_request"
  | "resource_not_found"
  | "forbidden"
  | "rate_limited"
  | "meta_unavailable"
  | "timeout"
  | "network_error"
  | "unknown_error";

type MetaResourceStatus = "verified" | "invalid" | "not_configured" | "not_checked";
type MetaTokenStatus = "valid" | "invalid" | "not_configured" | "unknown";

export interface MetaConnectionHealth {
  connected: boolean;
  apiVersion: string;
  businessId: string | null;
  businessStatus: MetaResourceStatus;
  adAccountId: string | null;
  adAccountStatus: MetaResourceStatus;
  token: {
    configured: boolean;
    valid: boolean | null;
    status: MetaTokenStatus;
  };
  response: {
    category: MetaResponseCategory;
    statusCode: number | null;
  };
}

export type MetaRequestResult = {
  ok: boolean;
  category: MetaResponseCategory;
  statusCode: number | null;
  body: unknown;
};

function categorizeStatus(statusCode: number): MetaResponseCategory {
  if (statusCode === 400) return "invalid_request";
  if (statusCode === 401) return "invalid_token";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "resource_not_found";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "meta_unavailable";
  return "unknown_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function requestMetaGraph(
  path: string,
  params: Record<string, string> = {},
  accessToken = config.META_ACCESS_TOKEN,
): Promise<MetaRequestResult> {
  if (!accessToken) {
    return {
      ok: false,
      category: "missing_credentials",
      statusCode: null,
      body: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  const url = new URL(`${META_GRAPH_BASE_URL}/${config.META_GRAPH_API_VERSION}${path}`);

  url.searchParams.set("access_token", accessToken);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  try {
    const response = await fetch(url, { signal: controller.signal });
    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      ok: response.ok,
      category: response.ok ? "ok" : categorizeStatus(response.status),
      statusCode: response.status,
      body,
    };
  } catch (error) {
    const category: MetaResponseCategory = error instanceof Error && error.name === "AbortError"
      ? "timeout"
      : "network_error";

    return {
      ok: false,
      category,
      statusCode: null,
      body: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resourceStatus(result: MetaRequestResult | null): MetaResourceStatus {
  if (!result) return "not_configured";
  return result.ok ? "verified" : "invalid";
}

function firstFailure(...results: Array<MetaRequestResult | null>): MetaRequestResult | null {
  return results.find((result) => result && !result.ok) || null;
}

export async function checkMetaGraphConnection(): Promise<MetaConnectionHealth> {
  const businessId = config.META_BUSINESS_ID || null;
  const adAccountId = config.META_AD_ACCOUNT_ID || null;
  const accessToken = config.META_ACCESS_TOKEN;
  const hasAppCredentials = Boolean(config.META_APP_ID && config.META_APP_SECRET);

  if (!accessToken) {
    return {
      connected: false,
      apiVersion: config.META_GRAPH_API_VERSION,
      businessId,
      businessStatus: "not_checked",
      adAccountId,
      adAccountStatus: "not_checked",
      token: {
        configured: false,
        valid: null,
        status: "not_configured",
      },
      response: {
        category: "missing_credentials",
        statusCode: null,
      },
    };
  }

  const tokenProbe = hasAppCredentials
    ? await requestMetaGraph(
        "/debug_token",
        { input_token: accessToken },
        `${config.META_APP_ID}|${config.META_APP_SECRET}`,
      )
    : await requestMetaGraph("/me", { fields: "id" }, accessToken);

  const tokenData = isRecord(tokenProbe.body) && isRecord(tokenProbe.body.data)
    ? tokenProbe.body.data
    : null;
  const tokenValid = tokenProbe.ok
    ? hasAppCredentials
      ? tokenData?.is_valid === true
      : true
    : false;
  const tokenStatus: MetaTokenStatus = tokenValid
    ? "valid"
    : tokenProbe.category === "invalid_token" || tokenData?.is_valid === false
      ? "invalid"
      : "unknown";

  if (!tokenValid) {
    console.warn("Meta Graph connection check failed.", {
      category: tokenProbe.category,
      statusCode: tokenProbe.statusCode,
    });
  }

  const businessProbe = tokenValid && businessId
    ? await requestMetaGraph(`/${encodeURIComponent(businessId)}`, { fields: "id,name" }, accessToken)
    : null;
  const normalizedAdAccountId = adAccountId
    ? adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`
    : null;
  const adAccountProbe = tokenValid && normalizedAdAccountId
    ? await requestMetaGraph(`/${encodeURIComponent(normalizedAdAccountId)}`, { fields: "id,name,account_status" }, accessToken)
    : null;

  const missingConfiguration = !config.META_APP_ID || !config.META_APP_SECRET || !businessId || !adAccountId;
  const failure = firstFailure(tokenProbe, businessProbe, adAccountProbe);
  const category = tokenStatus === "invalid"
    ? "invalid_token"
    : failure?.category || (missingConfiguration ? "incomplete_configuration" : "ok");
  const connected = tokenValid && Boolean(businessId && adAccountId)
    && resourceStatus(businessProbe) === "verified"
    && resourceStatus(adAccountProbe) === "verified"
    && !missingConfiguration;

  return {
    connected,
    apiVersion: config.META_GRAPH_API_VERSION,
    businessId,
    businessStatus: resourceStatus(businessProbe),
    adAccountId,
    adAccountStatus: resourceStatus(adAccountProbe),
    token: {
      configured: true,
      valid: tokenValid,
      status: tokenStatus,
    },
    response: {
      category,
      statusCode: failure?.statusCode ?? tokenProbe.statusCode,
    },
  };
}
