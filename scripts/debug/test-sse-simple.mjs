#!/usr/bin/env node

import http from "http";

const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";
const url = new URL(`http://localhost:4000/api/realtime/calls/stream?tenantId=${tenantId}`);

console.log("Testing SSE connection...");
console.log(`URL: ${url.toString()}\n`);

const req = http.get({
  hostname: url.hostname,
  port: url.port || 80,
  path: url.pathname + url.search,
  method: "GET",
  headers: {
    "Accept": "text/event-stream",
  },
}, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`);
  ["content-type", "cache-control", "connection", "x-accel-buffering"].forEach((h) => {
    if (res.headers[h]) {
      console.log(`  ${h}: ${res.headers[h]}`);
    }
  });
  
  if (res.statusCode !== 200) {
    console.log(`\n✗ Unexpected status code!\n`);
    let body = "";
    res.on("data", chunk => body += chunk);
    res.on("end", () => {
      console.log("Response body:", body);
      process.exit(1);
    });
    return;
  }
  
  console.log("\n✓ Connected! Waiting for events (5 seconds)...\n");
  
  let eventCount = 0;
  let buffer = "";
  
  const timeout = setTimeout(() => {
    console.log(`\n✓ Timeout reached`);
    req.destroy();
    process.exit(0);
  }, 5000);
  
  res.on("data", (chunk) => {
    buffer += chunk.toString();
    const parts = buffer.split("\n\n");
    buffer = parts[parts.length - 1];
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i].includes("event:")) {
        eventCount++;
        const lines = parts[i].split("\n");
        const eventLine = lines.find(l => l.startsWith("event:"));
        console.log(`Event #${eventCount}: ${eventLine}`);
      }
    }
  });
  
  res.on("end", () => {
    clearTimeout(timeout);
    console.log(`\nTotal events: ${eventCount}`);
    process.exit(0);
  });
  
  res.on("error", (err) => {
    clearTimeout(timeout);
    console.error(`Response error: ${err.message}`);
    process.exit(1);
  });
});

req.on("error", (err) => {
  console.error(`Request error: ${err.message}`);
  process.exit(1);
});

req.setTimeout(6000, () => {
  console.log("Request timeout");
  req.destroy();
  process.exit(1);
});