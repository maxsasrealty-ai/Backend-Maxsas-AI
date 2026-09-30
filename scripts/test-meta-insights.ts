import assert from "node:assert/strict";
import type { Request } from "express";
import { config } from "../src/lib/config";
import { requireAdminAccess } from "../src/middleware/requireAdminAccess";
import {
  getMetaInsights,
  META_INSIGHTS_MAX_PAGES,
  MetaInsightsQueryError,
  parseMetaInsightsQuery,
} from "../src/services/metaInsightsService";

type MockReply = { status?: number; body: unknown } | Error;
type RequestRecord = { url: URL; method: string };

const originalFetch = globalThis.fetch;
const originalAccessToken = config.META_ACCESS_TOKEN;
const originalAdAccountId = config.META_AD_ACCOUNT_ID;
const originalAdminKey = process.env.ADMIN_API_KEY;
const originalAppEnv = process.env.APP_ENV;
let requests: RequestRecord[] = [];

function setMetaConfig(accessToken?: string, adAccountId?: string): void {
  config.META_ACCESS_TOKEN = accessToken;
  config.META_AD_ACCOUNT_ID = adAccountId;
}

function mockGraph(handler: (url: URL) => MockReply): void {
  requests = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    requests.push({ url, method: init?.method || "GET" });
    const reply = handler(url);
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status || 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const validQuery = {
  since: "2026-09-01",
  until: "2026-09-07",
  breakdown: "campaign",
  granularity: "daily",
};

function successReply(body: unknown): MockReply {
  return { body };
}

function assertOnlyGetRequests(): void {
  assert.ok(requests.every((request) => request.method.toUpperCase() === "GET"));
}

async function run(name: string, test: () => Promise<void> | void): Promise<void> {
  await test();
  console.log(`PASS ${name}`);
}

function adminAuthCheck(): void {
  process.env.APP_ENV = "development";
  process.env.ADMIN_API_KEY = "phase10-test-admin-key";
  const invoke = (headers: Record<string, string>) => {
    let statusCode = 0;
    let nextCalled = false;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json() { return this; },
    } as unknown as Parameters<typeof requireAdminAccess>[1];
    requireAdminAccess(
      { headers, query: {} } as unknown as Request,
      response,
      () => { nextCalled = true; },
    );
    return { statusCode, nextCalled };
  };
  assert.deepEqual(invoke({}), { statusCode: 403, nextCalled: false });
  assert.deepEqual(invoke({ "x-admin-key": "phase10-test-admin-key" }), { statusCode: 0, nextCalled: true });
}

