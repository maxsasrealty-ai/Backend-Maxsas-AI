const baseUrl = "http://localhost:4000";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";

const payload = {
  roomId: `manual-test-${Date.now()}`,
  phoneNumber: process.env.TEST_PHONE_NUMBER || "+918882453059",
  agentName: process.env.TEST_AGENT_NAME || "maxsas-voice-agent-prod",
  direction: "outbound"
};

console.log("=== Testing Call Trigger ===");
console.log("Tenant:", tenantId);
console.log("Payload:", JSON.stringify(payload, null, 2));
console.log("");

try {
  const response = await fetch(`${baseUrl}/api/calls`, {
    method: "POST",
    headers: {
      "x-tenant-id": tenantId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text);
  
  if (response.status === 201 || response.ok) {
    const data = JSON.parse(text);
    console.log("\n✓ SUCCESS");
    console.log("Call ID:", data.data?.callId);
    console.log("Room ID:", data.data?.roomId);
    console.log("State:", data.data?.state);
  } else {
    console.log("\n✗ FAILED");
    try {
      const error = JSON.parse(text);
      console.log("Error:", error.error?.message);
    } catch {
      console.log("Raw response:", text);
    }
  }
} catch (err) {
  console.error("Network error:", err.message);
}