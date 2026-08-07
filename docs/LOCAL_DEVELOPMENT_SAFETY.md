# Local Development Safety

This backend is connected to production-grade voice, billing, and tenant workflows. Local runs should default to a safer posture unless you explicitly opt out.

## Recommended local defaults

- APP_ENV=development
- NODE_ENV=development
- LOCAL_DEVELOPMENT_SAFE_MODE=true
- ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS=false
- REDIS_DISABLED=true
- VOICE_TEST_MODE=true
- BILLING_BYPASS=true
- WEBHOOK_BRIDGE_ENABLED=false

## What the safety layer does

- Warns when local mode is pointed at a remote database, Redis instance, LiveKit cluster, or webhook host.
- Forces payment flows into mock behavior when local safety mode is active.
- Skips real outbound telephony side effects in local safety mode.
- Keeps production behavior unchanged.

## Before running locally

- Use a local DATABASE_URL whenever possible.
- Keep ADMIN_API_KEY, webhook tokens, and LiveKit credentials out of shared shell history.
- Treat .runtime state as disposable local-only data.

## Opting out

Set ALLOW_DANGEROUS_LOCAL_SIDE_EFFECTS=true only when you intentionally need to hit real external systems from a non-production environment.
