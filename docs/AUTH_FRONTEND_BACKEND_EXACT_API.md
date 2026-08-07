# Auth Frontend Backend Exact Contract

This document captures the current backend auth contract so frontend wiring does not drift.

## High-Level Flow

- Login is email + password through `POST /api/auth/login`.
- Signup is two-step:
  - `POST /api/auth/signup/send-otp` to send an OTP to the email.
  - `POST /api/auth/signup/verify` to verify the OTP and create the account with password.
- Forgot password is two-step:
  - `POST /api/auth/password/forgot` to send an OTP.
  - `POST /api/auth/password/reset` to verify OTP and set the new password.
- Token refresh is `POST /api/auth/refresh`.
- Logout is `POST /api/auth/logout`.
- Current session lookup is `GET /api/auth/me`.

## Route Details

### 1) Signup OTP Send

- Endpoint: `POST /api/auth/signup/send-otp`
- Request body: JSON object
  - `email` string, required
  - `fullName` string, optional
- Supported content types:
  - `application/json`
  - `application/x-www-form-urlencoded` is also accepted by the app body parser
- `x-tenant-id` header:
  - Not required for this route
  - Not used by the signup OTP flow
- Sync or async:
  - Synchronous request/response from the frontend point of view
  - The backend waits for OTP creation and email send attempt before responding
- Success response:
  - HTTP `200`
  - Shape:
    ```json
    {
      "success": true,
      "data": {
        "email": "user@example.com",
        "maskedEmail": "us***@example.com",
        "otpExpiresAt": "2026-05-25T13:00:00.000Z",
        "magicLinkExpiresAt": "",
        "cooldownSeconds": 60
      },
      "error": null
    }
    ```
- Failure response shape:
  - HTTP `400`, `410`, `429`, or `500` depending on cause
  - Shape:
    ```json
    {
      "success": false,
      "error": {
        "code": "OTP_SEND_FAILED",
        "message": "..."
      }
    }
    ```
- Important backend behavior:
  - Rate limiting is applied per IP and per email.
  - A cooldown window exists; frontend should disable the resend button using `cooldownSeconds`.
  - The backend sends the OTP email through SMTP via Nodemailer.

### 2) Signup OTP Verify and Account Create

- Endpoint: `POST /api/auth/signup/verify`
- Request body: JSON object
  - `email` string, required
  - `otp` string, required, must be 6 digits
  - `password` string, required, minimum 8 characters
  - `fullName` string, optional
- `x-tenant-id` header:
  - Not required
  - Signup creates a fresh tenant automatically
- Success response:
  - HTTP `201`
  - Same auth session/token payload shape as login
  - Includes `user`, `tenant`, `capabilities`, `accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `refreshExpiresIn`, `sessionId`
- Failure response shape:
  - HTTP `400`
  - Shape:
    ```json
    {
      "success": false,
      "error": {
        "code": "OTP_VERIFY_FAILED",
        "message": "..."
      }
    }
    ```
- Important backend behavior:
  - The account is created only after OTP verification succeeds.
  - Password is stored only at this step.
  - After verification, the backend also creates the auth session and returns tokens immediately.

### 3) Login with Password

- Endpoint: `POST /api/auth/login`
- Request body: JSON object
  - `email` string, required
  - `password` string, required
- `x-tenant-id` header:
  - Not required for login
- Success response:
  - HTTP `200`
  - Shape is the same as signup verify:
    - `user`
    - `tenant`
    - `capabilities`
    - `accessToken`
    - `refreshToken`
    - `tokenType`
    - `expiresIn`
    - `refreshExpiresIn`
    - `sessionId`
- Failure response:
  - HTTP `400` for invalid payload
  - HTTP `401` for invalid credentials
  - Shape:
    ```json
    {
      "success": false,
      "error": {
        "code": "INVALID_CREDENTIALS",
        "message": "..."
      }
    }
    ```

### 4) Forgot Password OTP Send

- Endpoint: `POST /api/auth/password/forgot`
- Request body:
  - `email` string, required
- Success response:
  - HTTP `200`
  - Same challenge shape as signup OTP send, except `magicLinkExpiresAt` is empty
- Failure response:
  - HTTP `400` or `500`
  - Standard failure shape with `success: false` and `error.code` / `error.message`
- Important backend behavior:
  - Rate limiting is applied per IP and per email.
  - The OTP email is sent through the SMTP provider.

### 5) Password Reset Verify

- Endpoint: `POST /api/auth/password/reset`
- Request body:
  - `email` string, required
  - `otp` string, required, 6 digits
  - `newPassword` string, required, minimum 8 characters
- Success response:
  - HTTP `200`
  - Shape:
    ```json
    {
      "success": true,
      "data": { "success": true },
      "error": null
    }
    ```
- Failure response:
  - HTTP `400`
  - Standard failure shape
- Important backend behavior:
  - The new password is applied only after OTP verification succeeds.
  - Existing sessions for that user are revoked during reset.

### 6) Refresh Token

- Endpoint: `POST /api/auth/refresh`
- Request body:
  - `refreshToken` string, required
- Success response:
  - HTTP `200`
  - Returns a fresh `accessToken` and rotated `refreshToken`
- Failure response:
  - HTTP `401`

### 7) Logout

- Endpoint: `POST /api/auth/logout`
- Request body:
  - `refreshToken` string, optional
  - `sessionId` string, optional UUID
  - `logoutAll` boolean, optional
- Success response:
  - HTTP `200`
- Failure response:
  - HTTP `500` only if the backend hits an unexpected error

### 8) Current Session

- Endpoint: `GET /api/auth/me`
- Header:
  - `Authorization: Bearer <accessToken>`
- Success response:
  - HTTP `200`
  - Returns the current user, tenant, capabilities, access token metadata, and session ID
- Failure response:
  - HTTP `401`

## Accepted Body Format

- Preferred format: JSON
- Also supported: `application/x-www-form-urlencoded`
- `multipart/form-data` is not part of the contract

## Tenant Header Behavior

- `x-tenant-id` is not mandatory for the auth flows above.
- Signup creates a tenant automatically.
- Login, signup verification, and password reset derive tenant/user context from the account record.
- If the frontend already has tenant context, it may still pass `x-tenant-id`, but the auth flow does not require it.

## OTP Source of Truth

- Backend is the source of truth for OTP expiry.
- Frontend timers are only display helpers.
- Signup OTP expiry is `5 minutes` on the backend.
- Login magic-link expiry is `10 minutes` on the backend.
- Cooldown for resend is `60 seconds` on the backend response.

## Provider Used for OTP Delivery

- OTP delivery uses SMTP through Nodemailer.
- In production the backend expects SMTP environment variables to be set.
- In local/dev without SMTP, Nodemailer can fall back to stream transport.

## Exact Backend Failure Shape

- The backend always replies in this general error shape:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable message"
    }
  }
  ```
- Validation failures return HTTP `400`.
- Credential failures return HTTP `401`.
- Account deletion or locked account cases may return HTTP `410`.
- Rate limiting may return HTTP `429`.

## Practical Frontend Wiring Rules

- Do not wait for any separate polling step after calling signup OTP send.
- After OTP send succeeds, show the OTP input screen immediately.
- Disable resend until `cooldownSeconds` elapses.
- For signup, do not create the account before OTP verification.
- For forgot password, do not update the password before OTP verification.
- Always store `accessToken` and `refreshToken` after successful login/signup/refresh.
- Always send `Authorization: Bearer <accessToken>` on protected API calls.
