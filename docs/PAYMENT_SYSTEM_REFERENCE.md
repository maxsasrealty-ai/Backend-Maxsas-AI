# Backend Payment System Reference

**Last Updated:** May 16, 2026  
**Status:** Production-Ready with PayU Integration  
**Audience:** Frontend developers, integrations team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Payment Providers](#payment-providers)
5. [API Endpoints](#api-endpoints)
6. [Request/Response Contracts](#requestresponse-contracts)
7. [Wallet System](#wallet-system)
8. [Billing & Usage](#billing--usage)
9. [Webhooks](#webhooks)
10. [Error Handling](#error-handling)
11. [Development & Testing](#development--testing)
12. [Environment Configuration](#environment-configuration)

---

## Overview

The backend payment system handles:
- **Wallet top-ups** via PayU payment gateway
- **Wallet balance tracking** with ledger entries
- **Transaction history** with provider reconciliation
- **Idempotent payment processing** to prevent duplicate charges
- **Webhook integration** for real-time payment confirmation
- **Multi-tenant isolation** with proper tenant context

### Key Features

✅ **PayU Integration** - Production-grade payment processing  
✅ **Wallet Management** - Balance tracking and ledger entries  
✅ **Idempotent Operations** - Duplicate payment prevention  
✅ **Webhook Processing** - Real-time payment confirmation  
✅ **Tenant Isolation** - Complete data segregation per tenant  
✅ **Mock Mode** - Development support without real payments  

---

## Architecture

### Payment Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Frontend initiates top-up                                 │
│    POST /api/payments/payu/initiate                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 2. Backend creates PaymentOrder + PaymentAttempt            │
│    - Generates merchant transaction ID                      │
│    - Creates PayU hash                                      │
│    - Returns checkout data                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 3. Frontend redirects to PayU                               │
│    POST to payuUrl with encrypted form                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 4. User completes payment on PayU                           │
│    (success/failure URL callback)                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 5. PayU sends webhook to backend                            │
│    POST /api/payments/payu/webhook                          │
│    - Validates signature                                    │
│    - Updates PaymentAttempt                                 │
│    - Creates WalletLedger entry                             │
│    - Credits wallet balance                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 6. Frontend redirected to success/failure page              │
│    - User sees status update                                │
│    - Balance refreshed from backend                         │
└─────────────────────────────────────────────────────────────┘
```

### Service Structure

- **payuService.ts** - PayU-specific business logic
  - Payment order creation
  - Hash generation and verification
  - Webhook processing
  - Reconciliation

- **paymentService.ts** - Generic payment operations (Razorpay legacy)
  - Top-up order creation
  - Wallet balance fetching
  - Transaction history

- **walletLedgerRepository.ts** - Wallet ledger data access
- **paymentReconciliationService.ts** - Payment reconciliation logic

---

## Database Schema

### Core Payment Models

#### `PaymentOrder`
Represents a payment transaction initiated by the user.

```prisma
model PaymentOrder {
  id                  String                @id @default(uuid())
  tenantId            String
  walletAccountId     String?
  userId              String?
  amountMinor         BigInt                // Amount in currency minor units (paise)
  currency            String                @default("INR")
  purpose             String                // e.g., "Wallet top-up"
  provider            PaymentProvider       @default(payu)
  providerMode        PaymentProviderMode   @default(test)
  status              PaymentOrderStatus    @default(created)
  payuTxnId           String?               // PayU transaction ID (mihpayid)
  merchantTxnId       String?               // Our transaction ID (txnid)
  redirectUrl         String?
  successUrl          String?
  failureUrl          String?
  metaJson            Json?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
  tenant              Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  paymentAttempts     PaymentAttempt[]
  walletLedgerEntries WalletLedger[]

  @@unique([tenantId, merchantTxnId])
  @@index([tenantId, status])
  @@index([tenantId, payuTxnId])
  @@index([tenantId, createdAt])
}
```

**Statuses:** `created`, `initiated`, `processing`, `completed`, `failed`, `cancelled`, `refunded`

#### `PaymentAttempt`
Individual attempt to process a payment order.

```prisma
model PaymentAttempt {
  id                    String                @id @default(uuid())
  tenantId              String
  paymentOrderId        String
  provider              PaymentProvider       @default(payu)
  providerMode          PaymentProviderMode   @default(test)
  providerPaymentId     String?               // PayU payment ID
  providerTxnId         String?               // PayU transaction ID
  requestPayloadJson    Json                  // Request sent to provider
  responsePayloadJson   Json?                 // Response from provider
  status                PaymentAttemptStatus  @default(initiated)
  errorCode             String?
  errorMessage          String?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt
  tenant                Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  paymentOrder          PaymentOrder          @relation(fields: [paymentOrderId], references: [id], onDelete: Cascade)

  @@index([tenantId, paymentOrderId])
  @@index([tenantId, status])
  @@index([tenantId, providerTxnId])
  @@index([tenantId, createdAt])
}
```

**Statuses:** `initiated`, `processing`, `completed`, `failed`

#### `PaymentWebhookEvent`
Webhook events received from payment providers.

```prisma
model PaymentWebhookEvent {
  id                    String                    @id @default(uuid())
  tenantId              String?
  provider              PaymentProvider           @default(payu)
  eventType             String
  providerEventId       String?
  providerTxnId         String?
  rawHeadersJson        Json?
  rawBodyJson           Json                      // Original webhook payload
  normalizedBodyJson    Json?                     // Normalized by handler
  processingStatus      WebhookProcessingStatus   @default(received)
  processingError       String?
  idempotencyKey        String                    @unique
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  tenant                Tenant?                   @relation(fields: [tenantId], references: [id], onDelete: SetNull)

  @@index([tenantId, processingStatus])
  @@index([tenantId, createdAt])
  @@index([provider, providerTxnId])
}
```

**Processing Statuses:** `received`, `processing`, `completed`, `failed`

#### `WalletAccount`
User wallet account within a tenant.

```prisma
model WalletAccount {
  id                    String                @id @default(uuid())
  tenantId              String
  userId                String?
  currency              String                @default("INR")
  status                String                @default("active")
  currentBalanceMinor   BigInt                @default(0)  // Current balance in paise
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt
  tenant                Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  walletLedger          WalletLedger[]

  @@unique([tenantId, userId])
  @@index([tenantId, status])
  @@index([tenantId, createdAt])
}
```

#### `WalletLedger`
Ledger entries representing all wallet transactions.

```prisma
model WalletLedger {
  id                   String              @id @default(uuid())
  tenantId             String
  walletAccountId      String
  direction            EntryDirection      @default(credit)  // credit | debit
  amountMinor          BigInt              // Amount in paise
  currency             String              @default("INR")
  status               LedgerEntryStatus   @default(pending)  // pending | completed | failed | reversed
  entryType            EntryType           @default(wallet_topup)
  paymentOrderId       String?
  paymentAttemptId     String?
  externalTxnId        String?
  referenceType        String?
  referenceId          String?
  description          String
  metaJson             Json?
  idempotencyKey       String?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  walletAccount        WalletAccount       @relation(fields: [walletAccountId], references: [id], onDelete: Cascade)
  paymentOrder         PaymentOrder?       @relation(fields: [paymentOrderId], references: [id], onDelete: SetNull)

  @@unique([walletAccountId, idempotencyKey])
  @@index([tenantId, walletAccountId])
  @@index([tenantId, status])
  @@index([tenantId, createdAt])
  @@index([paymentOrderId])
  @@index([externalTxnId])
}
```

#### `PaymentReconciliation`
Reconciliation records for payment verification.

```prisma
model PaymentReconciliation {
  id                    String                  @id @default(uuid())
  tenantId              String
  paymentOrderId        String
  provider              PaymentProvider         @default(payu)
  checkType             ReconciliationCheckType
  status                ReconciliationStatus    @default(matched)
  detailsJson           Json?
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt
  tenant                Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, paymentOrderId])
  @@index([tenantId, status])
  @@index([tenantId, createdAt])
}
```

### Legacy Wallet Models (Deprecated - for reference)

#### `WalletTransaction` (DEPRECATED)
Legacy transaction model - use `WalletLedger` instead.

```prisma
model WalletTransaction {
  id                String                  @id @default(uuid())
  tenantId          String
  type              WalletTransactionType   // credit | debit
  amountPaise       Int
  description       String
  provider          String?
  providerOrderId   String?
  providerPaymentId String?
  referenceId       String?
  status            WalletTransactionStatus // pending | completed | failed
  createdAt         DateTime                @default(now())
  updatedAt         DateTime                @updatedAt
  tenant            Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, providerOrderId])
  @@unique([tenantId, referenceId])
  @@index([tenantId, createdAt])
}
```

**Note:** New development should use `WalletLedger` and `WalletAccount` for better transaction tracking.

---

## Payment Providers

### PayU (Current Production Provider)

**Mode:** Test (Development) and Live (Production)

**Credentials:**
- `PAYU_KEY` - Merchant key
- `PAYU_SALT` - Merchant salt for hash generation
- `PAYU_MODE` - `test` or `live`

**Test Credentials (Development):**
```
PAYU_KEY=D0Fjcc
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ
PAYU_MODE=test
PAYU_URL=https://test.payumoney.com/payment
```

**API Endpoints:**
- Test: `https://test.payumoney.com/payment`
- Live: `https://secure.payu.in/_payment`
- Verify: `https://test.payumoney.com/payment/verify` (for hash verification)

**PayU Hash Generation:**
```
hash = SHA512(PAYU_KEY|merchantTxnId|amount|productInfo|email||PAYU_SALT)
```

### Razorpay (Legacy - Deprecated)

Legacy payment provider. New transactions should use PayU.

---

## API Endpoints

### PayU Routes

All PayU routes are under `/api/payments/` and require tenant authentication.

#### `POST /api/payments/payu/initiate`

Initiate a new wallet top-up payment order.

**Request:**
```json
{
  "amount": 10000,                    // Amount in paise (e.g., 10000 = ₹100)
  "description": "Wallet top-up",
  "email": "user@example.com",
  "phoneNumber": "9876543210",
  "userId": "user-uuid",
  "successUrl": "http://localhost:3000/lexus/wallet?payment=success",
  "failureUrl": "http://localhost:3000/lexus/wallet?payment=failure"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "paymentOrderId": "order-uuid",
    "merchantTransactionId": "txn_xxxxxxxx_timestamp_random",
    "payuKey": "D0Fjcc",
    "hash": "sha512_hash_string",
    "amount": 10000,
    "email": "user@example.com",
    "phoneNumber": "9876543210",
    "description": "Wallet top-up",
    "payuMode": "test",
    "payuUrl": "https://test.payumoney.com/payment",
    "successUrl": "http://localhost:3000/lexus/wallet?payment=success",
    "failureUrl": "http://localhost:3000/lexus/wallet?payment=failure"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_AMOUNT",
    "message": "amount must be a positive number in paise"
  }
}
```

**Validations:**
- `amount` must be >= ₹10 (1000 paise)
- `amount` must be <= ₹1,00,000 (10,000,000 paise)
- `email` must be valid
- `phoneNumber` must be numeric (10+ digits)
- `userId` must be UUID

---

#### `POST /api/payments/payu/webhook`

Webhook endpoint for PayU payment confirmations.

**Webhook Source:** PayU servers  
**Authentication:** HMAC-SHA512 signature verification

**Payload Format (from PayU):**
```json
{
  "status": "success",              // success | failure
  "mihpayid": "101234567",          // PayU payment ID
  "mode": "test",
  "txnid": "txn_xxxxxxxx_timestamp_random",  // Our merchant transaction ID
  "amount": "100.00",
  "productinfo": "Wallet top-up",
  "firstname": "User",
  "email": "user@example.com",
  "phone": "9876543210",
  "hash": "signature_hash",
  "error": "",                      // Error message if failed
  ...                               // Additional PayU fields
}
```

**Processing:**
1. Validates signature against stored PaymentAttempt
2. Updates PaymentAttempt status
3. If successful:
   - Creates WalletLedger entry with `credit` direction
   - Updates WalletAccount balance
   - Updates PaymentOrder status to `completed`
4. If failed:
   - Updates PaymentOrder status to `failed`
   - Records error message

---

#### `POST /api/payments/payu/mock-success`

**Development Only** - Simulate successful payment without PayU.

**Request:**
```json
{
  "amount": 10000,    // Amount in paise
  "userId": "user-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "amountCredited": 10000,
    "newBalance": 50000,
    "message": "Mock payment successful"
  }
}
```

**⚠️ Environment Check:**
- Returns 403 if `APP_ENV=production`
- Development/test only

---

### Razorpay Routes (Legacy)

#### `POST /api/payment/create-order`

**Deprecated** - Use PayU instead.

---

## Request/Response Contracts

### Type Definitions

#### `PayUInitiateRequest`
```typescript
interface PayUInitiateRequest {
  amount: number;           // Amount in paise (100-10000000)
  description: string;      // Payment description
  email: string;           // User email
  phoneNumber: string;     // User phone number (10+ digits)
  userId: string;          // User ID (UUID)
  successUrl: string;      // Post-success redirect URL
  failureUrl: string;      // Post-failure redirect URL
}
```

#### `PayUInitiateResponse`
```typescript
interface PayUInitiateResponse {
  paymentOrderId: string;           // Our payment order ID
  merchantTransactionId: string;    // Transaction ID for PayU
  payuKey: string;                  // PayU merchant key
  hash: string;                     // SHA512 hash for form validation
  amount: number;                   // Amount in paise
  email: string;
  phoneNumber: string;
  description: string;
  payuMode: string;                 // "test" or "live"
  payuUrl: string;                  // URL to POST payment form to
  successUrl: string;
  failureUrl: string;
}
```

#### `PayUWebhookPayload`
```typescript
interface PayUWebhookPayload {
  status: string;          // "success" | "failure"
  mihpayid: string;        // PayU payment ID
  mode: string;            // "test" | "live"
  txnid: string;           // Our transaction ID
  amount: string;          // Amount as string
  productinfo: string;     // Product description
  firstname: string;       // User name
  email: string;
  phone: string;
  hash: string;            // Webhook signature
  [key: string]: unknown;  // Additional PayU fields
}
```

#### `WalletAccountResponse`
```typescript
interface WalletAccountResponse {
  walletAccountId: string;
  tenantId: string;
  userId: string;
  currency: string;        // "INR"
  status: string;          // "active"
  currentBalanceMinor: number;  // Balance in paise
}
```

#### `WalletLedgerEntry`
```typescript
interface WalletLedgerEntry {
  id: string;
  tenantId: string;
  walletAccountId: string;
  direction: "credit" | "debit";
  amountMinor: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "reversed";
  entryType: string;
  paymentOrderId: string | null;
  externalTxnId: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## Wallet System

### Wallet Architecture

Each tenant has one or more `WalletAccount` entities:
- One per tenant (tenant-wide wallet)
- Optional: One per user per tenant (individual wallets)

**Balance Tracking:**
- `currentBalanceMinor` - Current balance in paise (100 = ₹1)
- Updated via `WalletLedger` entries
- Atomic operations using database transactions

### Wallet Operations

#### Credit (Top-up)

1. User initiates payment via `/api/payments/payu/initiate`
2. Backend creates `PaymentOrder` (status: `created`)
3. Backend creates `PaymentAttempt` with request payload
4. User completes payment on PayU
5. PayU sends webhook to `/api/payments/payu/webhook`
6. Backend validates webhook signature
7. Backend creates `WalletLedger` entry:
   - `direction`: `credit`
   - `status`: `completed`
   - `entryType`: `wallet_topup`
   - `paymentOrderId`: linked to PaymentOrder
8. Backend updates `WalletAccount.currentBalanceMinor` atomically
9. Frontend receives balance update

#### Debit (Usage)

During call processing:
1. Call completes → `call_completed` event
2. Backend charges wallet via `WalletLedger` entry:
   - `direction`: `debit`
   - `status`: `completed`
   - `entryType`: varies (e.g., `call_charge`)
   - `referenceId`: call session ID
3. Balance updated atomically

#### Balance Query

```typescript
const balance = walletAccount.currentBalanceMinor;  // in paise
const formattedBalance = `₹${balance / 100}`;
```

### Idempotency

The system prevents duplicate charges using:

**Wallet Ledger Idempotency:**
```prisma
@@unique([walletAccountId, idempotencyKey])
```

**Payment Order Uniqueness:**
```prisma
@@unique([tenantId, merchantTxnId])
```

**Webhook Deduplication:**
```prisma
@@unique([idempotencyKey])  // On PaymentWebhookEvent
```

---

## Billing & Usage

### Usage Records

Billing is tracked via `UsageRecord` entries created when calls complete:

```prisma
model UsageRecord {
  id            String            @id @default(uuid())
  tenantId      String
  callId        String
  usageType     UsageType         // call_charge, storage_charge, etc.
  amountPaise   Int               // Cost in paise
  status        UsageRecordStatus // pending, completed, failed
  sourceEventId String?           // call_completed event ID
  notes         String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  callSession   CallSession       @relation(fields: [callId], references: [id], onDelete: Cascade)
  tenant        Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}
```

### Billing Bypass (Development)

**Environment Variable:**
```
BILLING_BYPASS=true
```

When enabled in local development:
- `UsageRecord` entries are created but marked as `skipped`
- Wallet is not debited
- Useful for testing without affecting account balance

---

## Webhooks

### PayU Webhook Processing

**Endpoint:** `POST /api/payments/payu/webhook`

**Signature Verification:**
PayU sends an HMAC-SHA512 signature in the `hash` field.

**Processing Flow:**

```
1. Receive webhook payload
2. Validate signature against PAYU_SALT
3. Store PaymentWebhookEvent with idempotencyKey for deduplication
4. Lookup PaymentOrder by merchantTransactionId
5. If status == "success":
   a. Create WalletLedger entry (credit)
   b. Update WalletAccount.currentBalanceMinor
   c. Update PaymentAttempt to "completed"
   d. Update PaymentOrder to "completed"
6. If status == "failure":
   a. Update PaymentAttempt to "failed"
   b. Update PaymentOrder to "failed"
   c. Store error code and message
7. Return { received: true, eventType: "payment.completed" }
```

**Idempotency:**
- Webhook events are deduplicated using a unique `idempotencyKey`
- If a duplicate webhook is received, it's marked as `processed` and skipped

---

## Error Handling

### Common Errors

| Error Code | HTTP Status | Cause | Resolution |
|----------|------------|-------|-----------|
| `INVALID_AMOUNT` | 400 | Amount < ₹10 or > ₹1,00,000 | Enter valid amount |
| `MISSING_FIELDS` | 400 | Required fields missing | Provide all fields |
| `INVALID_EMAIL` | 400 | Invalid email format | Enter valid email |
| `INVALID_PHONE` | 400 | Phone < 10 digits | Enter valid phone |
| `PAYMENT_INIT_FAILED` | 400 | Backend error during order creation | Retry or contact support |
| `VERIFICATION_FAILED` | 400 | Hash or signature mismatch | Retry payment |
| `MISSING_SIGNATURE` | 400 | Webhook signature missing | Verify PayU webhook config |
| `WEBHOOK_PROCESSING_FAILED` | 500 | Error processing webhook | Check logs |
| `INSUFFICIENT_BALANCE` | 400 | Wallet balance too low for operation | Top-up wallet |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

---

## Development & Testing

### Mock Payment Flow

For development without PayU integration:

**Endpoint:** `POST /api/payments/payu/mock-success`

```bash
curl -X POST http://localhost:4000/api/payments/payu/mock-success \
  -H "Authorization: Bearer <auth-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "userId": "user-id"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "amountCredited": 10000,
    "newBalance": 60000,
    "message": "Mock payment successful"
  }
}
```

### Testing Checklist

- [ ] Payment order creation with valid amount
- [ ] Validation of minimum/maximum amounts
- [ ] Email and phone validation
- [ ] PayU form submission
- [ ] Webhook signature verification
- [ ] Wallet balance update on success
- [ ] Error handling on payment failure
- [ ] Idempotency (duplicate webhook handling)
- [ ] Multi-tenant isolation
- [ ] Balance persistence across sessions

### Test Data

```typescript
// Minimum amount: ₹10 (1000 paise)
const MIN_AMOUNT_PAISE = 1000;

// Maximum amount: ₹1,00,000 (10,000,000 paise)
const MAX_AMOUNT_PAISE = 10000000;

// Test credentials (from backend.env)
const PAYU_TEST_KEY = "D0Fjcc";
const PAYU_TEST_SALT = "Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ";
const PAYU_TEST_MODE = "test";
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Payment Provider
PAYU_MODE=test                                          # test | live
PAYU_KEY=D0Fjcc                                         # Merchant key
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ            # Merchant salt
PAYU_WEBHOOK_URL=http://127.0.0.1:4000/api/payments/payu/webhook
PAYU_SUCCESS_URL=http://localhost:3000/lexus/wallet?payment=success
PAYU_FAILURE_URL=http://localhost:3000/lexus/wallet?payment=failure
PAYU_REDIRECT_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@host/database

# Application
APP_ENV=development                                     # development | production
BILLING_BYPASS=true                                     # true | false
```

### Local Development Setup

```bash
# .env.local or backend.env
APP_ENV=development
BILLING_BYPASS=true
VOICE_TEST_MODE=true

PAYU_MODE=test
PAYU_KEY=D0Fjcc
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ
PAYU_SUCCESS_URL=http://localhost:3000/lexus/wallet?payment=success
PAYU_FAILURE_URL=http://localhost:3000/lexus/wallet?payment=failure
```

### Production Setup

```bash
# .env.production
APP_ENV=production
BILLING_BYPASS=false

PAYU_MODE=live
PAYU_KEY=<production-key>
PAYU_SALT=<production-salt>
PAYU_SUCCESS_URL=https://app.example.com/wallet?payment=success
PAYU_FAILURE_URL=https://app.example.com/wallet?payment=failure
```

---

## Integration Checklist

### Frontend Integration

- [ ] Implement wallet balance display
- [ ] Create top-up amount selector (₹10 to ₹1,00,000)
- [ ] Call `/api/payments/payu/initiate` to get checkout data
- [ ] Submit hidden form to PayU checkout URL
- [ ] Handle success (`?payment=success`) and failure (`?payment=failure`) redirects
- [ ] Refresh wallet balance on success
- [ ] Display transaction history
- [ ] Handle network errors gracefully

### Backend Integration

- [ ] Configure PayU credentials in environment
- [ ] Set webhook URL in PayU dashboard
- [ ] Test payment flow end-to-end
- [ ] Verify webhook signature validation
- [ ] Monitor payment processing logs
- [ ] Set up error alerts for failed payments
- [ ] Test idempotency with duplicate webhooks
- [ ] Verify tenant isolation

### Monitoring

- [ ] Track payment order creation rate
- [ ] Monitor webhook processing latency
- [ ] Alert on failed payment attempts
- [ ] Track wallet balance changes
- [ ] Monitor for duplicate webhook processing

---

## FAQ

**Q: What's the minimum payment amount?**  
A: ₹10 (1000 paise)

**Q: What's the maximum payment amount?**  
A: ₹1,00,000 (10,000,000 paise)

**Q: How long does payment confirmation take?**  
A: Usually 1-10 seconds after user completes payment on PayU

**Q: Can I test payments without PayU?**  
A: Yes, use `/api/payments/payu/mock-success` in development

**Q: What happens if the webhook fails?**  
A: PayU will retry up to 3 times. Check logs if payment doesn't complete.

**Q: Is billing mandatory?**  
A: No, use `BILLING_BYPASS=true` to skip charges in development

**Q: Can I retrieve transaction history?**  
A: Yes, query `WalletLedger` filtered by `walletAccountId` and date range

**Q: What if a user initiates payment twice?**  
A: Each creates a separate `PaymentOrder` with unique `merchantTxnId`

---

## Support & References

- **PayU Documentation:** https://www.payumoney.com/
- **Backend Status:** See [NEW_BACKEND_COMPLETE_STATUS_UP-TO-DATE.md](../NEW_BACKEND_COMPLETE_STATUS_UP-TO-DATE.md)
- **Wallet Flow:** [PayU Frontend Reference](../PAYU_FRONTEND_PAYMENT_FLOW_use_as_a_refernece.md)
- **Contract Validation:** See [CONTRACT_VALIDATION_SUMMARY.md](./CONTRACT_VALIDATION_SUMMARY.md)

---

**Last Updated:** May 16, 2026  
**Maintained By:** Backend Team  
**Next Review:** June 2026
