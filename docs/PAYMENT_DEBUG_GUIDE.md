# PayU Payment System - Debugging Guide

**Last Updated:** May 16, 2026  
**Purpose:** Fix "Error Loading URL" and other payment integration issues

---

## Common Issues & Solutions

### Issue 1: "Error Loading URL" When Opening Payment Gateway

**Symptoms:**
- Payment gateway doesn't load in WebView
- Native checkout shows "Error Loading URL"
- Web shows blank page instead of PayU form

**Root Causes & Fixes:**

#### A. PayU URL is Invalid or Not HTTPS

```typescript
// ❌ WRONG - Not HTTPS
const PAYU_TEST_URL = "http://test.payumoney.com/payment";

// ✅ CORRECT - Must be HTTPS
const PAYU_TEST_URL = "https://test.payumoney.com/payment";
const PAYU_LIVE_URL = "https://secure.payu.in/_payment";
```

**Check:** In `/src/services/payuService.ts`, verify:
```typescript
const PAYU_TEST_URL = "https://test.payumoney.com/payment";
const PAYU_LIVE_URL = "https://secure.payu.in/_payment";
```

#### B. Response is Missing `payuUrl` Field

The response MUST include all required fields:

```typescript
// ✅ CORRECT Response Structure
{
  "success": true,
  "data": {
    "paymentOrderId": "uuid",
    "merchantTransactionId": "txn_xxx_yyy_zzz",
    "payuKey": "D0Fjcc",
    "hash": "sha512hash...",
    "amount": 100000,
    "email": "user@example.com",
    "phoneNumber": "9876543210",
    "description": "Wallet top-up",
    "payuMode": "test",
    "payuUrl": "https://test.payumoney.com/payment",  // ← Required!
    "successUrl": "http://localhost:3000/lexus/wallet?payment=success",
    "failureUrl": "http://localhost:3000/lexus/wallet?payment=failure"
  }
}
```

**Check:** Ensure `payuService.ts` returns all fields:
```typescript
return {
  paymentOrderId: paymentOrder.id,
  merchantTransactionId: merchantTxnId,
  payuKey: PAYU_KEY,
  hash,
  amount: req.amount,
  email: req.email,
  phoneNumber,
  description: req.description,
  payuMode: PAYU_MODE,
  payuUrl,  // ← Ensure this is included!
  successUrl: req.successUrl,
  failureUrl: req.failureUrl,
};
```

#### C. Environment Variables Not Set

**Check:**
```bash
# Verify in backend.env
echo $PAYU_KEY
echo $PAYU_SALT
echo $PAYU_MODE
echo $PAYU_SUCCESS_URL
echo $PAYU_FAILURE_URL
```

**Required:**
```bash
PAYU_MODE=test                                          # for development
PAYU_KEY=D0Fjcc                                         # test key
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ            # test salt
EXPO_PUBLIC_WEB_APP_URL=http://localhost:8081           # local web test
PAYU_SUCCESS_URL=http://localhost:8081/payment/payu?payment=success
PAYU_FAILURE_URL=http://localhost:8081/payment/payu?payment=failure
```

For a manual local check, include the identifiers too:
```bash
http://localhost:8081/payment/payu?payment=success&payment_order_id=<uuid>&merchant_txn_id=<txn_id>
```

If the Expo web route still throws a CORS or Invalid URL error during local testing, use the backend fallback instead:
```bash
PAYU_LOCAL_RETURN_URL=http://localhost:4000
```
That keeps production on `https://maxsasrealtyai.in/payment/payu?...` but lets local tests complete on the backend callback page.

Backend callbacks now work in two steps:
1. PayU posts back to the backend return endpoint.
2. The backend validates the callback fields it received and redirects the browser to the frontend callback screen at `/payment/payu`.

If you want to make the backend callback base explicit, set:
```bash
PAYU_SERVER_RETURN_BASE=http://localhost:4000
```
or the public backend origin in production.

