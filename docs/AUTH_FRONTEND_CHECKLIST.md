# Auth Frontend Quick Checklist

Purpose: one-page checklist for frontend engineers and QA to verify auth flows against the backend contract and isolate OTP/send-otp timeouts.

## Canonical Endpoints
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/signup/send-otp` — `{ email, fullName? }` → returns `{ cooldownSeconds, otpExpiresAt }`
- `POST /api/auth/signup/verify` — `{ email, otp, password, fullName? }` → returns `{ accessToken, refreshToken }`
- `POST /api/auth/password/forgot` — `{ email }`
- `POST /api/auth/password/reset` — `{ email, otp, newPassword }`

## Exact Fix Plan
- Make signup a strict two-step flow: send OTP first, then verify OTP + password.
- Remove any hardcoded `10s` timeout or auto-abort on `signup/send-otp`; allow `30s+` or no client timeout.
- Send request body as JSON only, exactly `{ email, fullName? }` for signup OTP send.
- After success, immediately switch UI to OTP entry and store the returned `otpExpiresAt` and `cooldownSeconds`.
- Disable resend until backend cooldown ends; do not invent a local cooldown that differs from backend.
- Preserve the email value across all auth screens and steps.
- On verify/login success, store both `accessToken` and `refreshToken`, then use `Authorization: Bearer <accessToken>` for protected requests.
- Show real backend `error.code` and `error.message`; do not replace them with a generic timeout message.
- If OTP send still hangs after the frontend fix, collect network trace + backend logs and check SMTP latency/provider errors.

## Frontend Rules
- Send JSON only: `Content-Type: application/json` and body exactly as the route expects.
- Do not hard-abort `send-otp` at 10 seconds. Allow 30 seconds or no client timeout for SMTP waits.
- Wait for `signup/send-otp` response before moving to OTP entry.
- Use backend `otpExpiresAt` and `cooldownSeconds` for UI timing and resend disablement.
- Preserve `email` across signup, verify, forgot-password, and reset screens.
- Disable submit/resend while pending; show spinner; clear success/error state on completion.
- Show backend `error.code` and `error.message` directly instead of a generic timeout.
- After `signup/verify` or `login`, store both `accessToken` and `refreshToken`.
- Send `Authorization: Bearer <accessToken>` on protected requests.

## What To Change In Frontend Code
- Search for auth request helpers and remove any `timeout: 10000`, `AbortController`, or retry wrapper around `signup/send-otp`.
- Update the signup screen state machine so step 1 only asks for email, step 2 asks for OTP + password.
- Use the server response to drive UI timing instead of local magic numbers.
- Keep the UI loading state active until the actual response arrives or a real network error occurs.
- If a response returns `cooldownSeconds`, disable resend from that number rather than a hardcoded value.
- If a response returns `otpExpiresAt`, display that timestamp or derive the remaining time from it.

## Quick Request Snippets
- send-otp
```js
await fetch('/api/auth/signup/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, fullName })
});
```
- forgot-password
```js
await fetch('/api/auth/password/forgot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email })
});
```
- verify
```js
await fetch('/api/auth/signup/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, otp, password, fullName })
});
```
- reset-password
```js
await fetch('/api/auth/password/reset', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, otp, newPassword })
});
```

## Timeout Guidance
- If using Axios, avoid `timeout: 10000` for `send-otp`; use `30000` or omit.
- If using `AbortController`, only abort for real cancel/navigation actions.

## Diagnostics To Attach
- HAR or network trace showing `POST /api/auth/signup/send-otp` (headers, body, response, elapsed time).
- Frontend console logs and any caught error stacks.
- Backend request log for the same timestamp (request ID if available).
- SMTP transport/provider logs showing send attempt and latency.
- DB row for created OTP with expiry and cooldown fields.

## QA Repro
1. From a fresh app state, attempt signup with a test email.
2. Capture network trace for `signup/send-otp` and note elapsed time and response body.
3. If client times out earlier than 30s, record exact abort timing and stack.
4. If backend hangs, attach backend logs and SMTP provider responses.

## Root Cause To Fix First
- The most likely frontend bug is an old timeout or state flow that still expects the OTP send step to finish in 10 seconds.
- The second likely bug is stale UI logic not using `cooldownSeconds` and `otpExpiresAt` from the backend response.
- The third likely bug is a mixed auth state machine that merges login, signup, and reset into one flow.

## Stop / Escalate
- If the frontend follows this checklist and the request still times out, the remaining likely causes are backend SMTP delay, rate limiting, or a missing backend log/route hit.
