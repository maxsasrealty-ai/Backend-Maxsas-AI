# Voice Events Integration Guide

## Architecture Overview

The Node.js backend receives real-time voice events from the LiveKit AI Voice Agent Server via HTTP webhooks, validates them, stores them durably, and streams them to the frontend via Server-Sent Events (SSE) for real-time UI updates.

### Event Flow Architecture

```
Agent Server (Voice Events)
    ↓ (POST /api/webhooks/voice/events)
    ↓
Webhook Ingestion Endpoint
    ↓ (verify auth token, validate envelope)
    ↓
Voice Event Service
    ├─ Store in DB (CallEvent, CallSession, TranscriptSegment)
    ├─ Extract & persist specialized payloads (LeadExtraction, CallOutcome)
    └─ Publish to Real-time Stream
    ↓
Realtime Service (SSE/WebSocket)
    ↓
Frontend UI (Real-time Call Flow Tracking)
```

---

## Secure Webhook Ingestion Endpoint

### Endpoint: `POST /api/webhooks/voice/events`

**Authentication**: Bearer Token (X-Webhook-Auth header or Authorization header)

**Location**: [src/routes/webhooks/voice.ts](../src/routes/webhooks/voice.ts)

### Request Format

```bash
curl -X POST http://localhost:4000/api/webhooks/voice/events \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Auth: Bearer <BACKEND_WEBHOOK_AUTH_TOKEN>" \
  -H "X-Event-Id: <event_id_uuid>" \
  -H "X-Call-Id: <call_id>" \
  -H "X-Occurred-At: <iso8601_timestamp>" \
  -d '{
    "event_id": "<unique_uuid>",
    "event_type": "call_started",
    "tenant_id": "<tenant_uuid>",
    "call_id": "<call_uuid>",
    "room_id": "<livekit_room_name>",
    "occurred_at": "2026-05-01T12:00:00Z",
    "payload": {
      "phone_number": "+918882453059",
      "agent_name": "maxsas-voice-agent-prod",
      "direction": "outbound",
      "status": "started"
    }
  }'
```

### Event Types

The agent emits the following event sequence (normal call flow):

```
call_started
  ↓
call_ringing (outbound SIP only)
  ↓
call_connected
  ↓
call_active
  ↓
call_transcript_final
  ↓
[lead_extracted] (optional, only if lead fields detected)
  ↓
call_analysis_completed (always sent, contains final CRM record)
  ↓
call_completed (success) OR call_failed (exception)
```

### Event Type Details

#### 1. `call_started`
First event in every call. Indicates session initialization.

```json
{
  "event_type": "call_started",
  "payload": {
    "phone_number": "+918882453059",
    "agent_name": "maxsas-voice-agent-prod",
    "direction": "outbound",
    "status": "started"
  }
}
```

#### 2. `call_ringing`
Outbound SIP only. Target is ringing.

```json
{
  "event_type": "call_ringing",
  "payload": {
    "status": "call_ringing",
    "direction": "outbound",
    "agent_name": "maxsas-voice-agent-prod",
    "phone_number": "+918882453059"
  }
}
```

#### 3. `call_connected`
Target participant has joined the LiveKit room.

```json
{
  "event_type": "call_connected",
  "payload": {
    "status": "call_connected",
    "direction": "outbound",
    "agent_name": "maxsas-voice-agent-prod",
    "participant_identity": "sip-<call_id>"
  }
}
```

#### 4. `call_active`
Session started, first greeting queued.

```json
{
  "event_type": "call_active",
  "payload": {
    "status": "call_active",
    "direction": "outbound",
    "agent_name": "maxsas-voice-agent-prod"
  }
}
```

#### 5. `call_transcript_final`
Full conversation transcript. Sent after call ends.

```json
{
  "event_type": "call_transcript_final",
  "payload": {
    "turns": [
      {
        "speaker": "agent",
        "text": "Hello, is this a good time to talk about your real estate needs?",
        "sequenceNo": 1
      },
      {
        "speaker": "person",
        "text": "Yes, I'm interested in a 3 BHK apartment.",
        "sequenceNo": 2
      }
    ],
    "transcript_turns": 2
  }
}
```

