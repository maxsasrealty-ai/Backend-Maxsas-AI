# NEW BACKEND - COMPLETE UPDATED STATUS

Last Updated: 2026-05-26
Workspace: /root/maxsas-backend-ai
Purpose: Single source of truth for backend API wiring, frontend contract usage, and agent/server integration guidance.

> This document is the authoritative backend reference for frontend developers and agent-server integrators.
> Frontend must use backend APIs only. Do not call or depend on agent-specific internals unless a separate section below explicitly allows it.

## 1) Current Project Snapshot

- Project name: `maxsas-backend`
- Runtime: Node.js + Express (TypeScript, ESM)
- Entry: [src/index.ts](src/index.ts)
- Package manager: npm
- ORM: Prisma
- Queue: BullMQ
- Key integrations: LiveKit, SIP flow, webhook ingest, PayU, Razorpay, wallet/billing, account deletion, and admin control surfaces
- Shared request contracts live in [shared/contracts.ts](shared/contracts.ts)

## 2) Startup and Boot Behavior

- `src/index.ts` starts the outbound call worker, account-deletion sweeper, webhook bridge, and dev-auth seeding unless `NODE_ENV=test`.
- The app listens on `PORT` or defaults to `4000`.
- Startup logs include environment warnings for LiveKit, PayU, Redis, database, and safety-mode mismatches.

## 3) Verified NPM Scripts

From [package.json](package.json):

- `npm run dev` -> `node --import dotenv/config --import tsx src/index.ts`
- `npm run start` -> `node --import dotenv/config --import tsx src/index.ts`
- `npm run ui` -> prints the Master Control URL
- Prisma scripts:
  - `npm run prisma:generate`
  - `npm run prisma:migrate`
  - `npm run prisma:pull`
- Test and helper scripts:
  - `npm run test:lead-normalization`
  - `npm run test:voice-webhook`
  - `npm run test:outbound-call`
  - `npm run test:dispatch-contract`
  - `npm run test:e2e`
  - `npm run monitor:call`

## 4) Server Routing and Exposure

### 4.1 Public and Health Endpoints

- `GET /` -> JSON status message from the backend
- `GET /health` -> health response
- `GET /api/health` -> mounted health router response

### 4.2 Static Admin and Browser Surfaces

- `GET /admin` -> serves [public/admin.html](public/admin.html)
- `GET /admin-panel` -> serves [public/admin_panel.html](public/admin_panel.html)
- `GET /admin/master-control` -> serves [public/master-control.html](public/master-control.html)
- `GET /payments-panel` -> serves [public/payments_panel.html](public/payments_panel.html)
- `GET /delete-account` -> serves [public/delete-account.html](public/delete-account.html)
- `GET /account/settings` -> serves [public/account-settings.html](public/account-settings.html)
- `GET /admin-ui/*` -> static asset hosting from [public/](public)

### 4.3 Browser Convenience Redirects

These routes exist for browser navigation and redirect into the API:

- `GET /admin/dev-monitor/calls` -> `/api/admin/dev-monitor/calls`
- `GET /admin/dev-monitor/logs` -> `/api/admin/dev-monitor/logs`
- `GET /admin/dev-monitor/call-events/:call_id` -> `/api/admin/dev-monitor/call-events/:call_id`
- `GET /admin/dev-monitor/payments` -> `/api/admin/dev-monitor/payments`
- `GET /admin/dev-monitor/payment-events/:id` -> `/api/admin/dev-monitor/payment-events/:id`

### 4.4 API Router Mount

The backend mounts the main API at `/api` via [src/routes/index.ts](src/routes/index.ts).

Current route groups:

- `/api/health`
- `/api/admin`
- `/api/access`
- `/api/account`
- `/api/auth`
- `/api/capabilities`
- `/api/campaigns`
- `/api/enterprise/analytics`
- `/api/calls`
- `/api/leads`
- `/api/realtime`
- `/api/webhooks`
- `/api/payments/payu/webhook` with raw body middleware
- `/api/payments`
- `/api/wallet`
- `/api/payment/webhook` with raw body middleware
- `/api/payment`

### 4.5 Notable Admin Routes

The admin router includes:

- `/api/admin/live-events/stream`
- `/api/admin/live-events/recent`
- `/api/admin/users`
- `/api/admin/tenants`
- `/api/admin/tenants/:id`
- `/api/admin/tenants/:id/usage`
- `/api/admin/tenants/:id/wallet`
- `/api/admin/tenants/:id/control-center`
- `/api/admin/tenants/:id/campaigns`
- `/api/admin/tenants/:id/enterprise/convert`
- `/api/admin/tenants/:id/enterprise/clone`
- `/api/admin/tenants/:id/enterprise/credentials`
- `/api/admin/tenants/:id/enterprise/invite`
- `/api/admin/dev-monitor/calls`
- `/api/admin/dev-monitor/logs`
- `/api/admin/dev-monitor/payments`
- `/api/admin/dev-monitor/payment-events/:id`
- `/api/admin/dev-monitor/call-events/:call_id`
- `/api/admin/dev-monitor/livekit-room/:room_name`
- `/api/admin/backend-control`
- `/api/admin/backend-control/reset`
- `/api/admin/backend-control/actions/:action`
- `/api/admin/account-deletion/sweep`

