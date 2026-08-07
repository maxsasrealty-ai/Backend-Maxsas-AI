# Voice Events Integration — Quick Start (5 Minutes)

## TL;DR

Your backend now:
1. ✅ Receives webhook events from the AI Voice Agent Server
2. ✅ Stores them durably in PostgreSQL (CallEvent, CallSession, LeadExtraction, TranscriptSegment)
3. ✅ Streams them real-time to frontend via SSE (GET /api/realtime/calls/stream)
4. ✅ Extracts CRM data (call_outcome, confidence, lead fields) from `call_analysis_completed` event

**Status**: Ready to test now.

---

## Quick Test (2 minutes)

### Terminal 1: Start Backend
```bash
cd /root/new-backend
npm run dev
```

### Terminal 2: Run Integration Test
```bash
cd /root/new-backend

BACKEND_URL=http://localhost:4000 \
WEBHOOK_TOKEN="dev_secret_token_livekit_99" \
TENANT_ID="709b47b6-1dc4-439d-872c-3625fae2374f" \
node scripts/test-voice-events-integration.mjs
```

### Terminal 3: Monitor SSE Stream
```bash
curl -N http://localhost:4000/api/realtime/calls/stream?tenantId=709b47b6-1dc4-439d-872c-3625fae2374f \
  -H "Authorization: Bearer dev-admin-key"
```

**Expected Output**:
- Terminal 2: "8/8 events accepted ✓"
- Terminal 3: Live events from Terminal 2

---

## Frontend Integration (2 minutes)

### Option A: Use React Hook (Easiest)
```typescript
import { useVoiceEventStream } from '@/shared/clients/VoiceEventClient';

export function CallStatus({ callId, tenantId }) {
  const { state } = useVoiceEventStream({
    tenantId,
    onEvent: (event) => {
      if (event.eventType === 'call_analysis_completed') {
        console.log('Call outcome:', event.payload.call_outcome);
        console.log('Confidence:', event.payload.confidence);
      }
    },
  });

  return <div>{state?.status || 'Initializing'}</div>;
}
```

### Option B: Use Component (Drop-in)
```typescript
import { CallMonitor } from '@/shared/clients/VoiceEventClient';

export function CallPage({ callId, tenantId }) {
  return <CallMonitor callId={callId} tenantId={tenantId} />;
}
```

### Option C: Manual Control
```typescript
import VoiceEventClient from '@/shared/clients/VoiceEventClient';

const client = new VoiceEventClient({ tenantId });
client.connect();
// ... later
client.disconnect();
```

---

## Environment Setup (1 minute)

### Backend `.env`
```env
# Webhook Security
BACKEND_WEBHOOK_AUTH_TOKEN=dev_secret_token_livekit_99

# Event Endpoint
BACKEND_WEBHOOK_URL=http://localhost:4000/api/webhooks/voice/events
VOICE_WEBHOOK_PUBLIC_URL=http://localhost:4000

# Agent
LIVEKIT_AGENT_NAME=maxsas-voice-agent-prod
API_BASE_URL=http://localhost:4000
```

### Agent Server Config
```env
BACKEND_WEBHOOK_URL=http://backend.example.com/api/webhooks/voice/events
BACKEND_WEBHOOK_AUTH_TOKEN=dev_secret_token_livekit_99
```

**⚠️ Both tokens MUST match exactly.**

---

## Event Flow at a Glance

```
Agent → POST /api/webhooks/voice/events
        ↓ (verify auth, validate, deduplicate)
        → Database (CallEvent, CallSession, LeadExtraction, TranscriptSegment)
        ↓
        → Real-time Pub/Sub
        ↓
Frontend ← GET /api/realtime/calls/stream (SSE)
```

---

## Database Queries (Verify It Works)

```sql
-- See all events for a call
SELECT event_type, occurred_at FROM "CallEvent" 
WHERE call_id = '<call_id>' 
ORDER BY occurred_at;

-- Check CRM data
SELECT call_outcome, confidence FROM "CallSession" 
WHERE id = '<call_id>';

-- See extracted lead
SELECT property_type, "preferredLocation", budget_range FROM "LeadExtraction" 
WHERE call_id = '<call_id>';

-- See transcript
SELECT speaker, text, sequence_no FROM "TranscriptSegment" 
WHERE call_id = '<call_id>' 
ORDER BY sequence_no;
```

