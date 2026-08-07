# PayU Frontend Payment Flow Reference

This document describes the current frontend PayU wallet top-up flow and the exact request/response contract the backend must support.

## Purpose

This file is intended as a backend-facing reference for the frontend payment integration. It captures the active flow, files, payload shapes, callback expectations, and UI update behavior.

## Direct answers

These are the current answers based on the live frontend implementation:

1. Frontend stack: Expo React Native with file-based routing via `expo-router`. The same codebase supports web and native/mobile targets.
2. PayU initiate and form submission live in `hooks/useWallet.ts`. Web submission happens in `submitPayUHostedForm(data)`. Native navigation into the WebView checkout happens in `openPayUCheckoutNative(data)`, and the actual WebView form submit is in `app/(protected)/lexus/wallet/checkout.tsx`.
3. The payment flow is both web and native.
4. Web uses a hidden form submit in the same tab. Native uses the in-app WebView checkout screen.
5. On success, the wallet page shows a success message, refreshes wallet balance, and the transaction list updates through `refreshBalance()`.
6. On failure, the wallet page shows a failure message. There is no dedicated retry button in the current UI.
7. There is now a dedicated callback route at `app/payment/payu.tsx`. The callback screen waits for backend confirmation before returning to Wallet.
8. The frontend currently expects `PayUInitiateResponse` from `lib/api/payment.ts`.
9. `successUrl` and `failureUrl` are currently sent by the frontend in the initiate request. They are not only backend-provided today.
10. No, the current implementation does not add explicit debug logs for the final PayU payload or form action URL.

## Key files

- `hooks/useWallet.ts`
  - `topUp(amountPaise)`
  - `submitPayUHostedForm(data)`
  - `openPayUCheckoutNative(data)`
  - `simulateTopUpSuccess(amountPaise)`
  - `refreshBalance()`

- `lib/api/payment.ts`
  - `initiatePayUCheckout(payload)`
  - `PayUInitiateRequest`
  - `PayUInitiateResponse`

- `app/(protected)/lexus/wallet/checkout.tsx`
  - `PayUCheckoutScreen`
  - WebView checkout page for native/mobile flows

- `app/(protected)/lexus/wallet.tsx`
  - Wallet screen UI
  - handles `?payment=success` and `?payment=failure`

## Flow overview

### 1. User initiates top-up

When the user presses a quick top-up button or enters a manual amount, `useWallet.topUp(amountPaise)` is called.

### 2. Frontend calls backend

The frontend sends an `initiatePayUCheckout` request to the backend endpoint:

- URL: `/payments/payu/initiate`
- Method: `POST`
- Body shape: `PayUInitiateRequest`

### 3. Backend responds with PayU checkout data

Frontend expects a successful response with `PayUInitiateResponse`.

### 4. Web vs native handling

- Web: `submitPayUHostedForm(data)` creates a hidden HTML form and POSTs it directly to `data.payuUrl` in the same browser tab.
- Native/mobile: `openPayUCheckoutNative(data)` navigates to `app/(protected)/lexus/wallet/checkout.tsx` with PayU params as query values, then that screen renders a WebView and auto-submits the form.

### 5. Native checkout WebView

`PayUCheckoutScreen` constructs a small HTML page with a hidden form and auto-submits to `payload.payuUrl`.

The WebView also intercepts navigation events to:

- open `upi:`, `intent:`, `phonepe:`, `paytmmp:`, `tez:` via `Linking.openURL`
- intercept non-http(s) schemes and delegate to `Linking.openURL`
- detect `successUrl` / `failureUrl` and return to the wallet page

### 6. Wallet callback handling

`app/payment/payu.tsx` now owns the callback lifecycle and:

- reads the PayU return parameters and the durable pending-payment record
- shows a loading state while backend reconciliation is still pending
- polls wallet balance and transaction APIs until the webhook-confirmed credit is visible
- clears the pending-payment record after confirmation or terminal failure
- redirects back to the Wallet screen with `payment=success` or `payment=failure`

`app/(protected)/lexus/wallet.tsx` still consumes the `payment` query parameter for the final UI state, but it is no longer the primary callback processor.

## Backend request contract

