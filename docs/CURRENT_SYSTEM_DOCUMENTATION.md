# CURRENT SYSTEM DOCUMENTATION (As-Is Preservation Snapshot)

Date captured: 2026-04-15
Scope: Current deployed/project state before any cleanup/deletion/refactor.
Method: Read-only inspection of code, config, systemd units, env files, and runtime logs.

## 1. Project Overview

This project is a Hindi/Hinglish voice-agent system for real-estate lead qualification using LiveKit + SIP telephony + Python agent runtime.

Current implementation supports outbound call flow and has inbound-compatible architecture patterns, but operationally the currently documented active path is outbound dispatch + SIP participant creation.

Primary purpose of the agent:
- Speak in Hindi/Hinglish as "Anubhav" (current prompt/persona) for Maxsas Realty.
- Qualify leads by collecting 4 slots: property type, location, budget, timeline.
- Handle call outcomes like not interested, callback, wrong number, busy, etc.
- Emit structured webhook events for backend storage and call analytics.

Current observed status:
- `agent.service` is active/running.
- `webhook.service` is active/running.
- `agent-publisher.service` and `agent-participant.service` are currently inactive (dead).
- Outbound job failure evidence exists: timeout while waiting for target participant (`wait_for_participant` timeout in agent logs).

## 2. Directory and File Map

Important top-level folders/files:

- `agent/`: core runtime agent logic and service definitions.
- `infra/`: LiveKit + SIP + Redis runtime infra config.
- `data/db/voice_events.db`: legacy SQLite events database.
- `logs/webhook-server.out`: webhook startup/runtime output snapshot.
- `webhook-server.py`: Flask webhook ingest API + debug/admin endpoints.
- `shared/scripts/ops/migrate_voice_events_sqlite_to_postgres.py`: migration from SQLite to PostgreSQL.
- `backend/docs/DB_MIGRATION_NOTES.md`: notes about realtime/polling and ingestion flow.

Critical files and purpose:

- `agent/agent.py`
- Main LiveKit worker session handler, dialogue policy, STT/LLM/TTS pipeline, webhook emission, call-final analysis/classification.

- `agent/event_publisher.py`
- Async event queue + dedup + retry + webhook POST logic.

- `agent/test_outbound.py`
- Outbound trigger script: create room -> create dispatch -> create SIP participant.

- `agent/create_trunk.py`
- One-time SIP outbound trunk creation helper using Vobiz credentials.

- `agent/participant_worker.py`
- Participant-type worker registration (minimal connect/shutdown job).

- `agent/publisher_worker.py`
- Publisher-type worker registration (minimal connect/shutdown job).

- `agent/prompts/default_instruction.txt`
- Default runtime instruction prompt.

- `agent/.env.local`
- Active local runtime env override loaded after `.env.production`.

- `agent/.env.production`
- Production defaults loaded first.

- `agent/.env`
- Contains `VOICE_WEBHOOK_PUBLIC_URL` and `VOICE_WEBHOOK_BEARER_TOKEN`; not loaded by `agent.py` directly.

- `agent/systemd/agent.service`
- Main worker systemd service.

- `agent/systemd/agent-publisher.service`
- Publisher worker systemd unit.

- `agent/systemd/agent-participant.service`
- Participant worker systemd unit.

- `agent/systemd/webhook.service`
- Webhook API systemd unit, includes explicit `DATABASE_URL`.

- `webhook-server.py`
- Flask server that stores webhook events in PostgreSQL and exposes monitoring/debug APIs.

- `infra/docker-compose.yml`
- Launches `redis`, `livekit-server`, `livekit-sip` in host network mode.

- `infra/livekit.yaml`
- LiveKit server bind/RTC/key config.

- `infra/livekit-sip.yaml`
- LiveKit SIP bridge config.

Conceptually must preserve:
- All env variable names and values/mappings.
- Agent name and dispatch metadata schema.
- Prompt source and override order.
- Event schema (`event_id`, `event_type`, `tenant_id`, `call_id`, `room_id`, `occurred_at`, `payload`).
- Service startup commands and loaded env files.
- Webhook endpoint path and auth behavior.

## 3. Core Runtime Architecture

