import assert from "node:assert/strict";
import type { Request } from "express";
import { config } from "../src/lib/config";
import { requireAdminAccess } from "../src/middleware/requireAdminAccess";
import { discoverMetaAds, META_ADS_MAX_PAGES } from "../src/services/metaAdsDiscoveryService";

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

function emptyGraphReply(): MockReply {
  return { body: { data: [] } };
}

function assertOnlyReadRequests(): void {
  assert.ok(requests.every((request) => request.method.toUpperCase() === "GET"));
}

async function run(name: string, test: () => Promise<void> | void): Promise<void> {
  await test();
  console.log(`PASS ${name}`);
}

function runAdminAuthCheck(): void {
  process.env.APP_ENV = "development";
  process.env.ADMIN_API_KEY = "phase8-test-admin-key";
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
  assert.deepEqual(invoke({ "x-admin-key": "phase8-test-admin-key" }), { statusCode: 0, nextCalled: true });
}

async function main(): Promise<void> {
  try {
    await run("missing Meta credentials makes no Graph calls", async () => {
      setMetaConfig(undefined, "123");
      mockGraph(() => { throw new Error("Unexpected Graph request"); });
      const result = await discoverMetaAds();
      assert.equal(requests.length, 0);
      assert.equal(result.campaigns.category, "missing_credentials");
      assert.equal(result.adsets.status, "not_configured");
    });

    await run("missing Ad Account makes no Graph calls", async () => {
      setMetaConfig("phase8-test-token", undefined);
      mockGraph(() => { throw new Error("Unexpected Graph request"); });
      const result = await discoverMetaAds();
      assert.equal(requests.length, 0);
      assert.equal(result.ads.category, "incomplete_configuration");
    });

    await run("admin authentication protects access", () => runAdminAuthCheck());

    await run("empty collections are reported explicitly", async () => {
      setMetaConfig("phase8-test-token", "act_123");
      mockGraph(() => emptyGraphReply());
      const result = await discoverMetaAds();
      assert.equal(requests.length, 3);
      assert.equal(result.campaigns.status, "empty");
      assert.equal(result.adsets.status, "empty");
      assert.equal(result.ads.pagination.complete, true);
      assertOnlyReadRequests();
    });

    await run("pagination follows safe next links and normalizes fields", async () => {
      setMetaConfig("phase8-test-token", "123");
      mockGraph((url) => {
        if (url.pathname.endsWith("/campaigns")) {
          if (url.searchParams.get("after") === "cursor-2") {
            return { body: { data: [{ id: "campaign-2", name: "Second" }] } };
          }
          return {
            body: {
              data: [{ id: "campaign-1", objective: "OUTCOME_SALES" }],
              paging: {
                next: "https://graph.facebook.com/v19.0/act_123/campaigns?access_token=foreign-secret&after=cursor-2&limit=100&fields=id%2Cname",
              },
            },
          };
        }
        if (url.pathname.endsWith("/adsets")) {
          return { body: { data: [{ id: "adset-1", daily_budget: 2500, campaign_id: "campaign-1" }] } };
        }
        return { body: { data: [{ id: "ad-1", adset_id: "adset-1" }] } };
      });

      const result = await discoverMetaAds();
      assert.equal(result.adAccountId, "act_123");
      assert.deepEqual(result.campaigns.items.map((item) => item.id), ["campaign-1", "campaign-2"]);
      assert.equal(result.campaigns.items[0].objective, "OUTCOME_SALES");
      assert.equal(result.campaigns.items[0].buying_type, null);
      assert.equal(result.adsets.items[0].daily_budget, "2500");
      assert.equal(result.ads.items[0].campaign_id, null);
      assert.equal(result.campaigns.pagination.complete, true);
      assert.equal(requests.find((request) => request.url.searchParams.has("after"))?.url.searchParams.get("access_token"), "phase8-test-token");
      assert.equal(JSON.stringify(result).includes("phase8-test-token"), false);
      assert.equal(JSON.stringify(result).includes("foreign-secret"), false);
      assertOnlyReadRequests();
    });

    await run("pagination limit exposes incomplete collections", async () => {
      setMetaConfig("phase8-test-token", "123");
      mockGraph((url) => {
        if (!url.pathname.endsWith("/campaigns")) return emptyGraphReply();
        const cursor = Number(url.searchParams.get("after") || "0");
        return {
          body: {
            data: [{ id: `campaign-${cursor + 1}` }],
            paging: {
              next: `https://graph.facebook.com/v19.0/act_123/campaigns?after=${cursor + 1}&limit=100`,
            },
          },
        };
      });

      const result = await discoverMetaAds();
      assert.equal(result.campaigns.pagination.pagesFetched, META_ADS_MAX_PAGES);
      assert.equal(result.campaigns.pagination.complete, false);
      assert.equal(result.campaigns.pagination.hasMore, true);
      assert.equal(result.campaigns.pagination.limitReached, true);
      assert.equal(result.campaigns.status, "partial");
      assert.equal(requests.filter((request) => request.url.pathname.endsWith("/campaigns")).length, META_ADS_MAX_PAGES);
      assertOnlyReadRequests();
    });

    await run("permission, rate-limit, and network errors remain isolated", async () => {
      setMetaConfig("phase8-test-token", "123");
      mockGraph((url) => {
        if (url.pathname.endsWith("/campaigns")) {
          if (url.searchParams.has("after")) {
            return { status: 400, body: { error: { code: 200, message: "foreign-secret" } } };
          }
          return {
            body: {
              data: [{ id: "campaign-kept" }],
              paging: { next: "https://graph.facebook.com/v19.0/act_123/campaigns?after=next" },
            },
          };
        }
        if (url.pathname.endsWith("/adsets")) {
          return { status: 400, body: { error: { code: 17, message: "private rate limit details" } } };
        }
        throw new Error("private network details");
      });

      const result = await discoverMetaAds();
      assert.equal(result.campaigns.status, "partial");
      assert.deepEqual(result.campaigns.items.map((item) => item.id), ["campaign-kept"]);
      assert.equal(result.campaigns.category, "forbidden");
      assert.equal(result.adsets.category, "rate_limited");
      assert.equal(result.ads.category, "network_error");
      assert.equal(JSON.stringify(result).includes("private"), false);
      assert.equal(JSON.stringify(result).includes("foreign-secret"), false);
      assertOnlyReadRequests();
    });

    await run("invalid tokens and unsafe pagination links are rejected", async () => {
      setMetaConfig("phase8-test-token", "123");
      mockGraph((url) => {
        if (url.pathname.endsWith("/campaigns")) {
          return { status: 400, body: { error: { code: 190, message: "expired" } } };
        }
        if (url.pathname.endsWith("/adsets")) {
          return {
            body: {
              data: [{ id: "adset-kept" }],
              paging: { next: "https://example.invalid/steal?access_token=secret" },
            },
          };
        }
        return emptyGraphReply();
      });

      const result = await discoverMetaAds();
      assert.equal(result.campaigns.status, "permission_denied");
      assert.equal(result.campaigns.category, "invalid_token");
      assert.equal(result.adsets.status, "partial");
      assert.equal(result.adsets.category, "invalid_request");
      assert.equal(result.adsets.pagination.hasMore, true);
      assert.equal(requests.filter((request) => request.url.hostname === "example.invalid").length, 0);
      assertOnlyReadRequests();
    });

    await run("timeouts stay isolated to their collection", async () => {
      setMetaConfig("phase8-test-token", "123");
      mockGraph((url) => {
        if (!url.pathname.endsWith("/ads")) return emptyGraphReply();
        const timeout = new Error("private timeout details");
        timeout.name = "AbortError";
        throw timeout;
      });

      const result = await discoverMetaAds();
      assert.equal(result.ads.category, "timeout");
      assert.equal(result.ads.status, "error");
      assert.equal(result.campaigns.status, "empty");
      assert.equal(JSON.stringify(result).includes("private timeout details"), false);
      assertOnlyReadRequests();
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
  console.error(error instanceof Error ? error.message : "Meta Ads discovery tests failed");
  process.exitCode = 1;
});