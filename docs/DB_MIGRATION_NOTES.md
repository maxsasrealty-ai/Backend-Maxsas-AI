# PostgreSQL Migration Steps

## Monorepo Root Prisma (Exact)

- Schema path: `backend/prisma/schema.prisma`
- Root-safe pull (recommended):
   - `npm run backend:prisma:pull`
- Direct root command with explicit schema + Neon URL:
   - `npx prisma db pull --schema backend/prisma/schema.prisma --url "postgresql://neondb_owner:npg_ChDmfM17WcYz@ep-jolly-moon-anui4kjq-pooler.c-6.us-east-1.aws.neon.tech/neondb?schema=public&sslmode=require"`

1. Set PostgreSQL connection:
   - `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public`
2. Regenerate Prisma client from updated schema:
   - `cd backend`
   - `npx prisma generate`
3. Create and apply migration:
   - `npx prisma migrate dev --name postgres_uuid_jsonb_timestamptz`
4. Validate schema + migration state:
   - `npx prisma validate`
   - `npx prisma migrate status`
5. Deploy migrations to production:
   - `npx prisma migrate deploy`

# Schema Decisions

- Database provider: PostgreSQL only (`datasource db.provider = postgresql`)
- ID strategy: all primary IDs and FK IDs use UUID (`String @db.Uuid`, `@default(uuid())` on PKs)
- Event/call compatibility: `call_session.external_call_id` added for provider IDs while internal PK remains UUID
- JSON strategy: all payload/raw blobs use `Json @db.JsonB`
- Time strategy: all datetime fields use `DateTime @db.Timestamptz(6)`
- Multi-tenant safety: tenant-scoped relations and tenant-scoped indexes on all high-traffic tables
- Delete behavior:
  - `onDelete: Cascade` for tenant-owned records
  - `onDelete: SetNull` for optional references (e.g., source call, outbound request link)

# Index Strategy

## Mandatory Tenant Indexes
- Single-column tenant indexes on all tenant-scoped tables:
  - user, wallet_transaction, call_session, call_event, transcript_segment, lead_extraction, usage_record, outbound_call_request, campaign, campaign_call, campaign_contact

## High-Write Time-Series Indexes
- `(tenant_id, created_at)` on:
  - user, wallet_transaction, call_session, call_event, transcript_segment, lead_extraction, usage_record, outbound_call_request, campaign, campaign_call, campaign_contact

## Call/Transcript/Event Access Indexes
- `(call_id, sequence_no)` on transcript_segment
- `(tenant_id, call_id, event_type, occurred_at)` on call_event
- `(tenant_id, status)` and `(tenant_id, initiated_at)` on call_session

## Uniqueness/Idempotency
- `call_event.event_id` unique
- `transcript_segment(call_id, sequence_no)` unique
- `lead_extraction.call_id` unique
- `wallet_transaction(tenant_id, reference_id)` unique
- `usage_record(tenant_id, call_id, usage_type, source_event_id)` unique
- `call_session(tenant_id, external_call_id)` unique

# Required Application Refactors After Schema Cutover

1. Call identity split:
   - Replace direct usage of `call_session.id = external call_id`
   - Use internal UUID `id` for relations and persistence
   - Store provider call identifier in `call_session.external_call_id`
2. JSON writes:
   - Repositories currently pass serialized strings for payload/raw fields
   - Update to pass objects directly (`Prisma.InputJsonValue`) for JsonB columns
3. Tenant config field:
   - `workspaceConfigJson` changed to JsonB
   - Remove manual JSON stringify/parse for this field in repository/service paths
4. UUID input validation:
   - Validate path/body IDs used for UUID-keyed tables before Prisma queries
5. Event dedup query:
   - Keep dedup by `event_id` as primary idempotency key
   - Use composite index query as secondary guard only

# Tenant Isolation Enforcement Strategy

- Repository boundary rule: tenant-scoped tables require `tenantId` in method signature.
- Query rule: every read/update/delete query on tenant-scoped tables includes `tenantId` in `where`.
- Update rule: use `updateMany` with `{ id, tenantId }` for tenant-scoped mutation safety.
- Input rule: `tenantId` validated as UUID before database access.

# Transaction Boundaries

- Webhook ingestion transaction:
   - `processNormalizedVoiceEvent` wraps call-session resolution, event insert, transcript upsert, lead upsert, and state transition in a single Prisma transaction.
- Call completion billing transaction:
   - `call_completed` state transition executes wallet idempotent debit within the same transaction path.
   - Debit idempotency key: `call_debit_<internal_call_uuid>`.

