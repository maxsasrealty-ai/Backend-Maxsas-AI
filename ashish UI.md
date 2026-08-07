I've now read every file in your Mexus AI Admin Dashboard. Here's a complete breakdown of the entire structure:

***

## Project Overview

This is a **Next.js 15+** admin dashboard for the **Maxsas AI** multi-tenant SaaS platform, built with **TypeScript**, **Tailwind CSS v4**, **GSAP animations**, and **Recharts**. All code lives under `master` branch of the `mexus` repo.

***

## File Structure

```
mexus/
├── src/
│   ├── app/
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Main dashboard page (50 lines)
│   │   ├── globals.css                # Global styles + CSS variables (401 lines)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── dashboard/                 # 6 dashboard widgets
│   │   │   ├── StatsCards.tsx         (172 lines)
│   │   │   ├── CallsTable.tsx         (444 lines)
│   │   │   ├── HeroBanner.tsx         (212 lines)
│   │   │   ├── RevenueChart.tsx       (239 lines)
│   │   │   ├── ActivityFeed.tsx       (139 lines)
│   │   │   └── TenantCards.tsx        (274 lines)
│   │   └── layout/
│   │       ├── DashboardShell.tsx     (159 lines)
│   │       ├── Sidebar.tsx            (329 lines)
│   │       └── TopBar.tsx             (214 lines)
│   └── lib/
│       └── mock-data.ts               (405 lines)
```

***

## Component Breakdown

### 1. **DashboardShell** (`src/components/layout/DashboardShell.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/layout/DashboardShell.tsx)
The root layout wrapper. Key features:
- **Floating Particle Canvas** — A full-viewport `anvas>` with 55 colored particles that drift, connect with lines when within 130px of each other, and pulse in brightness
- Two **ambient orbital gradients** (cyan top-left, violet bottom-right) that float via CSS animation
- Renders `<Sidebar />` and `<TopBar />` plus the page `children`
- Sidebar width is reactive (280px or 72px collapsed)
- Entry animation on the main content area

### 2. **Sidebar** (`src/components/layout/Sidebar.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/layout/Sidebar.tsx)
A collapsible navigation sidebar at 329 lines — one of the larger components. Features:
- **Animated logo** — Gradient conic-gradient ring rotating continuously, animated Zoom pulse effect
- **Expand/collapse toggle** (280px → 72px with smooth GSAP transition)
- **Nav items**: Dashboard, Calls & Leads (badge: `8`), Tenants, Analytics, AI Agents (badge: `5`), Users
- **Bottom nav**: Notifications (badge: 4), Settings, Help
- **User profile card** at bottom showing "AN" avatar, "Anubhav · Founder · Admin", and logout button
- GSAP entrance: sidebar slides in, logo spins, nav items cascade
- Collapsing animates label text fading in/out

### 3. **TopBar** (`src/components/layout/TopBar.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/layout/TopBar.tsx)
The fixed horizontal header bar. Features:
- Page title + subtitle from props
- **Live clock** updating every second (en-IN locale)
- **System status indicator** with pulsing green dot — "All Systems Operational"
- **Global search input** (expands on focus)
- **Refresh button** with rotating icon animation
- **Notification bell** with dropdown (4 notification items: warn/success/info types)
- **"New" CTA button** (primary gradient)
- **Avatar dropdown** with Anubhav's profile
- GSAP entrance: bar slides down, bottom gradient line draws from left to right

### 4. **HeroBanner** (`src/components/dashboard/HeroBanner.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/HeroBanner.tsx)
The hero welcome section at the top of the dashboard. Features:
- Animated grid background + floating orbs (cyan + violet radial gradients)
- **Pill badge**: "Maxsas AI · Admin Console v1.0"
- **Greeting**: "Good [Morning/Afternoon/Evening], Anubhav" with emoji based on system time
- Today's summary: mention of 1,284 calls processed with 94.2% uptime
- **CTA buttons**: "View Live Calls" (primary) and "Generate Report" (ghost)
- **4 quick stat cards** on the right: Calls Today (1,284), Revenue (₹7.8L), Active Agents (38), Leads Today (47) — all with inline GSAP hover lift + glow
- Multiple simultaneous GSAP animations: timeline for entrance, floating sparkles, pulsing glow line, orbiting orbs
- **70 lines of GSAP animation code** — this is the most animation-heavy component

### 5. **StatsCards** (`src/components/dashboard/StatsCards.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/StatsCards.tsx)
Four animated stat cards in a responsive grid:
- **Total Calls** (48,291, +12.4%, cyan)
- **Active Leads** (3,847, +8.1%, violet)
- **Tenants** (142, +3.2%, emerald)
- **Revenue MRR** ($284,500, +18.7%, amber)
- Each card has: icon badge with glow, GSAP counter animation, trend indicator (+/-), **SVG sparkline** with fill gradient + stroke draw animation, per-card colored glow orbs, and hover lift effect
- The **Counter** component animates numbers from 0 to target using GSAP
- The **SparkLine** sub-component is fully custom SVG — calculates polylines from data arrays, draws with GSAP strokeDashoffset animation, adds a filled gradient area, and animates a glowing endpoint circle

### 6. **RevenueChart** (`src/components/dashboard/RevenueChart.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/RevenueChart.tsx)
Two charts side-by-side in a 5-column grid (3:2 ratio):
- **Left: Revenue Area Chart** — Recharts AreaChart showing monthly revenue ($148K–$284.5K) and call volume (28K–51K) over 12 months. Dual gradient fills (cyan for revenue, violet for calls). Custom tooltip. Shows +18.7% YoY badge.
- **Right: Call Volume Bar Chart** — Recharts BarChart showing hourly call distribution (2-hour intervals, 5–195 calls). Bars color-coded: teal for peak hour, violet for high, dark purple for normal. Shows peak hour info card (14:00 hrs, 195 calls).

