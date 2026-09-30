import assert from "node:assert/strict";
import {
  buildMetaAttributionPagination,
  buildMetaAttributionSummary,
  buildMetaAttributionWhere,
  isMetaAttributed,
  isMetaAttributionUnresolved,
  isPaidRegistration,
  META_ATTRIBUTION_MAX_PAGE_SIZE,
  metaAttributionUnresolvedWhere,
  parseMetaAttributionQuery,
  resolveMetaAttribution,
  toMetaAttributionRow,
  MetaAttributionQueryError,
} from "../src/services/metaAttributionService";

const base = {
  status: "REGISTERED",
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

function run(name: string, test: () => void): void {
  test();
  console.log(`PASS ${name}`);
}

run("no Meta-related attribution", () => {
  const result = resolveMetaAttribution({ ...base, gclid: "google-click" });
  assert.equal(result.attributed, false);
  assert.equal(result.resolution, "none");
});

run("UTM-only attribution remains unresolved", () => {
  const result = resolveMetaAttribution({ ...base, utmCampaign: "spring-campaign" });
  assert.equal(result.attributed, true);
  assert.equal(result.resolution, "unresolved");
  assert.equal(result.metaCampaignId, null);
});

run("fbclid-only attribution remains unresolved", () => {
  assert.equal(resolveMetaAttribution({ ...base, fbclid: "click-id" }).resolution, "unresolved");
});

run("fbp and fbc attribution remains unresolved", () => {
  const result = resolveMetaAttribution({ ...base, fbp: "browser-id", fbc: "click-cookie" });
  assert.equal(result.attributed, true);
  assert.equal(result.resolution, "unresolved");
});

run("explicit campaign ID resolves the campaign", () => {
  const result = resolveMetaAttribution({ ...base, metaCampaignId: "campaign-1" });
  assert.equal(result.resolution, "campaign_resolved");
});

run("campaign and ad set IDs resolve through ad set", () => {
  const result = resolveMetaAttribution({ ...base, metaCampaignId: "campaign-1", metaAdsetId: "adset-1" });
  assert.equal(result.resolution, "campaign_adset_resolved");
});

run("campaign, ad set, and ad IDs resolve through ad", () => {
  const result = resolveMetaAttribution({ ...base, metaCampaignId: "campaign-1", metaAdsetId: "adset-1", metaAdId: "ad-1" });
  assert.equal(result.resolution, "campaign_adset_ad_resolved");
});

run("paid and attributed registration is counted without revenue", () => {
  const registration = { ...base, status: "PAID", fbc: "click-cookie" };
  const result = resolveMetaAttribution(registration);
  assert.equal(result.attributed, true);
  assert.equal(isPaidRegistration(registration), true);
  assert.equal(isMetaAttributionUnresolved(registration), true);
  assert.deepEqual(buildMetaAttributionSummary({
    totalRegistrations: 1,
    attributedRegistrations: 1,
    unresolvedAttributions: 1,
    paidRegistrations: 1,
    paidAttributedRegistrations: 1,
  }), {
    totalRegistrations: 1,
    attributedRegistrations: 1,
    unresolvedAttributions: 1,
    paidRegistrations: 1,
    paidAttributedRegistrations: 1,
  });
});

run("paid unresolved and unpaid attributed remain distinct", () => {
  const paidUnresolved = { ...base, status: "PAID", utmSource: "meta" };
  const unpaidAttributed = { ...base, status: "REGISTERED", fbclid: "click-id" };
  assert.equal(resolveMetaAttribution(paidUnresolved).resolution, "unresolved");
  assert.equal(isMetaAttributionUnresolved(paidUnresolved), true);
  assert.equal(isPaidRegistration(paidUnresolved), true);
  assert.equal(isMetaAttributed(unpaidAttributed), true);
  assert.equal(isPaidRegistration(unpaidAttributed), false);
});

run("date filters are inclusive and identifiers are exact", () => {
  const query = parseMetaAttributionQuery({
    since: "2026-09-01",
    until: "2026-09-30",
    campaign_id: " campaign-1 ",
    adset_id: "adset-1",
  });
  const where = buildMetaAttributionWhere(query) as { AND: Array<Record<string, unknown>> };
  const dateClause = where.AND[0].createdAt as { gte: Date; lte: Date };
  assert.equal(dateClause.gte.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(dateClause.lte.toISOString(), "2026-09-30T23:59:59.999Z");
  assert.equal(query.campaignId, "campaign-1");
});

run("invalid dates and reversed ranges are rejected", () => {
  assert.throws(() => parseMetaAttributionQuery({ since: "2026-02-30" }), MetaAttributionQueryError);
  assert.throws(() => parseMetaAttributionQuery({ since: "2026-09-02", until: "2026-09-01" }), MetaAttributionQueryError);
});

run("safe row serialization excludes payment and credential fields", () => {
  const sensitiveFixture = {
    ...base,
    id: "registration-1",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    status: "PAID",
    utmSource: "meta",
    fbclid: "private-click-id",
    fbp: "private-browser-id",
    razorpaySignature: "private-payment-signature",
    access_token: "private-token",
  } as unknown as Parameters<typeof toMetaAttributionRow>[0];
  const row = toMetaAttributionRow(sensitiveFixture);
  const serialized = JSON.stringify(row);
  assert.equal(row.fbclidPresent, true);
  assert.equal(row.fbpPresent, true);
  assert.equal("razorpaySignature" in row, false);
  assert.equal(serialized.includes("private-click-id"), false);
  assert.equal(serialized.includes("private-browser-id"), false);
  assert.equal(serialized.includes("private-payment-signature"), false);
  assert.equal(serialized.includes("private-token"), false);
});

run("pagination is bounded and reports continuation", () => {
  const query = parseMetaAttributionQuery({ page: "2", limit: "200" });
  assert.equal(query.skip, 200);
  assert.equal(query.limit, META_ATTRIBUTION_MAX_PAGE_SIZE);
  assert.deepEqual(buildMetaAttributionPagination(2, 200, 450), {
    page: 2,
    pageSize: 200,
    totalRows: 450,
    hasMore: true,
    nextPage: 3,
  });
  assert.throws(() => parseMetaAttributionQuery({ limit: "201" }), MetaAttributionQueryError);
  assert.throws(() => parseMetaAttributionQuery({ page: "10001" }), MetaAttributionQueryError);
  assert.ok(metaAttributionUnresolvedWhere());
});