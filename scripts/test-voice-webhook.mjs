const baseUrl = process.env.VOICE_WEBHOOK_PUBLIC_URL || "http://localhost:8080";
const webhookToken = process.env.VOICE_WEBHOOK_BEARER_TOKEN || "dev_secret_token_livekit_99";

if (process.env.ALLOW_SYNTHETIC_WEBHOOK_TEST !== "true") {
  console.error("Blocked: synthetic webhook test is disabled by default.");
  console.error("Set ALLOW_SYNTHETIC_WEBHOOK_TEST=true only when you intentionally want mock events.");
  process.exit(1);
}

const payload = {
  event_type: "publisher_test",
  tenant_id: process.env.TEST_TENANT_ID || "lexus-demo",
  call_id: `call_test_${Date.now()}`,
  room_id: `room_test_${Date.now()}`,
  occurred_at: new Date().toISOString(),
  payload: {
    message: "publisher_test from script"
  }
};

const response = await fetch(`${baseUrl}/api/webhooks/voice/events`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "authorization": `Bearer ${webhookToken}`,
    "x-event-id": `evt_test_${Date.now()}`
  },
  body: JSON.stringify(payload)
});

const text = await response.text();
console.log("Status:", response.status);
console.log(text);
