# Voice Events Integration - Implementation Checklist

## Overview

This checklist guides you through implementing real-time voice event ingestion, WebSocket/SSE streaming, and persistent analysis storage in your Node.js backend.

**Status**: ✅ Infrastructure complete | 🔄 Testing & Deployment phase

---

## Phase 1: Infrastructure Validation ✅

- [x] **Webhook Endpoint** — `POST /api/webhooks/voice/events`
  - Location: [src/routes/webhooks/voice.ts](../src/routes/webhooks/voice.ts)
  - Auth: Bearer token via `X-Webhook-Auth` header
  - Validates envelope, deduplicates events, stores in DB
  
- [x] **Event Type Definitions** — All 9 event types defined
  - Location: [shared/contracts/voice-events.ts](../shared/contracts/voice-events.ts)
  - Includes: call_started, call_ringing, call_connected, call_active, call_transcript_final, lead_extracted, call_analysis_completed, call_completed, call_failed
  
- [x] **Database Schema**
  - `CallEvent` — Immutable event log (9+ events per call)
  - `CallSession` — Call record with CRM fields (callOutcome, confidence, endedBy)
  - `TranscriptSegment` — Transcript turns (indexed for search)
  - `LeadExtraction` — Normalized lead fields from analysis
  
- [x] **Event Processing Service** — [src/services/voiceEventService.ts](../src/services/voiceEventService.ts)
  - Normalizes incoming webhooks
  - Persists to database in transaction
  - Extracts state transitions, transcript, lead data, and call outcome
  - Publishes to real-time service
  
- [x] **Real-Time Streaming** — SSE (Server-Sent Events)
  - Endpoint: `GET /api/realtime/calls/stream`
  - Location: [src/routes/realtime.ts](../src/routes/realtime.ts)
  - Supports admin-scoped and tenant-scoped streaming
  - Heartbeat every 20s to detect disconnects
  - Auto-reconnect guidance for frontend

---

## Phase 2: Frontend Integration 🔄

- [ ] **React Client Library** — [shared/clients/VoiceEventClient.tsx](../shared/clients/VoiceEventClient.tsx)
  - [ ] Import `VoiceEventClient` class for manual control
  - [ ] Or use `useVoiceEventStream()` hook for automatic management
  - [ ] Or use `<CallMonitor />` component for drop-in monitoring UI

- [ ] **Example: Call Monitor UI**
  ```typescript
  import { CallMonitor } from '@/shared/clients/VoiceEventClient';
  
  export default function CallPage({ callId, tenantId }) {
    return (
      <div>
        <CallMonitor 
          tenantId={tenantId} 
          callId={callId} 
          baseUrl="http://backend.local"
        />
      </div>
    );
  }
  ```

- [ ] **Example: Manual Event Handling**
  ```typescript
  const client = new VoiceEventClient({
    tenantId: 'tenant-uuid',
    onEvent: (event) => {
      console.log(`Call ${event.callId} → ${event.eventType}`);
      
      if (event.eventType === 'call_analysis_completed') {
        // Display final CRM outcome
        setOutcome(event.payload.call_outcome);
        setConfidence(event.payload.confidence);
      }
    },
  });
  
  client.connect();
  // ... later
  client.disconnect();
  ```

- [ ] **Styling** — Add CSS for call monitor timeline, transcript, and analysis display

---

## Phase 3: Environment Configuration 🔄

- [ ] **Backend `.env` or `.env.prod`**
  ```env
  # Webhook Security
  BACKEND_WEBHOOK_AUTH_TOKEN=<secure_token_32_chars>
  
  # Event Endpoint
  BACKEND_WEBHOOK_URL=http://backend.example.com/api/webhooks/voice/events
  VOICE_WEBHOOK_PUBLIC_URL=http://backend.example.com
  
  # Agent Configuration
  LIVEKIT_AGENT_NAME=maxsas-voice-agent-prod
  
  # Realtime Streaming
  API_BASE_URL=http://backend.example.com
  ```

- [ ] **Agent Server Configuration** (Python/Go agent)
  ```env
  BACKEND_WEBHOOK_URL=http://backend.example.com/api/webhooks/voice/events
  BACKEND_WEBHOOK_AUTH_TOKEN=<same_secure_token>
  ```

- [ ] **Verify Both Sides Match**
  ```bash
  # Backend
  echo $BACKEND_WEBHOOK_AUTH_TOKEN
  
  # Agent Config
  grep BACKEND_WEBHOOK_AUTH_TOKEN agent_config.env
  ```

