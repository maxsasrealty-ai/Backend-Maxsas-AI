# BACKEND-FRONTEND SYSTEM REFERENCE

> **IMPORTANT:** This document is written exclusively for Backend Developers. It serves as the single source of truth for the Maxsas Realty AI Livekit frontend state. Read this document before making any backend changes involving SaaS structure, APIs, auth, tenants, billing, leads, plans, workspaces, or realtime streams. Update this file whenever the frontend architecture or shared contracts are modified.

---

## 1. Project Overview & Current Frontend Status
The Maxsas Realty frontend is a unified React Native application built with Expo SDK 54, targeting Web, iOS, and Android simultaneously. It provides a multi-tenant SaaS interface for real estate agents and brokerages to manage AI voice calls, campaigns, and leads. 

**Current Status:** 
- The UI features a premium dark-mode aesthetic with custom animations.
- The routing strictly separates public landing pages and protected multi-tenant workspaces.
- Realtime Server-Sent Events (SSE) integration is implemented for live call updates.
- Auth is partially simulated/mocked for prototype speed, with a session manager preparing for real JWT integration.

---

## 2. Tech Stack
- **Framework:** Expo (SDK 54), React 19, React Native 0.81
- **Routing:** Expo Router (File-based routing v6)
- **Language:** TypeScript
- **Styling:** Vanilla CSS (`app/global.css`) for web animations, React Native `StyleSheet` for cross-platform layouts, and dynamic themes via `LexusThemeContext`.
- **State Management:** React Context API, local component state, and AsyncStorage (`lib/auth/session.ts`).
- **Icons:** Expo Vector Icons, Lucide React
- **Payments:** Razorpay, Stripe (referenced in `package.json`)
- **API Communication:** Native `fetch` wrapped in a custom `ApiClient` + Native `EventSource` for SSE.

---

## 3. Repository/Folder Structure
```text
maxsas-ai-livekit/
├── app/                  # Expo Router file-based routing
│   ├── (protected)/      # Authenticated dashboards
│   │   ├── admin/        # Super admin workspace
│   │   ├── enterprise/   # Enterprise/Brokerage workspace
│   │   └── lexus/        # Agent/Small Business workspace
│   ├── (public)/         # Unauthenticated pages (landing, login)
│   ├── _layout.tsx       # Root layout and authentication guards
│   └── global.css        # Global CSS animations and web resets
├── components/           # Reusable cross-platform UI components
├── context/              # Global React Contexts (Theme, Calls, Auth, Plan)
├── hooks/                # Custom React Hooks
├── lib/                  # Core frontend logic
│   ├── adapters/         # Data mapping layer
│   ├── api/              # API Client and service mappers
│   ├── auth/             # Session management
│   └── realtime/         # SSE Livekit Event Stream handling
└── shared/
    └── contracts/        # 🚨 Shared TS types with backend (Source of Truth)
```

---

## 4. Routing Layout & Public vs Protected Areas
Routing is driven by Expo Router file structures. 
- **Root Layout (`app/_layout.tsx`):** Acts as the primary guard. It monitors authentication status and injects global styles.
- **Public Area (`app/(public)`):** Accessible without a token. Includes `login.tsx`, `signup.tsx`, `privacy-policy.tsx`, `refund-policy.tsx`, `terms.tsx`.
- **Protected Area (`app/(protected)`):** Contains the multi-tenant SaaS dashboards. Users are gated here based on session validity.

---

## 5. Workspace Split
The platform separates roles visually and functionally using dedicated route groups:
1. **Lexus (`app/(protected)/lexus`)**: Designed for solo agents or small teams. Focuses on manual call dispatch, single lead uploads, basic wallet top-ups, and individual reporting.
2. **Prestige**: Currently merged or planned to sit between Lexus and Enterprise (Not actively deployed in the current route structure, but planned for future tier).
3. **Enterprise (`app/(protected)/enterprise`)**: Designed for brokerages. Includes team management (`/teams`), mass campaigns (`/campaigns`), white-labeling (`/white-label`), and advanced billing.
4. **Admin (`app/(protected)/admin`)**: Super-administrator view for managing SaaS tenants (`/tenants`) and viewing live infrastructure events (`/live-events`).

