# Backend Payment System - Comprehensive Summary

## Executive Overview

The backend payment system is a multi-provider architecture supporting PayU (primary) and Razorpay (legacy) payment processors. It uses a **double-entry wallet ledger** model with comprehensive audit logging, idempotent webhook processing, and automatic reconciliation. All payment operations are **tenant-scoped** for multi-tenancy.

---

## 1. Payment Entities & Database Schema

### 1.1 Core Payment Models

#### **PaymentOrder** (Master payment record)
- **Purpose**: Tracks wallet top-up orders
- **Key Fields**:
  - `id` (UUID): Unique payment order ID
  - `tenantId` (UUID): Tenant ownership
  - `userId` (string, optional): User-specific wallet
  - `walletAccountId` (UUID, optional): Linked wallet account
  - `amountMinor` (BigInt): Amount in paise (₹1 = 100 paise)
  - `currency` (string): Default "INR"
  - `purpose` (string): e.g., "wallet_topup"
  - `provider` (enum): `payu | razorpay`
  - `providerMode` (enum): `test | live`
  - `status` (enum): `created | pending | initiated | success | failed | cancelled | expired`
  - `merchantTxnId` (string, unique per tenant): Generated transaction ID (format: `txn_<abbr>_<timestamp>_<random>`)
  - `payuTxnId` (string, optional): PayU's mihpayid
  - `redirectUrl`, `successUrl`, `failureUrl`: Payment redirect URLs
  - `metaJson` (JSON): Arbitrary metadata
  - `createdAt`, `updatedAt`: Timestamps
- **Indexes**: `(tenantId, status)`, `(tenantId, payuTxnId)`, `(tenantId, createdAt)`
- **Unique Constraints**: `(tenantId, merchantTxnId)`

#### **PaymentAttempt** (Individual payment transaction attempt)
- **Purpose**: Audit log of payment processor interactions
- **Key Fields**:
  - `id` (UUID): Unique attempt ID
  - `tenantId`, `paymentOrderId` (UUID)
  - `provider`, `providerMode`: Provider info
  - `providerPaymentId` (string, optional): Provider's unique ID
  - `providerTxnId` (string, optional): Provider's transaction ID
  - `requestPayloadJson` (JSON): Request sent to provider
  - `responsePayloadJson` (JSON, optional): Response from provider
  - `status` (enum): `initiated | pending | success | failed | declined`
  - `errorCode`, `errorMessage` (string, optional): Error details
  - `createdAt`, `updatedAt`
- **Indexes**: `(tenantId, paymentOrderId)`, `(tenantId, status)`, `(tenantId, providerTxnId)`

#### **PaymentWebhookEvent** (Webhook audit trail)
- **Purpose**: Idempotent webhook processing with full audit
- **Key Fields**:
  - `id` (UUID)
  - `tenantId` (UUID, optional, resolved during processing)
  - `provider` (enum): Payment provider
  - `eventType` (string): e.g., "payment_status"
  - `providerEventId`, `providerTxnId` (string, optional)
  - `rawHeadersJson`, `rawBodyJson` (JSON): Raw webhook data
  - `normalizedBodyJson` (JSON, optional): Normalized webhook payload
  - `processingStatus` (enum): `received | processed | failed | ignored`
  - `processingError` (string, optional): Error message if failed
  - `idempotencyKey` (string, unique): `payu_<mihpayid>_<txnid>` for deduplication
  - `createdAt`, `updatedAt`
- **Indexes**: `(tenantId, processingStatus)`, `(tenantId, createdAt)`, `(provider, providerTxnId)`

#### **PaymentReconciliation** (Reconciliation audit)
- **Purpose**: Track payment reconciliation checks and resolutions
- **Key Fields**:
  - `id`, `tenantId`, `paymentOrderId` (UUID)
  - `provider` (enum)
  - `checkType` (enum): `webhook_vs_verify` (extensible)
  - `status` (enum): `matched | mismatched | resolved`
  - `detailsJson` (JSON): Reconciliation details (status, source, action taken)
  - `createdAt`, `updatedAt`
- **Indexes**: `(tenantId, paymentOrderId)`, `(tenantId, status)`, `(tenantId, createdAt)`

#### **WalletAccount** (User/tenant wallet container)
- **Purpose**: Holds wallet balance and settings
- **Key Fields**:
  - `id` (UUID)
  - `tenantId` (UUID): Tenant owner
  - `userId` (string, optional): Null = tenant-level wallet, non-null = user-specific wallet
  - `currency` (string): Default "INR"
  - `status` (string): Default "active"
  - `currentBalanceMinor` (BigInt): Current balance in paise
  - `createdAt`, `updatedAt`
