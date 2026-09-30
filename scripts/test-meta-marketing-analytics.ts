import assert from "node:assert/strict";
import type { MetaInsightRow, MetaInsightsResult } from "../src/services/metaInsightsService";
import {
  aggregateMetaMarketingRows,
  buildMetaMarketingDateWhere,
  isMetaMarketingPartial,
  parseMetaMarketingQuery,
  type MetaMarketingRegistration,
} from "../src/services/metaMarketingAnalyticsService";

const BASE_DATE_RANGE = { since: "2026-09-01", until: "2026-09-30" };
const registrationBase: Omit<MetaMarketingRegistration, "id" | "createdAt" | "status"> = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
  fbclid: null,
  fbp: null,
  fbc: null,
  metaCampaignId: null,
  metaAdsetId: null,
  metaAdId: null,
};

function registration(id: string, values: Partial<MetaMarketingRegistration> = {}): MetaMarketingRegistration {
  return {
    ...registrationBase,
    id,
    createdAt: new Date("2026-09-15T12:00:00.000Z"),
    status: "REGISTERED",
    ...values,
  };
}

function insight(values: Partial<MetaInsightRow> = {}): MetaInsightRow {
  return {
    date_start: "2026-09-01",
    date_stop: "2026-09-30",
    campaign_id: "campaign-1",
    campaign_name: "Campaign One",
    adset_id: "adset-1",
    adset_name: "Ad Set One",
    ad_id: "ad-1",
    ad_name: "Ad One",
    spend: 100,
    impressions: 1000,
    reach: 800,
    clicks: 50,
    ctr: 5,
    cpc: 2,
    cpm: 100,
    frequency: 1.25,
    actions: [],
    ...values,
  };
}

function metaResult(
  rows: MetaInsightRow[],
  options: Partial<MetaInsightsResult> = {},
): MetaInsightsResult {
  return {
    adAccountId: "act-test",
    breakdown: "campaign",
    dateRange: { ...BASE_DATE_RANGE, granularity: "summary" },
    status: "ok",
    category: "ok",
    statusCode: 200,
    error: null,
    rows,
    pagination: { pagesFetched: 1, complete: true, hasMore: false, limitReached: false },
    ...options,
  };
}

function run(name: string, test: () => void): void {
  test();
  console.log(`PASS ${name}`);
}

run("campaign spend and matching registration", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("r1", { metaCampaignId: "campaign-1", status: "PAID", fbclid: "click-1" }),
  ]);
  assert.equal(result.rows[0].campaignId, "campaign-1");
  assert.equal(result.rows[0].spend, 100);
  assert.equal(result.rows[0].registrations, 1);
  assert.equal(result.rows[0].paidAttributedRegistrations, 1);
});

run("campaign with spend and zero registrations remains visible", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].spend, 100);
  assert.equal(result.rows[0].registrations, 0);
  assert.equal(result.unmatchedMetaRows, 1);
});

run("registration matches by exact campaign ID, not name", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight({ campaign_name: "Renamed campaign" })], [
    registration("r1", { metaCampaignId: "campaign-1", utmCampaign: "old name" }),
  ]);
  assert.equal(result.rows[0].registrations, 1);
  assert.equal(result.rows[0].campaignName, "Renamed campaign");
});

run("unmatched campaign ID is represented without Meta metrics", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("r1", { metaCampaignId: "campaign-not-in-insights", status: "PAID" }),
  ]);
  const unmatched = result.rows.find((row) => row.matchStatus === "unmatched");
  assert.ok(unmatched);
  assert.equal(unmatched.campaignId, "campaign-not-in-insights");
  assert.equal(unmatched.spend, null);
  assert.equal(unmatched.registrations, 1);
});

run("UTM campaign text does not match or fabricate an ID", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight({ campaign_name: "Campaign One" })], [
    registration("r1", { utmCampaign: "Campaign One" }),
  ]);
  assert.equal(result.rows.find((row) => row.matchStatus === "matched")?.registrations, 0);
  assert.equal(result.rows.find((row) => row.matchStatus === "unresolved")?.unresolvedRegistrations, 1);
  assert.equal(result.rows.some((row) => row.campaignId === "Campaign One"), false);
});

run("paid attributed registration preserves paid state", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("r1", { metaCampaignId: "campaign-1", status: "PAID", fbc: "click-cookie" }),
  ]);
  assert.equal(result.rows[0].paidRegistrations, 1);
  assert.equal(result.rows[0].paidAttributedRegistrations, 1);
});

