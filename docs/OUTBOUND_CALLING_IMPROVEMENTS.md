# Outbound Calling Improvements - Implementation Summary

**Date**: April 19, 2026  
**Goal**: Enhance outbound call flow with deterministic trunk resolution, stage-aware structured errors, and comprehensive logging.

---

## 📋 Changes Overview

### 1. **Trunk Resolution with Deterministic Priority** ✅

**File**: [src/lib/config.ts](src/lib/config.ts#L123-L138)

Added `resolveOutboundTrunk()` function that:
- Returns both trunk ID and its source (SIP_OUTBOUND_TRUNK_ID or LIVEKIT_OUTBOUND_TRUNK_ID)
- Follows deterministic priority: SIP first, then LIVEKIT, then error
- Throws `outbound_trunk_missing` error with clear guidance when neither is configured
- Enables structured logging of trunk source for debugging

**Implementation**:
```typescript
export function resolveOutboundTrunk(): { 
  trunkId: string; 
  source: "SIP_OUTBOUND_TRUNK_ID" | "LIVEKIT_OUTBOUND_TRUNK_ID" 
}
```

---

### 2. **Stage-Aware Structured Errors** ✅

**File**: [src/services/telephonyService.ts](src/services/telephonyService.ts)

Created `TelephonyError` class with stage tracking:

```typescript
export type TelephonyErrorStage = 
  | "room_create_failed"
  | "dispatch_create_failed"
  | "sip_participant_create_failed"
  | "outbound_trunk_missing"
  | "config_validation_failed";

export class TelephonyError extends Error {
  constructor(
    public stage: TelephonyErrorStage,
    message: string,
    public context: Record<string, unknown> = {}
  )
}
```

**Stage-specific error handling**:

| Stage | Trigger | Blocking | Recovery |
|-------|---------|----------|----------|
| **room_create_failed** | LiveKit room creation fails | ✓ Yes | Retry job (BullMQ) |
| **sip_participant_create_failed** | SIP participant creation fails | ✓ Yes | Retry job (BullMQ) |
| **dispatch_create_failed** | Agent dispatch fails | ✗ No | Log warning, continue (auto-dispatch via room metadata) |
| **outbound_trunk_missing** | No trunk ID configured | ✓ Yes | Fix env vars |
| **config_validation_failed** | Missing LIVEKIT vars or phone | ✓ Yes | Fix env vars |

---

### 3. **Structured Logging Across All Stages** ✅

**Files Modified**:
- [src/services/telephonyService.ts](src/services/telephonyService.ts) - Telephony dispatch logs
- [src/queue/worker.ts](src/queue/worker.ts) - Job processing logs
- [src/services/callService.ts](src/services/callService.ts#L23-L59) - Call session initiation logs
- [src/routes/calls/create.ts](src/routes/calls/create.ts) - HTTP route logs

**Common context fields in all logs**:
```json
{
  "call_id": "uuid",
  "tenant_id": "uuid",
  "room_id": "string",
  "agent_name": "string",
  "trunk_source": "SIP_OUTBOUND_TRUNK_ID | LIVEKIT_OUTBOUND_TRUNK_ID",
  "error_stage": "room_create_failed | dispatch_create_failed | ...",
  "request_id": "uuid"
}
```

**Key log points**:
1. **Route handler** (`/api/calls`): Request validation, response
2. **Call service**: Call session initiation, queue enqueue
3. **Queue**: Job claimed, dispatch started
4. **Telephony service**: 
   - Trunk resolution with source
   - LiveKit room creation
   - Agent dispatch attempt
   - SIP participant creation
5. **Worker**: Completion/failure with error stage

---

## 📁 Files Changed

### Core Service Files

#### 1. [src/lib/config.ts](src/lib/config.ts)
- **Added**: `resolveOutboundTrunk()` function (lines 123-138)
- **Change**: Deterministic trunk resolution with source tracking
- **Impact**: Non-breaking; config.sipTrunkId still works but now tracked for logs

#### 2. [src/services/telephonyService.ts](src/services/telephonyService.ts)
- **Added**: `TelephonyError` class for stage-specific errors
- **Added**: `TelephonyErrorStage` type definition
- **Changed**: All stages wrapped in try-catch with structured error throwing
- **Changed**: Replaced console.log with logger.info/warn/error
- **Added**: Comprehensive context logging (call_id, tenant_id, room_id, trunk_source, etc.)
- **Preserved**: Non-blocking agent dispatch failure handling
- **Impact**: Backward compatible; errors now carry more context for debugging

#### 3. [src/queue/worker.ts](src/queue/worker.ts)
- **Added**: Import of `TelephonyError` for error stage extraction
- **Changed**: Structured logging with context fields (request_id, tenant_id, job_id)
- **Added**: Per-stage logging: job claimed, dispatch started, session created, etc.
- **Added**: Error logging with error_stage field
- **Changed**: Updated error message format to include stage: `${stage}: ${message}`
- **Impact**: Better visibility into job processing; operator can correlate logs by context fields

#### 4. [src/services/callService.ts](src/services/callService.ts#L23-L59)
- **Added**: Structured context logging (tenant_id, room_id, phone_number, agent_name)
- **Added**: Log at initiation start, request creation, queue enqueue, and error
- **Changed**: Better error messages with full context
- **Impact**: Clearer trace from HTTP request through to queue

#### 5. [src/routes/calls/create.ts](src/routes/calls/create.ts)
- **Changed**: Replaced console.log with structured logger calls
- **Added**: Context fields (request_id, tenant_id, room_id, phone_number, agent_name)
- **Added**: Validation failure logging with missing fields list
- **Added**: Error type and code in error logs
- **Impact**: Consistent logging across HTTP boundary

---

## 🧪 Tests Added

### 1. [scripts/test-outbound-trunk-resolution.mjs](scripts/test-outbound-trunk-resolution.mjs)

**Purpose**: Validate trunk resolution logic

**Test Cases**:
- ✅ Primary trunk (SIP_OUTBOUND_TRUNK_ID) wins over secondary
- ✅ Fallback to LIVEKIT_OUTBOUND_TRUNK_ID when SIP not set
- ✅ Only primary set works
- ✅ Error when no trunk IDs configured

**How to run**:
```bash
node scripts/test-outbound-trunk-resolution.mjs
```

### 2. [scripts/test-outbound-failures.mjs](scripts/test-outbound-failures.mjs)

**Purpose**: Validate failure scenarios and structured errors

**Test Cases**:
- ✅ Missing phone number (config_validation_failed)
- ✅ Invalid phone format handling
- ✅ Valid request queuing

**How to run**:
```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Run tests
TEST_PHONE_NUMBER="+919999999999" node scripts/test-outbound-failures.mjs
```

---

## 🔍 Verification Commands

### 1. **Verify Imports Compile**
```bash
npx tsx --eval "
  import { resolveOutboundTrunk } from './src/lib/config.ts';
  import { TelephonyError } from './src/services/telephonyService.ts';
  console.log('✓ All imports OK');
"
```

### 2. **Start Backend and Verify Logs**
```bash
npm run dev 2>&1 | tee backend-dev.log
```

**Monitor for**:
- `"stage":"room_create_failed"` - Room creation errors
- `"trunk_source":"SIP_OUTBOUND_TRUNK_ID"` - Trunk source tracking
- `"error_stage":"sip_participant_create_failed"` - SIP errors
- `"call_id"` - Call context in every log

### 3. **Test Trunk Resolution**
```bash
# Test 1: SIP takes priority
SIP_OUTBOUND_TRUNK_ID=ST_PRIMARY LIVEKIT_OUTBOUND_TRUNK_ID=ST_FALLBACK \
  node scripts/test-outbound-trunk-resolution.mjs

# Test 2: LIVEKIT fallback
unset SIP_OUTBOUND_TRUNK_ID
LIVEKIT_OUTBOUND_TRUNK_ID=ST_FALLBACK \
  node scripts/test-outbound-trunk-resolution.mjs

# Test 3: Missing trunk error
unset SIP_OUTBOUND_TRUNK_ID
unset LIVEKIT_OUTBOUND_TRUNK_ID \
  node scripts/test-outbound-trunk-resolution.mjs
```

### 4. **Test Outbound Call Flow**
```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Test call initiation
TEST_TENANT_ID="lexus-demo" \
TEST_PHONE_NUMBER="+918882453059" \
  node scripts/test-outbound-call.mjs

# Terminal 3: Monitor telephony logs
tail -f backend-dev.log | grep -E '(telephony|room_create|sip_participant|trunk_source|call_id)'
```

### 5. **Test Failure Scenarios**
```bash
npm run dev &
sleep 2

# Test with backend running
TEST_PHONE_NUMBER="+919999999999" \
  node scripts/test-outbound-failures.mjs
```

---

## 📊 Log Examples

### Success Flow
```json
{"ts":"2026-04-19T05:30:00.000Z","level":"info","message":"Initiating call session","tenant_id":"lexus-demo","room_id":"room_123","phone_number":"+918882453059","agent_name":"maxsas-voice-agent-prod"}
{"ts":"2026-04-19T05:30:00.100Z","level":"info","message":"Outbound call request created","call_id":"abc-123","status":"queued"}
{"ts":"2026-04-19T05:30:00.200Z","level":"info","message":"Processing outbound call job","request_id":"abc-123","tenant_id":"lexus-demo"}
{"ts":"2026-04-19T05:30:00.300Z","level":"info","message":"Trunk resolution succeeded","call_id":"abc-123","trunk_source":"SIP_OUTBOUND_TRUNK_ID"}
{"ts":"2026-04-19T05:30:00.400Z","level":"info","message":"LiveKit room created","call_id":"abc-123","room_name":"room_123"}
{"ts":"2026-04-19T05:30:00.500Z","level":"info","message":"SIP participant created","call_id":"abc-123","sip_trunk_id":"ST_EPQHdYRSkF2f"}
```

### Failure Flow (Room Creation Fails)
```json
{"ts":"2026-04-19T05:30:00.300Z","level":"error","message":"LiveKit room creation failed","call_id":"abc-123","stage":"room_create_failed","error":"Connection refused"}
{"ts":"2026-04-19T05:30:00.350Z","level":"error","message":"Outbound call dispatch failed","request_id":"abc-123","error_stage":"room_create_failed"}
```

### Trunk Resolution Failure
```json
{"ts":"2026-04-19T05:30:00.250Z","level":"error","message":"Trunk resolution failed","call_id":"abc-123","stage":"outbound_trunk_missing","error":"Neither SIP_OUTBOUND_TRUNK_ID nor LIVEKIT_OUTBOUND_TRUNK_ID is configured"}
```

---

## ✅ Backward Compatibility

All changes are **fully backward compatible**:

1. ✅ **config.sipTrunkId** still works as before
2. ✅ **HTTP contracts** unchanged (POST /api/calls request/response)
3. ✅ **DB schema** unchanged (no migration needed)
4. ✅ **Queue interface** unchanged (same job shape)
5. ✅ **Agent dispatch** non-blocking behavior preserved
6. ✅ **Tenant scoping** preserved in all operations
7. ✅ **SSE behavior** unchanged
8. ✅ **Payment/admin** modules untouched

---

## 🚀 Deployment Notes

### Pre-deployment Checklist
- [ ] Verify both trunk env vars are set (or at least one)
- [ ] Verify LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are set
- [ ] Run trunk resolution test to validate env setup
- [ ] Check logs during test call for structured error stages

### During Rollout
1. Deploy code to dev environment first
2. Run `test-outbound-trunk-resolution.mjs` to validate trunk setup
3. Make a test call and monitor logs for new error stage fields
4. Verify agent dispatch still works despite non-blocking error handling
5. Roll out to staging with gradual traffic increase
6. Monitor for any telephony errors with new stage field

### Monitoring/Alerting
After deployment, set up alerts for:
- `"stage":"room_create_failed"` - Critical, indicates LiveKit issues
- `"stage":"sip_participant_create_failed"` - Critical, SIP gateway issues
- `"stage":"outbound_trunk_missing"` - Critical, env var misconfiguration
- `"stage":"dispatch_create_failed"` - Warning level (non-blocking, but indicates potential issues)

---

## 📝 Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Trunk resolution** | Implicit fallback | Explicit with source tracking |
| **Error handling** | Generic messages | Stage-specific structured errors |
| **Logging** | console.log scattered | Structured logger with context |
| **Debugging** | Hard to trace (no call_id in logs) | Easy (call_id, tenant_id, room_id in all logs) |
| **Failure classification** | Unclear what failed | Clear stage + error type |
| **Operator experience** | Manual log parsing | Structured fields for aggregation |

---

## 📚 Related Documentation

- [LiveKit Room Concepts](https://docs.livekit.io/home/client/concepts/)
- [LiveKit SIP API](https://docs.livekit.io/home/server/sip/)
- [Agent Framework](https://docs.livekit.io/home/agents/)
- [Backend Architecture Notes](docs/VPS_AGENT_INTEGRATION.md)