async function main(): Promise<void> {
  try {
    await run("missing credentials avoids Graph calls", async () => {
      setMetaConfig(undefined, "123");
      mockGraph(() => { throw new Error("Unexpected Graph request"); });
      const result = await getMetaInsights(validQuery);
      assert.equal(requests.length, 0);
      assert.equal(result.category, "missing_credentials");
      assert.equal(result.status, "not_configured");
    });

    await run("missing Ad Account avoids Graph calls", async () => {
      setMetaConfig("phase10-test-token", undefined);
      mockGraph(() => { throw new Error("Unexpected Graph request"); });
      const result = await getMetaInsights(validQuery);
      assert.equal(requests.length, 0);
      assert.equal(result.category, "incomplete_configuration");
    });

    await run("date and query parameters are strictly validated", () => {
      assert.throws(() => parseMetaInsightsQuery({ ...validQuery, since: "2026-02-30" }), MetaInsightsQueryError);
      assert.throws(() => parseMetaInsightsQuery({ ...validQuery, until: "09/07/2026" }), MetaInsightsQueryError);
      assert.throws(() => parseMetaInsightsQuery({ ...validQuery, since: "2026-09-08" }), MetaInsightsQueryError);
      assert.throws(() => parseMetaInsightsQuery({ ...validQuery, fields: "spend" }), MetaInsightsQueryError);
      assert.throws(() => parseMetaInsightsQuery({ ...validQuery, breakdown: "campaign,ad" }), MetaInsightsQueryError);
    });

    await run("admin authentication protects the endpoint convention", () => adminAuthCheck());

    await run("empty results and safe normalized metrics are handled", async () => {
      setMetaConfig("phase10-test-token", "act_123");
      mockGraph((url) => {
        assert.equal(url.pathname.endsWith("/v19.0/act_123/insights"), true);
        assert.equal(url.searchParams.get("level"), "campaign");
        assert.equal(url.searchParams.get("time_increment"), "1");
        assert.deepEqual(JSON.parse(url.searchParams.get("time_range") || "{}"), { since: validQuery.since, until: validQuery.until });
        return successReply({ data: [] });
      });
      const result = await getMetaInsights(validQuery);
      assert.equal(result.status, "empty");
      assert.equal(result.pagination.complete, true);
      assert.equal(result.rows.length, 0);
      assert.equal(requests.length, 1);
      assertOnlyGetRequests();
    });

    await run("summary and breakdowns use only allowlisted Graph parameters", async () => {
      setMetaConfig("phase10-test-token", "123");
      mockGraph((url) => {
        assert.equal(url.searchParams.get("level"), "adset");
        assert.equal(url.searchParams.has("time_increment"), false);
        assert.match(url.searchParams.get("fields") || "", /campaign_id,campaign_name,adset_id,adset_name/);
        return successReply({ data: [{ date_start: validQuery.since, spend: "1.25", impressions: "10", actions: [{ action_type: "link_click", value: "3" }, { action_type: "lead", value: "1" }] }] });
      });
      const result = await getMetaInsights({ ...validQuery, breakdown: "adset", granularity: "summary" });
      assert.equal(result.status, "ok");
      assert.equal(result.rows[0].spend, 1.25);
      assert.equal(result.rows[0].impressions, 10);
      assert.deepEqual(result.rows[0].actions, [{ action_type: "link_click", value: 3 }, { action_type: "lead", value: 1 }]);
      assert.equal(JSON.stringify(result).includes("phase10-test-token"), false);
      assertOnlyGetRequests();
    });

    await run("pagination is bounded and strips access tokens", async () => {
      setMetaConfig("phase10-test-token", "123");
      mockGraph((url) => {
        const after = Number(url.searchParams.get("after") || "0");
        return successReply({
          data: [{ campaign_id: `campaign-${after + 1}`, spend: String(after + 1) }],
          paging: { next: `https://graph.facebook.com/v19.0/act_123/insights?after=${after + 1}&access_token=other-secret` },
        });
      });
      const result = await getMetaInsights(validQuery);
      assert.equal(result.rows.length, META_INSIGHTS_MAX_PAGES);
      assert.equal(result.pagination.pagesFetched, META_INSIGHTS_MAX_PAGES);
      assert.equal(result.pagination.complete, false);
      assert.equal(result.pagination.hasMore, true);
      assert.equal(result.pagination.limitReached, true);
      assert.equal(JSON.stringify(result).includes("other-secret"), false);
      assert.ok(requests.every((request) => request.url.searchParams.get("access_token") === "phase10-test-token"));
      assertOnlyGetRequests();
    });

    await run("pagination completion clears hasMore", async () => {
      setMetaConfig("phase10-test-token", "123");
      mockGraph((url) => url.searchParams.has("after")
        ? successReply({ data: [{ campaign_id: "campaign-2" }] })
        : successReply({
          data: [{ campaign_id: "campaign-1" }],
          paging: { next: "https://graph.facebook.com/v19.0/act_123/insights?after=next" },
        }));
      const result = await getMetaInsights(validQuery);
      assert.equal(result.pagination.pagesFetched, 2);
      assert.equal(result.pagination.complete, true);
      assert.equal(result.pagination.hasMore, false);
      assert.equal(result.pagination.limitReached, false);
      assert.equal(result.status, "ok");
      assertOnlyGetRequests();
    });

    await run("later-page failure preserves partial rows without raw error", async () => {
      setMetaConfig("phase10-test-token", "123");
      mockGraph((url) => {
        if (url.searchParams.has("after")) {
          return { status: 403, body: { error: { code: 200, message: "secret raw Graph failure" } } };
        }
        return successReply({
          data: [{ campaign_id: "campaign-kept", spend: "9.99" }],
          paging: { next: "https://graph.facebook.com/v19.0/act_123/insights?after=next&access_token=secret-token" },
        });
      });
      const result = await getMetaInsights(validQuery);
      assert.equal(result.status, "partial");
      assert.equal(result.category, "forbidden");
      assert.equal(result.rows[0].campaign_id, "campaign-kept");
      assert.equal(result.pagination.complete, false);
      assert.equal(JSON.stringify(result).includes("secret raw Graph failure"), false);
      assert.equal(JSON.stringify(result).includes("secret-token"), false);
      assertOnlyGetRequests();
    });

    await run("Meta invalid-token and rate-limit categories are mapped", async () => {
      setMetaConfig("phase10-test-token", "123");
      mockGraph(() => ({ status: 400, body: { error: { code: 190, message: "raw token error" } } }));
      const invalidToken = await getMetaInsights(validQuery);
      assert.equal(invalidToken.category, "invalid_token");
      assert.equal(invalidToken.status, "permission_denied");

      mockGraph(() => ({ status: 400, body: { error: { code: 17, message: "raw throttle error" } } }));
      const rateLimit = await getMetaInsights(validQuery);
      assert.equal(rateLimit.category, "rate_limited");
      assert.equal(rateLimit.status, "error");
      assert.equal(JSON.stringify(rateLimit).includes("raw throttle error"), false);
      assertOnlyGetRequests();
    });
  } finally {
    globalThis.fetch = originalFetch;
    setMetaConfig(originalAccessToken, originalAdAccountId);
    if (originalAdminKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = originalAdminKey;
    if (originalAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalAppEnv;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Meta Insights tests failed");
  process.exitCode = 1;
});