---

## Key Event Types

| Event | When | Contains |
|-------|------|----------|
| `call_started` | Immediately | phone_number, agent_name |
| `call_ringing` | Outbound SIP | status |
| `call_connected` | Target joined | participant_identity |
| `call_active` | Conversation starts | status |
| `call_transcript_final` | Call ends | full transcript turns |
| `lead_extracted` | If leads found | property_type, location, budget, confidence |
| **`call_analysis_completed`** | Always | **call_outcome, confidence, lead.*** ⭐ |
| `call_completed` | Success | ended_by, duration_sec |
| `call_failed` | Exception | error, stage, retryable |

---

## Critical: `call_analysis_completed` Event

**This is the main CRM record. Guaranteed to arrive for every call.**

```json
{
  "event_type": "call_analysis_completed",
  "payload": {
    "call_outcome": "qualified_lead_buy",  // CRM label
    "confidence": 0.89,                     // 0.0 - 1.0
    "lead": {
      "property_type": "apartment",
      "location": "Whitefield, Bangalore",
      "budget": "80L - 1.2Cr",
      "timeline": "short_term"
    },
    "duration_sec": 245,
    "started_at": "2026-05-01T12:00:00Z"
  }
}
```

**Stored in**:
- `CallSession.callOutcome`
- `CallSession.confidence`
- `LeadExtraction.rawJson` (full payload)
- `LeadExtraction` individual fields

---

## Troubleshooting

### "Test failed: webhook not accepted"
1. Check webhook token matches in `.env`
2. Verify backend is running
3. Check logs for "voice event accepted" message

### "Events not in database"
1. Run: `SELECT COUNT(*) FROM "CallEvent";`
2. Check database connection in `.env`
3. Run: `npx prisma migrate deploy` to ensure schema up-to-date

### "SSE not streaming"
1. Verify tenantId is correct
2. Check browser console for EventSource errors
3. Try: `curl -N http://localhost:4000/api/realtime/calls/stream?tenantId=<id>`

### "No call_outcome in CallSession"
1. Verify `call_analysis_completed` event arrived
2. Check `CallEvent` table for event
3. Check database transaction didn't fail

---

## Files You'll Reference

| File | What | When |
|------|------|------|
| [VOICE_EVENTS_INTEGRATION.md](./VOICE_EVENTS_INTEGRATION.md) | Complete technical ref | Need detailed info |
| [VOICE_EVENTS_CHECKLIST.md](./VOICE_EVENTS_CHECKLIST.md) | Step-by-step checklist | Implementing |
| [VOICE_EVENTS_ARCHITECTURE.md](./VOICE_EVENTS_ARCHITECTURE.md) | System overview | Understanding design |
| [scripts/test-voice-events-integration.mjs](../scripts/test-voice-events-integration.mjs) | Integration test | Testing locally |
| [shared/clients/VoiceEventClient.tsx](../shared/clients/VoiceEventClient.tsx) | React client | Building frontend |

---

## Next Steps

1. ✅ Run integration test (see Quick Test above)
2. 🔄 Integrate React client into frontend (see Frontend Integration above)
3. 🔄 Verify call_outcome displays in UI
4. 🔄 Deploy to staging
5. 🔄 Configure production environment
6. 🔄 Enable monitoring

---

## Production Checklist

- [ ] Update `BACKEND_WEBHOOK_AUTH_TOKEN` to random 32-char token
- [ ] Update `BACKEND_WEBHOOK_URL` to production domain (HTTPS)
- [ ] Agent server configured with same token
- [ ] Database connection configured
- [ ] SSE streaming working from production URL
- [ ] Monitoring & alerts enabled
- [ ] Logs reviewed for errors

---

## Support

For more details: See [VOICE_EVENTS_INTEGRATION.md](./VOICE_EVENTS_INTEGRATION.md)

All files are in: `/root/new-backend/docs/` and `/root/new-backend/shared/`

---

**That's it!** Your backend is ready. Start testing now. 🚀