---

## Phase 4: Testing & Validation 🔄

### Manual Testing

- [ ] **Run Integration Test**
  ```bash
  # Terminal 1: Start backend
  npm run dev
  
  # Terminal 2: Run full lifecycle test
  BACKEND_URL=http://localhost:4000 \
  WEBHOOK_TOKEN="dev_secret_token_livekit_99" \
  TENANT_ID="709b47b6-1dc4-439d-872c-3625fae2374f" \
  node scripts/test-voice-events-integration.mjs
  ```

- [ ] **Check Database**
  ```sql
  -- Verify events were stored
  SELECT COUNT(*), event_type 
  FROM "CallEvent" 
  GROUP BY event_type;
  
  -- Check call outcome
  SELECT 
    id, 
    "callOutcome", 
    confidence, 
    "endedBy", 
    "durationSec"
  FROM "CallSession" 
  ORDER BY "createdAt" DESC 
  LIMIT 5;
  
  -- Check lead extraction
  SELECT * FROM "LeadExtraction" 
  ORDER BY "createdAt" DESC LIMIT 1;
  ```

- [ ] **Verify SSE Stream** (in separate terminal)
  ```bash
  curl -N http://localhost:4000/api/realtime/calls/stream?tenantId=709b47b6-1dc4-439d-872c-3625fae2374f \
    -H "Authorization: Bearer dev-admin-key"
  
  # Should see:
  # event: connected
  # event: heartbeat (every 20s)
  # event: call_event (during test)
  ```

- [ ] **Test Webhook Auth Failure**
  ```bash
  curl -X POST http://localhost:4000/api/webhooks/voice/events \
    -H "Content-Type: application/json" \
    -H "X-Webhook-Auth: Bearer wrong_token" \
    -d '{"event_type":"call_started",...}'
  
  # Should return 401 Unauthorized
  ```

- [ ] **Test Duplicate Event Handling**
  ```bash
  # Send same event_id twice
  # First request → 202 Accepted
  # Second request → 202 Accepted (same event_id) with "accepted: false"
  ```

### Contract Validation

- [ ] **Run Contract Validator**
  ```bash
  npm run test:voice-webhook
  ```

---

## Phase 5: Deployment 🔄

- [ ] **Production Environment Setup**
  ```bash
  # Generate secure token
  openssl rand -base64 32
  
  # Export to production secret manager (AWS Secrets, Azure KV, etc.)
  BACKEND_WEBHOOK_AUTH_TOKEN=<generated_token>
  
  # Update agent config
  # Update DNS/load balancer routing to ensure agent can reach backend
  ```

- [ ] **Monitor Logs**
  ```bash
  # Watch for webhook events
  tail -f backend-logs.txt | grep "voice event"
  
  # Check for failures
  tail -f backend-logs.txt | grep "dispatch failed\|webhook.*error"
  ```

- [ ] **Health Check Endpoint**
  ```bash
  curl http://backend.example.com/api/health
  
  # Should indicate voice webhook ready
  ```

- [ ] **Verify TLS/HTTPS** (if agent is remote)
  ```bash
  # Ensure webhook URL is HTTPS in production
  BACKEND_WEBHOOK_URL=https://backend.example.com/api/webhooks/voice/events
  ```

---

## Phase 6: Monitoring & Alerting 🔄

- [ ] **Key Metrics to Track**
  - Webhook accept rate (events accepted / total received)
  - call_analysis_completed arrival rate (should be ~100%)
  - Average event processing latency
  - SSE subscriber count
  - Re-connection attempts

- [ ] **Alerts to Configure**
  - ⚠️ Webhook auth failure rate > 5%
  - ⚠️ call_analysis_completed missing for > 2 consecutive calls
  - ⚠️ Database transaction failures in voice service
  - ⚠️ SSE connection drop rate > 10%

- [ ] **Logging Rules**
  ```
  [WEBHOOK] voice event accepted → ✅ Normal
  [WEBHOOK] voice event normalized → ✅ Normal
  Voice event persisted → ✅ Normal
  Voice SSE event published → ✅ Normal
  
  Outbound call dispatch failed → ⚠️ Review trunk ID
  Voice webhook DB transaction failed → ⚠️ DB issue
  SIP participant creation failed → ⚠️ LiveKit issue
  ```

---

## Phase 7: Advanced Customization 🔄

### Adding Custom Event Types

When you extend the agent with custom events:

1. **Update Type Definition**
   - Edit [shared/contracts/voice-events.ts](../shared/contracts/voice-events.ts)
   - Add to `VoiceEventType` union
   - Define payload interface

