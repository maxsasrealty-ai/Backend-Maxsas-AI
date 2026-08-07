# Intern Local Setup Guide

This guide is for anyone cloning this backend for the first time. It explains how to run the project locally, which environment variables matter, and which parts of the system are production-sensitive.

## What This Backend Does

This is a production backend for a live AI voice SaaS platform. It handles:

- Multi-tenant APIs
- Voice call orchestration
- Voice webhook ingestion
- SSE / realtime updates
- Billing and wallet flows
- Admin control surfaces
- Queue-backed outbound call dispatch
- LiveKit / SIP integration

Treat it as a live system, not a demo app.

## Recommended Local Defaults

Use these settings for normal local work:

```env
APP_ENV=development
NODE_ENV=development
LOCAL_DEVELOPMENT_SAFE_MODE=true
ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS=false
REDIS_DISABLED=true
VOICE_TEST_MODE=true
BILLING_BYPASS=true
WEBHOOK_BRIDGE_ENABLED=false
```

If you ever set `ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS=true`, you are explicitly opting into risky behavior such as calling real external services from a non-production environment.

## Setup Steps

1. Install dependencies.

```bash
npm install
```

2. Create a local `.env` file in the repo root.

Use the variable list below as a starting point. Do not reuse production secrets.

3. Start the backend.

```bash
npm run dev
```

4. Open the health check.

- `GET http://localhost:4000/health`
- `GET http://localhost:4000/api/health`

5. Open the admin UI if you need it.

- `GET http://134.209.157.41:4000/admin/master-control`

## Important Environment Variables

### Core runtime

- `APP_ENV` - `development`, `staging`, or `production`
- `NODE_ENV` - usually `development` locally
- `PORT` - backend port, default `4000`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string, default `redis://127.0.0.1:6379`
- `REDIS_DISABLED` - set `true` if you do not want BullMQ/Redis locally

### Voice and webhook integration

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_AGENT_NAME`
- `SIP_OUTBOUND_TRUNK_ID`
- `LIVEKIT_OUTBOUND_TRUNK_ID`
- `VOICE_WEBHOOK_PUBLIC_URL`
- `BACKEND_WEBHOOK_URL`
- `VOICE_WEBHOOK_BEARER_TOKEN`
- `BACKEND_WEBHOOK_TOKEN`
- `BACKEND_WEBHOOK_AUTH_TOKEN`
- `WEBHOOK_BRIDGE_ENABLED`
- `WEBHOOK_SERVER_BASE_URL`
- `WEBHOOK_BRIDGE_POLL_MS`
- `VOICE_TEST_MODE`

### Billing and payments

- `BILLING_BYPASS` - skips billing charges in supported paths
- `PAYU_KEY`
- `PAYU_SALT`
- `PAYU_MODE`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Auth and admin

- `AUTH_BEARER_TOKEN`
- `ADMIN_API_KEY`
- `DEV_AUTH_EMAIL`
- `DEV_AUTH_PASSWORD`
- `DEV_AUTH_FULL_NAME`
- `DEV_AUTH_TENANT_ID`
- `DEV_AUTH_TENANT_NAME`

## What You Need to Know Before Editing Code

### 1. This backend can mutate production state

The code can write to real tenant rows, call rows, lead rows, wallet rows, and payment tables. Be careful around:

- [src/services/telephonyService.ts](../src/services/telephonyService.ts)
- [src/modules/voice-events/voice-events.service.ts](../src/modules/voice-events/voice-events.service.ts)
- [src/services/paymentService.ts](../src/services/paymentService.ts)
- [src/services/payuService.ts](../src/services/payuService.ts)
- [src/services/backendControlService.ts](../src/services/backendControlService.ts)
- [src/routes/admin.ts](../src/routes/admin.ts)

### 2. Admin endpoints are powerful

Admin routes can create or mutate tenants, reset runtime state, restart queue behavior, test webhooks, and inspect internal data.

- [src/routes/admin.ts](../src/routes/admin.ts)
- [src/routes/realtime.ts](../src/routes/realtime.ts)
- [src/routes/access.ts](../src/routes/access.ts)

### 3. Webhooks are live ingress paths

Webhook endpoints should be treated as production ingress, not test endpoints.

- [src/routes/webhooks/voice.ts](../src/routes/webhooks/voice.ts)
- [src/middleware/verifyWebhookAuth.ts](../src/middleware/verifyWebhookAuth.ts)
- [src/services/webhookBridgeService.ts](../src/services/webhookBridgeService.ts)

### 4. Realtime / SSE can leak live tenant data

If you connect to realtime routes with the wrong tenant or admin key, you can see live operational events.

- [src/routes/realtime.ts](../src/routes/realtime.ts)
- [src/services/realtimeService.ts](../src/services/realtimeService.ts)
- [src/services/callObservabilityService.ts](../src/services/callObservabilityService.ts)

### 5. Queue and worker behavior matters

Outbound call dispatch can hit LiveKit / SIP and create real external side effects.

- [src/queue/producer.ts](../src/queue/producer.ts)
- [src/queue/worker.ts](../src/queue/worker.ts)
- [src/services/callService.ts](../src/services/callService.ts)

## Safer Local Workflow

- Keep `DATABASE_URL` pointed to a local database.
- Keep `REDIS_DISABLED=true` unless you specifically need queue testing.
- Keep `WEBHOOK_BRIDGE_ENABLED=false` unless you know why you need it.
- Use `VOICE_TEST_MODE=true` and `BILLING_BYPASS=true` locally.
- Do not use production webhook tokens or admin keys on a laptop unless explicitly required for a controlled test.
- Do not run reset scripts against a production database.

## High-Risk Files To Avoid Running Blindly

- [scripts/reset-db.ts](../scripts/reset-db.ts)
- [scripts/reset-db.mjs](../scripts/reset-db.mjs)
- [src/services/backendControlService.ts](../src/services/backendControlService.ts)
- [src/routes/admin.ts](../src/routes/admin.ts)
- [src/services/telephonyService.ts](../src/services/telephonyService.ts)
- [src/services/paymentService.ts](../src/services/paymentService.ts)
- [src/services/payuService.ts](../src/services/payuService.ts)

## Useful Commands

```bash
npm run dev
npm run prisma:generate
npm run prisma:migrate
npm run prisma:pull
npm run test:voice-webhook
npm run test:outbound-call
npm run test:dispatch-contract
```

## Troubleshooting

### Backend fails to start

- Check `DATABASE_URL`
- Check `REDIS_URL` or set `REDIS_DISABLED=true`
- Check LiveKit envs if you are exercising outbound call paths

### Auth requests fail

- Verify `AUTH_BEARER_TOKEN`
- For local-only dev auth, check `DEV_AUTH_EMAIL` and `DEV_AUTH_PASSWORD`

### Webhook requests fail

- Check `VOICE_WEBHOOK_BEARER_TOKEN`, `BACKEND_WEBHOOK_TOKEN`, or `BACKEND_WEBHOOK_AUTH_TOKEN`
- Make sure the sender uses the bearer header expected by the backend

### Queue jobs do not run

- Check Redis availability
- Check `REDIS_DISABLED`
- Check `OUTBOUND_QUEUE_CONCURRENCY`

### Billing actions appear to do nothing

- Check `VOICE_TEST_MODE` and `BILLING_BYPASS`
- If you are in local safety mode, payment flows may be mocked by design

## Final Rule

If you are not sure whether a route or script can hit production data, assume that it can until you verify otherwise.