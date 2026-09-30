import type { Prisma, PrismaClient } from "../generated/prisma";
import {
  isMetaAttributed,
  metaAttributionSignalWhere,
  type WebinarAttributionSource,
} from "./metaAttributionService";
import {
  getMetaInsights,
  type MetaInsightRow,
  type MetaInsightsBreakdown,
  type MetaInsightsResult,
} from "./metaInsightsService";

const MAX_REGISTRATION_ROWS = 10_000;

export type MetaMarketingBreakdown = Extract<MetaInsightsBreakdown, "campaign" | "adset" | "ad">;
export type MetaMarketingQueryErrorCode = "INVALID_QUERY" | "INVALID_DATE_RANGE";

export class MetaMarketingAnalyticsQueryError extends Error {
  constructor(public readonly code: MetaMarketingQueryErrorCode, message: string) {
    super(message);
    this.name = "MetaMarketingAnalyticsQueryError";
  }
}

export class MetaMarketingAnalyticsDatabaseError extends Error {
  constructor() {
    super("Marketing analytics database lookup failed");
    this.name = "MetaMarketingAnalyticsDatabaseError";
  }
}

export interface MetaMarketingQuery {
  since: string;
  until: string;
  breakdown: MetaMarketingBreakdown;
}

export interface MetaMarketingRegistration extends WebinarAttributionSource {
  id: string;
  createdAt: Date;
  status: string;
}

export interface MetaMarketingCounts {
  totalRegistrations: number;
  attributedRegistrations: number;
  resolvedRegistrations: number;
  unresolvedRegistrations: number;
  paidRegistrations: number;
  paidAttributedRegistrations: number;
  unmatchedAttributedRegistrations: number;
}

export interface MetaMarketingMetrics {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
}

export interface MetaMarketingRow extends MetaMarketingMetrics {
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  registrations: number;
  attributedRegistrations: number;
  paidRegistrations: number;
  paidAttributedRegistrations: number;
  unresolvedRegistrations: number;
  matchStatus: "matched" | "unmatched" | "unresolved";
}

export interface MetaMarketingAnalytics {
  breakdown: MetaMarketingBreakdown;
  metaDateRange: { since: string; until: string };
  registrationDateRange: { since: string; until: string };
  partial: boolean;
  metaStatus: {
    status: MetaInsightsResult["status"];
    category: MetaInsightsResult["category"];
    statusCode: number | null;
  };
  rows: MetaMarketingRow[];
  summary: MetaMarketingCounts & {
    metaRows: number;
    unmatchedMetaRows: number;
  };
  pagination: {
    meta: MetaInsightsResult["pagination"];
    registrations: {
      maxRows: number;
      rowsFetched: number;
      totalRows: number;
      complete: boolean;
      hasMore: boolean;
      limitReached: boolean;
    };
  };
}