For production web:
```bash
EXPO_PUBLIC_WEB_APP_URL=https://maxsasrealtyai.in
PAYU_SUCCESS_URL=https://maxsasrealtyai.in/payment/payu?payment=success
PAYU_FAILURE_URL=https://maxsasrealtyai.in/payment/payu?payment=failure
```

The callback URL also carries `payment_order_id` and `merchant_txn_id` so the wallet page can identify the exact attempt.

#### D. Request Body Missing Required Fields

The frontend must send all required fields in the request:

```typescript
// ❌ INCOMPLETE Request
{
  "amount": 100000,
  "email": "user@example.com"
  // Missing: phoneNumber, userId, description
}

// ✅ COMPLETE Request
{
  "amount": 100000,
  "description": "Wallet top-up",
  "email": "user@example.com",
  "phoneNumber": "9876543210",
  "userId": "user-uuid-123",
  "successUrl": "http://localhost:8081/payment/payu?payment=success",
  "failureUrl": "http://localhost:8081/payment/payu?payment=failure"
}
```

**Check:** In route validation in `/src/routes/payuPayment.ts`:
```typescript
if (!amount || !email || !phoneNumber || !userId) {
  // Returns 400 error
}
```

#### E. Amount Validation Issues

```typescript
// ❌ OLD - Too permissive
if (!Number.isFinite(amountPaise) || amountPaise < 100) { }

// ✅ NEW - Correct limits
if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise < 1000) {
  throw new Error("amount must be at least 1000 paise (₹10)");
}
if (amountPaise > 10000000) {
  throw new Error("amount cannot exceed 10000000 paise (₹1,00,000)");
}
```

**Check:** Amount limits:
- Minimum: 1000 paise (₹10)
- Maximum: 10,000,000 paise (₹1,00,000)

#### F. Database Transaction Error in Mock Success

```typescript
// ❌ WRONG Status Value
status: "success"  // Not a valid enum value!

// ✅ CORRECT Status Values
status: "pending" | "completed" | "failed" | "reversed"
```

**Check:** In mock-success endpoint:
```typescript
status: "completed",  // NOT "success"!
```

---

### Issue 2: 400 Error When Calling `/api/payments/payu/initiate`

#### A. Missing Required Headers

```bash
# Must include tenant context
curl -X POST http://localhost:4000/api/payments/payu/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "x-tenant-id: <tenant-id>"  # ← Required!
  -d '{...}'
```

#### B. Invalid Tenant Context

The `requireTenant` middleware needs:
```typescript
// From middleware/requireTenant.ts
- Header: `x-tenant-id`
OR
- JWT token containing tenant ID
```

---

### Issue 3: Payment Order Not Created

Check logs for:
```
[PaymentOrder Creation Error]
```

**Common causes:**
1. Database connection failure
2. Invalid tenant ID
3. Invalid wallet account data

---

## Testing Checklist

### 1. Test Backend Endpoint

```bash
# Test PayU initiation endpoint
node scripts/test-payu-initiate.mjs
```

This script validates:
- ✓ Endpoint responds with 200
- ✓ Response has `success: true`
- ✓ All required fields are present
- ✓ payuUrl is HTTPS
- ✓ payuMode is correct (test/live)

### 2. Test Environment Configuration

```bash
# Verify environment variables
npm run verify-payu-config
```

Should output:
```
✓ PAYU_KEY: D0Fjcc
✓ PAYU_SALT: ****** (hidden)
✓ PAYU_MODE: test
✓ PAYU_SUCCESS_URL: http://localhost:3000/...
✓ PAYU_FAILURE_URL: http://localhost:3000/...
```

### 3. Test Payment Flow End-to-End

1. **Start backend**
   ```bash
   npm run dev
   ```

