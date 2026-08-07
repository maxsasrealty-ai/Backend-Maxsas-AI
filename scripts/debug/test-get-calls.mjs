const baseUrl = "http://localhost:4000";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";

console.log("=== Testing GET /api/calls ===");
console.log("Tenant:", tenantId);
console.log("");

try {
  const response = await fetch(`${baseUrl}/api/calls`, {
    method: "GET",
    headers: {
      "x-tenant-id": tenantId,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response Body:");
  console.log(text);
  
  if (!response.ok) {
    console.log("\n✗ FAILED");
    try {
      const error = JSON.parse(text);
      console.log("Error Code:", error.error?.code);
      console.log("Error Message:", error.error?.message);
    } catch {
      console.log("Raw body:", text);
    }
  } else {
    console.log("\n✓ SUCCESS");
    const data = JSON.parse(text);
    console.log("Total Items:", data.meta?.pagination?.totalItems);
    console.log("Items:", data.data?.length || 0);
  }
} catch (err) {
  console.error("Network error:", err.message);
  console.error(err);
}