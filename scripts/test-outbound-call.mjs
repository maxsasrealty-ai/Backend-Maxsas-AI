const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";
const phoneNumber = process.env.TEST_PHONE_NUMBER || "+918882453059";
const roomId = process.env.TEST_ROOM_ID || `room_test_${Date.now()}`;
const agentName = process.env.TEST_AGENT_NAME || "maxsas-voice-agent-prod";
const callDurationLimitSec = Number(process.env.TEST_CALL_DURATION_LIMIT_SEC || 118);

const response = await fetch(`${baseUrl}/api/calls`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-tenant-id": tenantId
  },
  body: JSON.stringify({
    roomId,
    phoneNumber,
    agentName,
    direction: "outbound",
    voiceCalling: {
      callDurationLimitEnabled: true,
      callDurationLimitSec,
    },
  })
});

const text = await response.text();
console.log("Status:", response.status);
console.log(text);