## 5) Backend API Reference for Frontend

### 5.1 Frontend integration surface

Frontend should use these backend routes and headers:

- `POST /api/calls` to initiate outbound voice calls
- `GET /api/calls` to list calls
- `GET /api/calls/:callId` to fetch call detail
- `GET /api/calls/:callId/transcript` to fetch transcripts
- `GET /api/calls/:callId/recording` to fetch recording metadata
- `GET /api/calls/:callId/lead` to fetch the extracted lead
- `GET /api/health` for backend health
- `GET /api/access` and `GET /api/access/capabilities` for capability planning
- `GET /api/capabilities` for tenant-scoped capability checks
- `GET /api/realtime/calls/stream` and `GET /api/realtime/campaigns/stream` for SSE/admin stream usage
- `GET /api/admin/live-events/recent` for live event list in admin tooling
- `GET /api/admin/dev-monitor/calls`, `logs`, `payments`, `payment-events`, and `call-events` for backend diagnostics
- `GET /api/admin/tenants` and related tenant detail endpoints for admin workflows
- `GET /api/account/delete-status` plus delete/restore endpoints for account-deletion workflows

### 5.2 Request headers required by frontend

- `Authorization: Bearer <token>` for `requireAuth` protected routes
- `x-tenant-id: <tenantId>` for tenant-scoped routes like `/api/calls`, `/api/wallet`, `/api/leads`, and `/api/realtime`
- `Content-Type: application/json`
- `x-admin-key: <adminKey>` or bearer admin auth for admin routes that require it

### 5.3 Call creation contract

`POST /api/calls` requires all four fields:

```json
{
  "roomId": "room-123",
  "phoneNumber": "+918882453059",
  "agentName": "maxsas-voice-agent-prod",
  "direction": "outbound"
}
```

If any field is missing, the backend returns `400 INVALID_REQUEST`.

The response shape follows [shared/contracts.ts](shared/contracts.ts) and includes the created call data plus request metadata.

### 5.4 Frontend MUST NOT use these directly

- `/api/webhooks/voice/events`
- `/api/webhooks/voice/agent-logs`
- agent-specific internal endpoints unless explicitly instructed

These webhook endpoints are backend ingress points for voice event delivery, not frontend UI API surfaces.

## 6) Agent Server / Voice Integration Reference

### 6.1 Agent integration flow

- Frontend calls `/api/calls`.
- Backend validates request and tenant context.
- Backend normalizes phone numbers and initiates the call session.
- Backend emits and persists the call lifecycle and generates webhook details.
- Agent or voice systems send events into backend on `/api/webhooks/voice/events`.

### 6.2 Voice webhook configuration

The backend derives webhook URLs from environment configuration in [src/lib/config.ts](src/lib/config.ts):

- `API_BASE_URL` or `VOICE_WEBHOOK_PUBLIC_URL` is the base URL
- `BACKEND_WEBHOOK_URL` overrides the full voice event URL
- Default voice event target: `${base}/api/webhooks/voice/events`
- Default agent log target: `${base}/api/webhooks/voice/agent-logs`

### 6.3 Voice webhook auth expectations

Webhook senders should use bearer token auth from one of:

- `VOICE_WEBHOOK_BEARER_TOKEN`
- `BACKEND_WEBHOOK_TOKEN`
- `BACKEND_WEBHOOK_AUTH_TOKEN`

The backend uses `verifyWebhookAuth` middleware to validate incoming webhook bearer tokens.

### 6.4 Frontend / agent separation rule

- Frontend must not connect directly to agent-side voice webhook endpoints.
- Agent systems may send events to backend webhook endpoints, but frontend should only consume backend APIs.
- If a frontend task needs agent data, the request still goes through backend routes and not through agent server internals.

## 7) Auth, Tenant, and Capability Middleware

### 7.1 `requireAuth`

Protected routes use [src/middleware/requireAuth.ts](src/middleware/requireAuth.ts).

- Expects `Authorization: Bearer <token>`
- Accepts configured token from `AUTH_BEARER_TOKEN`
- Accepts dev tokens: `dev_token` or `dev-auth-token`

### 7.2 `requireTenant`

Tenant-scoped routes require `x-tenant-id` via [src/middleware/requireTenant.ts](src/middleware/requireTenant.ts).