---

## 6. Plan-to-Route Mapping & Feature Gating Logic
Feature gating relies on the backend returning `PlanCapabilities` (`shared/contracts/plans.ts`). The frontend evaluates these to hide/show UI elements.
- **Plans:** `basic`, `pro`, `enterprise`.
- **Capability Keys:** `calls.live`, `calls.history`, `transcripts.partial`, `transcripts.full`, `recordings.playback`, `analytics.basic`, `analytics.advanced`, `crm.sync`, `whiteLabel.branding`.
- **Logic:** The frontend hook evaluates `features[CapabilityKey] === true` before granting access to specific screens (like advanced analytics routes) or UI buttons.

---

## 7. Major Screens / Pages
### Lexus Workspace
- **Home (`lexus/index.tsx`)**: Dashboard overview, quick stats.
- **Upload (`lexus/leads-upload.tsx`)**: CSV handling, mapping inputs to the `/calls` batch dispatch API.
- **Wallet (`lexus/wallet.tsx`)**: Credit balance display and Razorpay/Stripe top-up flows.
- **Reports (`lexus/calls.tsx`)**: Call history, transcript rendering, and call analysis.
- **Profile (`lexus/profile.tsx`)**: Agent settings, forwarding numbers, prompt tuning, UI mock mode, and Call Duration limit controls.

---

## 8. Contexts & Providers
- **`LexusThemeContext.tsx`**: Manages the dark/light mode palette, injecting `colors.bgSoft`, `colors.border`, etc.
- **`CallsContext.tsx`**: Manages the local array of active/past calls to prevent prop-drilling across the dashboard.
- **`AuthContext.tsx` & `PlanContext.tsx`**: Planned structure for injecting session data.

---

## 9. Hooks
- **`useAuth.ts`**: Fetches current `AuthSessionUser`.
- **`usePlan.ts` / `useCapabilities.ts`**: Fetches and evaluates tenant capability flags.
- **`useWallet.ts`**: Handles balance fetches and payment processor SDK loading.
- **`useCallDetail.ts` & `useVoiceCalls.ts`**: Fetches specific transcripts and events.
- **`useLexusTheme`**: Accesses dynamic design tokens.

---

## 10. API Client Structure & Shared Contracts
### The API Client (`lib/api/client.ts`)
- Implements `ApiClient` class over native `fetch`.
- **Headers Automatically Injected:**
  - `Authorization: Bearer <TOKEN>` (Defaults to `dev_token` if missing).
  - `x-tenant-id: <TENANT_ID>` (Pulled from local storage session).
- **Envelopes:** All responses are expected to be wrapped in the `ApiEnvelope<T>` format (`success: boolean`, `data: T`, `error: {}`).

### Shared Contracts (`shared/contracts/`)
**DO NOT CHANGE THESE IN BACKEND WITHOUT UPDATING FRONTEND DIRECTORY.**
- `api.ts`: Envelope structure.
- `calls.ts`: Call states (`queued`, `ringing`, `active`, etc.), transcripts, lead payloads.
- `plans.ts`: Plan capability mappings.
- `workspace.ts`: Tenant configurations.
- `admin.ts`, `payment.ts`, `campaigns.ts`.

---

## 11. SSE / Realtime Flow
- **Implementation:** `lib/realtime/client.ts` uses native `EventSource`.
- **Endpoint:** `${baseApiUrl}/realtime/calls/stream?tenantId=<TENANT_ID>`
- **Behavior:** The frontend maintains a single persistent SSE connection per active tenant. It listens to the `call_event` stream. The backend **must** stream valid JSON matching `RealtimeCallEvent`. 
- **Reconnection:** Features an automatic exponential backoff reconnect mechanism.

---