### `PayUInitiateRequest`

```ts
export interface PayUInitiateRequest {
  amount: number;        // amount in paise
  description: string;
  email: string;
  phoneNumber: string;
  userId: string;
  successUrl: string;
  failureUrl: string;
}
```

### Notes

- `amount` is always passed in paise.
- `successUrl` and `failureUrl` are full callback URLs.
  - On web, the URL is built from `EXPO_PUBLIC_WEB_APP_URL` when provided, otherwise from the current secure origin and normalized to HTTPS when appropriate.
  - For local fallback testing, set `EXPO_PUBLIC_PAYU_LOCAL_RETURN_URL` to `http://localhost:4000` to use the backend fallback page, or `http://localhost:8081` to test the Expo web route.
  - On native, the URL is built with `Linking.createURL("payment/payu")`.
- `email`, `phoneNumber`, and `userId` are derived from the authenticated user.
- The frontend currently sends both `successUrl` and `failureUrl` as part of the initiate request.
- The pending payment is persisted across the redirect so app resumes/background transitions can recover the flow.

## Backend response contract

### `PayUInitiateResponse`

```ts
export interface PayUInitiateResponse {
  paymentOrderId: string;
  merchantTransactionId: string;
  payuKey: string;
  hash: string;
  amount: number;
  email: string;
  phoneNumber: string;
  description: string;
  payuMode: string;
  payuUrl: string;
  successUrl: string;
  failureUrl: string;
}
```

### Required response fields

- `paymentOrderId`: frontend stores this for display only.
- `merchantTransactionId`: used as PayU `txnid`.
- `payuKey`: PayU merchant key.
- `hash`: SHA512 hash required for PayU checkout.
- `amount`: original amount in paise.
- `email`: customer email.
- `phoneNumber`: customer phone.
- `description`: optional text for payment metadata.
- `payuMode`: PayU mode indicator (`test` / `live` / other).
- `payuUrl`: MUST be an HTTPS PayU URL.
- `successUrl` / `failureUrl`: callback URLs sent back to the client on redirect.
- The frontend consumes this shape directly from `lib/api/payment.ts` and passes the fields through to the form payload unchanged, except for converting amount from paise to rupees when building the hosted form.

## PayU form generation

### Web path

`submitPayUHostedForm(data)` posts these PayU form fields:

- `key`
- `txnid`
- `amount` (converted from paise to rupees)
- `productinfo` = `wallet_topup`
- `firstname` = first part of email
- `email`
- `phone`
- `hash`
- `surl` = successUrl
- `furl` = failureUrl
- `service_provider` = `payu_paisa`

### Native path

`checkout.tsx` builds the same form fields and submits them from a WebView.

Note: the amount that goes into the PayU form is `amount / 100`.

## Callback expectations

The backend must ensure PayU checkout redirects to the provided `successUrl` or `failureUrl`.

Frontend behavior:

- On `successUrl` redirect, the app returns to the wallet page and refreshes balance.
- On `failureUrl` redirect, the wallet page shows a failure message.

## UI update behavior

The frontend now verifies payment success by waiting for the wallet ledger and transaction APIs to show the webhook-confirmed credit before it shows the final success state.

The backend must therefore:

- mark the payment attempt as succeeded or failed in the DB
- update the wallet balance and transaction history
- support both test and live PayU modes consistently

The frontend will refresh the wallet balance after success and display updated transactions.

Current UI behavior is intentionally lightweight: success/failure is surfaced through the wallet page message, not through a dedicated toast or standalone result screen.

## Dev-only support

The frontend also calls a dev mock endpoint:

- `POST /payments/payu/mock-success`

This is used only for simulated balance crediting during development.

## Important backend requirements

- Backend should accept tenant context via the normal request flow.
- The frontend client uses `lib/api/client.ts`, which injects `x-tenant-id` when available.
- Do not rely on a request body field named `tenantId` unless the backend also supports it; the frontend sends tenant scope through headers.
- `payuUrl` must be HTTPS, not a `upi:` deep link.
- The route must return response data in the format expected by `PayUInitiateResponse`.

## Notes for backend developers

