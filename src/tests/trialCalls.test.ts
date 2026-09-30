import assert from "node:assert/strict";
import { test } from "node:test";

import { createTrialCallSchema, toPublicTrialCall, triggerTrialCallRequestSchema } from "../routes/trialCalls";
import { createTrialCall, processTrialCallWebhook, receiveTrialCallWebhook, triggerTrialCall } from "../services/trialCallService";
import {
  NormalizedVoiceWebhook,
  RinggVoiceCallProvider,
  RinggVoiceProviderConfig,
  VoiceCallProvider,
} from "../services/voiceCallProvider";

const now = new Date("2026-09-30T12:00:00.000Z");

function createFakeDatabase() {
  const calls = new Map<string, any>();
  const events = new Map<string, any>();
  const registrations = new Map([[
    "registration-1",
    { name: "Trial Customer", phone: "+14155550123" },
  ]]);
  const db = {
    trialCall: {
      async create({ data }: { data: Record<string, unknown> }) {
        const call = {
          id: "trial-1", tenantId: null, userId: null, webinarRegistrationId: null,
          customerName: null, providerCallId: null, agentId: null, status: "QUEUED",
          subStatus: null, callDirection: "OUTBOUND", durationSeconds: null, recordingUrl: null,
          transcript: null, outcome: null, outcomeData: null, initiatedAt: null, startedAt: null,
          completedAt: null, failedAt: null, failureReason: null, lastWebhookAt: null,
          createdAt: now, updatedAt: now, ...data,
        };
        calls.set(call.id, call);
        return call;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const call = calls.get(where.id);
        if (!call) throw new Error("call missing");
        Object.assign(call, data);
        return call;
      },
      async updateMany({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) {
        const call = calls.get(where.id);
        if (!call || call.status !== where.status) return { count: 0 };
        Object.assign(call, data);
        return { count: 1 };
      },
      async findUnique({ where }: { where: { id: string } }) { return calls.get(where.id) || null; },
      async findFirst({ where }: { where: { provider: string; providerCallId: string } }) {
        return [...calls.values()].find((call) => call.provider === where.provider && call.providerCallId === where.providerCallId) || null;
      },
      async findMany() { return [...calls.values()]; },
    },
    trialCallWebhookEvent: {
      async create({ data }: { data: Record<string, any> }) {
        if (events.has(data.idempotencyKey)) throw { code: "P2002" };
        const event = { id: data.id, processingStatus: data.processingStatus, ...data };
        events.set(data.idempotencyKey, event);
        return event;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const event = [...events.values()].find((entry) => entry.id === where.id);
        Object.assign(event, data);
        return event;
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const event = [...events.values()].find((entry) => entry.id === where.id && entry.processingStatus === where.processingStatus);
        if (!event) return { count: 0 };
        Object.assign(event, data);
        return { count: 1 };
      },
      async findUnique({ where }: { where: { idempotencyKey: string } }) { return events.get(where.idempotencyKey) || null; },
    },
    webinarRegistration: {
      async findUnique({ where }: { where: { id: string } }) { return registrations.get(where.id) || null; },
    },
  };
  return { db, calls, events };
}

function fakeProvider(overrides: Partial<VoiceCallProvider> = {}): VoiceCallProvider {
  return {
    name: "test-provider",
    async initiateCall() { return { providerCallId: "provider-call-1" }; },
    async getCallDetails() { throw new Error("not used"); },
    async validateWebhook() { return true; },
    normalizeWebhook(payload) { return payload as NormalizedVoiceWebhook; },
    ...overrides,
  };
}

const ringgConfig: RinggVoiceProviderConfig = {
  apiKey: "test-api-key",
  agentId: "backend-agent-id",
  numberPoolId: "backend-number-pool",
  webhookBearerToken: "ringg-webhook-secret",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function triggerWithRingg(
  fetcher: typeof fetch,
  config: RinggVoiceProviderConfig = ringgConfig,
  timeoutMs = 100,
) {
  const provider = new RinggVoiceCallProvider(config, fetcher, timeoutMs);
  const { db } = createFakeDatabase();
  const call = await createTrialCall({
    phoneNumber: "+14155550123",
    customerName: "Trial Customer",
  }, provider, db as never);
  return triggerTrialCall(call.id, provider, db as never);
}

test("Ringg call uses the documented outbound endpoint and server-selected fields", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return jsonResponse(200, { status: "success", data: { call_id: "ringg-call-123" } });
  };
  const provider = new RinggVoiceCallProvider(ringgConfig, fetcher);
  const { db } = createFakeDatabase();
  const call = await createTrialCall({
    phoneNumber: "+14155550123",
    customerName: "Trial Customer",
  }, provider, db as never);

  const result = await triggerTrialCall(call.id, provider, db as never);

  assert.equal(requestUrl, "https://prod-api.ringg.ai/ca/api/v0/calling/v2/outbound/individual");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("X-API-KEY"), "test-api-key");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), null);
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    name: "Trial Customer",
    mobile_number: "+14155550123",
    agent_id: "backend-agent-id",
    number_pool_id: "backend-number-pool",
  });
  assert.equal(result.providerCallId, "ringg-call-123");
  assert.equal(result.status, "QUEUED");
});