#### 6. `lead_extracted` (Optional)
Only sent if at least one lead field is extractable. Confidence scores provided.

```json
{
  "event_type": "lead_extracted",
  "payload": {
    "property_type": "apartment",
    "preferred_location": "Whitefield, Bangalore",
    "budget_range": "80L - 1.2Cr",
    "purchase_timeline": "3-6 months",
    "confidence": {
      "overall": 0.92,
      "threshold": 0.75,
      "attempt": 1
    }
  }
}
```

#### 7. `call_analysis_completed` ⭐ **Primary CRM Record**
Always sent. Contains final analysis, outcome label, and confidence score.

```json
{
  "event_type": "call_analysis_completed",
  "payload": {
    "call_id": "<call_uuid>",
    "started_at": "2026-05-01T12:00:00Z",
    "duration_sec": 245,
    "status": "completed",
    "lead": {
      "property_type": "apartment",
      "location": "Whitefield, Bangalore",
      "budget": "80L - 1.2Cr",
      "timeline": "short_term"
    },
    "call_outcome": "qualified_lead_buy",
    "confidence": 0.89
  }
}
```

**CRM Outcome Labels**:
- `call_failed`, `busy_line`, `invalid_number`, `voicemail_detected`
- `user_no_response`, `wrong_person`
- `not_available_callback_requested`, `not_interested`, `already_purchased`
- `budget_not_decided`, `timeline_long_term`
- `details_requested`, `advisor_callback_scheduled`
- `qualified_lead_buy`, `site_visit_scheduled`

#### 8. `call_completed`
Success path. Last event in normal flow.

```json
{
  "event_type": "call_completed",
  "payload": {
    "status": "completed",
    "ended_by": "participant_disconnected",
    "duration_sec": 245,
    "transcript_turns": 8,
    "recording_url": null
  }
}
```

#### 9. `call_failed`
Exception path. Replaces `call_completed` on unhandled error.

```json
{
  "event_type": "call_failed",
  "payload": {
    "status": "failed",
    "error": "Max duration timeout (30m exceeded)",
    "stage": "runtime_max_duration",
    "retryable": false
  }
}
```

---

## Real-Time Event Streaming to Frontend

### Option 1: Server-Sent Events (SSE) — **Recommended**

**Endpoint**: `GET /api/realtime/calls/stream`

**Query Parameters**:
- `tenantId` (required) — Tenant UUID
- `adminKey` (optional) — Admin API key for admin-scoped streaming

**Example Client Code** (React):

