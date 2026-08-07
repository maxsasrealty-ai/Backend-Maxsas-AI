# Maxsas Backend

Production backend for the Maxsas AI voice SaaS platform.

This service powers multi-tenant APIs, outbound call orchestration, voice webhook ingestion, realtime/SSE updates, wallet and billing flows, and admin control surfaces. It is production-connected, so local development should use the safe defaults below unless you intentionally need live side effects.

## What It Covers

- Multi-tenant APIs for auth, access, capabilities, calls, leads, campaigns, enterprise analytics, and admin workflows
- Outbound voice call dispatch through LiveKit/SIP and the BullMQ worker
- Voice webhook ingestion and event persistence
- Realtime event streams for call and campaign monitoring
- Wallet, billing, PayU, and Razorpay payment flows
- Admin UI, backend control, and account-deletion workflows

## Quick Start

```bash
npm install
npm run dev
```

If you want a fully local database for testing, start the bundled Postgres container first and use the local dev script:

```bash
npm run dev:local
```

This starts Postgres on `localhost:5432`, applies the Prisma migrations, and then launches the backend.

Then open:

- `http://localhost:4000/health`
- `http://localhost:4000/api/health`
- `http://localhost:4000/admin/master-control`

The `npm run ui` script prints the production master control shortcut, but the local app runs on `http://localhost:4000`.

## Safe Local Setup

Use these defaults for a safe local run:

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

If you are new to the repo, read [docs/INTERN_LOCAL_SETUP.md](docs/INTERN_LOCAL_SETUP.md) and [docs/LOCAL_DEVELOPMENT_SAFETY.md](docs/LOCAL_DEVELOPMENT_SAFETY.md) before changing runtime settings.

The local `.env` already points `DATABASE_URL` to `postgresql://postgres:Maxsas123@localhost:5432/maxsas_dev?schema=public`. Production should keep using the value from [\.env.prod.template](.env.prod.template) or the deployed environment.

## Important Environment Variables

### Core runtime

- `APP_ENV`
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `REDIS_DISABLED`
- `CORS_ALLOWED_ORIGINS`
- `OUTBOUND_QUEUE_CONCURRENCY`
- `API_BASE_URL`

### Voice, LiveKit, and webhooks

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

### Billing, payments, and wallet

- `BILLING_BYPASS`
- `VOICE_TEST_MODE`
- `PAYU_KEY`
- `PAYU_SALT`
- `PAYU_MODE`
- `PAYU_VERIFY_URL`
- `PAYU_SERVER_RETURN_BASE`
- `PAYU_WEBHOOK_URL`
- `PAYU_LOCAL_RETURN_URL`
- `PUBLIC_APP_URL`
- `FRONTEND_BASE_URL`
- `EXPO_PUBLIC_WEB_APP_URL`
- `PAYU_FRONTEND_WEB_APP_URL`
- `PAYU_REDIRECT_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Auth, admin, and seeding

- `AUTH_BEARER_TOKEN`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ADMIN_API_KEY`
- `DEV_AUTH_EMAIL`
- `DEV_AUTH_PASSWORD`
- `DEV_AUTH_FULL_NAME`
- `DEV_AUTH_TENANT_ID`
- `DEV_AUTH_TENANT_NAME`

### Email and provider settings

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `GOOGLE_CLIENT_ID`
- `BREVO_API_KEY`

### Safety toggles

- `LOCAL_DEVELOPMENT_SAFE_MODE`
- `ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS`

## NPM Scripts

These are the current package scripts in [package.json](package.json):