test("request schemas reject frontend-supplied agent and caller-source fields", () => {
  const validCreate = { phoneNumber: "+14155550123", customerName: "Trial Customer" };
  for (const key of ["agentId", "provider", "RINGG_API_KEY", "number_pool_id", "from_number_id", "from_number", "webhook_url"]) {
    assert.equal(createTrialCallSchema.safeParse({ ...validCreate, [key]: "frontend-value" }).success, false, key);
    assert.equal(triggerTrialCallRequestSchema.safeParse({ [key]: "frontend-value" }).success, false, key);
  }
});

test("Ringg adapter permits exactly one configured caller source", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return jsonResponse(200, { data: { call_id: `call-${requests.length}` } });
  };
  const callInput = { phoneNumber: "+14155550123", customerName: "Trial Customer", trialCallId: "trial-1" };

  for (const source of [
    { numberPoolId: "pool-id", fromNumberId: undefined, fromNumber: undefined },
    { numberPoolId: undefined, fromNumberId: "number-id", fromNumber: undefined },
    { numberPoolId: undefined, fromNumberId: undefined, fromNumber: "+14155550999" },
  ]) {
    await new RinggVoiceCallProvider({ ...ringgConfig, ...source }, fetcher).initiateCall(callInput);
  }

  assert.deepEqual(requests[0].number_pool_id, "pool-id");
  assert.equal("from_number_id" in requests[0], false);
  assert.equal("from_number" in requests[0], false);
  assert.deepEqual(requests[1].from_number_id, "number-id");
  assert.equal("number_pool_id" in requests[1], false);
  assert.deepEqual(requests[2].from_number, "+14155550999");
  assert.equal("number_pool_id" in requests[2], false);
});

test("Ringg webhook validates bearer auth and normalizes documented events", async () => {
  const provider = new RinggVoiceCallProvider(ringgConfig, fetch);
  const payload = {
    event_id: "event-1",
    event_type: "call_completed",
    call_id: "ringg-call-123",
    duration_seconds: 42,
    transcript: [{ speaker: "assistant", text: "Hello" }],
    occurred_at: now.toISOString(),
  };

  assert.equal(await provider.validateWebhook({
    headers: { authorization: "Bearer ringg-webhook-secret" },
    rawBody: JSON.stringify(payload),
  }), true);
  assert.equal(await provider.validateWebhook({ headers: {}, rawBody: JSON.stringify(payload) }), false);
  assert.equal(await provider.validateWebhook({
    headers: { authorization: "Bearer wrong-secret" },
    rawBody: JSON.stringify(payload),
  }), false);
  assert.equal(await provider.validateWebhook({
    headers: { authorization: "Bearer ringg-webhook-secret" },
    rawBody: "not-json",
  }), false);

  const normalized = provider.normalizeWebhook(payload);
  assert.equal(normalized.eventId, "event-1");
  assert.equal(normalized.providerCallId, "ringg-call-123");
  assert.equal(normalized.eventType, "call_completed");
  assert.equal(normalized.status, "COMPLETED");
  assert.equal(normalized.durationSeconds, 42);
  assert.equal(normalized.transcript, JSON.stringify(payload.transcript));
  assert.equal(provider.normalizeWebhook({ event_type: "call_started", call_id: "ringg-call-123" }).status, "IN_PROGRESS");
});