Worker startup and registration:
- `agent.py` creates `AgentServer(load_threshold=<env>)`.
- Registers session handler with `@server.rtc_session(agent_name=AGENT_NAME)`.
- Runs via `agents.cli.run_app(server)`.

Call/job intake flow (`my_agent` in `agent.py`):
1. Parse room/job metadata (`_safe_json`).
2. Build runtime config (`_build_tenant_runtime_config`) including tenant, call_id, phone_number, models/voice.
3. Initialize optional webhook publisher if `BACKEND_WEBHOOK_URL` + token exist.
4. `ctx.connect()` with timeout.
5. Emit `call_started` and `call_ringing` events.
6. Wait for target participant via `_wait_for_target_participant`.
7. Build `AgentSession` with:
   - STT: Sarvam (`sarvam.STT`)
   - LLM: Groq (`groq.LLM`)
   - TTS: Sarvam (`sarvam.TTS` through `_build_tts_engine`)
   - VAD: Silero (`silero.VAD.load`)
8. Start session and send startup greeting (delay applied for outbound).
9. Conversation loop + event handlers process user transcripts and assistant responses.
10. On completion/timeout/shutdown:
    - emit final transcript event (`call_transcript_final`)
    - emit `lead_extracted` (if any)
    - build final call JSON (`_build_final_call_json`) and emit `call_analysis_completed`
    - emit `call_completed` once
11. On exceptions, emit `call_failed` with stage and retryability.

LiveKit room and SIP usage:
- Outbound script creates room + dispatch + SIP participant explicitly.
- Agent identifies target participant by identity scoring:
  - prefers `sip-*`
  - phone exact/partial match boosts score
- If no participant appears before timeout, call fails at `wait_for_participant` stage.

STT->LLM->TTS runtime path:
- User audio -> Sarvam STT final transcript -> dialogue policy decision -> sanitized text -> `session.say` -> TTS audio to participant.
- Agent also records transcript turns and classification outcome.

Call end behavior:
- Ends on participant disconnect, policy close reason, max duration timeout, or shutdown signal.
- Produces final analytics payload with call outcome and compressed transcript.

## 4. Exact Startup and Service Flow

### systemd units and startup commands

Main agent service (`agent/systemd/agent.service`):
- WorkingDirectory: `/root/ai-voice-system/agent`
- EnvironmentFile (order):
  - `/root/ai-voice-system/agent/.env.production`
  - `/root/ai-voice-system/agent/.env.local`
- ExecStart:
  - `/root/ai-voice-system/agent/.venv/bin/python /root/ai-voice-system/agent/agent.py start`
- ExecStartPre:
  - create/chmod `/root/ai-voice-system/logs/agent`
- Restart: `always`

Publisher worker (`agent/systemd/agent-publisher.service`):
- ExecStart: `/root/ai-voice-system/agent/.venv/bin/python /root/ai-voice-system/agent/publisher_worker.py start`
- Restart: `on-failure`

Participant worker (`agent/systemd/agent-participant.service`):
- ExecStart: `/root/ai-voice-system/agent/.venv/bin/python /root/ai-voice-system/agent/participant_worker.py start`
- Restart: `on-failure`

Webhook API (`agent/systemd/webhook.service`):
- WorkingDirectory: `/root/ai-voice-system`
- Environment includes:
  - `BACKEND_WEBHOOK_TOKEN=devsecrettokenlivekit99`
  - `DATABASE_URL=postgresql://voice_admin:voice_admin_dev_2026@127.0.0.1:5432/voice_events?sslmode=disable`
- ExecStart: `/root/ai-voice-system/.venv/bin/python /root/ai-voice-system/webhook-server.py`

Empty unit files present:
- `agent/systemd/monitor.service` (empty)
- `agent/systemd/prewarm.service` (empty)

### observed service status snapshot

- `agent.service`: active (running)
- `agent-publisher.service`: inactive (dead)
- `agent-participant.service`: inactive (dead)
- `webhook.service`: active (running)

### startup success/failure log indicators

Success indicators:
- Agent: logs like `starting livekit worker: agent_name=... livekit_url=...`
- Event publisher: `event publisher started` and `event delivered: status=200 ...`
- Webhook: HTTP `POST /api/webhooks/voice/events ... 200`