# Call Identity Model

- `call_session.id`: internal UUID primary key for all relations.
- `call_session.external_call_id`: provider/webhook identifier.
- Resolution order for webhook events:
   - Match by `(tenant_id, external_call_id)`.
   - Fallback to internal UUID match when external equals internal legacy value.
   - Bind `external_call_id` on first successful legacy fallback.

# Queue Architecture

- Queue engine: BullMQ + Redis.
- Queue name: `outbound-call-queue`.
- Producer: `src/queue/producer.ts` enqueues one job per `outbound_call_request.id`.
- Worker: `src/queue/worker.ts` consumes jobs and drives lifecycle:
   - `queued` -> `dispatching`
   - mock dispatch API call
   - on success: create `call_session`, mark request `dispatched`
   - on failure: mark request `failed`, persist error message
- API trigger: `initiateCallSession` now creates `outbound_call_request` and enqueues background job.

# Retry Strategy

- Attempts: `3`
- Backoff: `exponential`
- Initial delay: `1000ms`
- Job idempotency key: `outbound-call:<request_id>`

# Failure Handling

- Dispatch failures update `outbound_call_request.status = failed`.
- Error details written to `outbound_call_request.error_message`.
- Duplicate or already-processed jobs are ignored safely:
   - job lock via BullMQ `jobId`
   - DB claim step requires current status `queued` before moving to `dispatching`.

# Plan vs Feature Mapping

- lexus:
   - `campaign_calls`: `false`
   - `analytics`: `limited`
- enterprise:
   - `campaign_calls`: `true`
   - `analytics`: `full`

# Plan Enforcement Strategy

- Utility: `src/services/planFeatureService.ts`
   - `getTenantFeatures(tenant)` resolves feature flags from `tenant.plan`.
   - `enforceFeature(featureName)` blocks unauthorized feature access.
- Middleware: `src/middleware/requireFeature.ts`
   - Resolves tenant and plan, applies `enforceFeature`, returns `403` on denial.
- Campaign call enforcement:
   - `createTenantCampaign` and `updateTenantCampaign` enforce `campaign_calls` before campaign-call attachment.
- Analytics enforcement:
   - `GET /api/enterprise/analytics` requires `analytics=full` and rejects lexus tenants.

# Feature Override Strategy

- Tenant-level overrides are stored in `tenant.features_json` (JsonB).
- Override keys supported:
   - `campaign_calls` (boolean)
   - `analytics` (`limited` | `full`)
- Helper: `setTenantFeature(tenantId, feature, value)` writes one feature override while preserving existing override keys.

# Feature Merge Logic

- Resolution order for effective feature flags:
   1. Resolve plan defaults from `tenant.plan` (`lexus` or `enterprise`).
   2. Parse and validate `tenant.features_json`.
   3. Apply only valid override keys on top of plan defaults.
- Backward compatibility:
   - If `features_json` is missing, null, or invalid, effective features fall back to plan defaults.

# Frontend Call Lifecycle UI Architecture

- Lexus lifecycle UI (`app/(protected)/lexus/calls.tsx`):
   - Minimal lifecycle list for `queued`, `ringing`, `completed`, `failed`.
   - Live status updates come from the existing SSE stream consumer (`/api/realtime/calls/stream`) via `CallsContext`.
   - Basic lead output is fetched per completed call with `GET /api/calls/:callId/lead`.

- Enterprise lifecycle UI (`app/(protected)/enterprise/calls.tsx`):
   - Call list + selection pane (live states from SSE-backed `CallsContext`).
   - Timeline panel from `GET /api/calls/:callId` (`eventSummary` over `call_event`).
   - Transcript viewer from `GET /api/calls/:callId/transcript` (`transcript_segment`).
   - Lead extraction panel from `GET /api/calls/:callId/lead` (`lead_extraction`).
   - Campaign linkage panel:
      - `GET /api/campaigns`
      - `GET /api/campaigns/:id/calls`
      - UI links selected call to matching `campaign_call` records.

# Plan-Based Rendering Strategy (Frontend)

- Lexus tenants:
   - Render minimal lifecycle UI only (simple status list + basic lead output).
   - No transcript/timeline/campaign analytics panels.

- Enterprise tenants:
   - Render full lifecycle analytics UI (timeline, transcript, lead extraction, campaign linkage).