test("Ringg webhook rejects malformed and unsupported events", () => {
  const provider = new RinggVoiceCallProvider(ringgConfig, fetch);
  assert.throws(() => provider.normalizeWebhook({ event_type: "unknown_event", call_id: "ringg-call-123" }), /not supported/);
  assert.throws(() => provider.normalizeWebhook({ event_type: "call_started" }), /missing/);
  assert.throws(() => provider.normalizeWebhook([]), /object/);
});

test("missing Ringg server configuration fails the local trial call safely", async () => {
  let requestCount = 0;
  const fetcher: typeof fetch = async () => {
    requestCount += 1;
    return jsonResponse(200, { data: { call_id: "unexpected" } });
  };
  const result = await triggerWithRingg(fetcher, {});
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureReason, "Trial call provider configuration is incomplete");
  assert.equal(requestCount, 0);
});

test("Ringg authentication failures become safe failed trial calls", async () => {
  for (const status of [401, 403]) {
    const result = await triggerWithRingg(async () => new Response("sensitive provider body", { status }));
    assert.equal(result.status, "FAILED");
    assert.equal(result.failureReason, "Trial call provider authentication failed");
  }
});

test("Ringg 400, 404, 429, and 5xx failures become safe local failures", async () => {
  const cases = [
    [400, "Provider rejected the trial call request"],
    [404, "Configured trial call resource was not found"],
    [429, "Trial call provider rate limit exceeded"],
    [503, "Trial call provider is unavailable"],
  ] as const;

  for (const [status, reason] of cases) {
    const result = await triggerWithRingg(async () => new Response("raw response must not persist", { status }));
    assert.equal(result.status, "FAILED");
    assert.equal(result.failureReason, reason);
  }
});

test("Ringg network timeout marks the local call failed", async () => {
  const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
  });
  const result = await triggerWithRingg(fetcher, ringgConfig, 5);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureReason, "Trial call provider request timed out");
});

test("Ringg malformed and missing-call-ID responses fail safely", async () => {
  const malformed = await triggerWithRingg(async () => new Response("not-json", { status: 200 }));
  assert.equal(malformed.status, "FAILED");
  assert.equal(malformed.failureReason, "Trial call provider returned an invalid response");

  const missingId = await triggerWithRingg(async () => jsonResponse(200, { status: "success", data: {} }));
  assert.equal(missingId.status, "FAILED");
  assert.equal(missingId.failureReason, "Trial call provider response did not include a call identifier");
});

test("creates a local trial call from an existing webinar registration", async () => {
  const { db } = createFakeDatabase();
  const call = await createTrialCall({ webinarRegistrationId: "registration-1" }, fakeProvider(), db as never);
  assert.equal(call.status, "QUEUED");
  assert.equal(call.phoneNumber, "+14155550123");
  assert.equal(call.customerName, "Trial Customer");
});

test("provider initiation success persists provider call ID", async () => {
  const { db } = createFakeDatabase();
  const provider = fakeProvider({
    async initiateCall({ trialCallId }) {
      const localCall = await db.trialCall.findUnique({ where: { id: trialCallId } });
      assert.equal(localCall.status, "INITIATING");
      return { providerCallId: "provider-call-1" };
    },
  });
  const call = await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, provider, db as never);
  const result = await triggerTrialCall(call.id, provider, db as never);
  assert.equal(result.status, "QUEUED");
  assert.equal(result.providerCallId, "provider-call-1");
});

test("call_started webhook moves a trial call to in progress", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "call_started", providerCallId: "provider-call-1" },
    rawBody: "{}",
    event: { eventType: "call_started", providerCallId: "provider-call-1", status: "IN_PROGRESS", occurredAt: now },
  }, db as never);
  assert.equal(calls.get("trial-1").status, "IN_PROGRESS");
  assert.equal(calls.get("trial-1").startedAt, now);
});