### 7. **CallsTable** (`src/components/dashboard/CallsTable.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/CallsTable.tsx)
The largest component at 444 lines. Features:
- **Tab switching**: "Calls" vs "Leads" tabs with segmented button control
- **Search input** with live filtering on caller, tenant, status
- **Sortable columns** with asc/desc/none toggle and Chevron icons
- **Pagination** (6 rows per page) with page number buttons
- **Calls table** columns: Caller (with avatar + phone), Tenant, Type (inbound/outbound with icon), Duration, Status badge, Score (color-coded 0–100), Timestamp
- **Leads table** columns: Lead (avatar + email), Company, Status badge, Deal Value (₹), Source pill, Last Contact
- **Export/Filter buttons** (ghost styled)
- Live event simulation with `setInterval` adding new events every 6 seconds
- Staggered row entrance animations on filter/tab/page change

### 8. **ActivityFeed** (`src/components/dashboard/ActivityFeed.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/ActivityFeed.tsx)
A real-time activity feed panel (right side). Features:
- **LIVE badge** with pulsing/pinging green dot
- **4 activity types**: call (cyan), lead (violet), tenant (emerald), system (amber) — each with its own icon and color scheme
- **Live event injection**: `setInterval` every 6 seconds simulates new platform events (inbound calls, lead qualifications, tenant upgrades, AI model updates, call bursts)
- New events animate in from the right with background flash
- Shows "+N new events" counter in subtitle
- Fixed max height 420px with scroll

### 9. **TenantCards** (`src/components/dashboard/TenantCards.tsx`) [github](https://github.com/Aashiskr/mexus/blob/master/src/components/dashboard/TenantCards.tsx)
Tenant overview cards in a 3-column grid. 6 tenants mapped from mock data:
- **Header card**: Logo + status ring (green=active, purple=trial, red=inactive) + name + plan badge + status text + more-vertical menu
- **3 metric blocks**: Calls, Agents, Revenue — each with mini icon card
- **Usage bar**: Animated progress bar (GSAP fill animation) showing call usage vs. max limit — color-coded red/yellow based on >85%/>60% thresholds
- **Footer**: "Since [date]" + "Manage" link with external icon
- **3D tilt effect** on hover using `handleMouseMove` — calculates cursor position relative to card center and applies `rotateX/rotateY` with `transformPerspective: 900`. Elastic snap-back on leave.
- Per-tenant colored glow orbs, bottom accent lines

***

## Design System

The **globals.css** defines a comprehensive dark SaaS design system: [github](https://github.com/Aashiskr/mexus/blob/master/src/app/globals.css)

- **Color palette**: Deep navy base (#070c18 → #172440 scale)
- **Accent colors**: Cyan (#00d4ff), Violet (#7c3aed), Emerald (#10b981), Amber (#f59e0b), Rose (#f43f5e), Pink (#ec4899)
- **Text hierarchy**: Primary (#e8f0ff), Secondary (#8ba3c4), Muted (#4a6080)
- **Typography**: Inter for body text, Space Grotesk for headings
- **Glassmorphism**: `.glass` class with backdrop-filter blur(20px)
- **Animated gradient border**: `.glow-border` with rotating conic gradient on hover
- **Shimmer**: Diagonal light sweep animation
- **Pulse dot + ping**: Live indicator animations
- **Custom scrollbar**: 4px thin with gradient thumb
- **Grid background**: Subtle cyan grid overlay

***

## Key Tech Patterns

| Pattern | Usage |
|---------|-------|
| `gsap.context()` | For scoped animations that auto-clean up on unmount |
| `useRef + useEffect` | Nearly every component — ref-based GSAP targeting |
| `gsap.fromTo()` | Entry animations (slide in, fade, stagger) |
| `gsap.to()` | Hover effects, live updates, continuous loops |
| `setInterval` | Live event simulation in ActivityFeed and CallsTable |
| 3D tilt | TenantCards `handleMouseMove` with perspective transform |
| Custom SVG sparklines | StatsCards — manually computed polylines |
| Recharts composites | RevenueChart — AreaChart + BarChart dual display |
| CSS variables | All theming is CSS-var based, no Tailwind color classes |

***

## Data Flow

All data flows from `src/lib/mock-data.ts` with strongly typed TypeScript interfaces: [github](https://github.com/Aashiskr/mexus/blob/master/src/lib/mock-data.ts)
- `Call` → 8 mock calls (active, completed, pending, failed)
- `Lead` → 5 mock leads (qualified, contacted, converted, lost)
- `Tenant` → 6 tenants (TechCorp, FinEdge, HealthBridge, EduNext, RetailPulse, LogiTrack)
- `ActivityItem` → 6 initial activities + simulated live events
- `statsData` → 4 stats with sparkline arrays
- `revenueData` → 12 months of revenue + call volume
- `callVolumeData` → 24-hour distribution (12 data points)

***

## Navigation Routes

The Sidebar defines these routes:
- `/dashboard` — Overview (current page)
- `/dashboard/calls` — Calls & Leads (badge: 8)
- `/dashboard/tenants` — Tenants
- `/dashboard/analytics` — Analytics
- `/dashboard/agents` — AI Agents (badge: 5)
- `/dashboard/users` — Users
- `/dashboard/notifications` — Notifications (4)
- `/dashboard/settings` — Settings
- `/dashboard/help` — Help

***

This is a highly polished, production-ready admin dashboard with exceptional attention to animations, dark mode aesthetics, and real-time simulation. The code is well-structured with clear separation of concerns, TypeScript typing throughout, and consistent design tokens.