Failure indicators:
- Agent call flow: `TimeoutError` in `_wait_for_target_participant`.
- Job crash traces from `livekit.agents` after timeout.
- Webhook startup failure if `DATABASE_URL` missing (`RuntimeError: DATABASE_URL ... is required`).

## 5. Environment Variables and Config

Note: `agent.py` loads `.env.production` then `.env.local` (override=True). Therefore `.env.local` is effective where both define same key.

### active key-value snapshot from `agent/.env.local`

- `LIVEKIT_URL=ws://157.245.108.130:7880`
- `LIVEKIT_API_KEY=devkey`
- `LIVEKIT_API_SECRET=devsecret`
- `LIVEKIT_OUTBOUND_TRUNK_ID=ST_EPQHdYRSkF2f`
- `AGENT_NAME=maxsas-voice-agent-prod`
- `DEFAULT_TENANT_ID=cf063f44-f7b4-5d8c-811f-2e093bed8cb1`
- `DEFAULT_STT_LANGUAGE=hi-IN`
- `DEFAULT_LLM_MODEL=llama-3.1-8b-instant`
- `DEFAULT_TTS_MODEL=bulbul:v3`
- `DEFAULT_TTS_VOICE=manan`
- `SARVAM_TTS_MODEL=bulbul:v3`
- `SARVAM_TTS_SPEAKER=manan`
- `SARVAM_FORCE_NON_STREAMING=false`
- `SARVAM_TTS_SAMPLE_RATE=24000`
- `SARVAM_TTS_MIN_BUFFER_SIZE=30`
- `SARVAM_TTS_MAX_CHUNK_LENGTH=80`
- `SARVAM_TTS_PACE=1.10`
- `SARVAM_TTS_TEMPERATURE=0.35`
- `SARVAM_TTS_SEND_COMPLETION_EVENT=true`
- `SARVAM_STT_MODEL=saaras:v3`
- `SARVAM_STT_MODE=transcribe`
- `SARVAM_STT_SAMPLE_RATE=16000`
- `SARVAM_STT_HIGH_VAD_SENSITIVITY=true`
- `SARVAM_STT_FLUSH_SIGNAL=true`
- `SARVAM_STT_INPUT_AUDIO_CODEC=audio/wav`
- `SARVAM_TTS_OUTPUT_AUDIO_CODEC=audio/wav`
- `SILERO_MIN_SILENCE_DURATION=0.18`
- `SARVAM_API_KEY=...`
- `GROQ_API_KEY=...`
- `BACKEND_WEBHOOK_URL=http://127.0.0.1:8080/api/webhooks/voice/events`
- `BACKEND_WEBHOOK_TOKEN=devsecrettokenlivekit99`
- `EVENT_MAX_RETRIES=1`
- `EVENT_RETRY_BASE_DELAY_SECONDS=0.25`
- `EVENT_REQUEST_TIMEOUT_SECONDS=4`
- `MAX_CALL_DURATION_SECONDS=1800`
- `PARTICIPANT_WAIT_TIMEOUT_SECONDS=90`
- `EVENT_PUBLISHER_STARTUP_TEST_EVENT=true`
- `LIVEKIT_AGENT_LOAD_THRESHOLD=5.0`
- `LIVEKIT_WORKER_LOAD_THRESHOLD=5.0`
- `LIVEKIT_NUM_IDLE_PROCESSES=2`
- `OUTBOUND_GREETING_DELAY_SECONDS=6.0`

### additional env/config files observed

- `agent/.env`:
  - `VOICE_WEBHOOK_PUBLIC_URL=https://megaphonically-glummer-dalia.ngrok-free.dev`
  - `VOICE_WEBHOOK_BEARER_TOKEN=dev_secret_token_livekit_99`

- `agent/.env.production` has mostly blank LiveKit keys and fallback defaults.

- `agent/.env.local.backup` contains legacy/alternate values including Vobiz keys and an apparently malformed concatenated line:
  - `BACKEND_WEBHOOK_AUTH_TOKEN=dev_secret_token_livekit_99BACKEND_WEBHOOK_URL=http://localhost:4000/api/webhooks/voice/events`

### variable usage table (core runtime)

