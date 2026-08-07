Wallet UI ka exact current map निकाल रहा हूँ: पहले related files/hooks/pages identify करूँगा, फिर current render/data flow aur backend mismatch ko short audit mein summarize करूँगा.

Searched for regex `useWallet|WalletBalanceResponse|WalletTransactionsResponse|payment/payu|verify-redirect|refreshBalance|loadMoreTransactions|simulateTopUpSuccess` (`Maxsas-AI-Livekit` · `**/*.{ts,tsx,js,jsx,md}`), 139 results

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/hooks/useWallet.ts)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/app/%28protected%29/lexus/wallet.tsx#1-1), lines 1 to 520

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/app/payment/payu.tsx#1-1), lines 1 to 420

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/lib/api/payment.ts)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/shared/contracts/payment.ts)

Core files are in hand. Abhi I’m checking the exact rendered fields and any existing status/provider/source wiring so the report can say “already present” vs “missing” precisely.

Searched for regex `provider|status|tenantId|source|pending|locked|paymentMessage|optimisticTransaction|balanceFormatted|amountFormatted|createdAt` (`Maxsas-AI-Livekit` · `app/(protected)/lexus/wallet.tsx`), 67 results

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/lib/payments/payuFlow.ts)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/context/PlanContext.tsx)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/context/AuthContext.tsx)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/lib/api/client.ts)

Read [](file:///c%3A/Users/Anubhav%20Chaudhary/Documents/MAXSAS%20AI%20WORK/Maxsas-AI-Livekit/app/%28protected%29/lexus/wallet/checkout.tsx)

Ab relevant routes/components ka exact inventory complete kar रहा हूँ, plus debit/reversal/search terms dekh रहा हूँ ताकि support matrix false-positive na ho.

Searched for files matching `Maxsas-AI-Livekit` · `app/**/*wallet*.*`, 1 match

Searched for files matching `Maxsas-AI-Livekit` · `app/**/*payu*.*`, 1 match

Searched for regex `reversal|refund|failed|pending|debit|credit|providerOrderId|providerPaymentId|source|status` (`Maxsas-AI-Livekit` · `app/(protected)/lexus/wallet.tsx`), 56 results

Searched for regex `reversal|refund|pending|source|providerOrderId|providerPaymentId|status` (`Maxsas-AI-Livekit` · `lib/payments/payuFlow.ts`), 26 results

Searched for regex `balancePaise|balanceFormatted|amountFormatted|providerOrderId|providerPaymentId|status|createdAt|tenantId` (`Maxsas-AI-Livekit` · `shared/contracts/payment.ts`), 11 results

Searched for regex `GET /api/payment/balance|GET /api/payment/transactions|POST /api/payments/.*/verify-redirect|simulatePayUSuccessTopUp|initiatePayUCheckout` (`Maxsas-AI-Livekit` · `docs/*.md`), 54 results

**Audit**
- Existing wallet surface is centered on useWallet.ts, app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L1), payu.tsx, app/(protected)/lexus/wallet/checkout.tsx/lexus/wallet/checkout.tsx#L1), payment.ts, payuFlow.ts, and payment.ts.
- The wallet screen is a fully built UI, not a stub: balance hero, wallet summary stats, quick top-ups, custom top-up input, dev simulate button, payment status banners, optimistic payment card, filter chips, transaction list, and load-more pagination are all present in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L230).
- Data comes from `useWallet()` state. That hook owns `balance`, `transactions`, `totalTransactions`, `isLoading`, `isTopUpLoading`, `error`, and `topUpResult` with plain React state, not a global store or cache layer in useWallet.ts.
- API wiring is already in place through payment.ts: `GET /payment/balance`, `GET /payment/transactions`, `POST /payments/payu/initiate`, and `POST /payments/payu/mock-success`. The client injects `Authorization` and `x-tenant-id` automatically in client.ts.
- Refresh/live update is mount-driven plus manual and callback-driven: `useWallet()` calls `refreshBalance()` in `useEffect` on mount in useWallet.ts, the wallet screen has a manual refresh button in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L269), `loadMoreTransactions()` paginates in useWallet.ts, and payu.tsx polls balance/transactions every 3 seconds until it sees a matching credit.
- Pending PayU flow is partially implemented: `useWallet.topUp()` builds success/failure URLs and persists a pending payment record in payuFlow.ts, and the native/web checkout handoff is in app/(protected)/lexus/wallet/checkout.tsx/lexus/wallet/checkout.tsx#L1). The callback screen reads PayU params and redirects back to wallet, but it does not yet POST a verify-redirect call in the current code path.
- payment.ts already models tenant-scoped wallet data, signed amounts, provider refs, and statuses via `tenantId`, `amountFormatted`, `provider`, `providerOrderId`, `providerPaymentId`, `status`, and `createdAt` in payment.ts. There is no `source` field in the transaction contract yet.
- AuthContext.tsx and PlanContext.tsx are empty, so they are not part of the current wallet data flow.

**What the UI already renders vs what it does not**
- Tenant-wise balance: fetched tenant-wise through headers, but not shown as a tenant label in UI. Only `balanceFormatted` is rendered in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L243).
- Transaction history: yes, the list renders loaded transactions from the current tenant in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L397).
- Signed amounts `+/-`: yes, list rows show `+` for credit and `-` for debit in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L404).
- Pending top-ups: partially. There is a loading card during submission and an optimistic success card on callback, but not a durable pending transaction row or pending-status badge in the history list.
- Payment status: partially. The screen shows success/failure banners from callback query params, but transaction rows do not render the backend `status` field.
- Provider reference: not rendered. `providerOrderId` and `providerPaymentId` are used for matching/duplication logic, but not shown to users.
- Timestamps: yes, each row shows `createdAt` localized in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L402).
- Source fields: no, not rendered, and not even present in the current transaction contract.
- Debit/credit/reversal: credit/debit is supported in UI and model; reversal/refund is not explicitly modeled in the current UI or status enum.

**Mismatches with the tenant-scoped ledger flow**
- The biggest gap is that payu.tsx currently polls for confirmation and then redirects back, but does not make the backend verification POST you asked for.
- The current wallet list has enough fields to display `providerOrderId`, `providerPaymentId`, `status`, and a richer lifecycle, but the UI does not surface them yet.
- `status` is limited to `"pending" | "completed" | "failed"` in payment.ts, so backend reversal/refund/chargeback support will need schema expansion if those states must be visible.
- Summary cards like Spent/Recharged/Last Debit are computed from the in-memory `transactions` array in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L168), so they are only as complete as the loaded pages, not a backend aggregate.
- The wallet UI is tenant-scoped by transport, not by presentation. There is no tenant switcher, tenant badge, or explicit tenant label in the page.

**Exact wiring plan**
- Keep useWallet.ts as the single source of truth for balance and transaction state, and keep using the tenant-scoped API client.
- Add the backend verification POST in payu.tsx before redirecting back to wallet, then refresh balance and transactions after that call succeeds.
- Extend the transaction row UI in app/(protected)/lexus/wallet.tsx/lexus/wallet.tsx#L397) to show `status`, `provider`, and provider reference badges, and add a compact source badge only if the backend adds a `source` field.
- Add explicit pending/reversal presentation by expanding payment.ts if the backend ledger flow uses more than the current three statuses.
- Surface tenant scope in the UI only if product wants it; otherwise keep it implicit and enforce it through `x-tenant-id` in client.ts.
- If you want the wallet to feel fully production-ready, the next frontend step is not new screens, but richer transaction row metadata and a hard verify-redirect call in the callback flow.

If you want, I can turn this audit into a compact backend handoff checklist next, using the same current-state map.