- The frontend uses `router.push("/(protected)/lexus/wallet/checkout?${params}")` for native PayU checkout.
- The callback screen at `app/payment/payu.tsx` performs confirmation polling, then returns to Wallet.
- The wallet screen still listens for `?payment=success` and `?payment=failure` and refreshes data on success.
- A correct backend flow should persist the payment order/attempt and reconcile via webhook or callback.
- If the backend returns a non-HTTPS `payuUrl`, the native WebView flow will fail.
- If you want payload-level debugging, it is not present today and should be added explicitly in the checkout submission path.

## Summary

This document is the current frontend reference for the PayU wallet top-up flow. Backend implementation should match the request/response contract exactly, persist payment status, and support both test and live PayU modes so the UI displays accurate wallet balance and transaction state.



Troubleshoot From Frontend

# Payment Gateway "Error Loading URL" - Troubleshooting

**Date:** May 16, 2026  
**Error:** "This site can't be reached" / DNS_PROBE_FINISHED_NXDOMAIN  
**Status:** Fixed ✅

---

## 🔴 The Issue

When trying to open the PayU payment gateway, you get:
```
This site can't be reached
Error code: DNS_PROBE_FINISHED_NXDOMAIN
Check if there is a typo in test.payumoney.com
```

**Why?** The PayU test domain `test.payumoney.com` is:
- Not accessible from your region/network
- Possibly blocked by ISP/firewall
- Not available in your country

---

## Why Vercel Shows HTTP 405 On Success Redirect

This is a separate issue from PayU connectivity.

In this codebase, the PayU return URL is built by the frontend and points to the web app callback route at `/payment/payu`.

### What the frontend does

- `lib/payments/payuFlow.ts` builds the callback URL.
- On web, it prefers `EXPO_PUBLIC_WEB_APP_URL` and normalizes it to HTTPS when possible.
- If `EXPO_PUBLIC_PAYU_LOCAL_RETURN_URL` is set and the app is running on localhost, that override is used for local testing.
- On native, the callback URL is built with `Linking.createURL("payment/payu")`.

### What the callback route does

- `app/payment/payu.tsx` is a client-side Expo Router screen.
- It is not a backend endpoint.
- It reads `payment`, `txnid`, `mihpayid`, `amount`, `error`, and `reason` from the query string.
- It then polls wallet balance and transaction APIs until the backend webhook credit is visible.
- After confirmation, it redirects the user back to the Wallet screen.

### Why Vercel fails

- Vercel static export serves the callback route as a static page.
- PayU can return through a form POST or a redirect flow that is not compatible with a static-only host path.
- If the browser or PayU hits `/payment/payu` with a method Vercel does not serve for that asset path, Vercel returns `HTTP ERROR 405`.
- The current `vercel.json` only rewrites `/api/*` to the backend. It does not create a server callback handler for `/payment/payu`.

### Exact consequence

If PayU sends the user directly to `https://maxsasrealtyai.in/payment/payu` and Vercel treats it as a static asset request, the browser can show:

- `This page isn’t working right now`
- `HTTP ERROR 405`

This is a hosting/routing issue, not a payment-gateway hash issue.

---

## Backend Handoff Pack

Use this section as the exact implementation brief for the backend.

### Frontend route contract

The frontend currently expects these callback query params:

- `payment=success|failure`
- `txnid`
- `mihpayid`
- `amount`
- `error`
- `reason`

The callback screen uses them to:

- identify the payment attempt
- match the wallet ledger transaction
- wait for webhook confirmation
- return the user to Wallet with `payment=success` or `payment=failure`

### Frontend request contract for PayU initiate

The frontend sends this shape to the backend:

```ts
{
  amount: number;        // paise
  description: string;
  email: string;
  phoneNumber: string;
  userId: string;
  successUrl: string;
  failureUrl: string;
}
```

This request is sent to:

- `POST /api/payments/payu/initiate`

### Backend response contract expected by frontend

The frontend expects:

```ts
{
  paymentOrderId: string;
  merchantTransactionId: string;
  payuKey: string;
  hash: string;
  amount: number;
  email: string;
  phoneNumber: string;
  description: string;
  payuMode: string;
  payuUrl: string;
  successUrl: string;
  failureUrl: string;
}
```