2. **Add Handler**
   - Edit [src/services/voiceEventService.ts](../src/services/voiceEventService.ts)
   - Add to `SUPPORTED_EVENT_TYPES`
   - Add logic in `applyEventPayloadEffects()`

3. **Update Realtime Mapping**
   - Edit [src/services/realtimeService.ts](../src/services/realtimeService.ts)
   - Map event to `LiveCallStage` enum

4. **Test**
   ```bash
   node scripts/test-voice-events-integration.mjs --include-custom
   ```

### Storing Additional Analysis Fields

If agent provides extra fields in `call_analysis_completed`:

1. **Extend LeadExtraction Model**
   ```prisma
   model LeadExtraction {
     // ... existing
     customField1 String?
     customField2 Json?
   }
   ```

2. **Run Migration**
   ```bash
   npx prisma migrate dev --name add_custom_fields
   ```

3. **Update Extractor**
   ```typescript
   // In voiceEventService.ts
   await upsertLeadExtraction({
     // ...
     customField1: payload.custom_field_1,
   });
   ```

---

## Phase 8: Troubleshooting 🔄

### Issue: Events Not Appearing in Database

1. Check webhook auth token matches
2. Verify event envelope has all required fields
3. Check database connection (`DATABASE_URL`)
4. Look for transaction errors in logs

### Issue: SSE Not Streaming Events

1. Verify tenantId is correct
2. Check browser console for EventSource errors
3. Ensure backend is sending keep-alive heartbeats (every 20s)
4. Try different browser (some have SSE issues)

### Issue: call_analysis_completed Not Stored

1. Verify event arrives at webhook endpoint
2. Check CallSession record exists before call_analysis_completed
3. Verify confidence and call_outcome fields in payload
4. Look for parsing errors in logs

### Issue: Lead Data Empty

1. Check lead_extracted event sent separately (optional)
2. Verify call_analysis_completed.lead fields populated by agent
3. Check for typos in field names (preferred_location vs location)

---

## Reference Files

| File | Purpose |
|------|---------|
| [VOICE_EVENTS_INTEGRATION.md](./VOICE_EVENTS_INTEGRATION.md) | Complete integration guide |
| [src/routes/webhooks/voice.ts](../src/routes/webhooks/voice.ts) | Webhook endpoint |
| [src/services/voiceEventService.ts](../src/services/voiceEventService.ts) | Event processing logic |
| [src/routes/realtime.ts](../src/routes/realtime.ts) | SSE streaming endpoint |
| [src/services/realtimeService.ts](../src/services/realtimeService.ts) | Realtime pub/sub |
| [shared/contracts/voice-events.ts](../shared/contracts/voice-events.ts) | Event type definitions |
| [shared/clients/VoiceEventClient.tsx](../shared/clients/VoiceEventClient.tsx) | React client library |
| [scripts/test-voice-events-integration.mjs](../scripts/test-voice-events-integration.mjs) | Integration test |
| [prisma/schema.prisma](../prisma/schema.prisma) | Database schema |

---

## Rollout Timeline

- **Week 1**: Phase 1-2 (Infrastructure + Frontend Integration)
- **Week 2**: Phase 3-4 (Config + Testing)
- **Week 3**: Phase 5-6 (Deployment + Monitoring)
- **Ongoing**: Phase 7-8 (Customization + Optimization)

---

## Success Criteria

✅ Full call lifecycle events (call_started → call_completed) stored in database  
✅ call_analysis_completed event populates callOutcome, confidence, lead data  
✅ Real-time SSE stream working — frontend receives events < 100ms latency  
✅ All 9 event types handled (no unknown event errors)  
✅ Duplicate event handling working (idempotent)  
✅ Webhook auth enforced (401 on bad token)  
✅ Database transaction integrity maintained  
✅ Monitoring and alerts configured  

---

## Next Steps

1. ✅ Review [VOICE_EVENTS_INTEGRATION.md](./VOICE_EVENTS_INTEGRATION.md) for complete technical reference
2. 🔄 Run integration test: `node scripts/test-voice-events-integration.mjs`
3. 🔄 Integrate React client into frontend
4. 🔄 Deploy and monitor in staging environment
5. 🔄 Configure production environment variables
6. 🔄 Enable monitoring & alerting
7. 🔄 Plan custom event types with agent developer

---

**Questions?** → Check [VOICE_EVENTS_INTEGRATION.md](./VOICE_EVENTS_INTEGRATION.md) or review the test script output.