| Variable | Used In | Purpose | Required? | Breakage if Missing |
|---|---|---|---|---|
| LIVEKIT_URL | agent.py, test_outbound.py, workers | LiveKit API/worker endpoint | Required | Worker/API connect fails |
| LIVEKIT_API_KEY | agent.py (startup check), test_outbound.py | LiveKit auth key | Required | Worker refuses startup / API calls fail |
| LIVEKIT_API_SECRET | agent.py (startup check), test_outbound.py | LiveKit auth secret | Required | Worker refuses startup / API calls fail |
| AGENT_NAME | agent.py, workers, dispatch script default | Worker registration/dispatch target name | Required by startup check | Jobs may not dispatch to expected worker |
| LIVEKIT_OUTBOUND_TRUNK_ID | test_outbound.py | Outbound SIP trunk to dial PSTN | Required for outbound script | Outbound script exits with error |
| SARVAM_API_KEY | agent.py (startup check), Sarvam plugin | STT/TTS provider key | Required | agent startup fails or STT/TTS provider errors |
| GROQ_API_KEY | agent.py (startup check), classifier | LLM provider key | Required | startup fails / classification disabled/fails |
| DEFAULT_TENANT_ID | agent.py | fallback tenant id | Optional | tenant_id becomes unknown fallback |
| DEFAULT_STT_LANGUAGE | agent.py | STT language default | Optional | uses built-in hi-IN default |
| DEFAULT_LLM_MODEL | agent.py | LLM model default | Optional | uses hardcoded model fallback |
| DEFAULT_TTS_MODEL | agent.py | TTS model fallback | Optional | uses hardcoded fallback |
| DEFAULT_TTS_VOICE | agent.py | TTS voice fallback | Optional | uses hardcoded fallback |
| SARVAM_TTS_MODEL | agent.py | TTS model override | Optional | default model used |
| SARVAM_TTS_SPEAKER | agent.py | TTS speaker override | Optional | default speaker used |
| SARVAM_FORCE_NON_STREAMING | agent.py | toggles non-streaming TTS mode | Optional | default true path applies |
| SARVAM_TTS_SAMPLE_RATE | agent.py | TTS sample rate | Optional | defaults to 24000 |
| SARVAM_TTS_MIN_BUFFER_SIZE | agent.py | TTS buffering | Optional | defaults to 30 |
| SARVAM_TTS_MAX_CHUNK_LENGTH | agent.py | TTS chunk sizing | Optional | defaults to 80 |
| SARVAM_TTS_PACE | agent.py | TTS speech pace | Optional | default pace used |
| SARVAM_TTS_TEMPERATURE | agent.py | TTS generation temperature | Optional | default temp used |
| SARVAM_TTS_SEND_COMPLETION_EVENT | agent.py | TTS completion signaling | Optional | default true |
| SARVAM_STT_MODEL | agent.py | STT model | Optional | default `saaras:v3` |
| SARVAM_STT_MODE | agent.py | STT mode | Optional | default `transcribe` |
| SARVAM_STT_SAMPLE_RATE | agent.py | STT sample rate | Optional | default 16000 |
| SARVAM_STT_HIGH_VAD_SENSITIVITY | agent.py | STT vad sensitivity | Optional | defaults true |
| SARVAM_STT_FLUSH_SIGNAL | agent.py | STT flush behavior | Optional | defaults true |
| SARVAM_STT_INPUT_AUDIO_CODEC | agent.py | STT codec | Optional | fallback codec handling |
| SARVAM_TTS_OUTPUT_AUDIO_CODEC | agent.py | TTS output codec | Optional | defaults audio/wav |
| SILERO_MIN_SILENCE_DURATION | agent.py | VAD silence threshold | Optional | defaults apply |
| BACKEND_WEBHOOK_URL | agent.py, webhook config | target URL for event delivery | Optional at startup (warn) | event publishing disabled if empty |
| BACKEND_WEBHOOK_TOKEN | agent.py, webhook-server auth | bearer token for event auth | Optional in agent, required in webhook (if configured) | events rejected (401) or disabled send |
| BACKEND_WEBHOOK_AUTH_TOKEN | agent.py/webhook-server fallback token name | alternative token var | Optional | fallback token unavailable |
| EVENT_MAX_RETRIES | agent.py | publisher retries | Optional | default retry count |
| EVENT_RETRY_BASE_DELAY_SECONDS | agent.py | backoff base | Optional | default delay |
| EVENT_REQUEST_TIMEOUT_SECONDS | agent.py | webhook request timeout | Optional | default timeout |
| PARTICIPANT_WAIT_TIMEOUT_SECONDS | agent.py | max wait for SIP participant | Optional | defaults 90; timeout errors still possible |
| MAX_CALL_DURATION_SECONDS | agent.py | hard call duration cap | Optional | defaults 1800 |
| OUTBOUND_GREETING_DELAY_SECONDS | agent.py | outbound greeting delay | Optional | default 2.2 sec |
| LIVEKIT_AGENT_LOAD_THRESHOLD | agent.py, workers | load threshold | Optional | fallback threshold used |
| LIVEKIT_WORKER_LOAD_THRESHOLD | agent.py, workers | alternate threshold name | Optional | fallback threshold used |
| LIVEKIT_NUM_IDLE_PROCESSES | agent.py | worker pool tuning | Optional | defaults to 2 |
| LEAD_ENABLE_LLM_CLASSIFIER | agent.py | enable final classifier | Optional | classifier disabled if false |
| LEAD_CLASSIFICATION_MODEL | agent.py | classifier model | Optional | default model used |
| LEAD_CLASSIFICATION_TIMEOUT_SECONDS | agent.py | classifier timeout | Optional | default 12s |
| DATABASE_URL | webhook-server.py (and systemd env) | PostgreSQL connection string | Required for webhook startup | webhook server crashes at startup |
| PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE | webhook-server.py | DATABASE_URL fallback builder | Optional alternative | startup fails if neither DATABASE_URL nor enough PG* vars |
| VOICE_WEBHOOK_PUBLIC_URL | agent/.env only | legacy/public ingest URL value | Unverified current runtime usage | likely no runtime effect in `agent.py` |
| VOICE_WEBHOOK_BEARER_TOKEN | agent/.env only | legacy/public token value | Unverified current runtime usage | likely no runtime effect in `agent.py` |

