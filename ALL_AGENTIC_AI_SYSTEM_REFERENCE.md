# AGENTIC AI — Backend System Reference (Up To Date)

Last Updated: 2026-05-04
Repository: ai-voice-system
Path: /root/ai-voice-system

Purpose: Copy-paste-ready backend reference describing the AI Voice webhook API, agent runtime, configuration, and operational notes so backend teams can paste this into their server for exact configuration and troubleshooting.

Overview
- Purpose: Provide a complete, actionable reference for the webhook API and agent integration.
- Scope: `webhook-server.py` (Flask API), `agent/agent.py` (LiveKit agent), systemd units, infra compose, DB schema, and runtime env.

Components
- Webhook API: Flask app at [webhook-server.py](webhook-server.py) — ingest events, debug and query endpoints.
- Agent worker: LiveKit-based agent at [agent/agent.py](agent/agent.py) — handles calls (inbound/outbound), STT/LLM/TTS, and publishes events to backend.
- Systemd units: [agent/systemd/agent.service](agent/systemd/agent.service) and [agent/systemd/webhook.service](agent/systemd/webhook.service).
- Infra: Docker Compose for LiveKit + SIP + Redis — [infra/docker-compose.yml](infra/docker-compose.yml).
- Prompts & configs: [agent/prompts/default_instruction.txt](agent/prompts/default_instruction.txt) and [shared/configs/plans/](shared/configs/plans).

Prerequisites
- Linux host with systemd (recommended).
- Python >= 3.11 for the `agent` virtualenv.
- PostgreSQL accessible and credentials with CREATE/TABLE/INSERT privileges.
- LiveKit server + LiveKit SIP + Redis (Docker Compose provided in `infra/`).
- Provider API keys: Sarvam (TTS/STT), Groq (LLM), optional Deepgram.

Quick Install
1. Start infrastructure (LiveKit, SIP bridge, Redis):

```bash
cd /root/ai-voice-system/infra
docker compose up -d
docker compose ps
```

2. Prepare agent venv and install deps:

```bash
cd /root/ai-voice-system/agent
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt  # or install packages per pyproject.toml
```

3. Configure environment files
- Copy `agent/.env.production` to `agent/.env.local` and fill credentials (LIVEKIT_*, SARVAM_API_KEY, GROQ_API_KEY, BACKEND_WEBHOOK_URL, BACKEND_WEBHOOK_TOKEN).

4. Start webhook service (dev):

```bash
cd /root/ai-voice-system
source .venv/bin/activate   # workspace venv containing Flask/psycopg
python webhook-server.py
```

5. Start agent (dev):

```bash
cd /root/ai-voice-system/agent
source .venv/bin/activate
python agent.py start
```

