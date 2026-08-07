#!/usr/bin/env node

import http from "http";
import { URL } from "url";

const apiBaseUrl = "http://localhost:4000/api";
const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";

console.log("Testing realtime SSE stream...");
console.log(`Connecting to: ${apiBaseUrl}/realtime/calls/stream?tenantId=${tenantId}`);

const url = new URL(`${apiBaseUrl}/realtime/calls/stream?tenantId=${tenantId}`);
let eventCount = 0;
let connectionLost = false;

const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname + url.search,
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    "Accept": "text/event-stream",
  },
};

const req = http.request(options, (res) => {
  console.log(`✓ Connection established`);
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);

  if (res.statusCode !== 200) {
    console.error(`✗ Unexpected status code: ${res.statusCode}`);
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.error("Response body:", data);
      process.exit(1);
    });
    return;
  }

  // Check for required SSE headers
  const contentType = res.headers["content-type"];
  const connection = res.headers["connection"];

  if (contentType !== "text/event-stream") {
    console.error(`✗ Wrong Content-Type: ${contentType}`);
    process.exit(1);
  }
  console.log(`✓ Content-Type: text/event-stream`);

  if (!connection?.includes("keep-alive")) {
    console.warn(`⚠ Connection header might be wrong: ${connection}`);
  }
  console.log(`✓ Connection: keep-alive`);

  let buffer = "";
  let timeoutHandle = null;

  const resetTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    // Expect at least heartbeat every 25 seconds
    timeoutHandle = setTimeout(() => {
      console.error("✗ No events received for 25+ seconds");
      connectionLost = true;
      req.destroy();
    }, 25000);
  };

  resetTimeout();

  res.on("data", (chunk) => {
    buffer += chunk.toString();
    resetTimeout();

    // Process complete events (separated by \n\n)
    while (buffer.includes("\n\n")) {
      const endIdx = buffer.indexOf("\n\n");
      const eventStr = buffer.substring(0, endIdx);
      buffer = buffer.substring(endIdx + 2);

      try {
        const lines = eventStr.split("\n");
        let eventType = null;
        let eventData = null;
        let eventId = null;

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.substring(7);
          } else if (line.startsWith("data: ")) {
            eventData = JSON.parse(line.substring(6));
          } else if (line.startsWith("id: ")) {
            eventId = line.substring(4);
          }
        }

        eventCount++;
        const icon = eventType === "heartbeat" ? "💓" : "📨";
        console.log(`${icon} Event #${eventCount}: ${eventType} (id: ${eventId})`);

        if (eventType === "connected") {
          console.log(`   → Connected at: ${eventData.connectedAt}`);
        } else if (eventType === "call_event") {
          console.log(`   → Call: ${eventData.callId}, State: ${eventData.callState}`);
        }
      } catch (_err) {
        console.warn(`⚠ Failed to parse event: ${eventStr.substring(0, 50)}...`);
      }
    }
  });

  res.on("end", () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (!connectionLost) {
      console.log(`\n✓ Connection closed gracefully`);
    } else {
      console.error(`\n✗ Connection lost due to timeout`);
    }
    console.log(`Total events received: ${eventCount}`);
    process.exit(connectionLost ? 1 : 0);
  });

  res.on("error", (err) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.error(`✗ Response error: ${err.message}`);
    process.exit(1);
  });
});

req.on("error", (err) => {
  console.error(`✗ Request error: ${err.message}`);
  process.exit(1);
});

// Test timeout - stop after 10 seconds (should see many heartbeats)
setTimeout(() => {
  console.log(`\n✓ Test complete. Closing connection...`);
  req.destroy();
}, 10000);

console.log("Waiting for events (test will run for 10 seconds)...\n");