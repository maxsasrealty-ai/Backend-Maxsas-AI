#!/usr/bin/env node

import http from "http";

const tenantId = process.env.TEST_TENANT_ID || "lexus-demo";
const url = new URL(`http://localhost:4000/api/realtime/calls/stream?tenantId=${tenantId}`);

console.log("Testing SSE connection and heartbeat...");
console.log(`URL: ${url.toString()}\n`);

let eventCount = 0;
let buffer = "";
let heartbeatCount = 0;

const req = http.get({
  hostname: url.hostname,
  port: url.port || 80,
  path: url.pathname + url.search,
  method: "GET",
}, (res) => {
  console.log(`✓ Connected (Status ${res.statusCode})`);
  
  const timeout = setTimeout(() => {
    console.log(`\n✓ Test complete (30 second timeout)`);
    req.destroy();
  }, 30000);
  
  res.on("data", (chunk) => {
    buffer += chunk.toString();
    const parts = buffer.split("\n\n");
    buffer = parts[parts.length - 1];
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i].trim()) {
        const lines = parts[i].split("\n");
        const eventLine = lines.find(l => l.startsWith("event:"));
        if (eventLine) {
          eventCount++;
          if (eventLine.includes("heartbeat")) {
            heartbeatCount++;
            process.stdout.write(`💓`);
          } else if (eventLine.includes("connected")) {
            console.log(`\n✓ Event #${eventCount}: connected`);
          } else {
            console.log(`\n✓ Event #${eventCount}: ${eventLine.replace("event: ", "")}`);
          }
        }
      }
    }
  });
  
  res.on("end", () => {
    clearTimeout(timeout);
    console.log(`\n\n✓ Stream ended\nTotal events: ${eventCount} (${heartbeatCount} heartbeats)`);
  });
  
  res.on("error", (err) => {
    clearTimeout(timeout);
    console.error(`\n✗ Response error: ${err.message}`);
    process.exit(1);
  });
});

req.on("error", (err) => {
  console.error(`✗ Request error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  req.destroy();
  process.exit(0);
}, 30100);