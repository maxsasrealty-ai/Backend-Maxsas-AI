import {
  checkMetaGraphConnection,
  requestMetaGraph,
  type MetaConnectionHealth,
  type MetaRequestResult,
  type MetaResponseCategory,
} from "./metaGraphService";

export type MetaAssetCollectionStatus = "ok" | "not_configured" | "permission_denied" | "error";

export interface MetaAssetCollection<T> {
  items: T[];
  status: MetaAssetCollectionStatus;
  category: MetaResponseCategory;
  statusCode: number | null;
}

export interface MetaBusinessAsset {
  id: string;
  name: string | null;
  verificationStatus: string | null;
}

export interface MetaAdAccountAsset {
  id: string;
  accountId: string | null;
  name: string | null;
  status: string | null;
  currency: string | null;
  timezone: string | null;
}

export interface MetaPageAsset {
  id: string;
  name: string | null;
  username: string | null;
  category: string | null;
  verificationStatus: string | null;
}

export interface MetaInstagramAsset {
  id: string;
  pageId: string;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
}

export interface MetaPixelAsset {
  id: string;
  name: string | null;
  creationTime: string | null;
  lastFiredTime: string | null;
}

export interface MetaDatasetAsset {
  id: string;
  name: string | null;
  creationTime: string | null;
  updatedTime: string | null;
}

export interface MetaAssetDiscovery {
  connection: MetaConnectionHealth;
  business: MetaAssetCollection<MetaBusinessAsset>;
  adAccounts: MetaAssetCollection<MetaAdAccountAsset>;
  pages: MetaAssetCollection<MetaPageAsset>;
  instagramAccounts: MetaAssetCollection<MetaInstagramAsset>;
  pixels: MetaAssetCollection<MetaPixelAsset>;
  datasets: MetaAssetCollection<MetaDatasetAsset>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function arrayData(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isRecord);
}

function collection<T>(result: MetaRequestResult | null, items: T[] = []): MetaAssetCollection<T> {
  if (!result) {
    return {
      items: [],
      status: "not_configured",
      category: "incomplete_configuration",
      statusCode: null,
    };
  }

  const permissionDenied = result.category === "forbidden" || result.category === "invalid_token";
  return {
    items: result.ok ? items : [],
    status: result.ok ? "ok" : permissionDenied ? "permission_denied" : "error",
    category: result.category,
    statusCode: result.statusCode,
  };
}

function emptyCollection<T>(connection: MetaConnectionHealth): MetaAssetCollection<T> {
  const notConfigured = connection.response.category === "missing_credentials"
    || connection.response.category === "incomplete_configuration";
  return {
    items: [],
    status: notConfigured ? "not_configured" : "error",
    category: connection.response.category,
    statusCode: connection.response.statusCode,
  };
}

function normalizeBusiness(body: unknown): MetaBusinessAsset | null {
  if (!isRecord(body) || typeof body.id !== "string") return null;
  return {
    id: body.id,
    name: stringValue(body.name),
    verificationStatus: stringValue(body.verification_status),
  };
}

function normalizeAdAccounts(body: unknown): MetaAdAccountAsset[] {
  return arrayData(body)
    .filter((item): item is Record<string, unknown> & { id: string } => typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      accountId: stringValue(item.account_id),
      name: stringValue(item.name),
      status: stringValue(item.account_status),
      currency: stringValue(item.currency),
      timezone: stringValue(item.timezone_name),
    }));
}

function normalizePages(body: unknown): MetaPageAsset[] {
  return arrayData(body)
    .filter((item): item is Record<string, unknown> & { id: string } => typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      name: stringValue(item.name),
      username: stringValue(item.username),
      category: stringValue(item.category),
      verificationStatus: stringValue(item.verification_status),
    }));
}

function normalizePixels(body: unknown): MetaPixelAsset[] {
  return arrayData(body)
    .filter((item): item is Record<string, unknown> & { id: string } => typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      name: stringValue(item.name),
      creationTime: stringValue(item.creation_time),
      lastFiredTime: stringValue(item.last_fired_time),
    }));
}

