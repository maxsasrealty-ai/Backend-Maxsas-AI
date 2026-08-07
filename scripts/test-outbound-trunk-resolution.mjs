/**
 * Test: Outbound Trunk Resolution
 * 
 * This test validates the deterministic trunk ID resolution logic:
 * 1. SIP_OUTBOUND_TRUNK_ID has priority
 * 2. Falls back to LIVEKIT_OUTBOUND_TRUNK_ID
 * 3. Throws error if neither is configured
 * 
 * Usage:
 *   node scripts/test-outbound-trunk-resolution.mjs
 * 
 * Environment:
 *   - Run with various combinations of trunk IDs to validate priority
 */

import { execSync } from "child_process";

console.log("=== Outbound Trunk Resolution Tests ===\n");

const tests = [
  {
    name: "Primary trunk (SIP_OUTBOUND_TRUNK_ID) wins over secondary",
    env: {
      SIP_OUTBOUND_TRUNK_ID: "ST_PRIMARY_123",
      LIVEKIT_OUTBOUND_TRUNK_ID: "ST_SECONDARY_456",
    },
    expectedTrunk: "ST_PRIMARY_123",
    expectedSource: "SIP_OUTBOUND_TRUNK_ID",
  },
  {
    name: "Fallback to LIVEKIT_OUTBOUND_TRUNK_ID when SIP not set",
    env: {
      LIVEKIT_OUTBOUND_TRUNK_ID: "ST_LIVEKIT_789",
    },
    expectedTrunk: "ST_LIVEKIT_789",
    expectedSource: "LIVEKIT_OUTBOUND_TRUNK_ID",
  },
  {
    name: "Only primary set",
    env: {
      SIP_OUTBOUND_TRUNK_ID: "ST_ONLY_PRIMARY",
    },
    expectedTrunk: "ST_ONLY_PRIMARY",
    expectedSource: "SIP_OUTBOUND_TRUNK_ID",
  },
];

let passCount = 0;
let failCount = 0;

tests.forEach((test, idx) => {
  console.log(`Test ${idx + 1}: ${test.name}`);
  
  // Build environment
  const envVars = Object.entries({
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://dummy",
    LIVEKIT_URL: process.env.LIVEKIT_URL || "ws://localhost:7880",
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || "dummy",
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || "dummy",
    ...test.env,
  })
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");

  // Create a test script to validate trunk resolution
  const testScript = `
    import { resolveOutboundTrunk } from "./src/lib/config.ts";
    try {
      const result = resolveOutboundTrunk();
      console.log(JSON.stringify(result));
    } catch (err) {
      console.log(JSON.stringify({ error: err.message }));
    }
  `;

  try {
    const output = execSync(`${envVars} npx tsx --eval '${testScript}'`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    const result = JSON.parse(output);

    if (result.error) {
      console.log(`  ✗ FAIL: ${result.error}`);
      failCount++;
    } else if (result.trunkId === test.expectedTrunk && result.source === test.expectedSource) {
      console.log(`  ✓ PASS: trunk=${result.trunkId}, source=${result.source}`);
      passCount++;
    } else {
      console.log(`  ✗ FAIL: Got trunk=${result.trunkId}, source=${result.source}`);
      console.log(`         Expected trunk=${test.expectedTrunk}, source=${test.expectedSource}`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ ERROR: ${err.message.split("\n")[0]}`);
    failCount++;
  }
  console.log();
});

// Test missing trunk scenario
console.log(`Test ${tests.length + 1}: Error when no trunk IDs configured`);
const noTrunkEnv = [
  `DATABASE_URL="${process.env.DATABASE_URL || "postgresql://dummy"}"`,
  `LIVEKIT_URL="${process.env.LIVEKIT_URL || "ws://localhost:7880"}"`,
  `LIVEKIT_API_KEY="${process.env.LIVEKIT_API_KEY || "dummy"}"`,
  `LIVEKIT_API_SECRET="${process.env.LIVEKIT_API_SECRET || "dummy"}"`,
].join(" ");

const testScript = `
  import { resolveOutboundTrunk } from "./src/lib/config.ts";
  try {
    const result = resolveOutboundTrunk();
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }));
  }
`;

try {
  const output = execSync(`${noTrunkEnv} npx tsx --eval '${testScript}'`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  const result = JSON.parse(output);

  if (result.error && result.error.includes("outbound_trunk_missing")) {
    console.log(`  ✓ PASS: Correctly throws outbound_trunk_missing error`);
    passCount++;
  } else {
    console.log(`  ✗ FAIL: Expected outbound_trunk_missing error, got: ${result.error || JSON.stringify(result)}`);
    failCount++;
  }
} catch (err) {
  console.log(`  ✗ ERROR: ${err.message.split("\n")[0]}`);
  failCount++;
}

console.log(`\n=== Summary ===`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Total: ${passCount + failCount}`);

if (failCount > 0) {
  process.exit(1);
}