If missing, backend returns `400 TENANT_REQUIRED`.

### 7.3 `requireAdminAccess`

Admin endpoints accept one of:

- `x-admin-key: <adminKey>`
- `Authorization: Bearer <adminKey>`
- `adminKey=<adminKey>` query parameter

### 7.4 Capability and feature gates

- `/api/calls` uses capability checks such as `calls.live` and `calls.history`
- Transcript access requires `transcripts.full`
- Recording access requires `recordings.playback`
- Lead preview endpoints require `calls.live`
- `/api/enterprise/analytics` requires `requireFeature("analytics", { analyticsLevel: "full" })`

## 8) Payment, Wallet, and Billing Wiring

### 8.1 PayU payment routes

Current PayU routes under `/api/payments`:

- `POST /api/payments/payu/initiate`
- `POST /api/payments/payu/return/success`
- `GET /api/payments/payu/return/success`
- `POST /api/payments/payu/return/failure`
- `GET /api/payments/payu/return/failure`
- `POST /api/payments/payu/mock-success`
- `GET /api/payments`
- `GET /api/payments/:paymentOrderId`
- `POST /api/payments/:paymentOrderId/verify-redirect`
- `POST /api/payments/verify-redirect`
- `POST /api/payments/payu/webhook`
- `POST /api/payments/:paymentOrderId/reconcile`
- `GET /api/payments/payu/admin/webhooks/recent/:tenantId`

The PayU return URL logic is driven by `PUBLIC_APP_URL`, `FRONTEND_BASE_URL`, `EXPO_PUBLIC_WEB_APP_URL`, `PAYU_FRONTEND_WEB_APP_URL`, `PAYU_REDIRECT_URL`, `PAYU_SERVER_RETURN_BASE`, `PAYU_WEBHOOK_URL`, and `PAYU_LOCAL_RETURN_URL`.

### 8.2 Razorpay legacy payment routes

Current Razorpay routes under `/api/payment`:

- `POST /api/payment/create-order`
- `POST /api/payment/verify`
- `POST /api/payment/webhook`
- `GET /api/payment/balance`
- `GET /api/payment/transactions`

### 8.3 Wallet ledger routes

Current wallet routes under `/api/wallet`:

- `GET /api/wallet/transactions`
- `GET /api/wallet/summary`
- `GET /api/wallet/balance`

The wallet summary includes wallet balance plus call-billing data, so wallet and billing changes must keep the wallet ledger and call billing records in sync.

## 9) Account Deletion and Data Retention

The account deletion surface is mounted under `/api/account` and is also mirrored through admin routes for privileged workflows.

### Public/account-scoped routes

- `POST /api/account/delete-request`
- `POST /api/account/delete-data`
- `GET /api/account/delete-status`
- `POST /api/account/delete-restore`
- `POST /api/account/delete-sweep`

### Admin mirrors

- `/api/admin/tenants/:tenantId/account-deletion/status`
- `/api/admin/tenants/:tenantId/account-deletion/delete-request`
- `/api/admin/tenants/:tenantId/account-deletion/delete-data`
- `/api/admin/tenants/:tenantId/account-deletion/restore`
- `/api/admin/account-deletion/sweep`

These routes are rate-limited and should be treated as live-data workflows.

## 10) Special Backend Wiring Notes

### 10.1 Raw body handling

- `/api/webhooks/voice/events` is mounted before `express.json()` with `express.raw()`.
- `/api/payments/payu/webhook` and `/api/payment/webhook` also use raw body middleware.

This is required for signature verification and proper webhook processing.

### 10.2 CORS rules

Allowed origins include:

- explicit dev origins: `http://localhost:8081`, `http://localhost:19006`, `http://localhost:3000`
- any `http://localhost:<port>` in non-production environments
- any origin listed in `CORS_ALLOWED_ORIGINS`

Allowed headers include:

- `Content-Type`
- `Authorization`
- `X-Requested-With`
- `Accept`
- `x-tenant-id`

### 10.3 Public admin UI path

- `GET /admin/master-control` serves the admin dashboard
- `GET /admin-ui/*` serves static frontend assets from [public/](public)

## 11) Environment Key Inventory

Values intentionally omitted. Keys observed in the current codebase include:

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

### Voice and realtime

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

### Billing and payments

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

### Auth and admin

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

## 12) Drift Fixed in This Update

- The workspace path is now the current repo, not `/root/new-backend`.
- Tenant data is under `/api/admin/tenants`, not `/api/tenants`.
- Realtime streams are `/api/realtime/calls/stream` and `/api/realtime/campaigns/stream`, not a generic `/api/realtime` stream.
- The `/api/account` mount is documented and included in the API surface.
- PayU and Razorpay routes are documented with their actual current paths.
