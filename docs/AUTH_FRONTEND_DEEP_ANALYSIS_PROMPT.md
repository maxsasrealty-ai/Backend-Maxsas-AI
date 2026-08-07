# Auth Frontend Deep Analysis Handoff

This note is meant to isolate the current auth flow breakage before making more code changes.

## Current Architecture Summary

### Backend auth contract

- Login: `POST /api/auth/login`
  - Body: `{ email, password }`
- Signup OTP send: `POST /api/auth/signup/send-otp`
  - Body: `{ email, fullName? }`
- Signup OTP verify and account create: `POST /api/auth/signup/verify`
  - Body: `{ email, otp, password, fullName? }`
- Forgot password OTP send: `POST /api/auth/password/forgot`
  - Body: `{ email }`
- Password reset verify: `POST /api/auth/password/reset`
  - Body: `{ email, otp, newPassword }`
- Refresh: `POST /api/auth/refresh`
- Logout: `POST /api/auth/logout`
- Me: `GET /api/auth/me`

### Backend behavior assumptions

- Signup OTP send is synchronous from the client perspective.
- The response should only come after OTP creation and the email send attempt.
- The backend returns `cooldownSeconds` and `otpExpiresAt`.
- Signup does not create the account until OTP verification succeeds.
- Password reset does not update the password until OTP verification succeeds.
- OTP delivery is SMTP-based through Nodemailer in production.

## What Is Most Likely Breaking

The visible frontend timeout can come from one of these layers:

1. The frontend aborts too early before backend finishes SMTP work.
2. The request reaches backend, but OTP email sending blocks or fails.
3. The frontend expects old fields and does not render the new backend contract cleanly.
4. The UI sends the wrong payload shape for signup or reset.
5. The UI state machine is mixing login, signup, and reset flows into one stale screen model.

## Exact Frontend Flow To Inspect

### Signup flow

1. User enters email.
2. Frontend calls `POST /api/auth/signup/send-otp`.
3. Frontend waits for backend response.
4. On success, frontend stores `otpExpiresAt` and `cooldownSeconds`.
5. Frontend shows OTP entry screen.
6. User enters OTP and password.
7. Frontend calls `POST /api/auth/signup/verify`.
8. On success, frontend stores `accessToken` and `refreshToken`.

### Login flow

1. User enters email and password.
2. Frontend calls `POST /api/auth/login`.
3. On success, frontend stores `accessToken` and `refreshToken`.
4. Frontend sends `Authorization: Bearer <accessToken>` on protected requests.

### Forgot-password flow

1. User enters email.
2. Frontend calls `POST /api/auth/password/forgot`.
3. Frontend waits for backend response.
4. Frontend shows OTP input.
5. User enters OTP and new password.
6. Frontend calls `POST /api/auth/password/reset`.

## Deep Diagnostic Questions For Frontend

Answer these first before changing the backend again.

### Request shape

- What exact payload is the frontend sending to `POST /api/auth/signup/send-otp`?
- Is it sending JSON or form-urlencoded?
- Is `Content-Type: application/json` always present?
- Is the frontend accidentally sending extra fields or nesting the body under another object?

### Timing and timeout

- What is the current request timeout for signup OTP?
- Is the frontend aborting the request before the backend responds?
- Does the timeout differ between login, signup, and forgot-password screens?
- Is there any retry logic that may cause duplicate OTP requests?

### UI state

- After OTP send succeeds, does the UI immediately move to the OTP step?
- Is the UI still showing a stale login screen state after signup submit?
- Are resend and submit buttons disabled while the request is pending?
- Does the UI preserve the email across steps?

### Response handling

- Does the frontend read `otpExpiresAt` from the signup response?
- Does the frontend read `cooldownSeconds` from the signup response?
- Does the frontend show the correct success message after OTP send?
- Are backend error codes displayed as-is or being overwritten by a generic timeout error?

### Token handling

- Does the frontend persist both `accessToken` and `refreshToken` after login/signup verify/refresh?
- Is the refresh token stored in the same place across all auth flows?
- Does the frontend send the access token in the `Authorization` header for protected routes?