run("paid unresolved and unpaid attributed registrations are distinct", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("paid-unresolved", { status: "PAID", utmSource: "meta" }),
    registration("unpaid-attributed", { status: "REGISTERED", metaCampaignId: "campaign-1", fbp: "browser" }),
  ]);
  const unresolved = result.rows.find((row) => row.matchStatus === "unresolved");
  const matched = result.rows.find((row) => row.matchStatus === "matched");
  assert.equal(unresolved?.paidRegistrations, 1);
  assert.equal(unresolved?.unresolvedRegistrations, 1);
  assert.equal(matched?.registrations, 1);
  assert.equal(matched?.paidRegistrations, 0);
  assert.equal(matched?.paidAttributedRegistrations, 0);
});

run("campaign response counts a hierarchy registration once", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("r1", { metaCampaignId: "campaign-1", metaAdsetId: "adset-1", metaAdId: "ad-1" }),
  ]);
  assert.equal(result.rows.filter((row) => row.registrations > 0).length, 1);
  assert.equal(result.rows[0].registrations, 1);
});

run("adset breakdown joins on adset ID only", () => {
  const result = aggregateMetaMarketingRows("adset", [insight()], [
    registration("r1", { metaCampaignId: "different-campaign", metaAdsetId: "adset-1" }),
  ]);
  assert.equal(result.rows[0].adsetId, "adset-1");
  assert.equal(result.rows[0].registrations, 1);
});

run("ad breakdown joins on ad ID only", () => {
  const result = aggregateMetaMarketingRows("ad", [insight()], [
    registration("r1", { metaAdId: "ad-1" }),
  ]);
  assert.equal(result.rows[0].adId, "ad-1");
  assert.equal(result.rows[0].registrations, 1);
});

run("date range validates and uses registration date bounds", () => {
  const query = parseMetaMarketingQuery({ ...BASE_DATE_RANGE, breakdown: "campaign" });
  const where = buildMetaMarketingDateWhere(query);
  const createdAt = where.createdAt as { gte: Date; lte: Date };
  assert.equal(createdAt.gte.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(createdAt.lte.toISOString(), "2026-09-30T23:59:59.999Z");
});

run("invalid dates and breakdown are rejected", () => {
  assert.throws(() => parseMetaMarketingQuery({ since: "2026-02-30", until: "2026-03-01" }));
  assert.throws(() => parseMetaMarketingQuery({ since: "2026-09-02", until: "2026-09-01" }));
  assert.throws(() => parseMetaMarketingQuery({ ...BASE_DATE_RANGE, breakdown: "campaign_name" }));
});

run("partial Meta results are not reported as complete", () => {
  const partial = metaResult([insight()], {
    status: "partial",
    pagination: { pagesFetched: 5, complete: false, hasMore: true, limitReached: true },
  });
  assert.equal(isMetaMarketingPartial(partial, false), true);
});

run("missing Meta configuration and permission failures mark output partial", () => {
  const missing = metaResult([], { status: "not_configured", category: "missing_credentials", statusCode: null });
  const denied = metaResult([], { status: "permission_denied", category: "forbidden", statusCode: 403 });
  assert.equal(isMetaMarketingPartial(missing, false), true);
  assert.equal(isMetaMarketingPartial(denied, false), true);
});

run("rate limit, timeout, and network failures are incomplete", () => {
  for (const category of ["rate_limited", "timeout", "network_error"] as const) {
    const failed = metaResult([], { status: "error", category, statusCode: null });
    assert.equal(isMetaMarketingPartial(failed, false), true);
  }
});

run("spend/clicks/impressions aggregate while reach and frequency are not averaged", () => {
  const result = aggregateMetaMarketingRows("campaign", [
    insight({ spend: 10, impressions: 100, clicks: 5, reach: 80, frequency: 1.2 }),
    insight({ spend: 20, impressions: 300, clicks: 15, reach: 210, frequency: 1.4 }),
  ], []);
  assert.equal(result.rows[0].spend, 30);
  assert.equal(result.rows[0].impressions, 400);
  assert.equal(result.rows[0].clicks, 20);
  assert.equal(result.rows[0].ctr, 5);
  assert.equal(result.rows[0].cpc, 1.5);
  assert.equal(result.rows[0].cpm, 75);
  assert.equal(result.rows[0].reach, null);
  assert.equal(result.rows[0].frequency, null);
});

run("output contains no revenue or secret/customer fields", () => {
  const result = aggregateMetaMarketingRows("campaign", [insight()], [
    registration("r1", { metaCampaignId: "campaign-1", status: "PAID", fbclid: "fixture-click" }),
  ]);
  const serialized = JSON.stringify(result);
  for (const key of ["revenue", "ROAS", "ROI", "CAC", "CPL", "email", "phone", "razorpaySignature", "access_token", "META_APP_SECRET"]) {
    assert.equal(serialized.includes(key), false);
  }
  assert.equal(serialized.includes("fixture-click"), false);
});

run("database retrieval limit contributes to partial status", () => {
  assert.equal(isMetaMarketingPartial(metaResult([]), true), true);
  assert.equal(isMetaMarketingPartial(metaResult([]), false), false);
});