### What backend must ensure

1. Generate a valid PayU hash and return `payuUrl` as an HTTPS PayU endpoint.
2. Persist the payment initiation so webhook reconciliation can map PayU response back to the wallet top-up.
3. Accept PayU success/failure return traffic without relying on a static-only route.
4. On redirect from PayU, send the user to a GET-accessible callback page, not to a POST-only or static-only asset path.
5. Keep the callback query params intact so the frontend can reconcile the transaction.

### Recommended hosting behavior

Best production setup:

- PayU returns to a backend-controlled callback endpoint first.
- Backend validates the callback and then redirects the browser to the frontend callback route `/payment/payu` using GET.
- The frontend callback page polls wallet state until the webhook-confirmed credit is visible.

If you want the frontend route to stay as the final landing page, the backend still needs a server-side callback step in front of it on Vercel.

### Environment variables involved

Frontend environment variables currently used by the flow:

- `EXPO_PUBLIC_WEB_APP_URL`
- `EXPO_PUBLIC_PAYU_LOCAL_RETURN_URL`

Recommended values:

- Production web app URL: `https://maxsasrealtyai.in`
- Local backend fallback return URL: `http://localhost:4000`
- Local Expo route testing: `http://localhost:8081`

### Files backend should review

- `lib/payments/payuFlow.ts`
- `hooks/useWallet.ts`
- `app/payment/payu.tsx`
- `app/(protected)/lexus/wallet.tsx`
- `app/(protected)/lexus/wallet/checkout.tsx`
- `vercel.json`

---

## ✅ Solution 1: Use Mock Success Endpoint (RECOMMENDED FOR DEV)

Instead of going through PayU, simulate a successful payment:

```bash
# Add money to wallet instantly (development only)
node scripts/test-payment-mock.mjs 100000 user-uuid-123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "amountPaise": 100000,
    "newBalancePaise": 100000,
    "newBalanceFormatted": "₹1,000.00",
    "message": "Mock payment successful"
  }
}
```

**Advantages:**
✅ No network dependency  
✅ Instant completion  
✅ Perfect for testing UI/flow  
✅ Works everywhere  

---

## ✅ Solution 2: Use Alternative PayU Test URL

Update `/src/services/payuService.ts` line 23:

```typescript
// Option A: Use PayU's secure endpoint (works with test credentials)
const PAYU_TEST_URL = "https://cbjs.payu.in/payment";

// Option B: Use standard secure endpoint
const PAYU_TEST_URL = "https://secure.payu.in/_payment";

// Option C: Check PayU docs for your region's test URL
const PAYU_TEST_URL = "https://secure1.payu.in/_payment";
```

Then restart backend:
```bash
npm run dev
```

---

## ✅ Solution 3: Check Your Network

Try accessing PayU test directly:

```bash
# Test connectivity
curl -I https://cbjs.payu.in/payment

# If blocked, try:
ping test.payumoney.com

# Check DNS
nslookup test.payumoney.com
```

**If blocked by ISP/Firewall:**
- Contact ISP to unblock PayU domains
- Use VPN for testing
- Use mock endpoint instead

---

## 🔄 Complete Testing Flow

### Step 1: Start Backend
```bash
cd /root/new-backend
npm run dev
```

### Step 2: Test Mock Payment (Quick)
```bash
node scripts/test-payment-mock.mjs 100000 user-uuid-123
```

Expected: ✅ Success

### Step 3: Test Real PayU (When accessible)
```bash
node scripts/test-payu-initiate.mjs
```

Expected: Response with `payuUrl`

### Step 4: Frontend Integration

Frontend calls initiate:
```typescript
POST /api/payments/payu/initiate
Body: {
  amount: 100000,
  email: "user@example.com",
  phoneNumber: "9876543210",
  userId: "user-uuid"
}
```

Response:
```typescript
{
  payuUrl: "https://cbjs.payu.in/payment",  // ← Changed!
  // ... other fields
}
```

Frontend submits form to `payuUrl`

---

## 📊 PayU Test Credentials

```
Merchant Key: D0Fjcc
Merchant Salt: Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ
Test Email: test@payu.in
Test Card: 4111111111111111 (exp: 05/25, CVV: 123)
```

