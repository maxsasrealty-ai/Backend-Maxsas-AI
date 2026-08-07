window.MCModAnalytics = (function () {
  const STYLE_ID = 'mc-analytics-styles';
  const TAB_IDS = ['overview', 'calls', 'tenants'];
  const RANGE_IDS = ['24h', '7d', '30d', '90d'];

  const CHART_IDS = {
    callTrend: 'mc-analytics-call-trend',
    agentActivity: 'mc-analytics-agent-activity',
    quality: 'mc-analytics-quality',
    success: 'mc-analytics-success',
  };

  const state = {
    mounted: false,
    root: null,
    activeTab: 'overview',
    activeRange: '7d',
    overview: null,
    calls: null,
    tenants: null,
    clockTimer: null,
    autoRefreshTimer: null,
    hydrateSeq: 0,
    chartIds: Object.values(CHART_IDS),
    gsapContext: null,
    tenantsVisible: 20,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.mc-analytics-page { display:flex; flex-direction:column; gap:20px; animation: slideUpFade 0.5s ease-out both; }
.mc-analytics-hero { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:0; }
.mc-analytics-hero-copy { display:flex; flex-direction:column; gap:10px; }
.mc-analytics-hero-title { margin:0; font-size:26px; font-weight:800; color:var(--mc-text); letter-spacing:-0.02em; }
.mc-analytics-hero-subtitle { margin:0; font-size:var(--mc-text-sm); color:var(--mc-muted); }
.mc-analytics-hero-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-left:auto; }
.mc-analytics-clock-shell { display:flex; flex-direction:column; gap:4px; min-width:170px; padding:12px 14px; border-radius:16px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.02); }
.mc-analytics-clock-label { font-size:10px; color:var(--mc-muted); letter-spacing:0.12em; text-transform:uppercase; }
.mc-analytics-clock { color:var(--mc-cyan); font-family:var(--mc-font-mono); font-size:20px; font-weight:700; text-shadow:0 0 24px color-mix(in srgb, var(--mc-cyan) 28%, transparent); min-height:24px; }
.mc-analytics-refresh { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--mc-cyan-dim); color:white; font-size:13px; font-weight:700; cursor:pointer; transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.mc-analytics-refresh:hover { transform:translateY(-1px); box-shadow:0 0 18px rgba(0,212,255,0.15); border-color:rgba(0,212,255,0.35); }

.mc-analytics-tabs { display:flex; gap:4px; align-items:center; background:rgba(7, 12, 24, 0.7); border:1px solid var(--glass-border-light); border-radius:12px; padding:4px; margin:16px 0 4px; align-self:flex-start; flex-wrap:wrap; }
.mc-analytics-tab { flex:0 0 auto; padding:8px 18px; border-radius:8px; background:transparent; border:1px solid transparent; color:var(--mc-muted); font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; white-space:nowrap; }
.mc-analytics-tab:hover { color:var(--mc-text); background:rgba(255,255,255,0.03); }
.mc-analytics-tab.active { background:var(--mc-cyan-dim); color:white; border-color:rgba(0,212,255,0.3); box-shadow:0 0 20px rgba(0,212,255,0.15); }
.mc-analytics-range-bar { display:flex; gap:6px; align-items:center; margin-left:auto; flex-wrap:wrap; }
.mc-analytics-range-label { font-size:11px; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.06em; margin-right:8px; font-family:var(--mc-font-mono); }
.mc-analytics-range-btn { padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.02); color:var(--mc-muted); font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; transition:all 0.2s ease; font-family:var(--mc-font-mono); }
.mc-analytics-range-btn:hover { color:var(--mc-text); border-color:rgba(255,255,255,0.12); }
.mc-analytics-range-btn.active { color:var(--mc-cyan); background:var(--mc-cyan-dim); border-color:rgba(0,212,255,0.35); box-shadow:0 0 14px rgba(0,212,255,0.18); }

.mc-analytics-panels { display:flex; flex-direction:column; gap:20px; }
.mc-analytics-panel { display:none; }
.mc-analytics-panel.active { display:block; }
.mc-analytics-empty, .mc-panel-empty { display:flex; align-items:center; justify-content:center; text-align:center; min-height:160px; border-radius:14px; padding:28px; border:1px dashed var(--border-subtle); background:rgba(7,12,24,0.5); color:var(--mc-muted); font-size:var(--mc-text-sm); }

.mc-analytics-summary-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:var(--mc-grid-gap); margin:16px 0 20px; }
.mc-analytics-summary-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:18px; display:flex; gap:14px; align-items:center; transition:all 0.25s ease; box-shadow:0 8px 24px rgba(0,0,0,0.3); }
.mc-analytics-summary-card:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); transform:translateY(-2px); }
.mc-analytics-summary-icon { width:40px; height:40px; display:grid; place-items:center; border-radius:12px; background:rgba(255,255,255,0.03); color:var(--mc-cyan); flex:0 0 auto; }
.mc-analytics-summary-body { min-width:0; display:flex; flex-direction:column; gap:2px; }
.mc-analytics-summary-value { font-size:22px; font-weight:800; color:var(--mc-text); font-family:var(--mc-font-mono); line-height:1.1; }
.mc-analytics-summary-label { font-size:11px; font-weight:700; color:var(--mc-text); text-transform:uppercase; letter-spacing:0.08em; }
.mc-analytics-summary-sub { font-size:var(--mc-text-xs); color:var(--mc-muted); min-height:1em; }

