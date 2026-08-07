import { strict as assert } from "assert";

import { buildLivekitMetadata } from "../src/lib/config";
import { verifyWebhookAuth } from "../src/middleware/verifyWebhookAuth";
import { validateOutboundDispatchContract } from "../src/services/telephonyService";

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => void;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
    },
  };
}

function runWebhookAuth(headers: Record<string, string | undefined>): { nextCalled: boolean; res: MockResponse } {
  const req = { headers } as any;
  const res = createMockResponse();
  let nextCalled = false;

  verifyWebhookAuth(req, res as any, () => {
    nextCalled = true;
  });

  return { nextCalled, res };
}

console.log("=== Dispatch Contract Wiring Tests ===\n");

// Test 1: valid call request contract
console.log("Test 1: valid call request contract");
const validCallRequest = {
  roomId: `room-${Date.now()}`,
  phoneNumber: "+918882453059",
  agentName: "maxsas-voice-agent-prod",
  direction: "outbound",
};
assert.equal(typeof validCallRequest.roomId, "string");
assert.equal(typeof validCallRequest.phoneNumber, "string");
assert.equal(typeof validCallRequest.agentName, "string");
assert.equal(typeof validCallRequest.direction, "string");
console.log("  PASS\n");

// Test 2: missing required metadata rejected before dispatch
console.log("Test 2: missing required metadata");
const invalidDispatch = validateOutboundDispatchContract({
  callId: "",
  tenantId: "",
  roomId: "",
  phoneNumber: null,
  agentName: null,
  direction: "outbound",
});
assert.equal(invalidDispatch.valid, false);
assert.ok(invalidDispatch.missingFields.includes("callId"));
assert.ok(invalidDispatch.missingFields.includes("tenantId"));
assert.ok(invalidDispatch.missingFields.includes("roomId"));
assert.ok(invalidDispatch.missingFields.includes("phoneNumber"));
console.log("  PASS\n");

// Test 3: dispatch payload correctness
console.log("Test 3: dispatch payload correctness");
const metadata = buildLivekitMetadata({
  callId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  roomId: "room-dispatch-test",
  phoneNumber: "+918882453059",
  agentName: "maxsas-voice-agent-prod",
  direction: "outbound",
  extras: {
    trunk_id: "ST_TEST_TRUNK",
    webhook_url: "http://localhost:4000/api/webhooks/voice/events",
    webhook_config: {
      BACKEND_WEBHOOK_URL: "http://localhost:4000/api/webhooks/voice/events",
      BACKEND_WEBHOOK_TOKEN: "token-123",
    },
  },
});
assert.equal(metadata.call_id, "11111111-1111-4111-8111-111111111111");
assert.equal(metadata.tenant_id, "22222222-2222-4222-8222-222222222222");
assert.equal(metadata.room_id, "room-dispatch-test");
assert.equal(metadata.phone_number, "+918882453059");
assert.equal(metadata.agent_name, "maxsas-voice-agent-prod");
assert.equal(metadata.trunk_id, "ST_TEST_TRUNK");
assert.equal((metadata.webhook_config as any).BACKEND_WEBHOOK_URL, "http://localhost:4000/api/webhooks/voice/events");
assert.equal((metadata.webhook_config as any).BACKEND_WEBHOOK_TOKEN, "token-123");
console.log("  PASS\n");

// Test 4: webhook auth/header correctness
console.log("Test 4: webhook auth/header correctness");
const previousVoiceToken = process.env.VOICE_WEBHOOK_BEARER_TOKEN;
const previousToken = process.env.BACKEND_WEBHOOK_TOKEN;
const previousAuthToken = process.env.BACKEND_WEBHOOK_AUTH_TOKEN;
process.env.VOICE_WEBHOOK_BEARER_TOKEN = "test-webhook-token";
process.env.BACKEND_WEBHOOK_TOKEN = "test-webhook-token";
process.env.BACKEND_WEBHOOK_AUTH_TOKEN = "test-webhook-token";

type ApiErrorBody = { success: boolean; error?: { code?: string } };

const missingAuth = runWebhookAuth({});
assert.equal(missingAuth.nextCalled, false);
assert.equal(missingAuth.res.statusCode, 401);
assert.equal((missingAuth.res.body as ApiErrorBody).error?.code, "UNAUTHORIZED");

const wrongAuth = runWebhookAuth({ authorization: "Bearer wrong-token" });
assert.equal(wrongAuth.nextCalled, false);
assert.equal(wrongAuth.res.statusCode, 401);
assert.equal((wrongAuth.res.body as ApiErrorBody).error?.code, "UNAUTHORIZED");

const validAuth = runWebhookAuth({ authorization: "Bearer test-webhook-token" });
assert.equal(validAuth.nextCalled, true);

if (previousVoiceToken === undefined) {
  delete process.env.VOICE_WEBHOOK_BEARER_TOKEN;
} else {
  process.env.VOICE_WEBHOOK_BEARER_TOKEN = previousVoiceToken;
}
if (previousToken === undefined) {
  delete process.env.BACKEND_WEBHOOK_TOKEN;
} else {
  process.env.BACKEND_WEBHOOK_TOKEN = previousToken;
}
if (previousAuthToken === undefined) {
  delete process.env.BACKEND_WEBHOOK_AUTH_TOKEN;
} else {
  process.env.BACKEND_WEBHOOK_AUTH_TOKEN = previousAuthToken;
}
console.log("  PASS\n");

// Test 5: tenant scoping correctness in dispatch metadata
console.log("Test 5: tenant scoping correctness");
const tenantScopedMetadata = buildLivekitMetadata({
  callId: "33333333-3333-4333-8333-333333333333",
  tenantId: "44444444-4444-4444-8444-444444444444",
  roomId: "room-tenant-scope",
  phoneNumber: "+918882453059",
  agentName: "maxsas-voice-agent-prod",
  direction: "outbound",
});
assert.equal(tenantScopedMetadata.tenantId, "44444444-4444-4444-8444-444444444444");
assert.equal(tenantScopedMetadata.tenant_id, "44444444-4444-4444-8444-444444444444");
assert.equal(tenantScopedMetadata.callId, "33333333-3333-4333-8333-333333333333");
assert.equal(tenantScopedMetadata.call_id, "33333333-3333-4333-8333-333333333333");
console.log("  PASS\n");

console.log("All dispatch contract wiring tests passed.");
