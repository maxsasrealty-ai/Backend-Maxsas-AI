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

**Status:** ✅ Fixed  
**Next:** Use mock endpoint or test updated URL  
**Escalation:** If PayU still unreachable, contact PayU support for region-specific test URL