## 6. Prompt / Instructions System

Prompt sources:
- Default instruction file: `agent/prompts/default_instruction.txt`
- Runtime metadata override keys checked in order: `instruction`, `script`, `prompt` from room/job metadata.
- Emergency fallback instruction hardcoded in `agent.py` if file missing/empty and no metadata prompt.

Runtime selection order (`_resolve_instruction`):
1. Metadata prompt override (room/job metadata).
2. File content from `prompts/default_instruction.txt`.
3. Hardcoded fallback string.

Observed default prompt currently emphasizes:
- Hindi/Hinglish lead-qualification behavior.
- One question per turn.
- stop conditions for rejection/do-not-call.
- strict slot order and safety constraints.

## 7. Dialogue / Turn / Slot Flow

State machine implementation (`DialogueRuntime` + `_policy_next_reply`):
- Initial states: `opening` -> `permission_check`.
- Core slot states: `qualification_property_type`, `qualification_location`, `qualification_budget`, `qualification_timeline`.
- Callback branch: `busy_callback`.
- End state: `ended`.

Intent handling includes:
- terminal intents: `not_interested`, `do_not_call`, `abusive` -> immediate close.
- `wrong_person` -> single confirmation question, then close.
- `busy`/`callback_request` -> callback time question branch.
- minimal backchannel/silence -> repeated checks then confusion close.

Slot extraction:
- property type via keyword mapping.
- budget via regex and heuristic markers.
- timeline via marker maps.
- location via regex + known-city fallback.

Interruption and repetition control:
- detects interruption based on agent-response timing.
- sanitizes TTS output and suppresses problematic/repeated question patterns.
- tracks recent questions to avoid loops.

Fallback and termination:
- uses fixed fallback lines for unclear/rejection/callback closes.
- sets `policy_close_reason` for call termination when needed.

Qualification/callback/wrong-number/not-interested flows are explicitly represented in policy code and close reasons.

## 8. Outbound Call Flow

Current outbound trigger path:
- Script: `agent/test_outbound.py`
- Usage: `python3 /root/ai-voice-system/agent/test_outbound.py +<number> [agent_name]`

