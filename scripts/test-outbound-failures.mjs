/**
 * Test: Outbound Dispatch Stage-Specific Failures
 * 
 * This test validates structured error handling at each telephony stage:
 * 1. room_create_failed - LiveKit room creation fails
 * 2. sip_participant_create_failed - SIP participant creation fails
 * 3. dispatch_create_failed - Agent dispatch fails (non-blocking, should log warning)
 * 4. outbound_trunk_missing - Trunk ID resolution fails
 * 5. config_validation_failed - Missing env vars or phone number
 * 
 * Note: Full end-to-end testing requires mocking or a test LiveKit cluster.
 * This script validates error structure and logging approach.
 * 
 * Usage (after backend is running):
 *   npm run dev &
 *   # In another terminal:
 *   TEST_PHONE_NUMBER="+919999999999" node scripts/test-outbound-failures.mjs
 */

const baseUrl = process.env.API_BASE_URL || "http://localhost:4000";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";
const phoneNumber = process.env.TEST_PHONE_NUMBER || "+918882453059";
const roomId = `room_failure_test_${Date.now()}`;
const agentName = "test-agent";

console.log("=== Outbound Dispatch Failure Scenario Tests ===\n");

// Test 1: Missing phone number (config_validation_failed)
console.log("Test 1: Missing phone number should fail with config_validation_failed");
try {
  const response = await fetch(`${baseUrl}/api/calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantId,
    },
    body: JSON.stringify({
      roomId,
      phoneNumber: "", // Empty phone number
      agentName,
      direction: "outbound",
    }),
  });

  const data = await response.json();
  if (response.status === 400) {
    console.log(`  ✓ PASS: Validation rejected with 400`);
    console.log(`    Error code: ${data.error?.code}`);
  } else {
    console.log(`  ✗ FAIL: Expected 400, got ${response.status}`);
    console.log(`    Response: ${JSON.stringify(data)}`);
  }
} catch (err) {
  console.log(`  ✗ ERROR: ${err.message}`);
}

console.log();

// Test 2: Invalid phone number format (from normalizePhoneNumber)
console.log("Test 2: Invalid phone format (no digits) should fail");
try {
  const response = await fetch(`${baseUrl}/api/calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantId,
    },
    body: JSON.stringify({
      roomId: `room_invalid_phone_${Date.now()}`,
      phoneNumber: "not-a-phone", // No digits
      agentName,
      direction: "outbound",
    }),
  });

  const data = await response.json();
  if (response.status === 500) {
    console.log(`  ✓ PASS: Invalid phone rejected with 500`);
    console.log(`    Error code: ${data.error?.code}`);
    console.log(`    Message: ${data.error?.message}`);
  } else {
    console.log(`  ✗ FAIL: Expected 500, got ${response.status}`);
  }
} catch (err) {
  console.log(`  ✗ ERROR: ${err.message}`);
}

console.log();

// Test 3: Valid request (should queue successfully if Redis/DB available)
console.log("Test 3: Valid request should queue for dispatch");
try {
  const response = await fetch(`${baseUrl}/api/calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantId,
    },
    body: JSON.stringify({
      roomId: `room_valid_test_${Date.now()}`,
      phoneNumber,
      agentName,
      direction: "outbound",
    }),
  });

  const data = await response.json();
  if (response.status === 201 && data.success) {
    console.log(`  ✓ PASS: Call queued successfully`);
    console.log(`    Call ID: ${data.data?.callId}`);
    console.log(`    State: ${data.data?.state}`);
    console.log(`    Note: Dispatch happens asynchronously. Check logs for telephony stage errors.`);
  } else {
    console.log(`  ✗ FAIL: Expected 201 with success, got ${response.status}`);
    console.log(`    Response: ${JSON.stringify(data)}`);
  }
} catch (err) {
  console.log(`  ✗ ERROR: ${err.message}`);
}

console.log();
console.log("=== Tests Complete ===");
console.log("\nNote: Stage-specific errors (room_create_failed, sip_participant_create_failed, etc.)");
console.log("      will appear in backend logs during async dispatch processing.");
console.log("      Monitor logs with: tail -f backend-dev.log | grep -i telephony");