- `npm run dev`
- `npm run start`
- `npm run ui`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:pull`
- `npm run test:lead-normalization`
- `npm run test:voice-webhook`
- `npm run test:outbound-call`
- `npm run test:dispatch-contract`
- `npm run test:e2e`
- `npm run monitor:call`

Additional one-off utilities live under [scripts/](scripts/).

## Current Route Surface

### Public and health

- `GET /` returns the backend status JSON
- `GET /health`
- `GET /api/health`

### Browser and static UI surfaces

- `GET /admin` -> [public/admin.html](public/admin.html)
- `GET /admin-panel` -> [public/admin_panel.html](public/admin_panel.html)
- `GET /admin/master-control` -> [public/master-control.html](public/master-control.html)
- `GET /payments-panel` -> [public/payments_panel.html](public/payments_panel.html)
- `GET /delete-account` -> [public/delete-account.html](public/delete-account.html)
- `GET /account/settings` -> [public/account-settings.html](public/account-settings.html)
- `GET /admin-ui/*` serves the full [public/](public) directory as static assets
- `GET /payment/payu` is the PayU browser bridge that normalizes return data and redirects into the frontend wallet flow

### API groups

- `/api/auth` for login, Google sign-in, OTP, magic-link, refresh, and logout flows
- `/api/access` and `/api/capabilities` for capability and tenant workspace configuration
- `/api/calls` for create, list, detail, transcript, recording, and lead lookup flows
- `/api/leads` for list/detail and lead upload previews
- `/api/realtime` for SSE streams
- `/api/webhooks` for voice event ingestion
- `/api/payments` for PayU payment flows
- `/api/payment` for legacy Razorpay payment flows
- `/api/wallet` for wallet ledger and summary data
- `/api/account` for account-deletion workflows
- `/api/admin` for admin controls, tenant management, live events, and backend control
- `/api/enterprise/analytics` for enterprise analytics gating

## Key Runtime Flows

### Call orchestration

The outbound call path starts in [src/routes/calls/create.ts](src/routes/calls/create.ts), then moves through [src/services/callService.ts](src/services/callService.ts), [src/queue/producer.ts](src/queue/producer.ts), and [src/queue/worker.ts](src/queue/worker.ts) before dispatching to [src/services/telephonyService.ts](src/services/telephonyService.ts).

### Voice webhook ingestion

Voice events land in [src/modules/voice-events/voice-events.router.ts](src/modules/voice-events/voice-events.router.ts) and are processed by [src/modules/voice-events/voice-events.service.ts](src/modules/voice-events/voice-events.service.ts).

### Realtime / SSE

Realtime streams are served from [src/routes/realtime.ts](src/routes/realtime.ts) at `/api/realtime/calls/stream` and `/api/realtime/campaigns/stream`.

### Billing and wallet

Payment flows are implemented in [src/routes/payuPayment.ts](src/routes/payuPayment.ts), [src/routes/payment.ts](src/routes/payment.ts), and [src/routes/walletLedger.ts](src/routes/walletLedger.ts).

### Admin control

Admin APIs and runtime controls live in [src/routes/admin.ts](src/routes/admin.ts) and [src/services/backendControlService.ts](src/services/backendControlService.ts).

## Safety Notes

This backend is production-connected.

- Do not point `DATABASE_URL` at production unless you intend to work on the live system.
- Keep `REDIS_DISABLED=true` unless you are actively testing queue behavior.
- Keep `WEBHOOK_BRIDGE_ENABLED=false` unless you specifically need bridge polling.
- Use `VOICE_TEST_MODE=true` and `BILLING_BYPASS=true` for local development.
- Avoid production admin keys, webhook tokens, and payment credentials on a laptop.

## High-Risk Areas

These files can trigger real side effects and should be edited carefully:

- [src/services/telephonyService.ts](src/services/telephonyService.ts)
- [src/services/paymentService.ts](src/services/paymentService.ts)
- [src/services/payuService.ts](src/services/payuService.ts)
- [src/services/backendControlService.ts](src/services/backendControlService.ts)
- [src/routes/admin.ts](src/routes/admin.ts)
- [src/routes/webhooks/voice.ts](src/routes/webhooks/voice.ts)
- [src/routes/payuPayment.ts](src/routes/payuPayment.ts)
- [scripts/reset-db.ts](scripts/reset-db.ts)

## More Documentation

- [docs/INTERN_LOCAL_SETUP.md](docs/INTERN_LOCAL_SETUP.md)
- [docs/LOCAL_DEVELOPMENT_SAFETY.md](docs/LOCAL_DEVELOPMENT_SAFETY.md)
- [NEW_BACKEND_COMPLETE_STATUS_UP-TO-DATE.md](NEW_BACKEND_COMPLETE_STATUS_UP-TO-DATE.md)

## License

Private repository.