Environment variables (essential)
- `LIVEKIT_URL` — LiveKit websocket URL (e.g., `ws://127.0.0.1:7880`)
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `LIVEKIT_OUTBOUND_TRUNK_ID` (for SIP outbound)
- `BACKEND_WEBHOOK_URL` — Full URL where agent posts events
- `BACKEND_WEBHOOK_TOKEN` (or `BACKEND_WEBHOOK_AUTH_TOKEN`) — Bearer token for webhook publishing
- `DATABASE_URL` OR `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — Postgres connection
- Provider keys: `SARVAM_API_KEY`, `GROQ_API_KEY`, (optional) `DEEPGRAM_API_KEY`

Agent tuning & optional envs
- `DEFAULT_STT_LANGUAGE`, `DEFAULT_LLM_MODEL`, `DEFAULT_TTS_MODEL`, `DEFAULT_TTS_VOICE`
- `EVENT_MAX_RETRIES`, `EVENT_RETRY_BASE_DELAY_SECONDS`, `EVENT_REQUEST_TIMEOUT_SECONDS`
- `MAX_CALL_DURATION_SECONDS`, `PARTICIPANT_WAIT_TIMEOUT_SECONDS`, `OUTBOUND_AUTO_DIAL_IF_MISSING_PARTICIPANT`
- `LEAD_ENABLE_LLM_CLASSIFIER`, `LEAD_CLASSIFICATION_MODEL`

Lexus profile-driven call duration limit (new)
- Purpose: allow the backend to enforce short, profile-driven call duration limits for Lexus workspace/testing.
- How to provide: include `lexus_call_limit` in LiveKit room metadata or job metadata. Accepted locations:
	- Top-level in `room.metadata` or `job.metadata`: `"lexus_call_limit": "40s"` or numeric `40`
	- Nested in a profile object: `"workspace_profile": { "lexus_call_limit": "60s" }`
- Supported values (first-test): `40` (40 seconds), `60` (1 minute), `90` (1.5 minutes). Accepts `"40s"`, `"1m"`, `"1.5m"`, etc.
- Behavior: when a supported Lexus limit is present, the agent will start a strict timer when the call is connected. When the timer expires the agent:
	- Emits a `call_failed` event with `error: "lexus_timeout"` and `stage: "lexus_timeout"` so the backend records the termination reason.
	- Attempts a graceful disconnect of the LiveKit room (if supported by the SDK).
	- Sets the internal call completion event so the normal teardown and `call_analysis_completed` flow runs.
- If no Lexus limit is provided the agent preserves the existing call flow and existing `MAX_CALL_DURATION_SECONDS` logic.


Database schema (auto-created by webhook-server)
- `voice_events` table with columns:
	- `id BIGSERIAL PRIMARY KEY`
	- `event_id TEXT NOT NULL UNIQUE`
	- `event_type TEXT NOT NULL`
	- `tenant_id TEXT`
	- `call_id TEXT NOT NULL`
	- `room_id TEXT`
	- `occurred_at TEXT`
	- `payload_json JSONB NOT NULL`
	- `received_at TEXT NOT NULL`
- Indexes: `idx_voice_events_call_id`, `idx_voice_events_received_at`, `idx_voice_events_type`.
- `voice_ingest_audit` table: audit trail for ingest attempts; indexed on `call_id`, `received_at`, `event_id`.

Webhook API summary (actionable)
- `POST /api/webhooks/voice/events` — Primary ingest endpoint
	- Required headers: `X-Event-Id`, `X-Call-Id` (if not in body)
	- Body: JSON with `event_type` and optional `payload` (object)
	- Authorization: `Authorization: Bearer <token>` if `BACKEND_WEBHOOK_TOKEN` configured
	- Behavior: Inserts into `voice_events`; writes an audit row to `voice_ingest_audit`.
	- Data retention: keeps latest 15 distinct `call_id`s (SQL delete runs after insert)

- Vobiz adapter: `POST /api/webhooks/vobiz/call-event` and `/api/webhooks/vobiz/call-events` — maps Vobiz fields to internal event types.

- Querying:
	- `GET /api/voice/calls` — list recent calls (params: `limit`, `tenant_id`)
	- `GET /api/voice/calls/<call_id>` — full events + ingest_audit for `call_id`
	- `GET /api/voice/calls/<call_id>/final-json` — aggregated final payload and inferred outcome
	- `GET /api/voice/events/recent` and `/api/voice/ingest/recent` — cursored logs
	- `POST /api/debug/trigger-call` — development helper that runs `agent/test_outbound.py` using `agent/.venv/bin/python` (requires that venv and script exist)

Event lifecycle & semantics
- Events posted by agent: `call_started`, `call_ringing`, `call_connected`, `call_transcript_final`, `lead_extracted`, `call_analysis_completed`, `call_completed`, `call_failed`.
- Final JSON generation: `webhook-server` chooses a preferred event (`call_analysis_completed` → `call_completed`) to build `final_json`, and runs heuristics to infer `call_outcome`.

Operational & security notes
- Always set `BACKEND_WEBHOOK_TOKEN` in production; webhook server will allow unauthenticated requests only if token unset (permissive for dev).
- Use HTTPS for `BACKEND_WEBHOOK_URL` and enable TLS on LiveKit when exposing externally.
- Rotate DB and provider credentials regularly.
- Logs: agent and webhook services send to `journal` (systemd). Agent also creates `/root/ai-voice-system/logs/agent`.
- systemd examples:
	- `agent` unit: [agent/systemd/agent.service](agent/systemd/agent.service)
	- `webhook` unit: [agent/systemd/webhook.service](agent/systemd/webhook.service)

Troubleshooting checklist
- `500` on ingest: check `voice_ingest_audit` table for `reason` and `detail` columns.
- `trigger-call` fails: ensure `agent/.venv/bin/python` exists and `agent/test_outbound.py` is present and executable.
- Agent not starting: check `LIVEKIT_*` envs and `AGENT_NAME`; ensure `.env.production`/`.env.local` loaded by systemd.
- DB errors: validate `DATABASE_URL` or PG envs and that DB user has permissions.
- Event publishing disabled: agent logs a warning if `BACKEND_WEBHOOK_URL` or `BACKEND_WEBHOOK_TOKEN` missing.

References (files)
- Webhook API: [webhook-server.py](webhook-server.py)
- Agent: [agent/agent.py](agent/agent.py)
- Agent README: [agent/README.md](agent/README.md)
- Systemd: [agent/systemd/agent.service](agent/systemd/agent.service), [agent/systemd/webhook.service](agent/systemd/webhook.service)
- Infra compose: [infra/docker-compose.yml](infra/docker-compose.yml)
- Prompts: [agent/prompts/default_instruction.txt](agent/prompts/default_instruction.txt)

Next steps (optional)
- I can add an `env.example` file with placeholders for all required env vars.
- I can commit this change or create additional deployment helper scripts—tell me which.

End of reference.

