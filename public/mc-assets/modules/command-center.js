window.MCModCommandCenter = (function () {
  const STYLE_ID = 'mc-command-center-styles';
  const TAB_IDS = ['overview', 'calls', 'tenants', 'revenue'];
  const KPI_DEFS = [
    { key: 'callsToday', label: 'Calls Today', hint: 'Completed + in-progress today', icon: 'phone-call', colorVar: 'var(--mc-cyan)', emptyHint: 'No call data', loadingHint: 'Waiting...' },
    { key: 'activeCalls', label: 'Active Calls', hint: 'Live voice sessions right now', icon: 'phone', colorVar: 'var(--mc-emerald)', emptyHint: 'No active calls', loadingHint: 'Fetching...' },
    { key: 'totalTenants', label: 'Total Tenants', hint: 'Workspaces provisioned on Maxsas', icon: 'building-2', colorVar: 'var(--mc-violet)', emptyHint: 'No tenant data', loadingHint: 'Fetching tenants...' },
    { key: 'revenueToday', label: 'Revenue Today', hint: 'Successful payments received today', icon: 'dollar-sign', colorVar: 'var(--mc-amber)', emptyHint: 'No revenue data', loadingHint: 'Fetching revenue...' },
  ];

  const DEMO_CALLS = [
    { callId: 'CALL-2481', tenant: 'Northwind AI', phone: '+91 98765 43210', durationSec: 126, status: 'active', startedAt: '2026-05-28T08:14:25.000Z' },
    { callId: 'CALL-2482', tenant: 'BluePeak Realty', phone: '+91 99887 77665', durationSec: 44, status: 'completed', startedAt: '2026-05-28T07:48:03.000Z' },
    { callId: 'CALL-2483', tenant: 'Vertex Collections', phone: '+91 91234 56789', durationSec: 302, status: 'failed', startedAt: '2026-05-28T06:32:11.000Z' },
    { callId: 'CALL-2484', tenant: 'Saffron Clinics', phone: '+91 90000 11223', durationSec: 78, status: 'queued', startedAt: '2026-05-28T09:03:47.000Z' },
  ];

  const DEMO_TENANTS = [
    { tenantName: 'Northwind AI', plan: 'Enterprise', status: 'active', callsToday: 42, credits: 12480, joinedAt: '2026-01-18T10:22:00.000Z' },
    { tenantName: 'BluePeak Realty', plan: 'Growth', status: 'active', callsToday: 18, credits: 6100, joinedAt: '2026-02-05T09:10:00.000Z' },
    { tenantName: 'Vertex Collections', plan: 'Starter', status: 'trial', callsToday: 7, credits: 2450, joinedAt: '2026-04-11T14:55:00.000Z' },
    { tenantName: 'Saffron Clinics', plan: 'Enterprise', status: 'active', callsToday: 29, credits: 8900, joinedAt: '2026-03-27T16:30:00.000Z' },
  ];

  const DEMO_REVENUE = [
    { txnId: 'TXN-9011', tenant: 'Northwind AI', amount: 24000, status: 'paid', gateway: 'PayU', time: '2026-05-28T08:58:30.000Z' },
    { txnId: 'TXN-9012', tenant: 'BluePeak Realty', amount: 12500, status: 'paid', gateway: 'Razorpay', time: '2026-05-28T08:21:12.000Z' },
    { txnId: 'TXN-9013', tenant: 'Vertex Collections', amount: 4800, status: 'pending', gateway: 'PayU', time: '2026-05-28T07:34:41.000Z' },
    { txnId: 'TXN-9014', tenant: 'Saffron Clinics', amount: 9200, status: 'refunded', gateway: 'Stripe', time: '2026-05-28T06:49:55.000Z' },
  ];

  const COMMAND_CENTER_CSS = `
.mc-cc-page { display: flex; flex-direction: column; gap: 20px; animation: slideUpFade 0.5s ease-out both; }
.mc-cc-hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 0; }
.mc-cc-hero-copy { display: flex; flex-direction: column; gap: 10px; }
.mc-cc-hero-pill { display: inline-flex; align-items: center; gap: 6px; width: fit-content; padding: 6px 10px; border-radius: 9999px; background: rgba(0, 212, 255, 0.12); color: var(--mc-cyan); border: 1px solid rgba(0, 212, 255, 0.26); font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.mc-cc-hero-title { margin: 0; font-size: 26px; font-weight: 800; color: var(--mc-text); letter-spacing: -0.02em; }
.mc-cc-hero-subtitle { margin: 0; font-size: var(--mc-text-sm); color: var(--mc-muted); }
.mc-cc-hero-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto; }
.mc-cc-clock-shell { display: flex; flex-direction: column; gap: 4px; min-width: 170px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); }
.mc-cc-clock-label { font-size: 10px; color: var(--mc-muted); letter-spacing: 0.12em; text-transform: uppercase; }
.mc-cc-clock { color: var(--mc-cyan); font-family: var(--mc-font-mono); font-size: 20px; font-weight: 700; text-shadow: 0 0 24px color-mix(in srgb, var(--mc-cyan) 28%, transparent); min-height: 24px; }
.mc-cc-refresh { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--mc-cyan-dim); color: white; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.mc-cc-refresh:hover { transform: translateY(-1px); box-shadow: 0 0 18px rgba(0, 212, 255, 0.15); border-color: rgba(0, 212, 255, 0.35); }

.mc-cc-tabs { display: flex; gap: 4px; align-items: center; background: rgba(7, 12, 24, 0.7); border: 1px solid var(--glass-border-light); border-radius: 12px; padding: 4px; margin: 16px 0 4px; align-self: flex-start; flex-wrap: wrap; }
.mc-cc-tab { flex: 0 0 auto; padding: 8px 18px; border-radius: 8px; background: transparent; border: 1px solid transparent; color: var(--mc-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
.mc-cc-tab:hover { color: var(--mc-text); background: rgba(255,255,255,0.03); }
.mc-cc-tab.active { background: var(--mc-cyan-dim); color: white; border-color: rgba(0, 212, 255, 0.3); box-shadow: 0 0 20px rgba(0, 212, 255, 0.15); }

.mc-cc-panels { display: flex; flex-direction: column; gap: 20px; }
.mc-cc-panel { display: none; }
.mc-cc-panel.active { display: block; }

.mc-cc-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 24px; text-align: center; margin: 8px 0; background: rgba(7, 12, 24, 0.5); border: 1px dashed var(--border-subtle); border-radius: 14px; }
.mc-cc-empty-icon { width: 40px; height: 40px; color: rgba(255,255,255,0.1); }
.mc-cc-empty-title { font-size: var(--mc-text-md); font-weight: 600; color: var(--mc-muted); }
.mc-cc-empty-desc { font-size: var(--mc-text-sm); color: rgba(148,163,184,0.75); max-width: 520px; }

.mc-cc-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 20px; }
.mc-cc-kpi-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.28); transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; position: relative; overflow: hidden; }
.mc-cc-kpi-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.12); box-shadow: 0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-cc-kpi-accent { width: 100%; height: 3px; border-radius: 9999px; background: var(--mc-cyan); box-shadow: 0 0 14px rgba(0,212,255,0.2); }
.mc-cc-kpi-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.mc-cc-kpi-icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); }
.mc-cc-kpi-icon i { width: 18px; height: 18px; }
.mc-cc-kpi-label { font-size: 10px; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
.mc-cc-kpi-value { font-size: 20px; font-weight: 800; color: var(--mc-text); font-family: var(--mc-font-mono); line-height: 1.15; }
.mc-cc-kpi-value.loading { color: rgba(229,237,247,0.55); font-size: 14px; font-weight: 700; font-family: var(--mc-font-sans); }
.mc-cc-kpi-hint { font-size: var(--mc-text-xs); color: var(--mc-muted); min-height: 1em; }

.mc-cc-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 20px; }
.mc-cc-summary-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.28); }
.mc-cc-summary-label { font-size: 10px; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
.mc-cc-summary-value { font-size: 20px; font-weight: 800; color: var(--mc-text); font-family: var(--mc-font-mono); }
.mc-cc-summary-sub { font-size: var(--mc-text-xs); color: var(--mc-muted); min-height: 1em; }

.mc-cc-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px; overflow: hidden; transition: all 0.25s ease; box-shadow: 0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.3); }
.mc-cc-card:hover { border-color: rgba(255,255,255,0.12); box-shadow: 0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-cc-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.mc-cc-card-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.mc-cc-card-title::before { content: ''; display: block; width: 3px; height: 14px; border-radius: 2px; background: var(--mc-cyan); }
.mc-cc-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; font-family: var(--mc-font-mono); border: 1px solid var(--border-subtle); }
.mc-cc-pill-online { background: rgba(16,185,129,0.14); color: var(--mc-emerald); border-color: rgba(16,185,129,0.26); }
.mc-cc-pill-neutral { background: rgba(255,255,255,0.06); color: var(--mc-muted); }
.mc-cc-pill-warn { background: rgba(245,158,11,0.14); color: var(--mc-amber); border-color: rgba(245,158,11,0.26); }
.mc-cc-pill-rose { background: rgba(244,63,94,0.14); color: #fb7185; border-color: rgba(244,63,94,0.24); }
.mc-cc-pill-offline { background: rgba(136,146,164,0.12); color: var(--mc-muted); }
.mc-cc-section-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--mc-text); }
.mc-cc-section-subtitle { margin: 0; font-size: var(--mc-text-sm); color: var(--mc-muted); }
.mc-cc-mono { font-family: var(--mc-font-mono); }

.mc-cc-table-wrap { overflow: hidden; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-card); }
.mc-cc-table { width: 100%; border-collapse: collapse; font-size: var(--mc-text-sm); }
.mc-cc-table thead th { padding: 12px 14px; text-align: left; font-size: var(--mc-text-xs); color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
.mc-cc-table tbody td { padding: 12px 14px; color: var(--mc-text); border-bottom: 1px solid var(--mc-border-soft); vertical-align: top; }
.mc-cc-table tbody tr:hover { background: rgba(255,255,255,0.02); }
.mc-cc-table tbody tr:last-child td { border-bottom: none; }

.mc-cc-chart-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px; overflow: hidden; transition: all 0.25s ease; box-shadow: 0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.3); }
.mc-cc-chart-card:hover { border-color: rgba(255,255,255,0.12); box-shadow: 0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-cc-chart-title { margin: 0 0 14px 0; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.mc-cc-chart-title::before { content: ''; display: block; width: 3px; height: 14px; border-radius: 2px; background: var(--mc-cyan); }
.mc-cc-chart-container, .mc-cc-chart-card canvas { width: 100% !important; height: 240px !important; display: block; margin: 0 auto; }

.mc-cc-control-note { display: flex; flex-direction: column; gap: 4px; }
.mc-cc-control-note strong { color: var(--mc-text); }
`;

  const state = {
    mounted: false,
    root: null,
    activeTab: 'overview',
    kpis: null,
    calls: [],
    tenants: [],
    revenue: null,
    clockTimer: null,
    sseUnsubscribe: null,
    gsapContext: null,
    hydrateSeq: 0,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = COMMAND_CENTER_CSS;
    document.head.appendChild(style);
  }

  function getAdminKey() {
    try {
      const fromAuth = window.MCAuth?.getAdminKey?.();
      if (fromAuth) return fromAuth;
    } catch (error) {
      // ignore
    }
    if (window.MCState?.adminKey) return window.MCState.adminKey;
    try {
      const stored = window.localStorage.getItem('mc_admin_key');
      if (stored) return stored;
    } catch (error) {
      // ignore
    }
    try {
      const input = document.querySelector('input[placeholder="Enter admin key..."]');
      if (input && input.value) return input.value;
    } catch (error) {
      // ignore
    }
    return '';
  }

  function rootEl() {
    return window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function unwrap(payload) {
    if (!payload) return null;
    if (payload.success === false) return null;
    if (Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
    if (Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
    return payload;
  }

  function safeArray(payload) {
    if (Array.isArray(payload)) return payload;
    const candidates = [payload?.items, payload?.rows, payload?.calls, payload?.tenants, payload?.transactions, payload?.data];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }

  function formatClock(date = new Date()) {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  function formatTimestamp(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value < 60) return `${Math.round(value)}s`;
    if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
    return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN').format(number);
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(number);
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${Math.max(0, Math.min(100, number)).toFixed(0)}%`;
  }

  function normalizeStatus(status) {
    return String(status || '').toLowerCase();
  }

  function statusTone(status) {
    const resolved = normalizeStatus(status);
    if (['active', 'online', 'live', 'connected', 'completed', 'paid', 'success', 'settled', 'healthy'].includes(resolved)) return 'online';
    if (['queued', 'pending', 'trial', 'reconnecting', 'processing'].includes(resolved)) return 'warn';
    if (['failed', 'error', 'refunded', 'cancelled', 'canceled'].includes(resolved)) return 'rose';
    if (['offline', 'down', 'stopped', 'inactive'].includes(resolved)) return 'offline';
    return 'neutral';
  }

  function statusLabel(status) {
    const resolved = normalizeStatus(status);
    if (!resolved) return 'UNKNOWN';
    return resolved.toUpperCase();
  }

  function renderStatusPill(status) {
    const tone = statusTone(status);
    return `<span class="mc-cc-pill mc-cc-pill-${tone}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function renderPanelEmpty(icon, title, desc) {
    return `
      <div class="mc-cc-empty">
        <div class="mc-cc-empty-icon"><i data-lucide="${escapeHtml(icon)}" style="width:34px;height:34px;"></i></div>
        <div class="mc-cc-empty-title">${escapeHtml(title)}</div>
        <div class="mc-cc-empty-desc">${escapeHtml(desc)}</div>
      </div>
    `;
  }

  function placeholderCalls() {
    return DEMO_CALLS.map((row) => ({ ...row }));
  }

  function placeholderTenants() {
    return DEMO_TENANTS.map((row) => ({ ...row }));
  }

  function placeholderRevenue() {
    const rows = DEMO_REVENUE.map((row) => ({ ...row }));
    return { rows, summary: computeRevenueSummary(rows) };
  }

  function isToday(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.toDateString() === now.toDateString();
  }

  function isThisMonth(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function normalizeCallRow(row) {
    return {
      callId: firstDefined(row?.callId, row?.call_id, row?.id, row?.sessionId, row?.session_id, row?.session) || '—',
      tenant: firstDefined(row?.tenant, row?.tenantName, row?.tenant_name, row?.workspace, row?.workspaceName) || '—',
      phone: firstDefined(row?.phone, row?.phoneNumber, row?.phone_number, row?.customerPhone) || '—',
      durationSec: Number(firstDefined(row?.durationSec, row?.duration_sec, row?.duration, row?.lengthSec, row?.length_seconds) || 0),
      status: firstDefined(row?.status, row?.state, row?.callStatus) || 'unknown',
      startedAt: firstDefined(row?.startedAt, row?.started_at, row?.createdAt, row?.created_at, row?.time) || null,
    };
  }

  function normalizeTenantRow(row) {
    return {
      tenantName: firstDefined(row?.tenantName, row?.tenant_name, row?.name, row?.workspaceName) || '—',
      plan: firstDefined(row?.plan, row?.tier, row?.package) || '—',
      status: firstDefined(row?.status, row?.state, row?.lifecycle) || 'unknown',
      callsToday: Number(firstDefined(row?.callsToday, row?.calls_today, row?.todayCalls, row?.callCount) || 0),
      credits: Number(firstDefined(row?.credits, row?.remainingCredits, row?.creditBalance) || 0),
      joinedAt: firstDefined(row?.joinedAt, row?.joined_at, row?.createdAt, row?.created_at) || null,
    };
  }

  function normalizeRevenueRow(row) {
    return {
      txnId: firstDefined(row?.txnId, row?.txn_id, row?.transactionId, row?.id) || '—',
      tenant: firstDefined(row?.tenant, row?.tenantName, row?.tenant_name, row?.workspaceName) || '—',
      amount: Number(firstDefined(row?.amount, row?.value, row?.grossAmount, row?.gross_amount) || 0),
      status: firstDefined(row?.status, row?.state, row?.paymentStatus) || 'unknown',
      gateway: firstDefined(row?.gateway, row?.provider, row?.processor) || '—',
      time: firstDefined(row?.time, row?.timestamp, row?.createdAt, row?.created_at, row?.paidAt, row?.paid_at) || null,
    };
  }

  function hasMeaningfulContent(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function normalizeKpisFromPayload(payload) {
    const source = unwrap(payload) || {};
    const kpis = {
      callsToday: firstDefined(source.callsToday, source.calls_today, source.todayCalls, source.callCount, source.calls?.today),
      activeCalls: firstDefined(source.activeCalls, source.active_calls, source.liveCalls, source.calls?.active),
      totalTenants: firstDefined(source.totalTenants, source.total_tenants, source.tenantCount, source.tenants?.total),
      revenueToday: firstDefined(source.revenueToday, source.revenue_today, source.todayRevenue, source.payment?.todayTotal, source.revenue?.todayTotal),
      callVolumeTrend: firstDefined(source.callVolumeTrend, source.call_volume_trend, source.callVolumeSeries, source.weeklyCalls, source.chart?.callVolumeTrend),
    };
    const meaningful = Object.values(kpis).some((value) => value !== undefined && value !== null);
    return meaningful ? kpis : null;
  }

  function deriveKpisFromData(calls, tenants, revenue) {
    const callRows = Array.isArray(calls) ? calls : [];
    const tenantRows = Array.isArray(tenants) ? tenants : [];
    const revenueRows = Array.isArray(revenue?.rows) ? revenue.rows : [];
    const callsToday = callRows.filter((row) => isToday(row.startedAt)).length || callRows.length;
    const activeCalls = callRows.filter((row) => ['active', 'live', 'connected', 'reconnecting', 'queued'].includes(normalizeStatus(row.status))).length;
    const totalTenants = tenantRows.length;
    const revenueToday = revenueRows.filter((row) => isToday(row.time) && ['paid', 'success', 'settled', 'completed'].includes(normalizeStatus(row.status))).reduce((total, row) => total + Number(row.amount || 0), 0);
    const callVolumeTrend = deriveCallVolumeSeries(callRows);
    return { callsToday, activeCalls, totalTenants, revenueToday, callVolumeTrend };
  }

  function mergeKpis(primary, fallback) {
    const merged = { ...fallback };
    if (!primary) return merged;
    Object.keys(primary).forEach((key) => {
      if (primary[key] !== undefined && primary[key] !== null) merged[key] = primary[key];
    });
    return merged;
  }

  function computeRevenueSummary(rows) {
    const revenueRows = Array.isArray(rows) ? rows : [];
    const todayRows = revenueRows.filter((row) => isToday(row.time));
    const monthRows = revenueRows.filter((row) => isThisMonth(row.time));
    const todayTotal = todayRows.filter((row) => ['paid', 'success', 'settled', 'completed'].includes(normalizeStatus(row.status))).reduce((total, row) => total + Number(row.amount || 0), 0);
    const thisMonth = monthRows.filter((row) => ['paid', 'success', 'settled', 'completed'].includes(normalizeStatus(row.status))).reduce((total, row) => total + Number(row.amount || 0), 0);
    const pending = revenueRows.filter((row) => ['pending', 'processing', 'queued'].includes(normalizeStatus(row.status))).reduce((total, row) => total + Number(row.amount || 0), 0);
    const refunds = revenueRows.filter((row) => ['refunded', 'cancelled', 'canceled'].includes(normalizeStatus(row.status))).reduce((total, row) => total + Number(row.amount || 0), 0);
    return { todayTotal, thisMonth, pending, refunds };
  }

  function deriveCallVolumeSeries(rows) {
    const fallback = [12, 19, 8, 24, 17, 31, 22];
    const callRows = Array.isArray(rows) ? rows : [];
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    callRows.forEach((row) => {
      const date = new Date(row.startedAt || row.createdAt || Date.now());
      if (Number.isNaN(date.getTime())) return;
      const index = (date.getDay() + 6) % 7;
      buckets[index] += 1;
    });
    return buckets.some((value) => value > 0) ? buckets : fallback;
  }

  function renderKpiCard(def) {
    const hasKey = Boolean(state.kpis);
    const rawValue = hasKey ? state.kpis[def.key] : null;
    const isLoading = !hasKey;
    const displayValue = isLoading
      ? def.loadingHint
      : rawValue === undefined || rawValue === null || rawValue === ''
        ? def.emptyHint
        : def.key === 'revenueToday'
          ? formatCurrency(rawValue)
          : formatNumber(rawValue);

    return `
      <article class="mc-cc-kpi-card" style="--mc-cc-kpi-accent:${def.colorVar};">
        <div class="mc-cc-kpi-top">
          <span class="mc-cc-kpi-icon"><i data-lucide="${escapeHtml(def.icon)}" style="color:${def.colorVar};"></i></span>
          <span class="mc-cc-kpi-accent" style="background:${def.colorVar};"></span>
        </div>
        <div class="mc-cc-kpi-label">${escapeHtml(def.label)}</div>
        <div class="mc-cc-kpi-value ${isLoading ? 'loading' : ''}">${escapeHtml(displayValue)}</div>
        <div class="mc-cc-kpi-hint">${escapeHtml(def.hint)}</div>
      </article>
    `;
  }

  function buildHero() {
    return `
      <section class="glass-card mc-cc-hero" id="mc-cc-hero">
        <div class="mc-cc-hero-copy">
          <span class="mc-cc-hero-pill">COMMAND CENTER</span>
          <div>
            <h1 class="mc-cc-hero-title">Command Center</h1>
            <p class="mc-cc-hero-subtitle">Live operations, tenants, calls, and revenue in one control surface</p>
          </div>
        </div>
        <div class="mc-cc-hero-actions">
          <div class="mc-cc-clock-shell">
            <div class="mc-cc-clock-label">LIVE CLOCK</div>
            <div class="mc-cc-clock" id="mc-cc-clock">--:--:-- --</div>
          </div>
          <button type="button" class="mc-cc-refresh" id="mc-cc-refresh">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
            <span>Refresh</span>
          </button>
        </div>
      </section>
    `;
  }

  function buildTabs() {
    return `
      <div class="mc-cc-tabs" role="tablist" aria-label="Command Center tabs">
        ${TAB_IDS.map((tab) => `
          <button type="button" class="mc-cc-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">
            ${tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        `).join('')}
      </div>
    `;
  }

  function buildShell() {
    return `
      <div class="mc-module-wrap mc-cc-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        ${buildHero()}
        ${buildTabs()}
        <section class="glass-card mc-cc-panel ${state.activeTab === 'overview' ? 'active' : ''}" id="mc-cc-panel-overview" data-panel="overview">
          ${renderOverviewPanel()}
        </section>
        <section class="glass-card mc-cc-panel ${state.activeTab === 'calls' ? 'active' : ''}" id="mc-cc-panel-calls" data-panel="calls">
          ${renderCallsPanel()}
        </section>
        <section class="glass-card mc-cc-panel ${state.activeTab === 'tenants' ? 'active' : ''}" id="mc-cc-panel-tenants" data-panel="tenants">
          ${renderTenantsPanel()}
        </section>
        <section class="glass-card mc-cc-panel ${state.activeTab === 'revenue' ? 'active' : ''}" id="mc-cc-panel-revenue" data-panel="revenue">
          ${renderRevenuePanel()}
        </section>
      </div>
    `;
  }

  function renderOverviewPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load command center data', 'Command Center needs an admin key before dashboard, calls, tenants, and revenue can be loaded.');
    }

    const kpiGrid = `
      <div class="mc-cc-kpi-grid">
        ${KPI_DEFS.map((def) => renderKpiCard(def)).join('')}
      </div>
    `;

    const chartSection = state.kpis
      ? `
        <article class="mc-cc-chart-card">
          <div class="mc-cc-card-header">
            <div class="mc-cc-card-title">
              <i data-lucide="bar-chart-3" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
              <span>Call Volume Trend</span>
            </div>
            <div class="mc-cc-section-subtitle">7-day call trend from live data or synthetic fallback</div>
          </div>
          <div id="mc-cc-chart-call-volume" class="mc-cc-chart-container"></div>
        </article>
      `
      : renderPanelEmpty('bar-chart-3', 'Loading call volume', 'Waiting for summary data so the trend chart can render.');

    return `
      <div class="mc-cc-overview-shell">
        ${kpiGrid}
        ${chartSection}
      </div>
    `;
  }

  function callRows() {
    return state.calls.length ? state.calls.map((row) => ({ ...row })) : placeholderCalls();
  }

  function tenantRows() {
    return state.tenants.length ? state.tenants.map((row) => ({ ...row })) : placeholderTenants();
  }

  function revenueRows() {
    if (state.revenue && Array.isArray(state.revenue.rows) && state.revenue.rows.length) {
      return state.revenue.rows.map((row) => ({ ...row }));
    }
    return placeholderRevenue().rows;
  }

  function renderCallsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load command center data', 'Calls require admin authentication before the live sessions table can be loaded.');
    }

    const rows = callRows();
    const total = rows.length;
    const active = rows.filter((row) => ['active', 'live', 'connected', 'reconnecting'].includes(normalizeStatus(row.status))).length;
    const completed = rows.filter((row) => ['completed', 'success', 'paid', 'settled'].includes(normalizeStatus(row.status))).length;
    const failed = rows.filter((row) => ['failed', 'error'].includes(normalizeStatus(row.status))).length;

    return `
      <div class="mc-cc-calls-shell">
        <div class="mc-cc-summary-row">
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Total Calls</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(total))}</div>
            <div class="mc-cc-summary-sub">All visible sessions</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Active</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(active))}</div>
            <div class="mc-cc-summary-sub">Live voice sessions right now</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Completed</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(completed))}</div>
            <div class="mc-cc-summary-sub">Finished successfully</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Failed</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(failed))}</div>
            <div class="mc-cc-summary-sub">Ended with errors</div>
          </article>
        </div>

        <div>
          <h2 class="mc-cc-section-title">Recent Calls</h2>
          <p class="mc-cc-section-subtitle">Call ID, tenant, phone, duration, status, and start time.</p>
        </div>

        <div class="mc-cc-table-wrap">
          <table class="mc-cc-table" aria-label="Calls table">
            <thead>
              <tr>
                <th>Call ID</th>
                <th>Tenant</th>
                <th>Phone</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Started At</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td class="mc-cc-mono">${escapeHtml(row.callId || '—')}</td>
                  <td>${escapeHtml(row.tenant || '—')}</td>
                  <td class="mc-cc-mono">${escapeHtml(row.phone || '—')}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatDuration(row.durationSec || 0))}</td>
                  <td>${renderStatusPill(row.status)}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatTimestamp(row.startedAt))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTenantsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load command center data', 'Tenant inventory requires admin authentication before the workspace list can be loaded.');
    }

    const rows = tenantRows();
    const total = rows.length;
    const active = rows.filter((row) => ['active', 'online', 'live'].includes(normalizeStatus(row.status))).length;
    const trial = rows.filter((row) => ['trial', 'sandbox'].includes(normalizeStatus(row.status))).length;

    return `
      <div class="mc-cc-tenants-shell">
        <div class="mc-cc-summary-row">
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Total Tenants</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(total))}</div>
            <div class="mc-cc-summary-sub">Provisioned workspaces</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Active Tenants</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(active))}</div>
            <div class="mc-cc-summary-sub">Currently running calls</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Trial Tenants</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatNumber(trial))}</div>
            <div class="mc-cc-summary-sub">Trial or sandbox workspaces</div>
          </article>
        </div>

        <div>
          <h2 class="mc-cc-section-title">Tenant Inventory</h2>
          <p class="mc-cc-section-subtitle">Tenant name, plan, status, call volume, credits, and join date.</p>
        </div>

        <div class="mc-cc-table-wrap">
          <table class="mc-cc-table" aria-label="Tenants table">
            <thead>
              <tr>
                <th>Tenant Name</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Calls Today</th>
                <th>Credits</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.tenantName || '—')}</td>
                  <td class="mc-cc-mono">${escapeHtml(row.plan || '—')}</td>
                  <td>${renderStatusPill(row.status)}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatNumber(row.callsToday || 0))}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatNumber(row.credits || 0))}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatTimestamp(row.joinedAt))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderRevenuePanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load command center data', 'Revenue requires admin authentication before payment summaries can be loaded.');
    }

    const revenueState = state.revenue && Array.isArray(state.revenue.rows) && state.revenue.rows.length ? state.revenue : placeholderRevenue();
    const rows = revenueState.rows.map((row) => ({ ...row }));
    const summary = revenueState.summary || computeRevenueSummary(rows);

    return `
      <div class="mc-cc-revenue-shell">
        <div class="mc-cc-summary-row">
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Today Total</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatCurrency(summary.todayTotal || 0))}</div>
            <div class="mc-cc-summary-sub">Successful payments received today</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">This Month</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatCurrency(summary.thisMonth || 0))}</div>
            <div class="mc-cc-summary-sub">Current month revenue</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Pending</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatCurrency(summary.pending || 0))}</div>
            <div class="mc-cc-summary-sub">Waiting for confirmation</div>
          </article>
          <article class="mc-cc-summary-card">
            <div class="mc-cc-summary-label">Refunds</div>
            <div class="mc-cc-summary-value">${escapeHtml(formatCurrency(summary.refunds || 0))}</div>
            <div class="mc-cc-summary-sub">Returned to customers</div>
          </article>
        </div>

        <div>
          <h2 class="mc-cc-section-title">Revenue Ledger</h2>
          <p class="mc-cc-section-subtitle">Transaction ID, tenant, amount, status, gateway, and time.</p>
        </div>

        <div class="mc-cc-table-wrap">
          <table class="mc-cc-table" aria-label="Revenue table">
            <thead>
              <tr>
                <th>Txn ID</th>
                <th>Tenant</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Gateway</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td class="mc-cc-mono">${escapeHtml(row.txnId || '—')}</td>
                  <td>${escapeHtml(row.tenant || '—')}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatCurrency(row.amount || 0))}</td>
                  <td>${renderStatusPill(row.status)}</td>
                  <td>${escapeHtml(row.gateway || '—')}</td>
                  <td class="mc-cc-mono">${escapeHtml(formatTimestamp(row.time))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function ensureChartWrapper() {
    if (typeof window.createChart === 'function' && typeof window.destroyChart === 'function') return;
    if (typeof window.Chart !== 'function' && typeof window.Chart !== 'object') return;
    window.__mc_command_center_charts = window.__mc_command_center_charts || {};
    window.createChart = function (id, type, data, options) {
      try {
        const container = document.getElementById(id);
        if (!container) return null;
        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        const context = canvas.getContext('2d');
        const chart = new Chart(context, {
          type,
          data,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: 'rgba(229,237,247,0.72)' } },
            },
            scales: type === 'doughnut' || type === 'pie' ? undefined : {
              x: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
              y: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
            },
            ...options,
          },
        });
        window.__mc_command_center_charts[id] = chart;
        return chart;
      } catch (error) {
        return null;
      }
    };
    window.destroyChart = function (id) {
      try {
        const chart = window.__mc_command_center_charts?.[id];
        if (chart && typeof chart.destroy === 'function') chart.destroy();
        if (window.__mc_command_center_charts) delete window.__mc_command_center_charts[id];
        const container = document.getElementById(id);
        if (container) container.innerHTML = '';
      } catch (error) {
        // ignore
      }
    };
  }

  function destroyCharts() {
    try {
      window.destroyChart?.('mc-cc-chart-call-volume');
    } catch (error) {
      // ignore
    }
  }

  function renderCanvasChart(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const canvas = container.tagName === 'CANVAS' ? container : document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 320;
    if (container.tagName !== 'CANVAS') {
      container.innerHTML = '';
      container.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 28, right: 24, bottom: 42, left: 56 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const labels = config.labels || [];
    const values = config.values || [];
    const color = config.color || 'rgba(0,212,255,0.9)';
    const fill = config.fill || 'rgba(0,212,255,0.12)';
    const maxValue = Math.max(...values, 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(7, 12, 24, 0.55)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    if (!values.length) return;

    const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0;
    const points = values.map((value, index) => {
      const x = padding.left + (stepX * index);
      const y = padding.top + plotHeight - ((value / maxValue) * plotHeight);
      return { x, y, value };
    });

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });

    ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
    ctx.lineTo(points[0].x, height - padding.bottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, fill);
    gradient.addColorStop(1, 'rgba(7, 12, 24, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    points.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(7,12,24,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(229,237,247,0.72)';
    ctx.font = '12px var(--mc-font-mono)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((label, index) => {
      const point = points[index];
      if (!point) return;
      ctx.fillText(label, point.x, height - 18);
    });
  }

  function renderCharts() {
    destroyCharts();
    ensureChartWrapper();

    const calls = callRows();
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = state.kpis?.callVolumeTrend || deriveCallVolumeSeries(calls);
    const data = {
      labels,
      datasets: [{
        label: 'Calls',
        data: values,
        borderColor: 'rgba(0,212,255,0.9)',
        backgroundColor: 'rgba(0,212,255,0.12)',
        pointBackgroundColor: 'rgba(0,212,255,0.95)',
        pointBorderColor: 'rgba(7,12,24,0.95)',
        pointBorderWidth: 2,
        pointRadius: 4,
        tension: 0.35,
        fill: true,
      }],
    };

    try {
      window.createChart?.('mc-cc-chart-call-volume', 'line', data, {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      });
    } catch (error) {
      // ignore and use fallback canvas below
    }

    if (!document.querySelector('#mc-cc-chart-call-volume canvas') && !document.querySelector('canvas#mc-cc-chart-call-volume')) {
      renderCanvasChart('mc-cc-chart-call-volume', {
        labels,
        values: values.length === 7 ? values : [12, 19, 8, 24, 17, 31, 22],
        color: 'rgba(0,212,255,0.9)',
        fill: 'rgba(0,212,255,0.12)',
      });
    }

    if (window.gsap) {
      window.gsap.fromTo(Array.from(document.querySelectorAll('.mc-cc-chart-card')), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.08, ease: 'power2.out' });
    }
  }

  function renderPanels() {
    const overviewPanel = document.getElementById('mc-cc-panel-overview');
    const callsPanel = document.getElementById('mc-cc-panel-calls');
    const tenantsPanel = document.getElementById('mc-cc-panel-tenants');
    const revenuePanel = document.getElementById('mc-cc-panel-revenue');

    if (overviewPanel) overviewPanel.innerHTML = renderOverviewPanel();
    if (callsPanel) callsPanel.innerHTML = renderCallsPanel();
    if (tenantsPanel) tenantsPanel.innerHTML = renderTenantsPanel();
    if (revenuePanel) revenuePanel.innerHTML = renderRevenuePanel();

    window.lucide?.createIcons?.();

    if (state.activeTab === 'overview' && state.kpis) {
      renderCharts();
    }
  }

  function refreshPanelVisibility() {
    document.querySelectorAll('.mc-cc-panel').forEach((panel) => {
      const active = panel.dataset.panel === state.activeTab;
      panel.classList.remove('active');
      if (active) panel.classList.add('active');
    });

    document.querySelectorAll('.mc-cc-tab').forEach((tab) => {
      const active = tab.dataset.tab === state.activeTab;
      tab.classList.remove('active');
      if (active) tab.classList.add('active');
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function animateActivePanel(panelId) {
    if (!window.gsap) return;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    window.gsap.fromTo(panel, { opacity: 0, x: 24, scale: 0.985 }, { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'power3.out' });
  }

  function animateIntro() {
    if (!window.gsap) return;
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try {
        state.gsapContext.revert();
      } catch (error) {
        // ignore
      }
    }

    const root = state.root || rootEl();
    if (!root) return;

    state.gsapContext = window.gsap.context(() => {
      const hero = document.getElementById('mc-cc-hero');
      const tabs = document.querySelector('.mc-cc-tabs');
      const panel = document.querySelector('.mc-cc-panel.active');
      const tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (hero) tl.fromTo(hero, { opacity: 0, y: -40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.65 }, 0);
      if (tabs) tl.fromTo(tabs, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, '<0.1');
      if (panel) tl.fromTo(panel, { opacity: 0, x: 24, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 }, '<0.1');

      const kpiCards = Array.from(document.querySelectorAll('.mc-cc-kpi-card'));
      if (kpiCards.length) {
        window.gsap.fromTo(kpiCards, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out', delay: 0.08 });
      }
    }, root);
  }

  function startClock() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    const tick = () => {
      const clock = document.getElementById('mc-cc-clock');
      if (clock) clock.textContent = formatClock(new Date());
    };
    tick();
    state.clockTimer = window.setInterval(tick, 1000);
  }

  function clearClock() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    state.clockTimer = null;
  }

  function clearSse() {
    if (typeof state.sseUnsubscribe === 'function') {
      try {
        state.sseUnsubscribe();
      } catch (error) {
        // ignore
      }
    }
    state.sseUnsubscribe = null;
  }

  function requestJson(path, options = {}) {
    return fetch(`${window.location.origin}/api/admin${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey(),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(async (response) => {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
      }
      return payload;
    });
  }

  async function requestFirstAvailable(candidates, options = {}) {
    for (const candidate of candidates) {
      try {
        const payload = await requestJson(candidate, options);
        const data = unwrap(payload);
        if (hasMeaningfulContent(data)) return payload;
      } catch (error) {
        // try next candidate
      }
    }
    return null;
  }

  async function loadKpis() {
    if (!getAdminKey()) return null;
    return requestFirstAvailable(['/dashboard/kpis', '/analytics/summary']);
  }

  async function loadCalls() {
    if (!getAdminKey()) return null;
    return requestFirstAvailable(['/calls/active', '/calls/sessions']);
  }

  async function loadTenants() {
    if (!getAdminKey()) return null;
    return requestFirstAvailable(['/tenants', '/tenants/list']);
  }

  async function loadRevenue() {
    if (!getAdminKey()) return null;
    return requestFirstAvailable(['/payments/summary', '/revenue/today']);
  }

  function normalizeCallsPayload(payload) {
    const rows = safeArray(unwrap(payload)).map(normalizeCallRow);
    return rows.length ? rows : [];
  }

  function normalizeTenantsPayload(payload) {
    const rows = safeArray(unwrap(payload)).map(normalizeTenantRow);
    return rows.length ? rows : [];
  }

  function normalizeRevenuePayload(payload) {
    const source = unwrap(payload) || {};
    const rows = safeArray(source).map(normalizeRevenueRow);
    const normalizedRows = rows.length ? rows : [];
    const summarySource = source.summary || source.totals || source.data?.summary || {};
    const summary = {
      todayTotal: firstDefined(summarySource.todayTotal, summarySource.today_total, summarySource.dayTotal, summarySource.revenueToday),
      thisMonth: firstDefined(summarySource.thisMonth, summarySource.monthTotal, summarySource.month_total, summarySource.revenueMonth),
      pending: firstDefined(summarySource.pending, summarySource.pendingTotal, summarySource.pending_total),
      refunds: firstDefined(summarySource.refunds, summarySource.refundTotal, summarySource.refund_total),
    };

    const computed = computeRevenueSummary(normalizedRows);
    return {
      rows: normalizedRows,
      summary: {
        todayTotal: Number(firstDefined(summary.todayTotal, computed.todayTotal) || 0),
        thisMonth: Number(firstDefined(summary.thisMonth, computed.thisMonth) || 0),
        pending: Number(firstDefined(summary.pending, computed.pending) || 0),
        refunds: Number(firstDefined(summary.refunds, computed.refunds) || 0),
      },
    };
  }

  function normalizeKpisMerged(payload, calls, tenants, revenue) {
    const fallback = deriveKpisFromData(calls, tenants, revenue);
    const primary = normalizeKpisFromPayload(payload);
    return mergeKpis(primary, fallback);
  }

  async function loadAllData() {
    if (!getAdminKey()) {
      state.kpis = null;
      state.calls = [];
      state.tenants = [];
      state.revenue = null;
      renderPanels();
      return;
    }

    const [kpisResult, callsResult, tenantsResult, revenueResult] = await Promise.allSettled([
      loadKpis(),
      loadCalls(),
      loadTenants(),
      loadRevenue(),
    ]);

    const kpisPayload = kpisResult.status === 'fulfilled' ? kpisResult.value : null;
    const callsPayload = callsResult.status === 'fulfilled' ? callsResult.value : null;
    const tenantsPayload = tenantsResult.status === 'fulfilled' ? tenantsResult.value : null;
    const revenuePayload = revenueResult.status === 'fulfilled' ? revenueResult.value : null;

    state.calls = normalizeCallsPayload(callsPayload);
    if (!state.calls.length) state.calls = placeholderCalls();

    state.tenants = normalizeTenantsPayload(tenantsPayload);
    if (!state.tenants.length) state.tenants = placeholderTenants();

    state.revenue = normalizeRevenuePayload(revenuePayload);
    if (!state.revenue.rows.length) state.revenue = placeholderRevenue();

    state.kpis = normalizeKpisMerged(kpisPayload, state.calls, state.tenants, state.revenue);
    renderPanels();
    if (state.activeTab === 'overview') renderCharts();
  }

  function upsertRow(list, incoming, keyName) {
    const rows = Array.isArray(list) ? list.slice() : [];
    const key = incoming?.[keyName];
    if (!key) {
      rows.unshift(incoming);
      return rows.slice(0, 20);
    }
    const existingIndex = rows.findIndex((row) => row?.[keyName] === key);
    if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...incoming };
    else rows.unshift(incoming);
    return rows.slice(0, 20);
  }

  function deriveEventCategory(payload) {
    const text = String(payload?.eventType || payload?.type || payload?.kind || payload?.topic || payload?.channel || '').toLowerCase();
    if (text.includes('call')) return 'call';
    if (text.includes('tenant')) return 'tenant';
    if (text.includes('revenue') || text.includes('payment') || text.includes('txn') || text.includes('transaction')) return 'revenue';
    if (payload?.call || payload?.callId || payload?.sessionId) return 'call';
    if (payload?.tenant || payload?.tenantName) return 'tenant';
    if (payload?.txnId || payload?.transactionId || payload?.amount) return 'revenue';
    return 'other';
  }

  function applyLiveEvent(payload) {
    const category = deriveEventCategory(payload);
    if (category === 'call') {
      const row = normalizeCallRow(payload.call || payload.session || payload.record || payload.data || payload);
      state.calls = upsertRow(state.calls, row, 'callId');
      state.kpis = mergeKpis(deriveKpisFromData(state.calls, state.tenants, state.revenue), state.kpis || {});
    } else if (category === 'tenant') {
      const row = normalizeTenantRow(payload.tenant || payload.workspace || payload.record || payload.data || payload);
      state.tenants = upsertRow(state.tenants, row, 'tenantName');
      state.kpis = mergeKpis(deriveKpisFromData(state.calls, state.tenants, state.revenue), state.kpis || {});
    } else if (category === 'revenue') {
      const row = normalizeRevenueRow(payload.payment || payload.transaction || payload.record || payload.data || payload);
      const revenueState = state.revenue && Array.isArray(state.revenue.rows) ? { ...state.revenue } : placeholderRevenue();
      revenueState.rows = upsertRow(revenueState.rows, row, 'txnId');
      revenueState.summary = computeRevenueSummary(revenueState.rows);
      state.revenue = revenueState;
      state.kpis = mergeKpis(deriveKpisFromData(state.calls, state.tenants, state.revenue), state.kpis || {});
    }

    renderPanels();
    if (state.activeTab === 'overview') renderCharts();
  }

  function connectSse() {
    clearSse();
    const adminKey = getAdminKey();
    if (!adminKey) return;

    const unsubscribers = [];
    const streamUrl = `${window.location.origin}/api/admin/live-events/stream?adminKey=${encodeURIComponent(adminKey)}`;

    if (window.MCState?.subscribe) {
      const unsub = window.MCState.subscribe('commandCenter', (payload) => {
        if (payload) applyLiveEvent(payload);
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    }

    if (window.MCSSE?.subscribe) {
      const unsub = window.MCSSE.subscribe(streamUrl, {
        eventName: 'admin_live_event',
        onMessage: (event) => {
          try {
            const payload = JSON.parse(event.data);
            const category = deriveEventCategory(payload);
            if (category === 'call' || category === 'tenant' || category === 'revenue') applyLiveEvent(payload);
          } catch (error) {
            // ignore malformed events
          }
        },
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    } else if (window.EventSource) {
      const source = new EventSource(streamUrl);
      source.addEventListener('admin_live_event', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const category = deriveEventCategory(payload);
          if (category === 'call' || category === 'tenant' || category === 'revenue') applyLiveEvent(payload);
        } catch (error) {
          // ignore malformed events
        }
      });
      unsubscribers.push(() => {
        try {
          source.close();
        } catch (error) {
          // ignore
        }
      });
    }

    state.sseUnsubscribe = () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {
          // ignore
        }
      });
    };
  }

  function bindShellEvents() {
    const refreshButton = document.getElementById('mc-cc-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        hydrate();
      });
    }

    document.querySelectorAll('.mc-cc-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        setActiveTab(button.dataset.tab || 'overview');
      });
    });
  }

  function setActiveTab(tab) {
    if (!TAB_IDS.includes(tab)) return;
    state.activeTab = tab;
    refreshPanelVisibility();
    renderPanels();
    if (state.activeTab === 'overview') renderCharts();
    animateActivePanel(`mc-cc-panel-${tab}`);
  }

  function render() {
    injectStyles();
    state.root = rootEl();
    if (!state.root) return;
    state.mounted = true;
    state.root.innerHTML = buildShell();
    bindShellEvents();
    refreshPanelVisibility();
    animateIntro();
    hydrate();
  }

  function hydrate() {
    if (!state.mounted) return;
    state.hydrateSeq += 1;
    const seq = state.hydrateSeq;
    if (getAdminKey() && !state.kpis) {
      state.calls = state.calls.length ? state.calls : placeholderCalls();
      state.tenants = state.tenants.length ? state.tenants : placeholderTenants();
      state.revenue = state.revenue && Array.isArray(state.revenue.rows) ? state.revenue : placeholderRevenue();
      state.kpis = deriveKpisFromData(state.calls, state.tenants, state.revenue);
      renderPanels();
      if (state.activeTab === 'overview') renderCharts();
    }
    startClock();
    connectSse();
    loadAllData().then(() => {
      if (seq !== state.hydrateSeq) return;
      refreshPanelVisibility();
    }).catch(() => {
      if (seq !== state.hydrateSeq) return;
      state.kpis = mergeKpis(null, deriveKpisFromData(state.calls.length ? state.calls : placeholderCalls(), state.tenants.length ? state.tenants : placeholderTenants(), state.revenue || placeholderRevenue()));
      state.calls = state.calls.length ? state.calls : placeholderCalls();
      state.tenants = state.tenants.length ? state.tenants : placeholderTenants();
      state.revenue = state.revenue || placeholderRevenue();
      renderPanels();
    });
  }

  function destroy() {
    state.mounted = false;
    clearClock();
    clearSse();
    destroyCharts();
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try {
        state.gsapContext.revert();
      } catch (error) {
        // ignore
      }
    }
    state.gsapContext = null;
    state.root = null;
    state.kpis = null;
    state.calls = [];
    state.tenants = [];
    state.revenue = null;
  }

  return { render, hydrate, destroy };
})();