test("trial-call success logs do not contain provider secrets or customer data", async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try {
    await triggerWithRingg(async () => jsonResponse(200, { data: { call_id: "ringg-call-123" } }));
  } finally {
    console.log = originalLog;
  }
  const output = lines.join("\n");
  assert.equal(output.includes("test-api-key"), false);
  assert.equal(output.includes("+14155550123"), false);
  assert.equal(output.includes("ringg-webhook-secret"), false);
});

test("provider initiation failure marks the local call failed", async () => {
  const { db } = createFakeDatabase();
  const call = await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  const result = await triggerTrialCall(call.id, fakeProvider({
    async initiateCall() { throw new Error("secret-bearing provider error"); },
  }), db as never);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureReason, "Trial call request failed");
});

test("duplicate webhook is processed once", async () => {
  const { db } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  const input = { provider: "test-provider", payload: { event: "ring" }, rawBody: "{}", event: { eventType: "ring", providerCallId: "provider-call-1" } };
  assert.equal(await processTrialCallWebhook(input, db as never), "processed");
  assert.equal(await processTrialCallWebhook(input, db as never), "duplicate");
});

test("completed webhook stores outcome, transcript, recording, and completion time", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  const event = {
    eventType: "call.completed", providerCallId: "provider-call-1", status: "COMPLETED" as const,
    durationSeconds: 42, transcript: "Hello there", recordingUrl: "https://recordings.example/call-1",
    outcome: "interested", outcomeData: { qualified: true }, occurredAt: now,
  };
  assert.equal(await processTrialCallWebhook({ provider: "test-provider", payload: event, rawBody: "{}", event }, db as never), "processed");
  const call = calls.get("trial-1");
  assert.equal(call.status, "COMPLETED");
  assert.equal(call.durationSeconds, 42);
  assert.equal(call.transcript, "Hello there");
  assert.equal(call.recordingUrl, "https://recordings.example/call-1");
  assert.equal(call.completedAt, now);
});

test("failed webhook persists failed status", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  const event = { eventType: "call.failed", providerCallId: "provider-call-1", status: "FAILED" as const, failureReason: "No answer" };
  await processTrialCallWebhook({ provider: "test-provider", payload: event, rawBody: "{}", event }, db as never);
  assert.equal(calls.get("trial-1").status, "FAILED");
  assert.equal(calls.get("trial-1").failureReason, "No answer");
});

test("transcript-only webhook preserves transcript", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  const event = { eventType: "transcript.final", providerCallId: "provider-call-1", transcript: "Persist this" };
  await processTrialCallWebhook({ provider: "test-provider", payload: event, rawBody: "{}", event }, db as never);
  assert.equal(calls.get("trial-1").transcript, "Persist this");
});

test("recording reference persists on a later event", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  const event = { eventType: "recording.ready", providerCallId: "provider-call-1", recordingUrl: "https://recordings.example/ref" };
  await processTrialCallWebhook({ provider: "test-provider", payload: event, rawBody: "{}", event }, db as never);
  assert.equal(calls.get("trial-1").recordingUrl, "https://recordings.example/ref");
});

test("analysis and final processing events enrich without erasing existing data", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);

  const analysis = {
    eventType: "analysis_completed",
    providerCallId: "provider-call-1",
    outcome: "interested",
    outcomeData: { summary: "Requested a follow-up", sentiment: "positive" },
  };
  await processTrialCallWebhook({ provider: "test-provider", payload: analysis, rawBody: "{}", event: analysis }, db as never);
  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "recording_completed", providerCallId: "provider-call-1", recordingUrl: "https://recordings.example/final" },
    rawBody: "{}",
    event: { eventType: "recording_completed", providerCallId: "provider-call-1", recordingUrl: "https://recordings.example/final" },
  }, db as never);
  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "all_processing_completed", providerCallId: "provider-call-1" },
    rawBody: "{}",
    event: { eventType: "all_processing_completed", providerCallId: "provider-call-1", status: "COMPLETED" },
  }, db as never);

  assert.equal(calls.get("trial-1").outcome, "interested");
  assert.deepEqual(calls.get("trial-1").outcomeData, analysis.outcomeData);
  assert.equal(calls.get("trial-1").recordingUrl, "https://recordings.example/final");
  assert.equal(calls.get("trial-1").status, "COMPLETED");

  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "all_processing_completed", providerCallId: "provider-call-1", eventId: "final-2" },
    rawBody: "{}",
    event: { eventType: "all_processing_completed", providerCallId: "provider-call-1", status: "COMPLETED", eventId: "final-2" },
  }, db as never);
  assert.equal(calls.get("trial-1").outcome, "interested");
  assert.equal(calls.get("trial-1").recordingUrl, "https://recordings.example/final");
});