Execution flow in script:
1. Load `/root/ai-voice-system/agent/.env.local`.
2. Normalize LiveKit URL for HTTP API.
3. Validate `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_OUTBOUND_TRUNK_ID`.
4. Create room: `test-call-<phone>-<timestamp>`.
5. Create dispatch for agent with metadata `{"phone_number": ..., "call_id": ...}`.
6. Create SIP participant with trunk ID and `participant_identity=sip-<phone>-<timestamp>`.
7. Print JSON result including `dispatch_id`, `sip_call_id`, `sip_participant_id`.

Expected success sequence:
- Room created -> dispatch created -> SIP participant created -> target phone rings -> participant joins room -> agent session starts and greets.

Observed current failure point:
- Agent logs show timeout in `_wait_for_target_participant` (stage `wait_for_participant`) and emits `call_failed`.

## 9. Webhooks, APIs, URLs, and External Integrations

### Core runtime URLs and endpoints

LiveKit:
- WebSocket URL: `ws://157.245.108.130:7880` (agent config)
- SIP bridge config points to local ws: `ws://127.0.0.1:7880`

Webhook ingestion (agent -> backend):
- `BACKEND_WEBHOOK_URL=http://127.0.0.1:8080/api/webhooks/voice/events` (active `.env.local`)
- Authorization header: `Bearer <BACKEND_WEBHOOK_TOKEN or BACKEND_WEBHOOK_AUTH_TOKEN>`

Legacy/alternate webhook/public URLs in env snapshots:
- `VOICE_WEBHOOK_PUBLIC_URL=https://megaphonically-glummer-dalia.ngrok-free.dev`
- `BACKEND_WEBHOOK_URL=https://megaphonically-glummer-dalia.ngrok-free.dev/api/webhooks/voice/events` (in `.env.local.save`)
- `BACKEND_WEBHOOK_URL=https://abcd-1234.ngrok-free.app/api/webhooks/voice/events` (in `.env.local.backup`)
- `BACKEND_WEBHOOK_URL=http://localhost:4000/api/webhooks/voice/events` (backup/pre-debug files)

Webhook Flask server endpoints (`webhook-server.py`):
- `GET /healthz`
- `POST/OPTIONS /api/webhooks/voice/events`
- `GET /api/voice/calls`
- `GET /api/voice/calls/<call_id>`
- `GET /api/voice/calls/<call_id>/final-json`
- `GET /api/voice/ingest/recent`
- `GET /api/voice/events/recent`
- `GET /api/voice/debug/latest-final-json`
- `GET /api/voice/debug/summary`
- `POST/OPTIONS /api/debug/trigger-call`
- `GET /admin`
- Legacy Vobiz webhook stubs:
  - `POST /webhook/answer`
  - `POST /webhook/hangup`

Service ports observed in config:
- LiveKit server port: `7880`
- LiveKit RTC TCP: `7882`
- LiveKit RTC UDP range: `50000-60000`
- SIP port: `5060`
- Redis: `6379`
- Webhook Flask app: `8080`
- Participant worker HTTP port default: `8083`
- Publisher worker HTTP port default: `8082`

External providers/integrations:
- LiveKit server + SIP.
- Sarvam STT/TTS APIs.
- Groq chat completions API (`https://api.groq.com/openai/v1/chat/completions`).
- Vobiz SIP trunk credentials appear in backup env files.

## 10. Database / Event / Logging Flow

### Current backend storage (webhook service)

Configured DB in `webhook.service`:
- `postgresql://voice_admin:voice_admin_dev_2026@127.0.0.1:5432/voice_events?sslmode=disable`

`webhook-server.py` creates/uses PostgreSQL tables:
- `voice_events`
  - key fields: `event_id`, `event_type`, `tenant_id`, `call_id`, `room_id`, `occurred_at`, `payload_json`, `received_at`
- `voice_ingest_audit`
  - ingest status, http code, reason/detail, request payload snapshot

Ingestion write path:
1. Auth check.
2. Parse + normalize event.
3. Insert into `voice_events` with `ON CONFLICT (event_id) DO NOTHING`.
4. Write audit row into `voice_ingest_audit`.

### Legacy SQLite database snapshot

File: `data/db/voice_events.db`
Tables present:
- `voice_events`
- `voice_ingest_audit`
- `sqlite_sequence`

Observed SQLite counts at capture time:
- `voice_events_total=472`
- `voice_events_distinct_calls=54`