## 12. Auth & Session Assumptions
- **Storage:** Handled by `lib/auth/session.ts` using `AsyncStorage` on Native and `localStorage` on Web.
- **Key:** `maxsas.auth.session.user`
- **Data Shape:** `AuthSessionUser` requires `id`, `email`, `fullName`, `tenantId`.
- **Mock Warning:** `app/_layout.tsx` currently has auth guards commented out to allow rapid prototyping. Do not assume hard auth redirects are active on the frontend yet.

---

## 13. Theme, Design System, & Platform-Specific Files
- **Design System:** Strictly dark-mode premium UI. Uses heavy gradients, glassmorphism (`rgba(255,255,255, 0.05)`), and smooth shadows.
- **Platform Files:** Expo handles platform splits using `.web.tsx` or `.native.tsx`. E.g., `index.web.tsx` renders SEO-friendly web markup, while `index.native.tsx` renders App components.
- **CSS:** Web animations (`float`, `pulse-glow`, `fade-up`) are defined in `app/global.css`.

---

## 14. Environment / Config Dependencies
Managed via `expo-env.d.ts` and `.env` files.
- `EXPO_PUBLIC_API_BASE_URL`: Base SaaS Backend URL.
- `EXPO_PUBLIC_VOICE_API_BASE_URL`: Dedicated Voice Backend URL.
- `EXPO_PUBLIC_AUTH_BEARER_TOKEN`: Fallback/Dev token.
- `EXPO_PUBLIC_TENANT_ID`: Fallback/Dev tenant.

---

## 15. Error & Loading States
- API Errors are handled by extracting the `error.message` from the `ApiEnvelope`.
- Loading states rely on localized `isLoading` booleans, showing skeletons or spinner indicators. 
- UI does not currently crash on 401s; it gracefully logs the failure and shows an empty state.

---

## 16. Current Limitations & TODOs
1. **Auth Guards:** Route guards in `_layout.tsx` are disabled for prototype testing.
2. **Prestige Tier:** The Prestige UI workspace does not physically exist yet.
3. **SSE Fallbacks:** No WebSocket or Polling fallback if SSE is blocked by proxies.
4. **Call Duration Limit:** Currently stored in AsyncStorage (`maxsas.lexus.theme.duration_limit`) via `LexusThemeContext` for Lexus only. Pending backend API integration to pass this configuration downstream.

---
---

# 🚨 BACKEND IMPACT NOTES

Backend engineers must adhere to the following when modifying services:

1. **Required Headers:** Every SaaS backend route must expect and validate `x-tenant-id`.
2. **Response Formatting:** You **must** return the `ApiEnvelope<T>` format. `{"success": true, "data": ...}`. Returning raw arrays or raw objects will break the frontend `ApiClient`.
3. **SSE Connection String:** The endpoint `/realtime/calls/stream` must support query parameter `?tenantId=...`. Do not change this to a route param without updating `lib/realtime/client.ts`.
4. **Enums Match:** Call states (`queued`, `initiated`, `ringing`, `active`, `completed`, `failed`) are hardcoded in `shared/contracts/calls.ts`. Adding new states backend-side will result in "Unknown" frontend UI states.
5. **Feature Flags:** Hiding a backend route behind a payment plan requires updating `shared/contracts/plans.ts` so the frontend knows to hide the corresponding button.
6. **Token Resolution:** The frontend injects `Bearer <token>`. Ensure your backend Auth Middleware extracts the token from the standard `Authorization` header.

---
---

# 📝 CHANGE UPDATE CHECKLIST

**Every time this file or the frontend structure is modified, the author must review this checklist:**

- [ ] Have you added a new route? (Update "Workspace Split" & "Major Screens")
- [ ] Have you modified a shared contract? (Verify `shared/contracts` is synchronized with the backend repo)
- [ ] Have you changed a backend payload shape? (Update "Shared Contracts" & "Backend Impact Notes")
- [ ] Have you renamed any `CapabilityKey` plan logic? (Update "Feature Gating Logic")
- [ ] Have you changed how realtime events are formatted? (Update "SSE/Realtime Flow")
- [ ] Are fields removed or renamed? (Document in "Backend Impact Notes")
- [ ] Have environment variables changed? (Update "Environment / Config Dependencies")