.mc-analytics-stat-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin:16px 0 20px; }
.mc-analytics-stat-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:8px; box-shadow:0 8px 24px rgba(0,0,0,0.28); }
.mc-analytics-stat-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.mc-analytics-stat-label { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:var(--mc-muted); font-weight:700; }
.mc-analytics-stat-value { font-size:22px; font-weight:800; color:var(--mc-text); font-family:var(--mc-font-mono); }
.mc-analytics-stat-trend { font-size:11px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; font-family:var(--mc-font-mono); }
.mc-analytics-stat-trend.up { color:var(--mc-emerald); }
.mc-analytics-stat-trend.down { color:var(--mc-rose); }
.mc-analytics-stat-trend.flat { color:var(--mc-amber); }

.mc-analytics-chart-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:var(--mc-grid-gap); margin:16px 0; }
@media (max-width:1024px) { .mc-analytics-chart-grid { grid-template-columns:1fr; } }
.mc-analytics-chart-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:18px; overflow:hidden; transition:all 0.25s ease; box-shadow:0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.3); }
.mc-analytics-chart-card:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-analytics-chart-title { margin:0 0 14px 0; display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.08em; }
.mc-analytics-chart-title::before { content:''; display:block; width:3px; height:14px; border-radius:2px; background:var(--mc-cyan); }
.mc-analytics-chart-container, .mc-analytics-chart-card canvas { width:100% !important; height:240px !important; display:block; margin:0 auto; }

.mc-analytics-table-shell { display:flex; flex-direction:column; gap:14px; }
.mc-analytics-table-toolbar { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; }
.mc-analytics-table-meta { font-size:11px; color:var(--mc-muted); font-family:var(--mc-font-mono); letter-spacing:0.06em; text-transform:uppercase; }
.mc-analytics-load-more-wrap { display:flex; justify-content:flex-end; margin-top:14px; }
.mc-analytics-load-more { padding:10px 14px; border-radius:10px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.02); color:var(--mc-text); font-weight:700; cursor:pointer; transition:all 0.2s ease; }
.mc-analytics-load-more:hover { border-color:rgba(0,212,255,0.24); transform:translateY(-1px); }