Observed schema (SQLite):
- `voice_events`: `id`, `event_id`, `event_type`, `tenant_id`, `call_id`, `room_id`, `occurred_at`, `payload_json`, `received_at`
- `voice_ingest_audit`: `id`, `event_id`, `event_type`, `tenant_id`, `call_id`, `status`, `http_status`, `reason`, `detail`, `request_json`, `received_at`

Migration script:
- `shared/scripts/ops/migrate_voice_events_sqlite_to_postgres.py`
- migrates SQLite `voice_events` rows into PostgreSQL `voice_events`.

### Logging and evidence locations

- systemd journal:
  - `journalctl -u agent.service ...`
  - `journalctl -u webhook.service ...`
  - `journalctl -u agent-publisher.service ...`
  - `journalctl -u agent-participant.service ...`
- file logs:
  - `logs/webhook-server.out`
  - `agent/debug.log`
- Docker logs:
  - `docker logs infra_livekit-server_1`
  - `docker logs infra_livekit-sip_1`

## 11. Current Known Issues and Fragile Areas

Observed known issues:

1. Participant pickup timeout (critical runtime issue)
- Agent call task fails at `_wait_for_target_participant` with `TimeoutError`.
- Stage reported in `call_failed`: `wait_for_participant`.

2. Auxiliary workers inactive
- `agent-publisher.service` and `agent-participant.service` are inactive/dead.
- Main `agent.service` is active, but these separate worker services are not currently running.

3. Environment drift across env files
- `.env.local`, `.env.local.save`, `.env.local.backup`, `.env.production`, `.env` contain conflicting URLs/tokens/models.
- Backup env contains malformed concatenated token/url line.

4. Potential token-name mismatch risk
- Some places use `BACKEND_WEBHOOK_TOKEN`, some include `BACKEND_WEBHOOK_AUTH_TOKEN` fallback.
- Wrong key name/value can silently disable or reject webhook events.

5. Legacy docs out of sync with code
- `agent/AGENTS.md` mentions historical Cartesia runtime and older model/profile details that differ from current `agent.py` implementation (currently Sarvam TTS path).

6. Webhook startup fragility
- `webhook-server.py` hard-fails without `DATABASE_URL` (or sufficient PG* envs).
- Confirmed error text appears in `logs/webhook-server.out` when env missing.

7. Unknown current SIP trunk credential source
- Active `.env.local` keeps trunk ID only; Vobiz domain/user/pass are not present there now (present in backup). Rebuild must clarify source-of-truth.

## 12. Rebuild-Critical Information

Must preserve exactly in fresh rebuild:

- LiveKit endpoint and credentials:
  - `LIVEKIT_URL=ws://157.245.108.130:7880`
  - `LIVEKIT_API_KEY=devkey`
  - `LIVEKIT_API_SECRET=devsecret`

- Agent naming and dispatch:
  - `AGENT_NAME=maxsas-voice-agent-prod`
  - dispatch metadata keys: at minimum `phone_number`, `call_id`

- Outbound telephony mapping:
  - `LIVEKIT_OUTBOUND_TRUNK_ID=ST_EPQHdYRSkF2f`
  - SIP participant identity pattern: `sip-<phone>-<timestamp>`

- Webhook mapping:
  - Agent sends to: `http://127.0.0.1:8080/api/webhooks/voice/events`
  - Webhook auth token currently used: `devsecrettokenlivekit99`

- Webhook service DB mapping:
  - `DATABASE_URL=postgresql://voice_admin:voice_admin_dev_2026@127.0.0.1:5432/voice_events?sslmode=disable`

- Prompt/instruction source and precedence:
  - `agent/prompts/default_instruction.txt`
  - metadata override keys `instruction|script|prompt`
  - hardcoded emergency fallback

- Event contract and expected event types:
  - `call_started`, `call_ringing`, `call_connected`, `call_active`, `call_transcript_final`, `lead_extracted`, `call_analysis_completed`, `call_completed`, `call_failed`

- Runtime provider/model defaults currently in active env:
  - STT: Sarvam `saaras:v3`
  - LLM: `llama-3.1-8b-instant`
  - TTS: Sarvam `bulbul:v3`, speaker `manan`

- service startup and env loading behavior:
  - `.env.production` then `.env.local`
  - systemd unit commands and working directories

## 13. Command Reference