const BREAKDOWNS = new Set<MetaMarketingBreakdown>(["campaign", "adset", "ad"]);
const ALLOWED_QUERY_KEYS = new Set(["since", "until", "breakdown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strictDate(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_DATE_RANGE", `${name} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_DATE_RANGE", `${name} is not a valid calendar date`);
  }
  return value;
}

export function parseMetaMarketingQuery(input: unknown): MetaMarketingQuery {
  if (!isRecord(input)) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_QUERY", "Analytics filters must be an object");
  }
  if (Object.keys(input).some((key) => !ALLOWED_QUERY_KEYS.has(key))) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_QUERY", "Only since, until, and breakdown are supported");
  }

  const since = strictDate(input.since, "since");
  const until = strictDate(input.until, "until");
  if (since > until) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_DATE_RANGE", "since must be on or before until");
  }
  const breakdown = input.breakdown === undefined ? "campaign" : input.breakdown;
  if (typeof breakdown !== "string" || !BREAKDOWNS.has(breakdown as MetaMarketingBreakdown)) {
    throw new MetaMarketingAnalyticsQueryError("INVALID_QUERY", "breakdown must be campaign, adset, or ad");
  }
  return { since, until, breakdown: breakdown as MetaMarketingBreakdown };
}

function metricValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumMetric(rows: MetaInsightRow[], key: keyof MetaInsightRow): number | null {
  if (!rows.length) return null;
  const values = rows.map((row) => metricValue(row[key]));
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value as number), 0);
}

function firstText(rows: MetaInsightRow[], key: keyof MetaInsightRow): string | null {
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function selectedMetaId(row: MetaInsightRow, breakdown: MetaMarketingBreakdown): string | null {
  const value = breakdown === "campaign"
    ? row.campaign_id
    : breakdown === "adset"
      ? row.adset_id
      : row.ad_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectedRegistrationId(registration: MetaMarketingRegistration, breakdown: MetaMarketingBreakdown): string | null {
  const value = breakdown === "campaign"
    ? registration.metaCampaignId
    : breakdown === "adset"
      ? registration.metaAdsetId
      : registration.metaAdId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identity(rows: MetaInsightRow[], breakdown: MetaMarketingBreakdown) {
  return {
    campaignId: firstText(rows, "campaign_id"),
    campaignName: firstText(rows, "campaign_name"),
    adsetId: firstText(rows, "adset_id"),
    adsetName: firstText(rows, "adset_name"),
    adId: breakdown === "ad" ? firstText(rows, "ad_id") : null,
    adName: breakdown === "ad" ? firstText(rows, "ad_name") : null,
  };
}

function emptyMetrics(): MetaMarketingMetrics {
  return { spend: null, impressions: null, reach: null, clicks: null, ctr: null, cpc: null, cpm: null, frequency: null };
}

function combineMetrics(rows: MetaInsightRow[]): MetaMarketingMetrics {
  const spend = sumMetric(rows, "spend");
  const impressions = sumMetric(rows, "impressions");
  const clicks = sumMetric(rows, "clicks");
  const singleRow = rows.length === 1 ? rows[0] : null;
  return {
    spend,
    impressions,
    clicks,
    reach: singleRow ? metricValue(singleRow.reach) : null,
    ctr: impressions !== null && impressions > 0 && clicks !== null
      ? (clicks / impressions) * 100
      : singleRow ? metricValue(singleRow.ctr) : null,
    cpc: clicks !== null && clicks > 0 && spend !== null
      ? spend / clicks
      : singleRow ? metricValue(singleRow.cpc) : null,
    cpm: impressions !== null && impressions > 0 && spend !== null
      ? (spend / impressions) * 1000
      : singleRow ? metricValue(singleRow.cpm) : null,
    frequency: singleRow ? metricValue(singleRow.frequency) : null,
  };
}

function emptyCounts(): MetaMarketingCounts {
  return {
    totalRegistrations: 0,
    attributedRegistrations: 0,
    resolvedRegistrations: 0,
    unresolvedRegistrations: 0,
    paidRegistrations: 0,
    paidAttributedRegistrations: 0,
    unmatchedAttributedRegistrations: 0,
  };
}

function newRow(
  dimensions: ReturnType<typeof identity>,
  metrics: MetaMarketingMetrics,
  matchStatus: MetaMarketingRow["matchStatus"],
): MetaMarketingRow {
  return {
    ...dimensions,
    ...metrics,
    registrations: 0,
    attributedRegistrations: 0,
    paidRegistrations: 0,
    paidAttributedRegistrations: 0,
    unresolvedRegistrations: 0,
    matchStatus,
  };
}

function nameById(rows: MetaMarketingRow[], breakdown: MetaMarketingBreakdown, id: string | null, dimension: "campaign" | "adset"): string | null {
  if (!id) return null;
  const idKey = dimension === "campaign" ? "campaignId" : "adsetId";
  const nameKey = dimension === "campaign" ? "campaignName" : "adsetName";
  const found = rows.find((row) => row[idKey] === id && row[nameKey]);
  return found?.[nameKey] || null;
}

function unresolvedDimensions(registration: MetaMarketingRegistration, breakdown: MetaMarketingBreakdown, rows: MetaMarketingRow[]) {
  const campaignId = registration.metaCampaignId || null;
  const adsetId = breakdown === "ad" ? registration.metaAdsetId || null : null;
  return {
    campaignId,
    campaignName: nameById(rows, breakdown, campaignId, "campaign"),
    adsetId,
    adsetName: nameById(rows, breakdown, adsetId, "adset"),
    adId: null,
    adName: null,
  };
}

function registrationKey(registration: MetaMarketingRegistration, breakdown: MetaMarketingBreakdown): string | null {
  return selectedRegistrationId(registration, breakdown);
}

export function aggregateMetaMarketingRows(
  breakdown: MetaMarketingBreakdown,
  metaRows: MetaInsightRow[],
  registrations: MetaMarketingRegistration[],
) {
  const groupedInsights = new Map<string, MetaInsightRow[]>();
  let unmatchedMetaRows = 0;
  for (const metaRow of metaRows) {
    const id = selectedMetaId(metaRow, breakdown);
    if (!id) {
      unmatchedMetaRows += 1;
      continue;
    }
    const group = groupedInsights.get(id) || [];
    group.push(metaRow);
    groupedInsights.set(id, group);
  }

  const entityRows = new Map<string, MetaMarketingRow>();
  for (const [id, group] of groupedInsights) {
    const row = newRow(identity(group, breakdown), combineMetrics(group), "matched");
    entityRows.set(id, row);
  }

  const unmatchedRegistrationRows = new Map<string, MetaMarketingRow>();
  const unresolvedRegistrationRows = new Map<string, MetaMarketingRow>();
  for (const registration of registrations) {
    if (!isMetaAttributed(registration)) continue;
    const id = registrationKey(registration, breakdown);
    let target: MetaMarketingRow | undefined;
    if (!id) {
      const dimensions = unresolvedDimensions(registration, breakdown, [...entityRows.values()]);
      const key = JSON.stringify(dimensions);
      target = unresolvedRegistrationRows.get(key);
      if (!target) {
        target = newRow(dimensions, emptyMetrics(), "unresolved");
        unresolvedRegistrationRows.set(key, target);
      }
      target.unresolvedRegistrations += 1;
    } else {
      target = entityRows.get(id);
      if (!target) {
        target = unmatchedRegistrationRows.get(id);
        if (!target) {
          const dimensions = {
            campaignId: registration.metaCampaignId || null,
            campaignName: nameById([...entityRows.values()], breakdown, registration.metaCampaignId || null, "campaign"),
            adsetId: breakdown === "adset" || breakdown === "ad" ? registration.metaAdsetId || null : null,
            adsetName: nameById([...entityRows.values()], breakdown, registration.metaAdsetId || null, "adset"),
            adId: breakdown === "ad" ? registration.metaAdId || null : null,
            adName: null,
          };
          target = newRow(dimensions, emptyMetrics(), "unmatched");
          unmatchedRegistrationRows.set(id, target);
        }
      }
    }

    target.registrations += 1;
    target.attributedRegistrations += 1;
    if (registration.status === "PAID") {
      target.paidRegistrations += 1;
      target.paidAttributedRegistrations += 1;
    }
  }

  const rows = [
    ...entityRows.values(),
    ...unmatchedRegistrationRows.values(),
    ...unresolvedRegistrationRows.values(),
  ];
  unmatchedMetaRows += [...entityRows.values()].filter((row) => row.registrations === 0).length;
  return { rows, unmatchedMetaRows };
}

export function buildMetaMarketingDateWhere(query: MetaMarketingQuery): Prisma.WebinarRegistrationWhereInput {
  return {
    createdAt: {
      gte: new Date(`${query.since}T00:00:00.000Z`),
      lte: new Date(`${query.until}T23:59:59.999Z`),
    },
  };
}

export function isMetaMarketingPartial(
  insights: Pick<MetaInsightsResult, "status" | "pagination">,
  registrationLimitReached: boolean,
): boolean {
  const incompleteMeta = insights.status !== "ok" && insights.status !== "empty"
    || (insights.pagination.hasMore && !insights.pagination.complete)
    || insights.pagination.limitReached;
  return incompleteMeta || registrationLimitReached;
}

function andWhere(...clauses: Prisma.WebinarRegistrationWhereInput[]): Prisma.WebinarRegistrationWhereInput {
  return { AND: clauses };
}

function relevantIdField(breakdown: MetaMarketingBreakdown): "metaCampaignId" | "metaAdsetId" | "metaAdId" {
  if (breakdown === "campaign") return "metaCampaignId";
  if (breakdown === "adset") return "metaAdsetId";
  return "metaAdId";
}

function idsFromMetaRows(rows: MetaInsightRow[], breakdown: MetaMarketingBreakdown): string[] {
  return [...new Set(rows.map((row) => selectedMetaId(row, breakdown)).filter((id): id is string => id !== null))];
}

async function countMarketingSummary(
  prismaClient: PrismaClient,
  where: Prisma.WebinarRegistrationWhereInput,
  breakdown: MetaMarketingBreakdown,
  matchingIds: string[],
): Promise<Omit<MetaMarketingCounts, "totalRegistrations">> {
  const signalWhere = metaAttributionSignalWhere() as Prisma.WebinarRegistrationWhereInput;
  const idField = relevantIdField(breakdown);
  const unresolvedIdWhere = {
    OR: [{ [idField]: null }, { [idField]: "" }],
  } as Prisma.WebinarRegistrationWhereInput;
  const resolvedIdWhere = { [idField]: { in: matchingIds } } as Prisma.WebinarRegistrationWhereInput;
  const unmatchedIdWhere = {
    [idField]: { not: null, notIn: [...matchingIds, ""] },
  } as Prisma.WebinarRegistrationWhereInput;

  const [attributedRegistrations, unresolvedRegistrations, resolvedRegistrations, unmatchedAttributedRegistrations, paidRegistrations, paidAttributedRegistrations] = await Promise.all([
    prismaClient.webinarRegistration.count({ where: andWhere(where, signalWhere) }),
    prismaClient.webinarRegistration.count({ where: andWhere(where, signalWhere, unresolvedIdWhere) }),
    prismaClient.webinarRegistration.count({ where: andWhere(where, signalWhere, resolvedIdWhere) }),
    prismaClient.webinarRegistration.count({ where: andWhere(where, signalWhere, unmatchedIdWhere) }),
    prismaClient.webinarRegistration.count({ where: andWhere(where, { status: "PAID" }) }),
    prismaClient.webinarRegistration.count({ where: andWhere(where, signalWhere, { status: "PAID" }) }),
  ]);

  return {
    attributedRegistrations,
    resolvedRegistrations,
    unresolvedRegistrations,
    paidRegistrations,
    paidAttributedRegistrations,
    unmatchedAttributedRegistrations,
  };
}

export async function getMetaMarketingAnalytics(input: unknown): Promise<MetaMarketingAnalytics> {
  const query = parseMetaMarketingQuery(input);
  const { prisma } = await import("../lib/prisma");
  const insights = await getMetaInsights({
    since: query.since,
    until: query.until,
    breakdown: query.breakdown,
    granularity: "summary",
  });
  const where = buildMetaMarketingDateWhere(query);
  const metaRows = insights.rows;
  const matchingIds = idsFromMetaRows(metaRows, query.breakdown);

  let totalRegistrations: number;
  let counts: Omit<MetaMarketingCounts, "totalRegistrations">;
  let registrationBatch: MetaMarketingRegistration[];
  try {
    [totalRegistrations, counts, registrationBatch] = await Promise.all([
      prisma.webinarRegistration.count({ where }),
      countMarketingSummary(prisma, where, query.breakdown, matchingIds),
      prisma.webinarRegistration.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_REGISTRATION_ROWS + 1,
        select: {
          id: true,
          createdAt: true,
          status: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          utmContent: true,
          utmTerm: true,
          fbclid: true,
          fbp: true,
          fbc: true,
          metaCampaignId: true,
          metaAdsetId: true,
          metaAdId: true,
        },
      }),
    ]);
  } catch {
    throw new MetaMarketingAnalyticsDatabaseError();
  }

  const registrationRows = registrationBatch.slice(0, MAX_REGISTRATION_ROWS);
  const registrationLimitReached = registrationBatch.length > MAX_REGISTRATION_ROWS;
  const grouped = aggregateMetaMarketingRows(query.breakdown, metaRows, registrationRows);
  const partial = isMetaMarketingPartial(insights, registrationLimitReached);

  return {
    breakdown: query.breakdown,
    metaDateRange: { since: query.since, until: query.until },
    registrationDateRange: { since: query.since, until: query.until },
    partial,
    metaStatus: {
      status: insights.status,
      category: insights.category,
      statusCode: insights.statusCode,
    },
    rows: grouped.rows,
    summary: {
      metaRows: metaRows.length,
      totalRegistrations,
      ...counts,
      unmatchedMetaRows: grouped.unmatchedMetaRows,
    },
    pagination: {
      meta: insights.pagination,
      registrations: {
        maxRows: MAX_REGISTRATION_ROWS,
        rowsFetched: registrationRows.length,
        totalRows: totalRegistrations,
        complete: !registrationLimitReached,
        hasMore: registrationLimitReached,
        limitReached: registrationLimitReached,
      },
    },
  };
}