- **Unique Constraints**: `(tenantId, userId)` - allows one wallet per tenant+user pair
- **Indexes**: `(tenantId, status)`, `(tenantId, createdAt)`

#### **WalletLedger** (Double-entry ledger)
- **Purpose**: Immutable audit trail of all wallet movements
- **Key Fields**:
  - `id` (UUID)
  - `tenantId`, `walletAccountId` (UUID)
  - `direction` (enum): `credit | debit`
  - `amountMinor` (BigInt): Amount in paise
  - `currency` (string): Default "INR"
  - `status` (enum): `pending | success | failed | reversed`
  - `entryType` (enum): `wallet_topup | usage_debit | manual_credit | manual_debit | refund | adjustment`
  - `paymentOrderId` (UUID, optional): Link to PaymentOrder if this is from a payment
  - `externalTxnId` (string, optional): External transaction ID (e.g., PayU's mihpayid)
  - `referenceType`, `referenceId` (string, optional): Reference to related entity
  - `description` (string): Human-readable description
  - `metaJson` (JSON, optional): Metadata
  - `idempotencyKey` (string, optional): For idempotent creation
  - `createdAt`, `updatedAt`
- **Unique Constraints**: `(walletAccountId, idempotencyKey)` - prevents duplicate entries
- **Indexes**: `(tenantId, walletAccountId)`, `(tenantId, status)`, `(tenantId, createdAt)`, `(paymentOrderId)`, `(externalTxnId)`

#### **WalletTransaction** (Legacy wallet transaction, deprecated)
- **Purpose**: Older transaction model (mostly replaced by WalletLedger)
- **Key Fields**: Similar to WalletLedger but simpler
- **Note**: Kept for backward compatibility

#### **Tenant** (Tenant payment state)
- **Fields**:
  - `walletBalancePaise` (Int): Tenant-level wallet balance (legacy field, coexists with WalletAccount/WalletLedger)
  - Relations: `paymentOrders`, `paymentAttempts`, `paymentWebhookEvents`, `paymentReconciliations`

---

## 2. Payment Enums

### PaymentProvider
```typescript
enum PaymentProvider {
  payu = 'payu',
  razorpay = 'razorpay'
}
```

### PaymentProviderMode
```typescript
enum PaymentProviderMode {
  test = 'test',
  live = 'live'
}
```

### PaymentOrderStatus
```typescript
enum PaymentOrderStatus {
  created = 'created',          // Order initialized
  pending = 'pending',          // Awaiting payment
  initiated = 'initiated',      // User sent to payment gateway
  success = 'success',          // Payment confirmed
  failed = 'failed',            // Payment declined
  cancelled = 'cancelled',      // User cancelled
  expired = 'expired'           // Payment expired
}
```

### PaymentAttemptStatus
```typescript
enum PaymentAttemptStatus {
  initiated = 'initiated',      // Request sent to provider
  pending = 'pending',          // Awaiting provider response
  success = 'success',          // Provider confirmed success
  failed = 'failed',            // Provider reported failure
  declined = 'declined'         // Payment declined by provider
}
```

### WebhookProcessingStatus
```typescript
enum WebhookProcessingStatus {
  received = 'received',        // Webhook stored, not processed
  processed = 'processed',      // Successfully processed
  failed = 'failed',            // Processing failed
  ignored = 'ignored'           // Intentionally ignored
}
```

### EntryDirection
```typescript
enum EntryDirection {
  credit = 'credit',            // Money flowing in
  debit = 'debit'               // Money flowing out
}
```

### EntryType
```typescript
enum EntryType {
  wallet_topup = 'wallet_topup',
  usage_debit = 'usage_debit',
  manual_credit = 'manual_credit',
  manual_debit = 'manual_debit',
  refund = 'refund',
  adjustment = 'adjustment'
}
```

### LedgerEntryStatus
```typescript
enum LedgerEntryStatus {
  pending = 'pending',
  success = 'success',
  failed = 'failed',
  reversed = 'reversed'
}
```

---

## 3. Payment API Routes & Endpoints

### 3.1 PayU Payment Routes (`/api/payments/payu/`)

#### **POST /api/payments/payu/initiate**
- **Auth**: `requireTenant` middleware
- **Purpose**: Initiate a wallet top-up with PayU
- **Request Body**:
  ```typescript
  {
    amount: number,              // in paise (e.g., 100000 = ₹1000)
    description?: string,        // Default: "Wallet top-up"
    email: string,               // User email
    phoneNumber: string,         // User phone (10+ digits)
    userId: string,              // User identifier
    successUrl?: string,         // Redirect on success
    failureUrl?: string          // Redirect on failure
  }
  ```
- **Response**:
  ```typescript
  {
    success: boolean,
    data: {
      paymentOrderId: string,
      merchantTransactionId: string,
      payuKey: string,
      hash: string,              // SHA512 hash for PayU form
      amount: number,
      email: string,
      phoneNumber: string,
      description: string,
      payuMode: 'test' | 'live',
      payuUrl: string,           // PayU payment page URL
      successUrl: string,
      failureUrl: string
    }
  }
  ```
- **Validation**:
  - Amount: ₹10 (1000 paise) to ₹1,00,000 (10,000,000 paise)
  - Phone: 10+ digits
- **Side Effects**:
  - Creates `PaymentOrder` with status `created`
  - Creates `PaymentAttempt` with status `initiated`
  - Creates wallet account if not exists

#### **POST /api/payments/payu/mock-success** ⚠️ DEV ONLY
- **Auth**: `requireTenant`
- **Purpose**: Simulate successful payment without PayU (development only)
- **Availability**: Production returns 403 Forbidden
- **Request Body**:
  ```typescript
  {
    amount: number,              // in paise
    userId?: string              // Optional, defaults to tenant-level wallet
  }
  ```
- **Response**: Returns wallet update with new balance

#### **GET /api/payments/payu/:paymentOrderId**
- **Auth**: `requireTenant`
- **Purpose**: Fetch payment order details
- **Response**:
  ```typescript
  {
    id: string,
    tenantId: string,
    amount: number,
    currency: string,
    status: PaymentOrderStatus,
    provider: PaymentProvider,
    payuTxnId?: string,
    merchantTxnId: string,
    createdAt: string,
    updatedAt: string,
    attempts: Array<{
      id: string,
      status: PaymentAttemptStatus,
      providerTxnId?: string,
      createdAt: string
    }>
  }
  ```

#### **POST /api/payments/payu/:paymentOrderId/verify-redirect**
- **Auth**: `requireTenant`
- **Purpose**: Verify payment after redirect from PayU
- **Request Body**:
  ```typescript
  {
    merchantTransactionId: string,  // Original txn ID
    payuTransactionId: string,      // PayU's mihpayid
    status: 'success' | 'failed'    // Payment result
  }
  ```
- **Response**:
  ```typescript
  {
    success: boolean,
    message: string,
    data: {
      success: boolean,
      message: string,
      orderStatus?: PaymentOrderStatus
    }
  }
  ```
- **Side Effects**:
  - Updates `PaymentAttempt` with redirect result
  - Updates `PaymentOrder.payuTxnId` and status

#### **POST /api/payments/payu/webhook** 🔔 WEBHOOK
- **Auth**: None (webhook, raw body)
- **Purpose**: Receive and process PayU webhooks
- **Headers**: `x-payu-signature` or `x-signature`
- **Request Body**: Raw JSON (PayU webhook payload)
- **Response**: `{ success: boolean, message: string }`
- **Processing**:
  1. Parses webhook payload
  2. Generates idempotency key from `mihpayid_txnid`
  3. Checks for duplicates (skips if already processed)
  4. Finds matching `PaymentOrder` by `merchantTxnId`
  5. Updates `PaymentAttempt` with response
  6. On success:
     - Updates `PaymentOrder.status` to `success`
     - Creates `WalletLedger` entry (credit)
     - Updates `WalletAccount.currentBalanceMinor`
  7. On failure:
     - Updates `PaymentOrder.status` to `failed`
  8. Marks `PaymentWebhookEvent.processingStatus` to `processed`

#### **POST /api/payments/payu/:paymentOrderId/reconcile**
- **Auth**: `requireTenant`
- **Purpose**: Manual payment reconciliation
- **Response**:
  ```typescript
  {
    status: 'unresolved' | 'webhook_missing' | 'webhook_pending' | 'matched' | 'mismatched',
    matched: boolean,
    details: string
  }
  ```
- **Logic**:
  1. Checks if `PaymentOrder.payuTxnId` exists
  2. Looks for matching `PaymentWebhookEvent`
  3. Verifies webhook processing status
  4. Compares `PaymentOrder.status` vs webhook status

#### **GET /api/payments/payu/balance** ⚠️ DEPRECATED
- **Note**: Use `/api/wallet/balance` instead

#### **GET /api/admin/webhooks/recent/:tenantId** 🔧 DEBUG ONLY
- **Auth**: None (internal use)
- **Purpose**: Debug endpoint to view recent webhook events
- **Query**: `?limit=20` (max 100)
- **Response**:
  ```typescript
  {
    tenantId: string,
    count: number,
    events: Array<{
      id: string,
      eventType: string,
      providerTxnId: string,
      processingStatus: WebhookProcessingStatus,
      createdAt: string,
      error?: string
    }>
  }
  ```

### 3.2 Wallet Routes (`/api/wallet/`)

#### **GET /api/wallet/summary**
- **Auth**: Requires tenant context (header `x-tenant-id` or query param)
- **Purpose**: Get wallet balance and statistics
- **Response**:
  ```typescript
  {
    tenantId: string,
    balancePaise: number,
    balanceFormatted: string,    // "₹100.00"
    currency: string,
    totalCreditsPaise: number,
    totalCreditsFormatted: string,
    totalDebitsPaise: number,
    totalDebitsFormatted: string,
    createdAt: string
  }
  ```

#### **GET /api/wallet/transactions**
- **Auth**: Tenant context required
- **Purpose**: Fetch paginated wallet ledger entries
- **Query Parameters**:
  - `page` (default 1)
  - `pageSize` (default 20, max 100)
  - `status` (optional): `pending | success | failed | reversed`
  - `entryType` (optional): Entry type filter
- **Response**:
  ```typescript
  {
    items: Array<{
      id: string,
      type: 'credit' | 'debit',
      amountPaise: number,
      amountFormatted: string,
      description: string,
      status: LedgerEntryStatus,
      entryType: string,
      externalTxnId?: string,
      paymentOrderId?: string,
      createdAt: string
    }>,
    pagination: {
      page: number,
      pageSize: number,
      totalItems: number,
      totalPages: number
    }
  }
  ```

#### **GET /api/wallet/balance** (Alias for /summary)

### 3.3 Legacy Razorpay Routes (`/api/payment/`)

#### **POST /api/payment/create-order**
- **Purpose**: Create Razorpay order (legacy)
- **Request Body**: `{ amountPaise: number }`

#### **POST /api/payment/verify**
- **Purpose**: Verify Razorpay payment
- **Request Body**: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`

#### **POST /api/payment/webhook**
- **Purpose**: Razorpay webhook handler

#### **GET /api/payment/balance**
- **Purpose**: Get wallet balance (legacy)

#### **GET /api/payment/transactions**
- **Purpose**: List wallet transactions (legacy)

---

## 4. Payment Services & Business Logic

### 4.1 PayU Service (`src/services/payuService.ts`)

#### **Key Functions**

**`initiatePaymentOrder(req: PayUInitiationRequest): Promise<PayUInitiationResponse>`**
- Validates amount, phone number
- Creates wallet account if needed
- Generates merchant transaction ID: `txn_<8-char-tenant>_<timestamp>_<random>`
- Creates `PaymentOrder` record
- Generates SHA512 hash: `SHA512(key|txnid|amount|productinfo|email||salt)`
- Creates initial `PaymentAttempt` record
- Returns form data for PayU redirect

**`generatePayUHash(txnid, amount, productinfo, email, phone): string`**
- Implements PayU SHA512 hash algorithm
- Format: `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${email}||${PAYU_SALT}`

**`verifyPaymentFromRedirect(req: PayURedirectVerificationRequest): Promise<PaymentVerificationResponse>`**
- Validates payment order exists and belongs to tenant
- Validates merchant transaction ID match
- Creates or updates `PaymentAttempt` with redirect status
- Updates `PaymentOrder.payuTxnId` and status (pending/failed)

**`processPayUWebhook(rawBody, headerHash): Promise<WebhookResult>`**
- **Idempotency**: Uses `payu_${mihpayid}_${txnid}` key to prevent duplicate processing
- **Steps**:
  1. Create `PaymentWebhookEvent` record with status `received`
  2. Find `PaymentOrder` by `merchantTxnId` (from webhook txnid)
  3. Create/update `PaymentAttempt` with webhook response
  4. **On Success**:
     - Update `PaymentOrder.status = 'success'`
     - Find `WalletAccount`
     - Create `WalletLedger` entry (credit, status success)
     - Increment `WalletAccount.currentBalanceMinor`
     - Log success
  5. **On Failure**:
     - Update `PaymentOrder.status = 'failed'`
     - Log failure
  6. Update webhook event status to `processed`

**`reconcilePaymentOrder(tenantId, paymentOrderId): Promise<ReconciliationResult>`**
- Checks if payment and webhook statuses match
- Returns: `{ status, matched, details }`
- Statuses: `unresolved | webhook_missing | webhook_pending | matched | mismatched`

**`fetchPaymentOrderDetails(tenantId, paymentOrderId): Promise<PaymentDetails>`**
- Includes last 5 payment attempts
- Filters by tenant for security

**`getRecentWebhookEvents(tenantId, limit): Promise<WebhookEventSummary[]>`**
- Debug endpoint for viewing recent webhooks
- Ordered by creation descending

### 4.2 Billing Service (`src/modules/billing/billing.service.ts`)

#### **`enforceWalletGuardOrBypass(args): Promise<WalletGuardResult>`**
- **Purpose**: Check if call charge can be deducted from wallet
- **Parameters**:
  - `tenantId`: Tenant ID
  - `amountPaise`: Charge amount
  - `callId`: Call identifier
  - `sourceEventId`: Optional event ID for audit
- **Logic**:
  1. Fetch `Tenant.walletBalancePaise`
  2. Check bypass flags:
     - `config.isTestMode`
     - `config.isBillingBypass`
     - `shouldBypassBilling()` admin control
  3. If bypass enabled:
     - Create `UsageRecord` with status `bypassed`
     - Return `{ accepted: true, bypassed: true }`
  4. If insufficient balance:
     - Create `UsageRecord` with status `rejected`
     - Return `{ accepted: false, reason: 'INSUFFICIENT_BALANCE' }`
  5. If sufficient balance:
     - Atomic transaction:
       - Decrement `Tenant.walletBalancePaise`
       - Create `WalletTransaction` (debit, completed)
       - Create `UsageRecord` with status `charged`
     - Return `{ accepted: true, bypassed: false }`
- **Constants**:
  - `DEFAULT_OUTBOUND_CALL_CHARGE_PAISE = 1000` (₹10 per call)

### 4.3 Payment Reconciliation Service (`src/services/paymentReconciliationService.ts`)

#### **`reconcileUnresolvedPayments(tenantId?): Promise<ReconciliationResult[]>`**
- Finds all unresolved payments (>30 mins old)
- Statuses checked: `created | pending | initiated`
- For each payment:
  1. Check if webhook exists for `payuTxnId`
  2. Check webhook processing status
  3. If mismatched, attempt automatic resolution
  4. Store reconciliation record
- Returns: Array of reconciliation results
- Reconciliation actions: `webhook_vs_verify`, `matched`, `resolved`, etc.

#### **`reconcileSpecificPayment(tenantId, paymentOrderId): Promise<ReconciliationResult>`**
- Reconciles a single payment
- Checks webhook match and status

#### **`runAutomaticReconciliationJob(): Promise<ReconciliationStats>`**
- Scheduled job that runs `reconcileUnresolvedPayments()`
- Returns: `{ processed, matched, mismatched, resolved }`

### 4.4 Wallet Ledger Repository (`src/repositories/walletLedgerRepository.ts`)

#### **`getOrCreateWalletAccount(tenantId, userId?)`**
- Gets existing wallet or creates new one
- `userId` null = tenant-level wallet
- `userId` non-null = user-specific wallet

#### **`addLedgerEntry(req): Promise<WalletLedgerEntry>`**
- Creates immutable ledger entry
- **Idempotency**: Uses `idempotencyKey` to prevent duplicates
- Validates wallet ownership
- Returns existing entry if duplicate key found
- Atomically updates wallet balance:
  - Credit: `increment currentBalanceMinor`
  - Debit: `decrement currentBalanceMinor` (with balance check)
- Returns ledger entry details

#### **`listWalletTransactions(options): Promise<{ entries, total }>`**
- Paginated ledger query
- Supports filtering by status, entry type
- Default sort: descending by creation

#### **`getWalletBalance(tenantId, userId?): Promise<WalletSummary>`**
- Returns current balance and statistics
- Aggregates all ledger entries

#### **`formatPaise(amountPaise): string`**
- Formats paise to INR string: "₹100.00"

---

## 5. Payment Integration Points

### 5.1 PayU Integration

**Credentials** (from `backend.env` or `config.ts`):
```
PAYU_KEY=D0Fjcc (test)
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ (test)
PAYU_MODE=test|live
PAYU_WEBHOOK_URL=http://127.0.0.1:4000/api/payments/payu/webhook
PAYU_SUCCESS_URL=http://localhost:3000/lexus/wallet?payment=success
PAYU_FAILURE_URL=http://localhost:3000/lexus/wallet?payment=failure
```

**URLs**:
- Test: `https://test.payumoney.com/payment`
- Live: `https://secure.payu.in/_payment`
- Verify: `https://test.payumoney.com/payment/verify`

**Webhook Payload** (from PayU):
```typescript
{
  status: 'success' | 'failure' | 'pending',
  mihpayid: string,              // PayU's transaction ID
  mode: 'TEST' | 'LIVE',
  txnid: string,                 // Merchant transaction ID
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
  phone: string,
  [additionalFields]: unknown
}
```

**Hash Verification** (receiving webhooks):
```typescript
// PayU sends: merchantKey|merchantTransactionId|amount|productInfo|firstName|email|salt
// We validate this matches our stored hash
```

### 5.2 Razorpay Integration (Legacy)

**Credentials** (from `backend.env`):
```
RAZORPAY_KEY_ID=<key>
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook_secret>
```

**Mode**: 
- Mock mode when credentials missing or `allowDangerousLocalSideEffects=false`
- Real mode when both key and secret configured

### 5.3 Billing Integration Points

**Call Charge Enforcement** (`enforceWalletGuardOrBypass`):
- Called before outbound calls
- Deducts from `Tenant.walletBalancePaise`
- Falls back to `WalletLedger` for double-entry accounting

**Usage Tracking** (`UsageRecord`):
- Tracks all call charges
- Statuses: `bypassed | rejected | charged`
- Links to call session and source event

---

## 6. Configuration & Environment Variables

### Payment Configuration (`src/lib/config.ts`)

```typescript
{
  PAYU_KEY: optional string,
  PAYU_SALT: optional string,
  PAYU_MODE: optional 'test' | 'live',
  BILLING_BYPASS: boolean,           // Bypass all billing charges
  isTestMode: boolean,                // From VOICE_TEST_MODE
  isBillingBypass: boolean,          // From BILLING_BYPASS
  isLocalSafetyMode: boolean,        // Determined by environment
  allowDangerousLocalSideEffects: boolean
}
```

### Local Safety Mode

When `LOCAL_DEVELOPMENT_SAFETY=true`:
- Forces all payment flows into mock behavior
- PayU set to test mode regardless of env
- Razorpay credentials ignored even if present
- Billing operations become safe

### Environment Variables

```bash
# PayU
PAYU_KEY=D0Fjcc
PAYU_SALT=Sv3KkBlBt9gIp6YzzWz58zZ12qdld9pZ
PAYU_MODE=test|live
PAYU_WEBHOOK_URL=http://localhost:4000/api/payments/payu/webhook
PAYU_SUCCESS_URL=http://localhost:3000/lexus/wallet?payment=success
PAYU_FAILURE_URL=http://localhost:3000/lexus/wallet?payment=failure

# Razorpay (legacy)
RAZORPAY_KEY_ID=<optional>
RAZORPAY_KEY_SECRET=<optional>
RAZORPAY_WEBHOOK_SECRET=<optional>

# Billing
BILLING_BYPASS=true|false

# Development
VOICE_TEST_MODE=true|false
APP_ENV=development|production
```

---

## 7. Key Business Flows

### 7.1 Wallet Top-Up Flow

```
Client initiates top-up
    ↓
POST /api/payments/payu/initiate
    ↓
Create PaymentOrder (status: created)
Create PaymentAttempt (status: initiated)
Create/verify WalletAccount
Generate PayU hash
    ↓
Return: { paymentOrderId, merchantTxnId, hash, payuUrl, ... }
    ↓
Client redirects to PayU with form data
    ↓
User completes payment on PayU
    ↓
PayU redirects to successUrl/failureUrl with status
    ↓
Client calls POST /api/payments/payu/:paymentOrderId/verify-redirect
    ↓
Update PaymentAttempt with redirect result
Update PaymentOrder.payuTxnId
    ↓
[Async] PayU sends webhook to /api/payments/payu/webhook
    ↓
Process webhook (idempotent):
  - Create PaymentWebhookEvent (received)
  - Find PaymentOrder by merchantTxnId
  - Update PaymentAttempt with webhook response
  - If success:
    * Update PaymentOrder (success)
    * Create WalletLedger (credit)
    * Increment WalletAccount.currentBalanceMinor
  - Mark webhook processed
    ↓
Wallet updated and ready to use
```

### 7.2 Call Billing Flow

```
Outbound call initiated
    ↓
Call becomes active
    ↓
Billing guard check: enforceWalletGuardOrBypass()
    ↓
If bypass enabled:
  - Log UsageRecord (bypassed)
  - Proceed with call
Else:
  - Check Tenant.walletBalancePaise >= callCharge
  - If insufficient:
    * Log UsageRecord (rejected)
    * Block call
  - If sufficient:
    * Debit Tenant.walletBalancePaise
    * Create WalletTransaction (debit)
    * Create UsageRecord (charged)
    ↓
Call proceeds (or blocks if insufficient balance)
```

### 7.3 Payment Reconciliation Flow

```
[Periodic or manual trigger]
    ↓
Find unresolved payments (>30 mins old, status in created|pending|initiated)
    ↓
For each payment:
  - Check if PaymentWebhookEvent exists for payuTxnId
  - Verify webhook processing status
  - Compare PaymentOrder.status vs webhook status
  - If mismatched:
    * If webhook says success, auto-resolve:
      - Create WalletLedger if missing
      - Update WalletAccount balance
      - Update PaymentOrder (success)
  - Store PaymentReconciliation record
    ↓
Report: { processed, matched, mismatched, resolved }
```

### 7.4 Webhook Processing (Idempotent)

```
Receive webhook
    ↓
Generate idempotencyKey: payu_${mihpayid}_${txnid}
    ↓
Check PaymentWebhookEvent.idempotencyKey
    ↓
If exists and processingStatus === 'processed':
  - Log: Duplicate detected
  - Return: success (already processed)
    ↓
[Continue with processing]
    ↓
Create PaymentWebhookEvent (status: received)
    ↓
Try to process:
  - Find PaymentOrder by merchantTxnId
  - Update PaymentAttempt
  - If success: update payment, ledger, wallet
  - If failure: update payment status
    ↓
Mark webhook: processingStatus = 'processed'
    ↓
On error:
  - Mark webhook: processingStatus = 'failed'
  - Log error message
```

---

## 8. Middleware & Utilities

### 8.1 Auth Middleware

**`requireTenant`**: Extracts tenant context from:
- Request context (set by `attachRequestContext`)
- Session/JWT
- Query parameters
- Headers

Sets `req.requestContext?.tenantId` for downstream use.

### 8.2 Tenant Utilities

**`normalizeTenantId(rawTenantId: string): string`**
- Validates UUID format
- Returns normalized tenant ID

**`assertUuid(value, fieldName)`**
- Throws if not valid UUID
- Used for validation in services

### 8.3 Formatting Utilities

**`formatPaise(amountPaise: number): string`**
- Converts paise to INR string
- Format: "₹100.00" using en-IN locale

---

## 9. Security & Isolation

### 9.1 Tenant Isolation

- Every payment operation verifies `paymentOrder.tenantId === requestContext.tenantId`
- Wallet accounts scoped per `(tenantId, userId)`
- Ledger entries filtered by `tenantId`
- Webhooks resolved to tenant during processing

### 9.2 Idempotency

- **Webhooks**: `PaymentWebhookEvent.idempotencyKey` (unique)
- **Ledger**: `WalletLedger.idempotencyKey` per wallet (unique)
- Duplicate operations return existing result without side effects

### 9.3 Atomic Operations

- Payment order + attempt creation in single request
- Wallet balance updates atomic (transaction)
- Ledger entry + balance update atomic

### 9.4 Audit Trail

- All payment attempts logged in `PaymentAttempt`
- All webhooks logged in `PaymentWebhookEvent`
- All wallet movements in `WalletLedger`
- Reconciliation checks in `PaymentReconciliation`

---

## 10. Error Handling

### Payment Errors

```typescript
// Validation errors
- "Minimum payment amount is ₹10"
- "Maximum payment amount is ₹1,00,000"
- "Invalid phone number"
- "Invalid amount"

// Order errors
- "Payment order not found or access denied"
- "Transaction ID mismatch"

// Webhook errors
- "Payment order not found for transaction"
- "Webhook processing failed"

// Reconciliation errors
- "Payment order not found or access denied"
```

### Billing Errors

```typescript
- "TENANT_NOT_FOUND"
- "INSUFFICIENT_BALANCE"
- Error response in UsageRecord status: 'rejected'
```

---

## 11. Shared Contracts

### Frontend-Backend Contracts (`shared/contracts.ts`)

#### **TenantWalletSummary**
```typescript
{
  tenantId: string;
  balancePaise: number;
  balanceFormatted: string;
  recentTransactionCount: number;
  totalCreditPaise: number;
  totalDebitPaise: number;
  lastProvider: string | null;
  recentTransactions: Array<{
    id: string;
    tenantId: string;
    type: 'credit' | 'debit';
    amountPaise: number;
    amountFormatted: string;
    description: string;
    provider: string | null;
    providerOrderId: string | null;
    providerPaymentId: string | null;
    status: 'pending' | 'completed' | 'failed';
    createdAt: string;
  }>;
}
```

#### **TenantControlCenterRecord** (includes billing section)
```typescript
{
  planBilling: {
    billingBypass: boolean;
    paymentLock: boolean;
    walletBalancePaise: number;
  };
}
```

#### **TenantInfoResponse** (includes wallet info)
```typescript
{
  walletBalancePaise: number;
  walletBalanceFormatted: string;
  walletSummary: TenantWalletSummary | null;
}
```

---

## 12. Testing & Development

### Mock Payment Flow (Dev Only)

**POST /api/payments/payu/mock-success** (non-production):
```typescript
Request: { amount: number, userId?: string }
    ↓
Create/upsert WalletAccount
Create WalletLedger (credit, success)
Increment WalletAccount.currentBalanceMinor
    ↓
Return: { tenantId, walletAccountId, amountPaise, newBalance, ... }
```

### Test Mode Behaviors

- `BILLING_BYPASS=true`: All charges logged but not enforced
- `VOICE_TEST_MODE=true`: Call costs zero or reduced
- `LOCAL_DEVELOPMENT_SAFETY=true`: All payments mocked
- PayU forced to test mode regardless of config

---

## 13. Documentation References

### Existing Docs

- [INTERN_LOCAL_SETUP.md](docs/INTERN_LOCAL_SETUP.md): Local payment testing setup
- [LOCAL_DEVELOPMENT_SAFETY.md](docs/LOCAL_DEVELOPMENT_SAFETY.md): Safety mode for payments
- [VPS_AGENT_INTEGRATION.md](docs/VPS_AGENT_INTEGRATION.md): Integration notes mentioning billing
- [CONTRACT_VALIDATION_SUMMARY.md](docs/CONTRACT_VALIDATION_SUMMARY.md): No changes to payment/admin

### Key Implementation Files

- [src/routes/payuPayment.ts](src/routes/payuPayment.ts): PayU API endpoints
- [src/services/payuService.ts](src/services/payuService.ts): PayU business logic
- [src/services/paymentReconciliationService.ts](src/services/paymentReconciliationService.ts): Reconciliation
- [src/modules/billing/billing.service.ts](src/modules/billing/billing.service.ts): Call charge enforcement
- [src/repositories/walletLedgerRepository.ts](src/repositories/walletLedgerRepository.ts): Wallet operations
- [prisma/schema.prisma](prisma/schema.prisma): Database models
- [shared/contracts.ts](shared/contracts.ts): API contracts

---

## 14. Current Status & Limitations

### Implemented ✅
- PayU test mode integration (primary)
- Razorpay legacy support (fallback)
- Wallet ledger double-entry system
- Idempotent webhook processing
- Automatic reconciliation with manual override
- Tenant isolation and access control
- Call-based billing with wallet guard
- Comprehensive audit trails

### Limitations ⚠️
- PayU live mode requires `PAYU_MODE=live` switch (manual, not auto-detected)
- Razorpay in mock mode when credentials missing
- No payment retry logic (single attempt per order)
- No partial payment support
- Manual reconciliation required for edge cases
- Webhook signature verification not fully implemented (TODO)

### Future Enhancements 🔮
- Multiple payment providers (Stripe, etc.)
- Recurring payments / subscription support
- Refund processing
- Payment plan customization
- Advanced reconciliation with retry logic
- Payment analytics dashboard
- Real-time payment status updates via WebSocket

---

## Quick Reference: Amount Conversions

```
₹1 = 100 paise
₹10 (minimum top-up) = 1,000 paise = 1000 (API parameter)
₹100 = 10,000 paise = 10000 (API parameter)
₹1,000 = 100,000 paise = 100000 (API parameter)
₹10,000 = 1,000,000 paise = 1000000 (API parameter)
₹1,00,000 (maximum) = 10,000,000 paise = 10000000 (API parameter)
```