```typescript
import { useEffect, useState } from 'react';

export function CallMonitor({ tenantId, callId }) {
  const [events, setEvents] = useState<RealtimeCallEvent[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/realtime/calls/stream?tenantId=${tenantId}`,
      {
        headers: { 'x-tenant-id': tenantId }
      }
    );

    eventSource.addEventListener('call_event', (e: MessageEvent) => {
      const event = JSON.parse(e.data) as RealtimeCallEvent;
      
      // Filter to current call
      if (event.callId === callId) {
        setEvents(prev => [...prev, event]);
        
        // Update UI based on event type
        switch(event.eventType) {
          case 'call_started':
            console.log('Call starting...');
            break;
          case 'call_active':
            console.log('Call active - conversation in progress');
            break;
          case 'call_transcript_final':
            console.log('Transcript:', event.payload);
            break;
          case 'call_analysis_completed':
            console.log('Analysis complete:', event.payload);
            break;
          case 'call_completed':
            console.log('Call ended');
            break;
          case 'call_failed':
            console.log('Call failed:', event.payload.error);
            break;
        }
      }
    });

    eventSource.addEventListener('heartbeat', (e: MessageEvent) => {
      console.log('Heartbeat:', JSON.parse(e.data));
    });

    eventSource.addEventListener('error', () => {
      console.error('SSE connection error');
      eventSource.close();
    });

    return () => eventSource.close();
  }, [tenantId, callId]);

  return (
    <div className="call-monitor">
      {events.map(e => (
        <div key={e.streamEventId} className="event">
          <span className="type">{e.eventType}</span>
          <span className="state">{e.callState}</span>
        </div>
      ))}
    </div>
  );
}
```

**Event Format** (SSE message):

```
id: evt_abc123
event: call_event
data: {
  "streamEventId": "evt_abc123",
  "tenantId": "tenant-uuid",
  "callId": "call-uuid",
  "roomId": "room-name",
  "occurredAt": "2026-05-01T12:00:00Z",
  "eventType": "call_active",
  "callState": "active",
  "stage": "in_progress",
  "payload": { ... }
}
```

**Heartbeat** (every 20s):

```
event: heartbeat
data: {"ts": "2026-05-01T12:00:20Z"}
```

### Option 2: WebSocket (Future Enhancement)

Currently SSE is the primary mechanism. WebSocket support can be added later for bidirectional communication if needed.

---

## Database Schema

### `CallEvent`
Immutable log of every voice event.

```prisma
model CallEvent {
  id             String         @id @default(uuid())
  callId         String         // FK to CallSession
  tenantId       String
  eventType      VoiceEventType // call_started, call_active, etc.
  occurredAt     DateTime       // When event occurred (from agent)
  eventId        String         @unique // Dedup key
  payloadJson    Json?          // Raw event payload
  rawEnvelope    Json?          // Full request envelope
  rawHeaders     Json?          // Request headers
  normalizedJson Json?          // Normalized version (future)
  createdAt      DateTime       @default(now())
  callSession    CallSession    @relation(fields: [callId], references: [id])
  tenant         Tenant         @relation(fields: [tenantId], references: [id])

  @@index([tenantId, callId, eventType, occurredAt])
}
```

### `CallSession`
High-level call record with outcome & metrics.

```prisma
model CallSession {
  id              String              @id @default(uuid())
  tenantId        String
  externalCallId  String?
  roomId          String
  phoneNumber     String?
  agentName       String?
  direction       String?
  status          CallLifecycleStatus @default(initiated)
  initiatedAt     DateTime            @default(now())
  connectedAt     DateTime?
  completedAt     DateTime?
  failedAt        DateTime?
  durationSec     Int?
  transcriptTurns Int?
  recordingUrl    String?
  estimatedCost   Decimal?
  lastError       String?
  
  // CRM Fields (from call_analysis_completed)
  callOutcome     String?             // qualified_lead_buy, not_interested, etc.
  endedBy         String?             // participant_disconnected, etc.
  confidence      Float?              // 0.0 - 1.0

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  events          CallEvent[]
  leadExtraction  LeadExtraction?
  transcriptSegments TranscriptSegment[]
  // ... other relations
}
```

### `LeadExtraction`
Normalized lead fields from call_analysis_completed.

```prisma
model LeadExtraction {
  id                String      @id @default(uuid())
  callId            String      @unique
  tenantId          String
  extractedAt       DateTime
  
  // Normalized from call_analysis_completed.lead
  name              String?
  phone             String?
  summary           String?
  propertyType      String?
  preferredLocation String?
  budgetRange       String?
  timeline          String?
  confidence        Float?
  
  rawJson           Json?       // Full call_analysis_completed payload
  createdAt         DateTime    @default(now())
  callSession       CallSession @relation(fields: [callId], references: [id])
  tenant            Tenant      @relation(fields: [tenantId], references: [id])
}
```

### `TranscriptSegment`
Immutable transcript turns, indexed for search.

```prisma
model TranscriptSegment {
  id                String      @id @default(uuid())
  callId            String
  tenantId          String
  speaker           Speaker     // "agent" | "person"
  text              String
  isFinal           Boolean     @default(false)
  sequenceNo        Int
  rawJson           Json?
  occurredAt        DateTime
  createdAt         DateTime    @default(now())
  callSession       CallSession @relation(fields: [callId], references: [id])

  @@unique([callId, sequenceNo])
  @@index([tenantId, callId, sequenceNo])
}
```

---

## Data Flow: call_analysis_completed → Database

When `call_analysis_completed` event arrives:

1. **CallEvent** record created (immutable log)
2. **CallSession** updated:
   - `callOutcome` = payload.call_outcome
   - `confidence` = payload.confidence
   - `completedAt` = payload.started_at + duration_sec
   - `durationSec` = payload.duration_sec
3. **LeadExtraction** upserted (overwrites previous lead_extracted if exists):
   - propertyType, preferredLocation, budgetRange, timeline from payload.lead.*
   - Full payload stored in rawJson for audit/redo
4. **RealtimeService** publishes event to SSE subscribers
   - Frontend receives `call_analysis_completed` event immediately
   - Can extract CRM fields and display call outcome

---

## Error Handling & Retry Logic

### Webhook Validation Errors

If incoming request fails validation:
- Returns `400 Bad Request` with detailed error reasons
- Event NOT stored
- Agent should retry with corrected payload

### Duplicate Event Handling

If `event_id` already exists:
- Returns `202 Accepted` with `accepted: false`
- Prevents double-processing of retried webhooks
- Uses in-memory Set + DB dedup check

### Non-Retriable Errors

- Invalid `tenant_id` format
- Missing required fields
- Webhook auth token mismatch

### Retriable Errors

- DB connection timeout
- Redis temporarily unavailable

---

## Adding New Event Types

When the agent is customized with new event types:

### Step 1: Update Type Definition
**File**: [shared/contracts/voice-events.ts](../shared/contracts/voice-events.ts)

```typescript
export type VoiceEventType =
  | "call_started"
  | "custom_event_new"  // Add here
  | "call_completed";

