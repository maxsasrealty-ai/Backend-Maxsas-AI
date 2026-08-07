#!/usr/bin/env node

/**
 * Test PayU Payment Initiation Endpoint
 * 
 * Tests the /api/payments/payu/initiate endpoint
 * Usage: node scripts/test-payu-initiate.mjs
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const TENANT_ID = process.env.TEST_TENANT_ID || "test-tenant-123";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "test-token";

async function testPayUInitiate() {
  console.log("🧪 Testing PayU Payment Initiation");
  console.log(`API Base: ${API_BASE}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log("");

  const payload = {
    amount: 100000,  // ₹1000
    description: "Test wallet top-up",
    email: "test@example.com",
    phoneNumber: "9876543210",
    userId: "user-uuid-123",
    successUrl: "http://localhost:3000/lexus/wallet?payment=success",
    failureUrl: "http://localhost:3000/lexus/wallet?payment=failure",
  };

  console.log("📤 Request payload:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");

  try {
    const response = await fetch(`${API_BASE}/api/payments/payu/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "x-tenant-id": TENANT_ID,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    console.log(`📥 Response Status: ${response.status}`);
    console.log("📥 Response body:");
    console.log(JSON.stringify(data, null, 2));
    console.log("");

    if (response.ok && data.success && data.data) {
      const { payuUrl, payuMode, payuKey, hash, merchantTransactionId } = data.data;
      
      console.log("✅ VALIDATION RESULTS:");
      console.log(`  ✓ payuUrl: ${payuUrl ? "✓ Present" : "✗ Missing"}`);
      console.log(`    → URL: ${payuUrl}`);
      console.log(`    → HTTPS: ${payuUrl?.startsWith("https://") ? "✓ Yes" : "✗ No"}`);
      console.log(`  ✓ payuMode: ${payuMode}`);
      console.log(`  ✓ payuKey: ${payuKey ? "✓ Present" : "✗ Missing"}`);
      console.log(`  ✓ hash: ${hash ? "✓ Present (" + hash.substring(0, 10) + "...)" : "✗ Missing"}`);
      console.log(`  ✓ merchantTransactionId: ${merchantTransactionId}`);
      
      const required = ["paymentOrderId", "merchantTransactionId", "payuKey", "hash", "amount", "email", "phoneNumber", "description", "payuMode", "payuUrl", "successUrl", "failureUrl"];
      const missing = required.filter(k => !(k in data.data));
      
      if (missing.length === 0) {
        console.log("  ✓ All required fields present");
      } else {
        console.log(`  ✗ Missing fields: ${missing.join(", ")}`);
      }
    } else {
      console.log("❌ Request failed");
      if (data.error) {
        console.log(`   Error: ${data.error.code} - ${data.error.message}`);
      }
    }
  } catch (error) {
    console.error("❌ Request error:", error.message);
    process.exit(1);
  }
}

testPayUInitiate().then(() => {
  console.log("\n✅ Test complete");
  process.exit(0);
}).catch(err => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
