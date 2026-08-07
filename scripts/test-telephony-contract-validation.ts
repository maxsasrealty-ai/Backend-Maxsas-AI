/**
 * Test: Telephony Contract Validation Function
 * 
 * This test validates the validateOutboundDispatchContract() function
 * to ensure it properly catches missing or invalid fields before dispatch.
 * 
 * Usage:
 *   npx tsx scripts/test-telephony-contract-validation.ts
 */

import { validateOutboundDispatchContract, TelephonyDispatchRequest } from "../src/services/telephonyService";

console.log("=== Telephony Contract Validation Function Tests ===\n");

let passCount = 0;
let failCount = 0;

// Test 1: Valid request passes validation
console.log("Test 1: Valid complete request passes validation");
const validRequest: TelephonyDispatchRequest = {
  callId: "call-123",
  tenantId: "tenant-456",
  roomId: "room-789",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
  callDurationLimitEnabled: true,
  callDurationLimitSec: 118,
};

const result1 = validateOutboundDispatchContract(validRequest);
if (result1.valid && result1.missingFields.length === 0) {
  console.log("  ✓ PASS: Valid request accepted");
  passCount++;
} else {
  console.log(`  ✗ FAIL: Valid request rejected`);
  console.log(`    Result: ${JSON.stringify(result1)}`);
  failCount++;
}

// Test 2: Missing callId is caught
console.log("\nTest 2: Missing callId is caught");
const missingCallId: TelephonyDispatchRequest = {
  callId: "",
  tenantId: "tenant-456",
  roomId: "room-789",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
};

const result2 = validateOutboundDispatchContract(missingCallId);
if (!result2.valid && result2.missingFields.includes("callId")) {
  console.log("  ✓ PASS: Missing callId caught");
  console.log(`    Missing fields: ${result2.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Missing callId not caught`);
  failCount++;
}

// Test 3: Missing tenantId is caught
console.log("\nTest 3: Missing tenantId is caught");
const missingTenantId: TelephonyDispatchRequest = {
  callId: "call-123",
  tenantId: "",
  roomId: "room-789",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
};

const result3 = validateOutboundDispatchContract(missingTenantId);
if (!result3.valid && result3.missingFields.includes("tenantId")) {
  console.log("  ✓ PASS: Missing tenantId caught");
  console.log(`    Missing fields: ${result3.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Missing tenantId not caught`);
  failCount++;
}

// Test 4: Missing roomId is caught
console.log("\nTest 4: Missing roomId is caught");
const missingRoomId: TelephonyDispatchRequest = {
  callId: "call-123",
  tenantId: "tenant-456",
  roomId: "",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
};

const result4 = validateOutboundDispatchContract(missingRoomId);
if (!result4.valid && result4.missingFields.includes("roomId")) {
  console.log("  ✓ PASS: Missing roomId caught");
  console.log(`    Missing fields: ${result4.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Missing roomId not caught`);
  failCount++;
}

// Test 5: Missing phoneNumber is caught
console.log("\nTest 5: Missing phoneNumber is caught");
const missingPhone: TelephonyDispatchRequest = {
  callId: "call-123",
  tenantId: "tenant-456",
  roomId: "room-789",
  phoneNumber: "",
  agentName: "agent-prod",
  direction: "outbound",
};

const result5 = validateOutboundDispatchContract(missingPhone);
if (!result5.valid && result5.missingFields.includes("phoneNumber")) {
  console.log("  ✓ PASS: Missing phoneNumber caught");
  console.log(`    Missing fields: ${result5.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Missing phoneNumber not caught`);
  failCount++;
}

// Test 6: Multiple missing fields are caught
console.log("\nTest 6: Multiple missing fields are caught");
const multiMissing: TelephonyDispatchRequest = {
  callId: "",
  tenantId: "",
  roomId: "room-789",
  phoneNumber: "",
  agentName: "agent-prod",
  direction: "outbound",
};

const result6 = validateOutboundDispatchContract(multiMissing);
if (!result6.valid && result6.missingFields.length === 3) {
  console.log("  ✓ PASS: Multiple missing fields caught");
  console.log(`    Missing fields: ${result6.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Did not catch all missing fields`);
  console.log(`    Expected 3 missing, got ${result6.missingFields.length}`);
  failCount++;
}

// Test 7: Null values are rejected
console.log("\nTest 7: Null/undefined values are rejected");
const nullValues: TelephonyDispatchRequest = {
  callId: null as any,
  tenantId: undefined as any,
  roomId: "room-789",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
};

const result7 = validateOutboundDispatchContract(nullValues);
if (!result7.valid && result7.missingFields.includes("callId") && result7.missingFields.includes("tenantId")) {
  console.log("  ✓ PASS: Null/undefined values rejected");
  console.log(`    Missing fields: ${result7.missingFields.join(", ")}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Null/undefined values not properly rejected`);
  failCount++;
}

// Test 8: Validation error message is descriptive
console.log("\nTest 8: Validation error message is descriptive");
const badRequest: TelephonyDispatchRequest = {
  callId: "",
  tenantId: "tenant-456",
  roomId: "",
  phoneNumber: "+918882453059",
  agentName: "agent-prod",
  direction: "outbound",
};

const result8 = validateOutboundDispatchContract(badRequest);
if (result8.error && result8.error.includes("missing required fields")) {
  console.log("  ✓ PASS: Error message is descriptive");
  console.log(`    Error: ${result8.error}`);
  passCount++;
} else {
  console.log(`  ✗ FAIL: Error message not descriptive`);
  failCount++;
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Total: ${passCount + failCount}`);

if (failCount > 0) {
  process.exit(1);
}