test("late call_started cannot regress a completed trial call", async () => {
  const { db, calls } = createFakeDatabase();
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, fakeProvider(), db as never);
  await triggerTrialCall("trial-1", fakeProvider(), db as never);
  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "call.completed", providerCallId: "provider-call-1" },
    rawBody: "{}",
    event: { eventType: "call.completed", providerCallId: "provider-call-1", status: "COMPLETED" },
  }, db as never);
  await processTrialCallWebhook({
    provider: "test-provider",
    payload: { eventType: "call_started", providerCallId: "provider-call-1" },
    rawBody: "{}",
    event: { eventType: "call_started", providerCallId: "provider-call-1", status: "IN_PROGRESS" },
  }, db as never);
  assert.equal(calls.get("trial-1").status, "COMPLETED");
});

test("unknown provider call ID is safely ignored", async () => {
  const { db, events } = createFakeDatabase();
  const event = { eventType: "call.completed", providerCallId: "unknown" };
  assert.equal(await processTrialCallWebhook({ provider: "test-provider", payload: event, rawBody: "{}", event }, db as never), "ignored");
  assert.equal([...events.values()][0].processingStatus, "IGNORED");
});

test("invalid webhook authentication is rejected before persistence", async () => {
  const { db, events } = createFakeDatabase();
  const provider = fakeProvider({ async validateWebhook() { return false; } });
  const result = await receiveTrialCallWebhook(provider, {
    headers: {}, rawBody: "{}", payload: { eventType: "call.completed", providerCallId: "unknown" },
  }, db as never);
  assert.equal(result, "unauthorized");
  assert.equal(events.size, 0);
});

test("only one concurrent trigger can claim a queued call", async () => {
  const { db } = createFakeDatabase();
  let initiationCount = 0;
  const provider = fakeProvider({
    async initiateCall() {
      initiationCount += 1;
      return { providerCallId: "provider-call-1" };
    },
  });
  await createTrialCall({ phoneNumber: "+14155550123", customerName: "Trial Customer" }, provider, db as never);
  const results = await Promise.allSettled([
    triggerTrialCall("trial-1", provider, db as never),
    triggerTrialCall("trial-1", provider, db as never),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(initiationCount, 1);
});

test("public trial-call view excludes provider-specific and sensitive fields", async () => {
  const { db } = createFakeDatabase();
  const call = await createTrialCall({
    phoneNumber: "+14155550123",
    customerName: "Trial Customer",
  }, fakeProvider(), db as never);
  const publicCall = toPublicTrialCall({
    ...call,
    agentId: "provider-agent-id",
    providerCallId: "provider-call-id",
    provider: "ringg",
    recordingUrl: "https://recordings.example/private",
    apiKey: "provider-api-key",
    authorization: "Bearer provider-secret",
    rawProviderPayload: { call_id: "provider-call-id", secret: "provider-secret" },
    providerPayload: { agent_id: "provider-agent-id" },
  });

  assert.equal("agentId" in publicCall, false);
  assert.equal("providerCallId" in publicCall, false);
  assert.equal("provider" in publicCall, false);
  assert.equal("recordingUrl" in publicCall, false);
  assert.equal("apiKey" in publicCall, false);
  assert.equal("authorization" in publicCall, false);
  assert.equal("rawProviderPayload" in publicCall, false);
  assert.equal("providerPayload" in publicCall, false);
});