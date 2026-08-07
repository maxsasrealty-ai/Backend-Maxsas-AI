const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";
const phoneNumber = process.env.TEST_PHONE_NUMBER || "+918882453059";
const agentName = process.env.TEST_AGENT_NAME || "maxsas-voice-agent-prod";

function headers(extra = {}) {
  return {
    "content-type": "application/json",
    "x-tenant-id": tenantId,
    ...extra,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.success === false) {
    throw new Error(`${response.status}: ${body?.error?.message || text || "request failed"}`);
  }
  return body;
}

async function fetchJsonAllowStatus(url, options = {}, allowedStatuses = []) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw new Error(`${response.status}: ${body?.error?.message || text || "request failed"}`);
  }

  return { status: response.status, body };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.env.ALLOW_E2E_TEST_CALL !== "true") {
    console.error("Blocked: E2E test call script is disabled by default.");
    console.error("Set ALLOW_E2E_TEST_CALL=true when you intentionally want to place a test call.");
    process.exit(1);
  }

  console.log("[E2E] Creating outbound call...");
  const outbound = await fetchJson(`${baseUrl}/api/calls`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      roomId: `room_${Date.now()}`,
      phoneNumber,
      agentName,
      direction: "outbound",
    }),
  });

  const call = outbound.data;
  if (!call?.id && !call?.callId) {
    throw new Error("Outbound call response missing call id");
  }

  const resolvedCallId = call?.id || call?.callId;

  console.log(`[E2E] Call created: ${resolvedCallId}`);

  const stateHistory = [];
  for (let i = 0; i < 6; i += 1) {
    const status = await fetchJson(`${baseUrl}/api/calls/${resolvedCallId}`, {
      method: "GET",
      headers: headers(),
    });
    const state = status?.data?.state || status?.data?.status || "unknown";
    stateHistory.push(state);
    console.log(`[E2E] Poll ${i + 1}: ${state}`);
    await sleep(2000);
  }

  console.log("[E2E] Waiting for real provider events...");
  await sleep(15000);

  const callDetail = await fetchJson(`${baseUrl}/api/calls/${resolvedCallId}`, {
    method: "GET",
    headers: headers(),
  });
  const transcriptResponse = await fetchJsonAllowStatus(
    `${baseUrl}/api/calls/${resolvedCallId}/transcript`,
    {
      method: "GET",
      headers: headers(),
    },
    [403]
  );
  const leads = await fetchJson(`${baseUrl}/api/leads`, {
    method: "GET",
    headers: headers(),
  });

  const linkedLead = (leads.data || []).find((item) => item.callId === resolvedCallId);
  const transcriptItems = transcriptResponse.status === 200 ? (transcriptResponse.body.data || []) : [];
  const transcriptBlockedByPlan = transcriptResponse.status === 403;

  console.log("[E2E] Final call state:", callDetail?.data?.state || callDetail?.data?.status);
  console.log("[E2E] Transcript segments:", transcriptItems.length);
  if (transcriptBlockedByPlan) {
    console.log("[E2E] Transcript endpoint blocked by tenant capabilities (expected for non-full plans)");
  }
  console.log("[E2E] Lead linked:", Boolean(linkedLead));

  if (!callDetail?.data?.callId) {
    throw new Error("Call detail not found after lifecycle events");
  }

  if (!transcriptBlockedByPlan && transcriptItems.length === 0) {
    console.warn("[E2E] Transcript not available yet. Verify live call completed and webhook events were ingested.");
  }

  if (!linkedLead) {
    console.warn("[E2E] Lead not linked yet. This can happen when enrichment has not completed.");
  }

  console.log("[E2E] PASS");
  console.log(JSON.stringify({ callId: call.id, stateHistory }, null, 2));
}

main().catch((error) => {
  console.error("[E2E] FAIL", error.message);
  process.exit(1);
});