Current useful commands (as observed/used in project context):

Service and process status:
- `systemctl status agent.service agent-publisher.service agent-participant.service --no-pager -l`
- `systemctl status webhook.service --no-pager -l`
- `ps -ef`

Service logs:
- `journalctl -u agent.service -n 120 --no-pager`
- `journalctl -u webhook.service -n 120 --no-pager`
- `journalctl -u agent-publisher.service --no-pager`
- `journalctl -u agent-participant.service --no-pager`

Infra logs:
- `cd /root/ai-voice-system/infra && docker compose ps`
- `docker logs infra_livekit-server_1 | grep "worker registered"`
- `docker compose logs -f livekit-server livekit-sip`

Outbound test trigger:
- `python3 /root/ai-voice-system/agent/test_outbound.py +918882453059`

LiveKit CLI:
- `lk dispatch create --api-key devkey --api-secret devsecret --url ws://157.245.108.130:7880 --agent-name maxsas-voice-agent-prod --room test-$(date +%s) --metadata '{"phone_number":"+918588837040"}'`
- `lk sip outbound-trunks list`

DB and webhook inspection:
- `tail -n 120 /root/ai-voice-system/logs/webhook-server.out`
- API checks:
  - `curl -s http://127.0.0.1:8080/healthz`
  - `curl -s http://127.0.0.1:8080/api/voice/debug/summary`

## 14. Open Questions / Unverified Areas

1. Unverified: whether inbound SIP trunk is currently configured and actively used. `LIVEKIT_INBOUND_TRUNK_ID` appears empty in backups.
2. Unverified: whether Vobiz credentials are still valid/required from backup env files or managed elsewhere now.
3. Unverified: whether `agent-publisher.service` and `agent-participant.service` are intentionally disabled or unintentionally down.
4. Unverified: whether `.env` keys `VOICE_WEBHOOK_PUBLIC_URL` and `VOICE_WEBHOOK_BEARER_TOKEN` are used by any active runtime path (not directly used by `agent.py`).
5. Unverified: exact current cause for `lk sip outbound-trunks list` failure (exit code 3 observed in terminal context; full stderr not captured here).
6. Unverified: whether active runtime still depends on any historical Cartesia paths present in old logs/docs.

## 15. Server Cleanup Safety Checklist

Before any deletion/cleanup, preserve all of the following:

- [ ] Full copy of env files:
  - `agent/.env.local`
  - `agent/.env.production`
  - `agent/.env`
  - `agent/.env.local.save`
  - `agent/.env.local.backup`
  - `agent/.env.local.pre_debug_fix_20260405_132139.bak`

- [ ] Prompt/instruction sources:
  - `agent/prompts/default_instruction.txt`
  - instruction resolution logic in `agent/agent.py`

- [ ] Service configuration:
  - all files in `agent/systemd/`
  - installed unit state/enablement and `/etc/systemd/system/*.service` equivalents

- [ ] Integration mappings and endpoints:
  - LiveKit URL/keys
  - webhook URL/token mappings
  - SIP trunk ID and any Vobiz credentials/source
  - ports (`7880`, `7882`, `5060`, `6379`, `8080`)

- [ ] Worker/agent naming and dispatch contract:
  - `AGENT_NAME=maxsas-voice-agent-prod`
  - dispatch metadata keys (`phone_number`, `call_id`)

- [ ] Event schema and DB expectations:
  - `voice_events` + `voice_ingest_audit` tables
  - payload/event type contract and final-json selection behavior

- [ ] Database and logs:
  - backup PostgreSQL `voice_events` and `voice_ingest_audit`
  - backup `data/db/voice_events.db` (legacy)
  - backup journals and log files (`logs/webhook-server.out`, `agent/debug.log`)

- [ ] Outbound/integration scripts:
  - `agent/test_outbound.py`
  - `agent/create_trunk.py`
  - migration script `shared/scripts/ops/migrate_voice_events_sqlite_to_postgres.py`

- [ ] Command/ops reference:
  - operational commands in Section 13
  - known error signatures in Section 11

- [ ] Provider/model settings:
  - Sarvam STT/TTS model and tuning vars
  - Groq model(s) and classifier toggles

This document is intended to be the baseline handover blueprint for clean rebuild without losing integration logic or environment-specific behavior.