export interface CustomEventPayload {
  custom_field: string;
  // ... define structure
}
```

### Step 2: Update Payload Union
```typescript
export type VoiceEventPayload =
  | CallStartedPayload
  | CustomEventPayload  // Add here
  | CallCompletedPayload;
```

### Step 3: Update Voice Event Service
**File**: [src/services/voiceEventService.ts](../src/services/voiceEventService.ts)

```typescript
const SUPPORTED_EVENT_TYPES: Set<VoiceEventType> = new Set([
  "call_started",
  "custom_event_new",  // Add here
  "call_completed",
]);

// Add handler in applyEventPayloadEffects()
if (event.eventType === "custom_event_new") {
  const payload = event.payload as CustomEventPayload;
  // Process and store payload
}
```

### Step 4: Update Realtime Mapping
**File**: [src/services/realtimeService.ts](../src/services/realtimeService.ts)

```typescript
function stageFromVoiceEvent(event: NormalizedVoiceEvent): LiveCallStage {
  switch (event.eventType) {
    case "custom_event_new":
      return "custom_stage";  // Add here
    case "call_completed":
      return "completed";
  }
}
```

---

## Testing & Validation

### Manual Webhook Test
```bash
./scripts/test-voice-webhook.mjs
```

### SSE Stream Test
```bash
curl -N http://localhost:4000/api/realtime/calls/stream?tenantId=<tenant_id> \
  -H "Authorization: Bearer <admin_key>"
```

### Contract Validation
```bash
./scripts/test-contract-validation.mjs
```

---

## Environment Configuration

**Required**:
```env
BACKEND_WEBHOOK_AUTH_TOKEN=<secure_token>
VOICE_WEBHOOK_PUBLIC_URL=http://backend.example.com
API_BASE_URL=http://localhost:4000
LIVEKIT_AGENT_NAME=maxsas-voice-agent-prod
```

**Used by Agent**:
```env
BACKEND_WEBHOOK_URL=http://backend.example.com/api/webhooks/voice/events
BACKEND_WEBHOOK_AUTH_TOKEN=<secure_token>
```

---

## Monitoring & Alerts

### Logs to Watch
```
[WEBHOOK] voice event accepted — All events accepted
[WEBHOOK] voice event normalized — Event successfully parsed
Voice event persisted — DB write succeeded
Voice SSE event published — Real-time subscribers notified
```

### Critical Events
- `call_analysis_completed` missing or malformed → Outcome cannot be recorded
- `call_failed` with `retryable: true` → Consider agent restart
- Duplicate `event_id` → Webhook retry detected (expected behavior)

---

## References

- [Voice Event Contracts](../shared/contracts/voice-events.ts)
- [Webhook Route](../src/routes/webhooks/voice.ts)
- [Event Processing Service](../src/services/voiceEventService.ts)
- [Realtime Streaming](../src/routes/realtime.ts)
- [Database Schema](../prisma/schema.prisma)