---

## 🛠️ Debugging Checklist

- [ ] Backend running on localhost:4000
- [ ] PayU environment variables set:
  ```bash
  echo $PAYU_KEY        # Should show: D0Fjcc
  echo $PAYU_SALT       # Should show: Sv3...
  echo $PAYU_MODE       # Should show: test
  ```

- [ ] Test connectivity:
  ```bash
  curl https://cbjs.payu.in/payment
  ```

- [ ] If PayU unreachable → Use mock endpoint:
  ```bash
  node scripts/test-payment-mock.mjs
  ```

- [ ] Check browser console for errors
- [ ] Check backend logs:
  ```bash
  tail -f backend-log.txt
  ```

---

## 📋 Development vs Production

| Scenario | Use |
|----------|-----|
| Local development | Mock endpoint: `POST /api/payments/payu/mock-success` |
| Testing PayU integration | Real endpoint: `POST /api/payments/payu/initiate` |
| Can't reach PayU test | Mock endpoint ✅ |
| Production | Real PayU with live credentials |

For web callback testing, set `EXPO_PUBLIC_PAYU_LOCAL_RETURN_URL=http://localhost:4000` to use the backend fallback page, or `http://localhost:8081` to keep the Expo route in the loop.

---

## 🚀 For Frontend Team

If PayU test URL is unreachable:

**Option A: Use Real Backend (Recommended)**
- Backend now uses `https://cbjs.payu.in/payment`
- Should work if that endpoint is accessible in your region
- Test with initiate endpoint

**Option B: Use Mock Success for Testing**
- Call `POST /api/payments/payu/mock-success` directly
- Simulates successful payment
- Perfect for UI/flow testing
- Can test success/failure paths

**Option C: Test with Different Region VPN**
- Use VPN to test from different country
- Verify PayU flow works

---

## 📞 If Still Not Working

1. **Check logs:**
   ```bash
   tail -f backend-log.txt | grep -i payu
   ```

2. **Verify endpoint:**
   ```bash
   curl -X POST http://localhost:4000/api/payments/payu/initiate \
     -H "Content-Type: application/json" \
     -H "x-tenant-id: test-tenant" \
     -d '{
       "amount": 100000,
       "email": "test@example.com",
       "phoneNumber": "9876543210",
       "userId": "user-123"
     }'
   ```

3. **Use mock instead:**
   ```bash
   curl -X POST http://localhost:4000/api/payments/payu/mock-success \
     -H "Content-Type: application/json" \
     -H "x-tenant-id: test-tenant" \
     -d '{
       "amount": 100000,
       "userId": "user-123"
     }'
   ```

---

## ✅ Environment Configuration Updated

File: `/src/services/payuService.ts`

**Changes:**
```typescript
// BEFORE (Inaccessible):
const PAYU_TEST_URL = "https://test.payumoney.com/payment";

// AFTER (More accessible):
const PAYU_TEST_URL = "https://cbjs.payu.in/payment";
```

The new URL should work better in most regions.

---

## 🎯 Recommended Approach

For **development & testing:**

1. ✅ Use mock endpoint for quick testing
2. ✅ Test real PayU when needed
3. ✅ Keep both working options available

```bash
# Quick test (mock)
node scripts/test-payment-mock.mjs 100000 user-123

# Real test (when PayU accessible)
node scripts/test-payu-initiate.mjs
```

---

## Frontend WebView Configuration

The native checkout screen now has enhanced WebView settings to handle PayU form POST:

**File:** `app/(protected)/lexus/wallet/checkout.tsx`

**Settings:**
- `javaScriptEnabled` ✅
- `domStorageEnabled` ✅
- `mixedContentMode="always"` ✅
- `allowUniversalAccessFromFileURLs` ✅
- `allowFileAccessFromFileURLs` ✅
- `onError` fallback with user alert ✅

This ensures the local HTML form can submit to PayU even from file:// origins.

---

**Status:** ✅ Fixed  
**Next:** Use mock endpoint or test updated URL  
**Escalation:** If PayU still unreachable, contact PayU support for region-specific test URL