- Runtime gate:
   - Rendering mode is decided from capability/workspace context (`workspaceType` + feature checks).
   - SSE transport remains identical across plans; only panel composition differs.

# Verified Realtime Event Flow (Code-Level)

1. Incoming webhook:
   - `POST /api/webhooks/voice/events` -> `backend/src/modules/voice-events/voice-events.router.ts`
2. Validation:
   - `voiceEventEnvelopeSchema.safeParse(parsedBody)`
3. Service handoff:
   - `ingestVoiceEvent({ eventId, headers, rawBody, envelope })`
4. DB writes in `ingestVoiceEvent`:
   - tenant ensure (`ensureTenant`)
   - `callSession.upsert`
   - `callEvent.create`
   - conditional updates: `transcriptSegment.upsert`, `leadExtraction.upsert`, `callSession.update`, usage/billing hooks
5. Realtime endpoint/listener path:
   - SSE endpoint `GET /api/realtime/calls/stream` -> `subscribeRealtimeEvents(tenantId, listener)`
   - in-memory tenant map: `listenersByTenant: Map<tenantId, Set<listener>>`
   - broadcast function exists: `publishRealtimeVoiceEvent(event)`
6. Frontend consume path:
   - EventSource listens to `call_event` on `/api/realtime/calls/stream`
   - parser: `parseRealtimeCallEvent`
   - state updates via `upsertCallSummary` + `applyLiveEvent`

# Missing / Broken Steps (Findings)

- Broken publish link:
   - Active webhook path (`modules/voice-events`) never calls `publishRealtimeVoiceEvent()`.
   - Result: DB persists, SSE stream receives nothing.

- Flow split / dead-path mismatch:
   - `publishRealtimeVoiceEvent()` is called only in legacy `backend/src/services/voiceEventService.ts` via `processNormalizedVoiceEvent`.
   - Legacy route file `backend/src/routes/webhooks/voice.ts` is not mounted in active router.

- Missing normalization stage in active flow:
   - Active webhook flow has validation + direct ingest, but no explicit normalized event object passed to realtime layer.

- State/stage shape drift risk (if publish is later wired to current mapper as-is):
   - `realtimeService.stateFromVoiceEvent` and `stageFromVoiceEvent` do not map `call_ringing` / `call_connected` explicitly.
   - They fall through to default (`active` / `in_progress`).

- Tenant scope verified:
   - Listener registry is tenant-keyed and SSE subscription is tenant-scoped.
   - Potential delivery drop remains if webhook `tenant_id` differs from stream tenant selection.

# Schema Recovery + DB Reset Fix

- Replaced corrupted Prisma schema that contained only `playing_with_neon`.
- Restored backend-required models and relations used by repositories/services:
   - `Tenant`
   - `CallSession`
   - `CallEvent`
   - `TranscriptSegment`
   - `LeadExtraction`
   - `Campaign`
   - `CampaignCall`
   - `CampaignContact`
   - `WalletTransaction`
   - `OutboundCallRequest`
   - `UsageRecord`
- Restored enums used by runtime code:
   - `PlanKey`, `CallLifecycleStatus`, `VoiceEventType`, `Speaker`
   - `CampaignStatus`, `OutboundRequestStatus`
   - `WalletTransactionType`, `WalletTransactionStatus`
   - `UsageType`, `UsageRecordStatus`
- Kept Prisma client generator output path as:
   - `backend/src/generated/prisma`
- Added minimal safety/runtime hardening:
   - graceful handling for missing tenant in billing/debit flows (`TENANT_NOT_FOUND` result instead of crash)
   - minimal DB connection readiness/failure logs in Prisma bootstrap
   - minimal DB transaction failure logs in call initiation and voice-event transaction paths

## Recovery Commands (Backend)

1. `cd backend`
2. `npm run prisma:generate`
3. `npx prisma validate --schema=./prisma/schema.prisma`
4. `npx tsc --noEmit`

## Clean Reset Commands (Destructive)

1. Ensure `DATABASE_URL` points to the intended Neon/Postgres database.
2. `cd backend`
3. `npx prisma migrate reset --schema=./prisma/schema.prisma`
4. `npm run prisma:generate`
5. `npm run dev`

## Optional Drift/Preview Checks

- SQL preview from empty schema:
   - `npx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script`
- Migration status:
   - `npx prisma migrate status --schema=./prisma/schema.prisma`

# Realtime UI Flow (Verified)

1. SSE client init:
   - `SseRealtimeClient.ensureConnected()` builds `.../realtime/calls/stream?tenantId=<id>` and creates `EventSource`.
