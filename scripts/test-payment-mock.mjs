#!/usr/bin/env node

/**
 * Test Payment with Mock Success (Development Only)
 * 
 * This simulates a successful payment without contacting PayU.
 * Useful when PayU test environment is unreachable.
 * 
 * Usage: node scripts/test-payment-mock.mjs <amount> <userId>
 * Example: node scripts/test-payment-mock.mjs 100000 user-uuid-123
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:4000";
const TENANT_ID = process.env.TEST_TENANT_ID || "test-tenant-123";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "test-token";

const args = process.argv.slice(2);
const amount = args[0] ? parseInt(args[0]) : 100000;  // ₹1000 default
const userId = args[1] || "user-uuid-123";

async function testMockSuccess() {
  console.log("🧪 Testing Mock Payment Success (Development Only)");
  console.log(`API Base: ${API_BASE}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Amount: ₹${(amount / 100).toFixed(2)} (${amount} paise)`);
  console.log("");

  const payload = {
    amount,
    userId,
  };

  console.log("📤 Request payload:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");

  try {
    const response = await fetch(`${API_BASE}/api/payments/payu/mock-success`, {
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
      const { amountPaise, newBalancePaise, newBalanceFormatted } = data.data;
      
      console.log("✅ MOCK PAYMENT SUCCESS!");
      console.log(`  ✓ Amount Credited: ₹${(amountPaise / 100).toFixed(2)}`);
      console.log(`  ✓ New Balance: ${newBalanceFormatted}`);
      console.log(`  ✓ Ledger Entry: ${data.data.ledgerEntryId}`);
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

testMockSuccess().then(() => {
  console.log("\n✅ Test complete");
  process.exit(0);
}).catch(err => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