.mc-analytics-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:9999px; border:1px solid var(--border-subtle); font-size:11px; font-weight:700; font-family:var(--mc-font-mono); letter-spacing:0.04em; }
.mc-analytics-badge.ok { background:rgba(16,185,129,0.14); color:var(--mc-emerald); border-color:rgba(16,185,129,0.26); }
.mc-analytics-badge.warn { background:rgba(245,158,11,0.14); color:var(--mc-amber); border-color:rgba(245,158,11,0.26); }
.mc-analytics-badge.bad { background:rgba(244,63,94,0.14); color:var(--mc-rose); border-color:rgba(244,63,94,0.26); }
.mc-analytics-badge.neutral { background:rgba(255,255,255,0.06); color:var(--mc-muted); }
`;
    document.head.appendChild(style);
  }

  function getAdminKey() {
    return window.MCAuth?.getAdminKey?.() || '';
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

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN').format(number);
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${number.toFixed(1)}%`;
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(number);
  }

  function formatDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }

  function formatDateTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  function formatTimeRange(label) {
    const value = String(label || '7d').toLowerCase();
    if (value === '24h') return 'Last 24 Hours';
    if (value === '7d') return 'Last 7 Days';
    if (value === '30d') return 'Last 30 Days';
    if (value === '90d') return 'Last 90 Days';
    return label ? `Last ${String(label).toUpperCase()}` : 'Current Range';
  }

  function unwrap(payload) {
    if (!payload) return null;
    if (payload.success === false) return null;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
  }

  function toArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  function fetchJson(path) {
    const adminKey = getAdminKey();
    return fetch(`${window.location.origin}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
    }).then(async (response) => {
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
      }
      return payload;
    });
  }

  function resolveSeries(source, fallbackLabels = []) {
    if (!source) return { labels: fallbackLabels, values: [] };
    if (Array.isArray(source)) {
      if (source.length === 0) return { labels: fallbackLabels, values: [] };
      if (typeof source[0] === 'object') {
        return {
          labels: source.map((item, index) => item.label ?? item.name ?? item.period ?? item.date ?? item.day ?? `#${index + 1}`),
          values: source.map((item) => Number(item.value ?? item.count ?? item.total ?? item.calls ?? item.success ?? item.active ?? 0)),
        };
      }
      return { labels: fallbackLabels.length ? fallbackLabels : source.map((_, index) => `#${index + 1}`), values: source.map((item) => Number(item || 0)) };
    }
    if (typeof source === 'object') {
      return {
        labels: toArray(source.labels).map((item) => String(item)),
        values: toArray(source.values).map((item) => Number(item || 0)),
      };
    }
    return { labels: fallbackLabels, values: [] };
  }

  function normalizeStatus(value) {
    const status = String(value || 'unknown').toLowerCase();
    if (status.includes('active') || status.includes('success') || status.includes('ok') || status.includes('healthy')) return 'ok';
    if (status.includes('warn') || status.includes('pending') || status.includes('idle') || status.includes('queued')) return 'warn';
    if (status.includes('fail') || status.includes('error') || status.includes('churn')) return 'bad';
    return 'neutral';
  }

  function deriveTrend(value, higherIsBetter = true) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'flat';
    if (number === 0) return 'flat';
    return higherIsBetter ? (number >= 0 ? 'up' : 'down') : (number <= 0 ? 'up' : 'down');
  }

  function renderBadge(status, text) {
    return `<span class="mc-analytics-badge ${status}">${escapeHtml(text)}</span>`;
  }

  function normalizeCallRow(raw) {
    const call = raw && typeof raw === 'object' ? raw : {};
    const startedAt = call.created_at || call.createdAt || call.startedAt || call.started_at || call.timestamp || Date.now();
    const durationValue = Number(call.durationSec ?? call.duration_s ?? call.duration ?? call.callDurationSec ?? 0);
    const latencyValue = Number(call.latencyMs ?? call.latency_ms ?? call.avgLatencyMs ?? call.averageLatencyMs ?? NaN);
    const status = String(call.status || call.outcome || call.result || 'unknown').toLowerCase();
    return {
      ...call,
      rowKey: String(call.id || call.call_id || call.callId || Math.random().toString(36).slice(2)),
      id: String(call.id || call.call_id || call.callId || ''),
      callId: String(call.id || call.call_id || call.callId || ''),
      tenantId: String(call.tenant_id || call.tenantId || call.tenant || '—'),
      agentId: String(call.agent_id || call.agentId || call.agent || '—'),
      status,
      statusTone: normalizeStatus(status),
      durationSec: Number.isFinite(durationValue) ? durationValue : 0,
      latencyMs: Number.isFinite(latencyValue) ? latencyValue : null,
      createdAt: startedAt,
      createdLabel: formatDateTime(startedAt),
      success: String(status).includes('success') || String(status).includes('qualified') || String(status).includes('completed'),
      failure: String(status).includes('fail') || String(status).includes('error') || String(status).includes('no_answer') || String(status).includes('busy'),
      isConversion: String(status).includes('qualified') || String(status).includes('success'),
      isCancelled: String(status).includes('cancel') || String(status).includes('drop'),
    };
  }

  function normalizeTenantRow(raw) {
    const tenant = raw && typeof raw === 'object' ? raw : {};
    const totalCalls = Number(tenant.totalCalls ?? tenant.callCount ?? tenant.calls ?? tenant.callsTotal ?? 0);
    const successRate = Number(tenant.successRate ?? tenant.success_rate ?? tenant.conversionRate ?? tenant.conversion_rate ?? NaN);
    const avgDuration = Number(tenant.avgDurationSec ?? tenant.averageDurationSec ?? tenant.avg_duration_sec ?? tenant.avgDuration ?? NaN);
    const lastActive = tenant.lastActiveAt || tenant.last_active_at || tenant.lastSeenAt || tenant.last_seen_at || tenant.updatedAt || tenant.updated_at || null;
    return {
      ...tenant,
      rowKey: String(tenant.id || tenant.tenantId || tenant.tenant_id || tenant.slug || Math.random().toString(36).slice(2)),
      tenantId: String(tenant.id || tenant.tenantId || tenant.tenant_id || tenant.slug || '—'),
      totalCalls: Number.isFinite(totalCalls) ? totalCalls : 0,
      successRate: Number.isFinite(successRate) ? successRate : null,
      avgDurationSec: Number.isFinite(avgDuration) ? avgDuration : null,
      lastActiveAt: lastActive,
      lastActiveLabel: formatDateTime(lastActive),
      status: String(tenant.status || tenant.state || tenant.lifecycle || (Number.isFinite(successRate) && successRate < 30 ? 'churned' : 'active')).toLowerCase(),
      statusTone: normalizeStatus(tenant.status || tenant.state || tenant.lifecycle || (Number.isFinite(successRate) && successRate < 30 ? 'churned' : 'active')),
    };
  }

  function deriveOverviewData(raw) {
    const overview = raw && typeof raw === 'object' ? raw : {};
    const kpis = overview.kpis || overview.summary || overview.metrics || overview;
    const callVolume = resolveSeries(overview.callVolume || overview.volumeTrend || overview.callTrend || overview.series?.callVolume || [], []);
    const agentActivity = resolveSeries(overview.agentActivity || overview.agentTrend || overview.series?.agentActivity || [], []);
    const totalCalls = Number(kpis.totalCalls ?? kpis.total_calls ?? overview.totalCalls ?? overview.callCount ?? callVolume.values.reduce((sum, value) => sum + Number(value || 0), 0));
    const successRate = Number(kpis.successRate ?? kpis.success_rate ?? overview.successRate ?? overview.callSuccessRate ?? NaN);
    const avgDuration = Number(kpis.avgDurationSec ?? kpis.avgDuration ?? kpis.averageDurationSec ?? overview.avgDurationSec ?? overview.avgDuration ?? NaN);
    const totalTenants = Number(kpis.totalTenants ?? kpis.total_tenants ?? overview.totalTenants ?? toArray(overview.tenants).length ?? toArray(overview.tenantRows).length ?? 0);
    return {
      raw: overview,
      totalCalls: Number.isFinite(totalCalls) ? totalCalls : 0,
      successRate: Number.isFinite(successRate) ? successRate : null,
      avgDurationSec: Number.isFinite(avgDuration) ? avgDuration : null,
      totalTenants: Number.isFinite(totalTenants) ? totalTenants : 0,
      callVolume,
      agentActivity,
    };
  }

  function bucketTrend(rows, days = 7) {
    const buckets = new Map();
    const labels = [];
    const today = new Date();
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      const label = date.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
      labels.push(label);
      buckets.set(label, { success: 0, failure: 0, total: 0 });
    }
    rows.forEach((row) => {
      const date = new Date(row.createdAt || Date.now());
      if (Number.isNaN(date.getTime())) return;
      const label = date.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
      if (!buckets.has(label)) return;
      const bucket = buckets.get(label);
      bucket.total += 1;
      if (row.success) bucket.success += 1;
      if (row.failure) bucket.failure += 1;
    });
    return {
      labels,
      success: labels.map((label) => buckets.get(label)?.success || 0),
      failure: labels.map((label) => buckets.get(label)?.failure || 0),
      total: labels.map((label) => buckets.get(label)?.total || 0),
    };
  }

  function deriveCallsData(raw, range) {
    const callsPayload = raw && typeof raw === 'object' ? raw : {};
    const rows = toArray(callsPayload.calls || callsPayload.rows || callsPayload.items || callsPayload.records || callsPayload.data || raw)
      .map(normalizeCallRow);
    const successfulCalls = Number(callsPayload.successfulCalls ?? callsPayload.successCount ?? rows.filter((row) => row.success).length);
    const failedCalls = Number(callsPayload.failedCalls ?? callsPayload.failureCount ?? rows.filter((row) => row.failure).length);
    const avgLatencyMs = Number(callsPayload.avgLatencyMs ?? callsPayload.averageLatencyMs ?? callsPayload.latencyMs ?? (() => {
      const values = rows.map((row) => Number(row.latencyMs)).filter((value) => Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
    })());
    const conversionRate = Number(callsPayload.conversionRate ?? callsPayload.successRate ?? (() => {
      const total = successfulCalls + failedCalls;
      return total ? (successfulCalls / total) * 100 : NaN;
    })());

    const qualityDistribution = resolveSeries(callsPayload.qualityDistribution || callsPayload.distribution || [
      { label: 'Successful', value: successfulCalls },
      { label: 'Failed', value: failedCalls },
      { label: 'Cancelled', value: rows.filter((row) => row.isCancelled).length },
    ]);

    const trendDays = range === '24h' ? 1 : range === '30d' ? 30 : range === '90d' ? 90 : 7;
    const trend = callsPayload.successFailureTrend || callsPayload.trend || bucketTrend(rows, trendDays);
    const threshold = Number(callsPayload.threshold ?? callsPayload.successThreshold ?? 80);

    return {
      raw: callsPayload,
      rows,
      successfulCalls: Number.isFinite(successfulCalls) ? successfulCalls : 0,
      failedCalls: Number.isFinite(failedCalls) ? failedCalls : 0,
      avgLatencyMs: Number.isFinite(avgLatencyMs) ? avgLatencyMs : null,
      conversionRate: Number.isFinite(conversionRate) ? conversionRate : null,
      qualityDistribution,
      successFailureTrend: {
        labels: trend.labels || [],
        success: trend.success || trend.values || [],
        failure: trend.failure || [],
        threshold,
      },
    };
  }

  function deriveTenantsData(raw) {
    const tenantsPayload = raw && typeof raw === 'object' ? raw : {};
    const rows = toArray(tenantsPayload.tenants || tenantsPayload.rows || tenantsPayload.items || tenantsPayload.data || raw).map(normalizeTenantRow);
    const activeTenants = Number(tenantsPayload.activeTenants ?? tenantsPayload.activeCount ?? rows.filter((row) => row.statusTone !== 'bad' && row.statusTone !== 'neutral').length);
    const churnedTenants = Number(tenantsPayload.churnedTenants ?? tenantsPayload.churnCount ?? rows.filter((row) => row.statusTone === 'bad').length);
    return {
      raw: tenantsPayload,
      rows,
      totalTenants: rows.length,
      activeTenants: Number.isFinite(activeTenants) ? activeTenants : 0,
      churnedTenants: Number.isFinite(churnedTenants) ? churnedTenants : 0,
    };
  }

  function buildShell() {
    return `
      <div class="mc-module-wrap mc-analytics-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        <section class="glass-card mc-analytics-hero" id="mc-analytics-hero">
          <div class="mc-analytics-hero-copy">
            <span class="hero-pill">ANALYTICS</span>
            <div>
              <h1 class="mc-analytics-hero-title">Analytics Dashboard</h1>
              <p class="mc-analytics-hero-subtitle">Voice operations analytics, agent performance, and tenant insights <span id="mc-analytics-range-label">${escapeHtml(formatTimeRange(state.activeRange))}</span></p>
            </div>
          </div>
          <div class="mc-analytics-hero-actions">
            <div class="mc-analytics-clock-shell">
              <div class="mc-analytics-clock-label">LIVE CLOCK</div>
              <div class="mc-analytics-clock" id="mc-analytics-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-analytics-refresh" id="mc-analytics-refresh">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
              <span>Refresh</span>
            </button>
          </div>
        </section>

        <div class="mc-analytics-tabs" role="tablist" aria-label="Analytics tabs">
          ${TAB_IDS.map((tab) => `<button type="button" class="mc-analytics-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>`).join('')}
          <div class="mc-analytics-range-bar" aria-label="Analytics ranges">
            <span class="mc-analytics-range-label">Range</span>
            ${RANGE_IDS.map((range) => `<button type="button" class="mc-analytics-range-btn ${state.activeRange === range ? 'active' : ''}" data-range="${range}">${range.toUpperCase()}</button>`).join('')}
          </div>
        </div>

        <section class="glass-card mc-analytics-panel ${state.activeTab === 'overview' ? 'active' : ''}" id="mc-analytics-panel-overview" data-panel="overview"></section>
        <section class="glass-card mc-analytics-panel ${state.activeTab === 'calls' ? 'active' : ''}" id="mc-analytics-panel-calls" data-panel="calls"></section>
        <section class="glass-card mc-analytics-panel ${state.activeTab === 'tenants' ? 'active' : ''}" id="mc-analytics-panel-panel-tenants" data-panel="tenants"></section>
      </div>
    `;
  }

  function renderOverviewPanel() {
    if (!getAdminKey()) {
      return '<div class="mc-panel-empty">Add admin key to load analytics data.</div>';
    }

    const overview = state.overview || deriveOverviewData(state.calls?.raw || state.calls || {});
    const kpis = [
      { label: 'Total Calls', value: formatNumber(overview.totalCalls), icon: 'phone-call', colorVar: 'var(--mc-cyan)' },
      { label: 'Success Rate', value: formatPercent(overview.successRate), icon: 'circle-check', colorVar: 'var(--mc-emerald)' },
      { label: 'Avg Call Duration', value: overview.avgDurationSec != null ? formatDuration(overview.avgDurationSec) : '—', icon: 'clock', colorVar: 'var(--mc-amber)' },
      { label: 'Total Tenants', value: formatNumber(overview.totalTenants), icon: 'building-2', colorVar: 'var(--mc-cyan)' },
    ];

    return `
      <div class="mc-analytics-shell">
        <div class="mc-analytics-summary-row" id="mc-analytics-overview-kpis">
          ${kpis.map((kpi) => window.createKpiCard?.(kpi.label, kpi.value, kpi.icon, kpi.colorVar, false) || '').join('')}
        </div>
        <div class="mc-analytics-chart-grid">
          <article class="mc-analytics-chart-card">
            <div class="mc-analytics-chart-title">Call Volume Trend</div>
            <div id="${CHART_IDS.callTrend}" class="mc-analytics-chart-container"></div>
          </article>
          <article class="mc-analytics-chart-card">
            <div class="mc-analytics-chart-title">Agent Activity</div>
            <div id="${CHART_IDS.agentActivity}" class="mc-analytics-chart-container"></div>
          </article>
        </div>
      </div>
    `;
  }

  function renderCallsStats() {
    const calls = state.calls || deriveCallsData({}, state.activeRange);
    const successTrend = Number.isFinite(calls.conversionRate) ? (calls.conversionRate >= 65 ? 'up' : calls.conversionRate >= 45 ? 'flat' : 'down') : 'flat';
    const failureTrend = calls.failedCalls > calls.successfulCalls ? 'down' : 'up';
    const cards = [
      { label: 'Successful Calls', value: formatNumber(calls.successfulCalls), tone: 'up', accent: 'var(--mc-emerald)' },
      { label: 'Failed Calls', value: formatNumber(calls.failedCalls), tone: 'down', accent: 'var(--mc-rose)' },
      { label: 'Avg Latency', value: calls.avgLatencyMs != null ? `${Math.round(calls.avgLatencyMs)} ms` : '—', tone: 'flat', accent: 'var(--mc-amber)' },
      { label: 'Conversion Rate', value: formatPercent(calls.conversionRate), tone: successTrend, accent: 'var(--mc-cyan)' },
    ];

    return `
      <div class="mc-analytics-stat-grid">
        ${cards.map((card) => `
          <article class="mc-analytics-stat-card">
            <div class="mc-analytics-stat-top">
              <div class="mc-analytics-stat-label">${escapeHtml(card.label)}</div>
              <div class="mc-analytics-stat-trend ${escapeHtml(card.tone)}">${card.tone === 'down' ? '↓' : '↑'}</div>
            </div>
            <div class="mc-analytics-stat-value" style="color:${card.accent};">${escapeHtml(card.value)}</div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderCallsPanel() {
    if (!getAdminKey()) {
      return '<div class="mc-panel-empty">Add admin key to load call analytics.</div>';
    }
    return `
      <div class="mc-analytics-shell">
        ${renderCallsStats()}
        <div class="mc-analytics-chart-grid">
          <article class="mc-analytics-chart-card">
            <div class="mc-analytics-chart-title">Call Quality Distribution</div>
            <div id="${CHART_IDS.quality}" class="mc-analytics-chart-container"></div>
          </article>
          <article class="mc-analytics-chart-card">
            <div class="mc-analytics-chart-title">Success vs Failure Over Time</div>
            <div id="${CHART_IDS.success}" class="mc-analytics-chart-container"></div>
          </article>
        </div>
      </div>
    `;
  }

  function renderTenantsPanel() {
    if (!getAdminKey()) {
      return '<div class="mc-panel-empty">Add admin key to load tenant analytics.</div>';
    }

    const tenants = state.tenants || deriveTenantsData({});
    const cards = [
      { label: 'Total Tenants', value: formatNumber(tenants.totalTenants), tone: 'neutral' },
      { label: 'Active Tenants', value: formatNumber(tenants.activeTenants), tone: 'ok' },
      { label: 'Churned Tenants', value: formatNumber(tenants.churnedTenants), tone: 'bad' },
    ];

    const visibleRows = tenants.rows.slice(0, state.tenantsVisible);
    const tableColumns = [
      { key: 'tenantId', label: 'Tenant ID', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.tenantId)}</span>` },
      { key: 'totalCalls', label: 'Total Calls', render: (_value, row) => `<span class="mc-mono">${escapeHtml(formatNumber(row.totalCalls))}</span>` },
      { key: 'successRate', label: 'Success %', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.successRate != null ? formatPercent(row.successRate) : '—')}</span>` },
      { key: 'avgDurationSec', label: 'Avg Duration', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.avgDurationSec != null ? formatDuration(row.avgDurationSec) : '—')}</span>` },
      { key: 'lastActiveAt', label: 'Last Active', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.lastActiveLabel)}</span>` },
      { key: 'status', label: 'Status', render: (_value, row) => renderBadge(row.statusTone, row.status) },
    ];

    return `
      <div class="mc-analytics-table-shell">
        <div class="mc-analytics-summary-row">
          ${cards.map((card) => `
            <article class="mc-analytics-summary-card">
              <div class="mc-analytics-summary-icon"><i data-lucide="building-2" style="width:20px;height:20px;"></i></div>
              <div class="mc-analytics-summary-body">
                <div class="mc-analytics-summary-value">${escapeHtml(card.value)}</div>
                <div class="mc-analytics-summary-label">${escapeHtml(card.label)}</div>
                <div class="mc-analytics-summary-sub">${renderBadge(card.tone, card.label)}</div>
              </div>
            </article>
          `).join('')}
        </div>

        <div class="mc-analytics-table-toolbar">
          <div class="mc-analytics-table-meta">Showing ${formatNumber(visibleRows.length)} of ${formatNumber(tenants.rows.length)} tenants</div>
          <div class="mc-analytics-table-meta">Search, sort, and inspect tenant activity</div>
        </div>

        <div id="mc-analytics-tenants-table"></div>
        ${tenants.rows.length > state.tenantsVisible ? '<div class="mc-analytics-load-more-wrap"><button type="button" class="mc-analytics-load-more" id="mc-analytics-load-more">Load More</button></div>' : ''}
      </div>
    `;
  }

  function renderPanels() {
    const overviewPanel = document.getElementById('mc-analytics-panel-overview');
    const callsPanel = document.getElementById('mc-analytics-panel-calls');
    const tenantsPanel = document.getElementById('mc-analytics-panel-panel-tenants');

    if (overviewPanel) overviewPanel.innerHTML = renderOverviewPanel();
    if (callsPanel) callsPanel.innerHTML = renderCallsPanel();
    if (tenantsPanel) tenantsPanel.innerHTML = renderTenantsPanel();

    refreshPanelVisibility();
    syncShellControls();
    window.lucide?.createIcons?.();
    bindPanelEvents();

    if (state.activeTab === 'overview') renderCharts();
    if (state.activeTab === 'calls') renderCharts();
    if (state.activeTab === 'tenants') mountTenantsTable();
  }

  function refreshPanelVisibility() {
    document.querySelectorAll('.mc-analytics-panel[data-panel]').forEach((panel) => {
      const active = panel.dataset.panel === state.activeTab;
      panel.classList.toggle('active', active);
    });
  }

  function syncShellControls() {
    document.querySelectorAll('.mc-analytics-tab[data-tab]').forEach((button) => {
      const active = button.dataset.tab === state.activeTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.mc-analytics-range-btn[data-range]').forEach((button) => {
      button.classList.toggle('active', button.dataset.range === state.activeRange);
    });

    const label = document.getElementById('mc-analytics-range-label');
    if (label) label.textContent = formatTimeRange(state.activeRange);
  }

  function destroyCharts() {
    state.chartIds.forEach((chartId) => {
      try {
        window.destroyChart?.(chartId);
      } catch (error) {
        // ignore
      }
    });
  }

  async function renderCharts() {
    destroyCharts();
    if (!state.activeTab) return;

    const overview = state.overview || deriveOverviewData(state.calls?.raw || state.calls || {});
    const calls = state.calls || deriveCallsData({}, state.activeRange);

    if (state.activeTab === 'overview') {
      const cyan = 'rgba(0, 212, 255, 0.9)';
      const cyanFill = 'rgba(0, 212, 255, 0.18)';
      const emerald = 'rgba(16, 185, 129, 0.9)';
      try {
        window.createChart?.(CHART_IDS.callTrend, 'line', {
          labels: overview.callVolume.labels || [],
          datasets: [{ label: 'Calls', data: overview.callVolume.values || [], borderColor: cyan, backgroundColor: cyanFill, fill: true, tension: 0.35, pointRadius: 0 }],
        }, { plugins: { legend: { display: false } } });
      } catch (error) {}

      try {
        window.createChart?.(CHART_IDS.agentActivity, 'bar', {
          labels: overview.agentActivity.labels || [],
          datasets: [{ label: 'Agent Activity', data: overview.agentActivity.values || [], backgroundColor: emerald, borderRadius: 8 }],
        }, { plugins: { legend: { display: false } } });
      } catch (error) {}
    }

    if (state.activeTab === 'calls') {
      const rose = 'rgba(244, 63, 94, 0.9)';
      const amber = 'rgba(245, 158, 11, 0.9)';
      const cyan = 'rgba(0, 212, 255, 0.9)';
      const cyanFill = 'rgba(0, 212, 255, 0.18)';

      try {
        window.createChart?.(CHART_IDS.quality, 'doughnut', {
          labels: calls.qualityDistribution.labels || ['Successful', 'Failed', 'Cancelled'],
          datasets: [{ data: calls.qualityDistribution.values || calls.qualityDistribution.values || [], backgroundColor: [emeraldColor(), rose, amber] }],
        }, { plugins: { legend: { position: 'bottom' } } });
      } catch (error) {
        try {
          window.createChart?.(CHART_IDS.quality, 'bar', {
            labels: calls.qualityDistribution.labels || [],
            datasets: [{ label: 'Quality', data: calls.qualityDistribution.values || [], backgroundColor: [emeraldColor(), rose, amber] }],
          }, { plugins: { legend: { display: false } } });
        } catch (innerError) {}
      }

      try {
        window.createChart?.(CHART_IDS.success, 'line', {
          labels: calls.successFailureTrend.labels || [],
          datasets: [
            { label: 'Success', data: calls.successFailureTrend.success || [], borderColor: emeraldColor(), backgroundColor: 'rgba(16,185,129,0.12)', fill: true, tension: 0.35, pointRadius: 0 },
            { label: 'Failure', data: calls.successFailureTrend.failure || [], borderColor: rose, backgroundColor: 'rgba(244,63,94,0.12)', fill: true, tension: 0.35, pointRadius: 0 },
            { label: 'Threshold', data: Array.from({ length: (calls.successFailureTrend.labels || []).length }, () => calls.successFailureTrend.threshold || 80), borderColor: amber, borderDash: [6, 6], pointRadius: 0, fill: false },
          ],
        }, { plugins: { legend: { display: false } } });
      } catch (error) {}
    }
  }

  function emeraldColor() {
    return 'rgba(16, 185, 129, 0.9)';
  }

  function mountTenantsTable() {
    const tenants = state.tenants || deriveTenantsData({});
    const visibleRows = tenants.rows.slice(0, state.tenantsVisible);
    const container = document.getElementById('mc-analytics-tenants-table');
    if (!container) return;

    const columns = [
      { key: 'tenantId', label: 'Tenant ID', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.tenantId)}</span>` },
      { key: 'totalCalls', label: 'Total Calls', render: (_value, row) => `<span class="mc-mono">${escapeHtml(formatNumber(row.totalCalls))}</span>` },
      { key: 'successRate', label: 'Success %', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.successRate != null ? formatPercent(row.successRate) : '—')}</span>` },
      { key: 'avgDurationSec', label: 'Avg Duration', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.avgDurationSec != null ? formatDuration(row.avgDurationSec) : '—')}</span>` },
      { key: 'lastActiveAt', label: 'Last Active', render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.lastActiveLabel)}</span>` },
      { key: 'status', label: 'Status', render: (_value, row) => renderBadge(row.statusTone, row.status) },
    ];

    const html = window.createDataTable ? window.createDataTable(columns, visibleRows, { sortable: true, filterable: true, striped: true }) : '';
    if (window.mountDataTable && html) {
      window.mountDataTable(container, html);
    } else {
      container.innerHTML = html;
    }

    const loadMore = document.getElementById('mc-analytics-load-more');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        state.tenantsVisible = Math.min(tenants.rows.length, state.tenantsVisible + 20);
        renderPanels();
      });
    }
  }

  function updateClock() {
    const clock = document.getElementById('mc-analytics-clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  }

  function startClock() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    updateClock();
    state.clockTimer = window.setInterval(updateClock, 1000);
  }

  function startAutoRefresh() {
    if (state.autoRefreshTimer) window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = window.setInterval(() => {
      hydrate().catch(() => {});
    }, 60000);
  }

  function clearTimers() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    if (state.autoRefreshTimer) window.clearInterval(state.autoRefreshTimer);
    state.clockTimer = null;
    state.autoRefreshTimer = null;
  }

  function animateIntro() {
    if (!window.gsap || !state.root) return;
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try {
        state.gsapContext.revert();
      } catch (error) {}
    }

    state.gsapContext = window.gsap.context(() => {
      const hero = document.getElementById('mc-analytics-hero');
      const tabs = document.querySelector('.mc-analytics-tabs');
      const panels = Array.from(document.querySelectorAll('.mc-analytics-panel.active .mc-analytics-summary-card, .mc-analytics-panel.active .mc-analytics-stat-card, .mc-analytics-panel.active .mc-analytics-chart-card, .mc-analytics-panel.active .mc-data-table'));
      const tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (hero) tl.fromTo(hero, { opacity:0, y:-30, scale:0.97 }, { opacity:1, y:0, scale:1, duration:0.55 }, 0);
      if (tabs) tl.fromTo(tabs, { opacity:0, y:16 }, { opacity:1, y:0, duration:0.35 }, '<0.1');
      if (panels.length) tl.fromTo(panels, { opacity:0, y:18 }, { opacity:1, y:0, duration:0.35, stagger:0.05 }, '<0.1');
    }, state.root);
  }

  function animateRefreshPulse() {
    if (!window.gsap) return;
    const targets = Array.from(document.querySelectorAll('.mc-analytics-summary-card, .mc-analytics-stat-card, .mc-analytics-chart-card, .mc-data-table'));
    if (!targets.length) return;
    window.gsap.to(targets, {
      scale: 1.01,
      boxShadow: '0 0 32px rgba(0, 212, 255, 0.18)',
      duration: 0.25,
      yoyo: true,
      repeat: 1,
      stagger: 0.02,
    });
  }

  function setActiveTab(tab) {
    if (!TAB_IDS.includes(tab)) return;
    state.activeTab = tab;
    refreshPanelVisibility();
    syncShellControls();
    renderPanels();
    refreshPanelVisibility();
    syncShellControls();
    animateIntro();
  }

  function setRange(range) {
    if (!RANGE_IDS.includes(range)) return;
    state.activeRange = range;
    state.tenantsVisible = 20;
    syncShellControls();
    hydrate().catch(() => {});
  }

  function bindShellEvents() {
    const refresh = document.getElementById('mc-analytics-refresh');
    if (refresh) {
      refresh.addEventListener('click', () => {
        animateRefreshPulse();
        hydrate({ userInitiated: true }).catch(() => {});
      });
    }

    document.querySelectorAll('.mc-analytics-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });

    document.querySelectorAll('.mc-analytics-range-btn[data-range]').forEach((button) => {
      button.addEventListener('click', () => setRange(button.dataset.range));
    });
  }

  function bindPanelEvents() {
    const loadMore = document.getElementById('mc-analytics-load-more');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        const tenants = state.tenants || deriveTenantsData({});
        state.tenantsVisible = Math.min(tenants.rows.length, state.tenantsVisible + 20);
        renderPanels();
      });
    }
  }

  function loadOverviewData() {
    if (window.MCApi?.getAnalyticsOverview) return window.MCApi.getAnalyticsOverview(state.activeRange);
    return fetchJson(`/api/admin/analytics/overview?range=${encodeURIComponent(state.activeRange)}`);
  }

  function loadCallsData() {
    if (window.MCApi?.getAnalyticsCalls) return window.MCApi.getAnalyticsCalls(state.activeRange);
    return fetchJson(`/api/admin/analytics/calls?range=${encodeURIComponent(state.activeRange)}`);
  }

  function loadTenantsData() {
    if (window.MCApi?.getAnalyticsTenants) return window.MCApi.getAnalyticsTenants(state.activeRange);
    return fetchJson(`/api/admin/analytics/tenants?range=${encodeURIComponent(state.activeRange)}`);
  }

  async function hydrate({ userInitiated = false } = {}) {
    const seq = ++state.hydrateSeq;
    if (!state.mounted) return;

    const adminKey = getAdminKey();
    if (!adminKey) {
      state.overview = null;
      state.calls = null;
      state.tenants = null;
      renderPanels();
      startClock();
      startAutoRefresh();
      return;
    }

    const results = await Promise.allSettled([
      Promise.resolve(loadOverviewData()).then((value) => deriveOverviewData(unwrap(value))),
      Promise.resolve(loadCallsData()).then((value) => deriveCallsData(unwrap(value), state.activeRange)),
      Promise.resolve(loadTenantsData()).then((value) => deriveTenantsData(unwrap(value))),
    ]);

    if (seq !== state.hydrateSeq) return;

    state.overview = results[0].status === 'fulfilled' ? results[0].value : null;
    state.calls = results[1].status === 'fulfilled' ? results[1].value : null;
    state.tenants = results[2].status === 'fulfilled' ? results[2].value : null;

    renderPanels();
    startClock();
    startAutoRefresh();
    if (window.gsap) animateIntro();
    if (userInitiated && window.MCToast) window.MCToast.showToastSuccess('Analytics refreshed.');
  }

  function render() {
    injectStyles();
    const el = rootEl();
    if (!el) return;
    state.root = el;
    state.mounted = true;
    el.innerHTML = buildShell();
    bindShellEvents();
    syncShellControls();
    window.lucide?.createIcons?.();
  }

  function destroy() {
    state.mounted = false;
    clearTimers();
    destroyCharts();
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try {
        state.gsapContext.revert();
      } catch (error) {}
    }
    state.gsapContext = null;
    state.root = null;
    state.overview = null;
    state.calls = null;
    state.tenants = null;
    state.tenantsVisible = 20;
  }

  return {
    render() {
      if (state.mounted) destroy();
      render();
      hydrate().catch(() => {});
    },
    hydrate,
    destroy,
  };
})();