2. Reconnect behavior:
   - `source.onerror` -> `scheduleReconnect()` exponential backoff (1s -> max 15s) -> reconnect.
3. Event intake:
   - listens on SSE event type `call_event`.
4. Parse gate:
   - `parseRealtimeCallEvent()` strict-required fields: `streamEventId, tenantId, callId, roomId, eventType, callState, stage, occurredAt`.
5. Context update path:
   - `CallsContext` subscription callback:
      - dedup via `streamEventId`
      - `setCalls(upsertCallSummary)`
      - `setLiveByCallId(applyLiveEvent)`
      - `setLiveVersionByCallId(+1)`
      - `setLiveConnectionState(state)`
6. Lexus UI binding:
   - `lexus/calls.tsx` consumes `calls` + `liveConnectionState`; renders lifecycle list and live stream label.
7. Enterprise UI binding:
   - `enterprise/calls.tsx` consumes `calls` + `liveByCallId` + `liveConnectionState`; renders per-call live stage strip and realtime status.

# Realtime UI Broken Points (Findings)

- Client-side pipeline is wired and reactive; no frontend-side disconnect in state binding path.
- Drop risk: strict parse gate discards events missing any required realtime fields.
- Effective break remains upstream publish gap:
   - active webhook/ingest path persists to DB but does not invoke realtime publish.
   - result at UI: SSE may connect/reconnect correctly but no `call_event` payloads arrive.
- Tenant mismatch risk:
   - frontend subscribes using `EXPO_PUBLIC_TENANT_ID`; webhook events published for different tenant IDs will not render.

# TS Backend Foundation Validation (2026-04-06)

- Webhook route: FOUND - implemented at `backend/src/modules/voice-events/voice-events.router.ts`, mounted via `/api/webhooks` + `/voice/events` => `POST /api/webhooks/voice/events`; fully implemented (auth + parse + schema validation + service call), not a stub.
- voiceEventService: FOUND - `backend/src/services/voiceEventService.ts` includes normalize (`normalizeVoiceEvent`), idempotency guard (`markEventAsProcessing` + dedup lookup), Prisma DB transaction writes, and realtime publish (`publishRealtimeVoiceEvent`) in `processNormalizedVoiceEvent`; however this is the legacy path and not the active mounted webhook ingestion path.
- realtimeService: FOUND - `backend/src/services/realtimeService.ts` manages in-memory listener sets, publishes realtime call events, and supports tenant-based fanout via `listenersByTenant` map.
- SSE route: FOUND - `backend/src/routes/realtime.ts` exposes `GET /api/realtime/calls/stream`, connects clients, pushes events from subscription, and emits SSE event type `call_event`.

- Missing pieces:
   - Active webhook service (`backend/src/modules/voice-events/voice-events.service.ts` -> `ingestVoiceEvent`) does not call realtime publish after DB writes.
   - Active webhook flow does not use legacy normalize/idempotency/publish pipeline (`processNormalizedVoiceEvent`).
   - End-to-end active path currently stops at DB persistence: Webhook -> Service -> DB (no Publish -> SSE).

- Blocking issue: Active mounted webhook ingestion writes to DB but never publishes to realtime fanout, so SSE clients receive no `call_event` updates.

# Realtime Propagation Fix Applied (2026-04-06)

- File updated: `backend/src/modules/voice-events/voice-events.service.ts`
- Function updated: `ingestVoiceEvent`
- Change:
   - Reused existing normalization helper: `normalizeVoiceEvent` from `src/services/voiceEventService.ts`
   - Reused existing publisher: `publishRealtimeVoiceEvent` from `src/services/realtimeService.ts`
   - Added publish step after successful DB persistence/updates in active ingestion flow
   - Added log: `[REALTIME] published call_event for callId=...`
- Resulting active path now includes realtime propagation:
   - `Webhook -> Service -> DB -> Publish -> SSE`

# Realtime Propagation Correction (2026-04-06)

- Runtime correction applied in active ingestion path `backend/src/modules/voice-events/voice-events.service.ts` (`ingestVoiceEvent`).
- Removed dependency on legacy `normalizeVoiceEvent` usage inside active module flow.
- Active publish now sends direct event object to `publishRealtimeVoiceEvent` using current webhook envelope fields (`tenantId`, `callId`, `eventType`, `occurredAt`, `payload`) plus required identifiers (`eventId`, `roomId`, raw fields).
- Logging retained: `[REALTIME] published call_event for callId=...`.