### UX edge cases

- What happens if OTP send succeeds but the email is delayed?
- What does the UI show if the OTP send call takes 15 to 30 seconds?
- Does the UI allow resending before `cooldownSeconds` elapses?
- Does the UI recover gracefully if verification fails with an invalid OTP?

## Backend Questions To Confirm If Frontend Looks Correct

- Is `POST /api/auth/signup/send-otp` actually reaching the backend route?
- Is the backend waiting on SMTP send before responding?
- Is SMTP configured correctly in the current environment?
- Is the provider returning a transport error or delayed response?
- Is the route hitting rate limiting or email cooldown logic?
- Does the backend log show `OTP_SEND_FAILED`, `ACCOUNT_DELETED`, `OTP_TOO_MANY_ATTEMPTS`, or `429`?
- Is the database migration state fully synced for auth tables and fields?

## Exact Frontend Prompt To Give The Team

Use this prompt as-is:

"Audit the auth UI against the backend contract and remove any old assumptions. Signup must be a two-step flow: first call `POST /api/auth/signup/send-otp` with `{ email, fullName? }`, wait for the response, then move to OTP entry and call `POST /api/auth/signup/verify` with `{ email, otp, password, fullName? }`. Forgot password must be a two-step flow: call `POST /api/auth/password/forgot` with `{ email }`, then call `POST /api/auth/password/reset` with `{ email, otp, newPassword }`. Login must use `POST /api/auth/login` with `{ email, password }`. Treat the backend as synchronous for OTP send, honor `cooldownSeconds` and `otpExpiresAt` from the backend response, do not hardcode a 10-second timeout for OTP send, store `accessToken` and `refreshToken` on successful auth, and send `Authorization: Bearer <accessToken>` on protected requests. If OTP send fails or hangs, surface the real backend error code/message instead of converting it into a generic UI timeout."

## Shorter Handoff Prompt

Use this if you want a compact version for the frontend owner:

"Please align the auth UI to the backend contract exactly: login via `POST /api/auth/login` with email/password, signup as a two-step flow using `POST /api/auth/signup/send-otp` then `POST /api/auth/signup/verify`, and forgot-password as a two-step flow using `POST /api/auth/password/forgot` then `POST /api/auth/password/reset`. The OTP send endpoint is synchronous, so the UI must wait for the real response, respect `cooldownSeconds` and `otpExpiresAt`, not hardcode a 10s timeout, preserve email across steps, and surface backend error codes/messages instead of a generic timeout. On success, store both `accessToken` and `refreshToken`, and use `Authorization: Bearer <accessToken>` for protected API calls."

## Exact Questions To Ask The Frontend Owner

If you want to isolate the mismatch quickly, ask these in order:

1. What exact payload and `Content-Type` are you sending to `POST /api/auth/signup/send-otp`?
2. Do you have any 10s timeout or `AbortController` around the signup OTP request?
3. Are you reading `cooldownSeconds` and `otpExpiresAt` from the success response?
4. Does the UI immediately switch to the OTP step after send-otp succeeds?
5. Are login, signup verify, forgot password, and password reset all using separate state paths?
6. Are you storing both `accessToken` and `refreshToken` after successful auth?
7. Are protected API requests consistently using `Authorization: Bearer <accessToken>`?
8. If send-otp fails, are you showing the backend `error.code` / `error.message` or replacing it with a generic timeout?

## What To Verify Next In Logs

When frontend looks correct, ask the backend side to confirm:

1. Whether `POST /api/auth/signup/send-otp` is reaching the route.
2. Whether SMTP send is blocking the response or failing.
3. Whether the backend is returning `200`, `400`, `429`, or `500` for that request.
4. Whether the log shows `OTP_SEND_FAILED`, `OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_DELETED`, or a transport error.


## Recommended Debug Order

1. Verify the frontend payload and timeout settings.
2. Verify the backend route log for `signup/send-otp`.
3. Verify SMTP delivery logs and provider errors.
4. Verify the OTP response fields shown in the UI.
5. Verify signup verify and password reset flows after OTP delivery works.