function normalizeDatasets(body: unknown): MetaDatasetAsset[] {
  return arrayData(body)
    .filter((item): item is Record<string, unknown> & { id: string } => typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      name: stringValue(item.name),
      creationTime: stringValue(item.creation_time),
      updatedTime: stringValue(item.updated_time),
    }));
}

function mergeById<T extends { id: string }>(...groups: T[][]): T[] {
  const merged = new Map<string, T>();
  groups.flat().forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

function mergeResults(...results: MetaRequestResult[]): MetaRequestResult {
  const successful = results.find((result) => result.ok);
  return successful || results[0];
}

function instagramFromPages(body: unknown, pageId: string): MetaInstagramAsset | null {
  if (!isRecord(body) || !isRecord(body.instagram_business_account)) return null;
  const account = body.instagram_business_account;
  if (typeof account.id !== "string") return null;
  return {
    id: account.id,
    pageId,
    username: stringValue(account.username),
    name: stringValue(account.name),
    profilePictureUrl: stringValue(account.profile_picture_url),
  };
}

export async function discoverMetaAssets(): Promise<MetaAssetDiscovery> {
  const connection = await checkMetaGraphConnection();
  const empty = <T,>() => emptyCollection<T>(connection);

  if (!connection.token.valid || !connection.businessId || connection.businessStatus !== "verified") {
    return {
      connection,
      business: empty<MetaBusinessAsset>(),
      adAccounts: empty<MetaAdAccountAsset>(),
      pages: empty<MetaPageAsset>(),
      instagramAccounts: empty<MetaInstagramAsset>(),
      pixels: empty<MetaPixelAsset>(),
      datasets: empty<MetaDatasetAsset>(),
    };
  }

  const businessId = encodeURIComponent(connection.businessId);
  const [businessResult, ownedAdAccounts, clientAdAccounts, ownedPages, clientPages, pixelsResult, datasetsResult] = await Promise.all([
    requestMetaGraph(`/${businessId}`, { fields: "id,name,verification_status" }),
    requestMetaGraph(`/${businessId}/owned_ad_accounts`, { fields: "id,account_id,name,account_status,currency,timezone_name", limit: "100" }),
    requestMetaGraph(`/${businessId}/client_ad_accounts`, { fields: "id,account_id,name,account_status,currency,timezone_name", limit: "100" }),
    requestMetaGraph(`/${businessId}/owned_pages`, { fields: "id,name,username,category,verification_status", limit: "100" }),
    requestMetaGraph(`/${businessId}/client_pages`, { fields: "id,name,username,category,verification_status", limit: "100" }),
    requestMetaGraph(`/${businessId}/owned_pixels`, { fields: "id,name,creation_time,last_fired_time", limit: "100" }),
    requestMetaGraph(`/${businessId}/datasets`, { fields: "id,name,creation_time,updated_time", limit: "100" }),
  ]);

  const pages = mergeById(normalizePages(ownedPages.body), normalizePages(clientPages.body));
  const adAccountsResult = mergeResults(ownedAdAccounts, clientAdAccounts);
  const pagesResult = mergeResults(ownedPages, clientPages);
  const instagramResults = await Promise.all(
    pages.map(async (page) => ({
      pageId: page.id,
      result: await requestMetaGraph(`/${encodeURIComponent(page.id)}`, {
        fields: "instagram_business_account{id,username,name,profile_picture_url}",
      }),
    })),
  );
  const instagramAccounts = instagramResults
    .map(({ pageId, result }) => instagramFromPages(result.body, pageId))
    .filter((account): account is MetaInstagramAsset => account !== null);
  const instagramResult = instagramResults.length
    ? mergeResults(...instagramResults.map(({ result }) => result))
    : pagesResult;

  return {
    connection,
    business: collection(businessResult, businessResult.ok ? [normalizeBusiness(businessResult.body)].filter((item): item is MetaBusinessAsset => item !== null) : []),
    adAccounts: collection(adAccountsResult, mergeById(normalizeAdAccounts(ownedAdAccounts.body), normalizeAdAccounts(clientAdAccounts.body))),
    pages: collection(pagesResult, pages),
    instagramAccounts: collection(instagramResult, instagramAccounts),
    pixels: collection(pixelsResult, normalizePixels(pixelsResult.body)),
    datasets: collection(datasetsResult, normalizeDatasets(datasetsResult.body)),
  };
}