2. **In frontend, call initiate**
   ```typescript
   const response = await fetch('/api/payments/payu/initiate', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'x-tenant-id': 'test-tenant-123'
     },
     body: JSON.stringify({
       amount: 100000,
       description: 'Test top-up',
       email: 'test@example.com',
       phoneNumber: '9876543210',
       userId: 'user-123',
       successUrl: 'http://localhost:3000/success',
       failureUrl: 'http://localhost:3000/failure'
     })
   });
   
   const data = await response.json();
   console.log(data.data.payuUrl);  // Should be HTTPS URL
   ```

3. **Verify response**
   - Check `payuUrl` is HTTPS
   - Check all required fields are present
   - Check hash is valid SHA512

### 4. Test Mock Success (Development)

```bash
curl -X POST http://localhost:4000/api/payments/payu/mock-success \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: test-tenant-123" \
  -d '{
    "amount": 100000,
    "userId": "user-uuid-123"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "amountPaise": 100000,
    "newBalancePaise": 100000,
    "message": "Mock payment successful"
  }
}
```

---

## Debugging Steps

### Step 1: Check Logs

```bash
# View backend logs
tail -f backend-log.txt

# Look for:
# [PaymentOrder] Payment initiated
# [PaymentOrder] Wallet account created
# [PaymentOrder] Hash generated
# [ERROR] or any error messages
```

### Step 2: Verify Database

```sql
-- Check payment orders
SELECT id, merchant_txn_id, status, payu_url, created_at 
FROM payment_orders 
ORDER BY created_at DESC 
LIMIT 5;

-- Check payment attempts
SELECT id, payment_order_id, status, error_message 
FROM payment_attempts 
ORDER BY created_at DESC 
LIMIT 5;
```

### Step 3: Test Hash Generation

```typescript
// In backend service
const hash = generatePayUHash(
  merchantTxnId,
  amount,
  "wallet_topup",
  email,
  phoneNumber
);
console.log("Generated hash:", hash);
```

Should produce a valid SHA512 hash (128 hex characters).

### Step 4: Verify Frontend Integration

Frontend should:
1. ✓ Receive response with `payuUrl`
2. ✓ Extract all form fields
3. ✓ Create hidden form
4. ✓ Submit to `payuUrl`
5. ✓ Handle redirect to success/failure URL

---

## Production Checklist

Before deploying to production:

- [ ] PAYU_MODE=live (not test)
- [ ] PAYU_KEY and PAYU_SALT updated with production credentials
- [ ] PAYU_SUCCESS_URL and PAYU_FAILURE_URL point to production domain
- [ ] BILLING_BYPASS=false (enable actual billing)
- [ ] APP_ENV=production
- [ ] Webhook URL registered in PayU dashboard
- [ ] Database backups enabled
- [ ] Error monitoring configured
- [ ] Test payment flow with small amount (₹10)

---

## Quick Reference: Response Contract

```typescript
interface PayUInitiateResponse {
  paymentOrderId: string;              // UUID
  merchantTransactionId: string;       // txn_XXXXXXXX_timestamp_random
  payuKey: string;                     // Merchant key (e.g., D0Fjcc)
  hash: string;                        // SHA512 hash (128 hex chars)
  amount: number;                      // Paise (100000 = ₹1000)
  email: string;                       // User email
  phoneNumber: string;                 // User phone (numeric)
  description: string;                 // Payment description
  payuMode: string;                    // "test" or "live"
  payuUrl: string;                     // HTTPS URL to PayU
  successUrl: string;                  // Post-success redirect
  failureUrl: string;                  // Post-failure redirect
}
```

All fields are required and must have correct types.

---

## Support

If issues persist:

1. Check backend logs: `tail -f backend-log.txt`
2. Verify environment: `echo $PAYU_KEY`
3. Test endpoint: `node scripts/test-payu-initiate.mjs`
4. Review this guide for your specific error
5. Check Database Migration Notes: [DB_MIGRATION_NOTES.md](./DB_MIGRATION_NOTES.md)

---

**Last Updated:** May 16, 2026
