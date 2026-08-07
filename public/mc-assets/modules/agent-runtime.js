window.MCModAgentRuntime = (function () {
  const STYLE_ID = 'mc-agent-runtime-styles';
  const TAB_IDS = ['sessions', 'agents', 'metrics', 'controls'];
  const CHART_IDS = {
    metrics: 'mc-agent-runtime-chart-metrics',
    status: 'mc-agent-runtime-chart-status',
  };
  const AGENT_PLACEHOLDERS = [
    {
      name: 'Deepgram STT',
      status: 'online',
      detail: 'Speech-to-text pipeline ready',
      metric: '98.4%',
      accent: 'var(--mc-cyan)',
    },
    {
      name: 'Groq LLM',
      status: 'online',
      detail: 'Prompt orchestration and reasoning layer',
      metric: '42 ms',
      accent: 'var(--mc-emerald)',
    },
    {
      name: 'Cartesia TTS',
      status: 'online',
      detail: 'Low-latency voice synthesis',
      metric: '31 ms',
      accent: 'var(--mc-violet)',
    },
    {
      name: 'LiveKit Workers',
      status: 'degraded',
      detail: 'Room dispatch and session relay',
      metric: '4 workers',
      accent: 'var(--mc-amber)',
    },
  ];

  const state = {
    mounted: false,
    root: null,
    activeTab: 'sessions',
    sessions: [],
    metrics: null,
    liveAgents: [],
    clockTimer: null,
    sseUnsubscribe: null,
    gsapContext: null,
    hydrateSeq: 0,
    controlResult: null,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.mc-agent-runtime-page { display:flex; flex-direction:column; gap:20px; animation: slideUpFade 0.5s ease-out both; }
.mc-agent-runtime-hero { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; padding:0; }
.mc-agent-runtime-hero-copy { display:flex; flex-direction:column; gap:10px; }
.mc-agent-runtime-hero-title { margin:0; font-size:26px; font-weight:800; color:var(--mc-text); letter-spacing:-0.02em; }
.mc-agent-runtime-hero-subtitle { margin:0; font-size:var(--mc-text-sm); color:var(--mc-muted); }
.mc-agent-runtime-hero-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-left:auto; }
.mc-agent-runtime-clock-shell { display:flex; flex-direction:column; gap:4px; min-width:170px; padding:12px 14px; border-radius:16px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.02); }
.mc-agent-runtime-clock-label { font-size:10px; color:var(--mc-muted); letter-spacing:0.12em; text-transform:uppercase; }
.mc-agent-runtime-clock { color:var(--mc-cyan); font-family:var(--mc-font-mono); font-size:20px; font-weight:700; text-shadow:0 0 24px color-mix(in srgb, var(--mc-cyan) 28%, transparent); min-height:24px; }
.mc-agent-runtime-refresh { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; border-radius:12px; border:1px solid var(--border-subtle); background:var(--mc-cyan-dim); color:white; font-size:13px; font-weight:700; cursor:pointer; transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.mc-agent-runtime-refresh:hover { transform:translateY(-1px); box-shadow:0 0 18px rgba(0, 212, 255, 0.15); border-color:rgba(0, 212, 255, 0.35); }

.mc-agent-runtime-tabs { display:flex; gap:4px; align-items:center; background:rgba(7, 12, 24, 0.7); border:1px solid var(--glass-border-light); border-radius:12px; padding:4px; margin:16px 0 4px; align-self:flex-start; flex-wrap:wrap; }
.mc-agent-runtime-tab { flex:0 0 auto; padding:8px 18px; border-radius:8px; background:transparent; border:1px solid transparent; color:var(--mc-muted); font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s ease; white-space:nowrap; }
.mc-agent-runtime-tab:hover { color:var(--mc-text); background:rgba(255,255,255,0.03); }
.mc-agent-runtime-tab.active { background:var(--mc-cyan-dim); color:white; border-color:rgba(0, 212, 255, 0.3); box-shadow:0 0 20px rgba(0, 212, 255, 0.15); }

.mc-agent-runtime-panels { display:flex; flex-direction:column; gap:20px; }
.mc-agent-runtime-panel { display:none; }
.mc-agent-runtime-panel.active { display:block; }

.mc-agent-runtime-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:40px 24px; text-align:center; margin:8px 0; background:rgba(7, 12, 24, 0.5); border:1px dashed var(--border-subtle); border-radius:14px; }
.mc-agent-runtime-empty-icon { width:40px; height:40px; color:rgba(255,255,255,0.1); }
.mc-agent-runtime-empty-title { font-size:var(--mc-text-md); font-weight:600; color:var(--mc-muted); }
.mc-agent-runtime-empty-desc { font-size:var(--mc-text-sm); color:rgba(148, 163, 184, 0.75); max-width:440px; }

.mc-agent-runtime-summary-row { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin:16px 0 20px; }
.mc-agent-runtime-summary-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:6px; box-shadow:0 8px 24px rgba(0,0,0,0.28); }
.mc-agent-runtime-summary-label { font-size:10px; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:700; }
.mc-agent-runtime-summary-value { font-size:20px; font-weight:800; color:var(--mc-text); font-family:var(--mc-font-mono); }
.mc-agent-runtime-summary-sub { font-size:var(--mc-text-xs); color:var(--mc-muted); min-height:1em; }

.mc-agent-runtime-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:18px; overflow:hidden; transition:all 0.25s ease; box-shadow:0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.3); }
.mc-agent-runtime-card:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-agent-runtime-card-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
.mc-agent-runtime-card-title { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.08em; }
.mc-agent-runtime-card-title::before { content:''; display:block; width:3px; height:14px; border-radius:2px; background:var(--mc-cyan); }
.mc-agent-runtime-pill { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:9999px; font-size:11px; font-weight:700; letter-spacing:0.04em; font-family:var(--mc-font-mono); }
.mc-agent-runtime-pill-online { background:rgba(16, 185, 129, 0.14); color:var(--mc-emerald); border:1px solid rgba(16, 185, 129, 0.26); }
.mc-agent-runtime-pill-offline { background:rgba(244, 63, 94, 0.14); color:#fb7185; border:1px solid rgba(244, 63, 94, 0.24); }
.mc-agent-runtime-pill-warn { background:rgba(245, 158, 11, 0.14); color:var(--mc-amber); border:1px solid rgba(245, 158, 11, 0.26); }
.mc-agent-runtime-pill-neutral { background:rgba(255,255,255,0.06); color:var(--mc-muted); border:1px solid var(--border-subtle); }

.mc-agent-runtime-section-title { margin:0; font-size:16px; font-weight:700; color:var(--mc-text); }
.mc-agent-runtime-section-subtitle { margin:0; font-size:var(--mc-text-sm); color:var(--mc-muted); }
.mc-agent-runtime-mono { font-family:var(--mc-font-mono); }

.mc-agent-runtime-table-wrap { overflow:hidden; border-radius:12px; border:1px solid var(--border-subtle); background:var(--bg-card); }
.mc-agent-runtime-table { width:100%; border-collapse:collapse; font-size:var(--mc-text-sm); }
.mc-agent-runtime-table thead th { padding:12px 14px; text-align:left; font-size:var(--mc-text-xs); color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap; border-bottom:1px solid var(--border-subtle); }
.mc-agent-runtime-table tbody td { padding:12px 14px; color:var(--mc-text); border-bottom:1px solid var(--mc-border-soft); vertical-align:top; }
.mc-agent-runtime-table tbody tr:hover { background:rgba(255,255,255,0.02); }
.mc-agent-runtime-table tbody tr:last-child td { border-bottom:none; }

.mc-agent-runtime-agent-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:var(--mc-grid-gap); margin:16px 0; }
@media (max-width: 1024px) { .mc-agent-runtime-agent-grid { grid-template-columns:1fr; } }
.mc-agent-runtime-agent-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:18px; transition:all 0.25s ease; box-shadow:0 8px 24px rgba(0,0,0,0.3); }
.mc-agent-runtime-agent-card:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); transform:translateY(-2px); }
.mc-agent-runtime-agent-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; }
.mc-agent-runtime-agent-name { margin:0; font-size:14px; font-weight:700; color:var(--mc-text); }
.mc-agent-runtime-agent-detail { margin:0; font-size:12px; color:var(--mc-muted); line-height:1.45; }
.mc-agent-runtime-agent-meta { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:12px; }
.mc-agent-runtime-agent-metric { font-size:20px; font-weight:800; color:var(--mc-text); font-family:var(--mc-font-mono); }
.mc-agent-runtime-agent-channel { font-size:10px; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.08em; font-weight:700; }
.mc-agent-runtime-agent-badges { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }
.mc-agent-runtime-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:9999px; border:1px solid var(--border-subtle); color:var(--mc-muted); font-size:10px; font-family:var(--mc-font-mono); }
.mc-agent-runtime-badge-active { background:rgba(16,185,129,0.12); color:var(--mc-emerald); }
.mc-agent-runtime-badge-idle { background:rgba(245,158,11,0.12); color:var(--mc-amber); }
.mc-agent-runtime-badge-offline { background:rgba(244,63,94,0.12); color:#fb7185; }

.mc-agent-runtime-metrics-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:var(--mc-grid-gap); margin:16px 0; }
@media (max-width: 1024px) { .mc-agent-runtime-metrics-grid { grid-template-columns:1fr; } }
.mc-agent-runtime-chart-card { background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:14px; padding:18px; overflow:hidden; transition:all 0.25s ease; box-shadow:0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px rgba(0,0,0,0.3); }
.mc-agent-runtime-chart-card:hover { border-color:rgba(255,255,255,0.12); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08), 0 12px 36px rgba(0,0,0,0.38); }
.mc-agent-runtime-chart-title { margin:0 0 14px 0; display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; color:var(--mc-muted); text-transform:uppercase; letter-spacing:0.08em; }
.mc-agent-runtime-chart-title::before { content:''; display:block; width:3px; height:14px; border-radius:2px; background:var(--mc-cyan); }
.mc-agent-runtime-chart-container, .mc-agent-runtime-chart-card canvas { width:100% !important; height:240px !important; display:block; margin:0 auto; }

.mc-agent-runtime-control-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin:16px 0; }
.mc-agent-runtime-control-btn { display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; padding:12px 14px; border-radius:12px; border:1px solid var(--border-subtle); background:rgba(255,255,255,0.02); color:var(--mc-text); cursor:pointer; transition:all 0.2s ease; text-align:left; }
.mc-agent-runtime-control-btn:hover { border-color:rgba(0,212,255,0.24); transform:translateY(-1px); box-shadow:0 0 0 1px inset rgba(0,212,255,0.08); }
.mc-agent-runtime-control-btn.primary { background:var(--mc-cyan-dim); border-color:rgba(0,212,255,0.3); }
.mc-agent-runtime-control-label { font-size:13px; font-weight:700; }
.mc-agent-runtime-control-desc { font-size:11px; color:var(--mc-muted); line-height:1.4; }
.mc-agent-runtime-control-output { margin-top:16px; padding:14px; border-radius:12px; border:1px solid var(--border-subtle); background:rgba(7,12,24,0.68); color:var(--mc-text); font-family:var(--mc-font-mono); font-size:12px; white-space:pre-wrap; }

.mc-agent-runtime-progress { width:100%; height:8px; border-radius:9999px; background:rgba(255,255,255,0.06); overflow:hidden; border:1px solid var(--border-subtle); }
.mc-agent-runtime-progress > span { display:block; height:100%; border-radius:9999px; background:linear-gradient(90deg, var(--mc-cyan), rgba(16,185,129,0.95)); }
`;
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
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
  }

  function safeArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
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

  function formatPercent(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${Math.max(0, Math.min(100, number)).toFixed(digits)}%`;
  }

  function normalizeStatus(status) {
    return String(status || 'offline').toLowerCase();
  }

  function statusTone(status) {
    const resolved = normalizeStatus(status);
    if (['online', 'active', 'healthy', 'connected', 'ok'].includes(resolved)) return 'online';
    if (['degraded', 'warn', 'warning', 'busy'].includes(resolved)) return 'warn';
    if (['offline', 'down', 'failed', 'error', 'disconnected'].includes(resolved)) return 'offline';
    return 'neutral';
  }

  function statusLabel(status) {
    const resolved = normalizeStatus(status);
    if (resolved === 'online') return 'ONLINE';
    if (resolved === 'active') return 'ACTIVE';
    if (resolved === 'healthy') return 'HEALTHY';
    if (resolved === 'connected') return 'CONNECTED';
    if (resolved === 'degraded') return 'DEGRADED';
    if (resolved === 'warn' || resolved === 'warning') return 'WARN';
    if (resolved === 'offline') return 'OFFLINE';
    if (resolved === 'down') return 'DOWN';
    if (resolved === 'failed') return 'FAILED';
    return String(status || 'UNKNOWN').toUpperCase();
  }

  function renderStatusPill(status) {
    const tone = statusTone(status);
    return `<span class="mc-agent-runtime-pill mc-agent-runtime-pill-${tone}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function renderSummaryCards() {
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const metrics = state.metrics || {};
    const agents = Array.isArray(state.liveAgents) ? state.liveAgents : [];
    const onlineAgents = agents.filter((agent) => ['online', 'active', 'healthy', 'connected', 'ok'].includes(normalizeStatus(agent.status))).length;
    const avgLatency = Number(metrics.avgLatencyMs ?? metrics.latencyMs ?? metrics.meanLatencyMs ?? 0);
    const sessionsCount = Number(metrics.activeSessions ?? sessions.length ?? 0);
    const throughput = Number(metrics.tokensPerSecond ?? metrics.tokensPerSec ?? metrics.throughput ?? 0);
    return `
      <div class="mc-agent-runtime-summary-row">
        <article class="mc-agent-runtime-summary-card">
          <div class="mc-agent-runtime-summary-label">Active Sessions</div>
          <div class="mc-agent-runtime-summary-value">${escapeHtml(String(Number.isFinite(sessionsCount) ? sessionsCount : sessions.length))}</div>
          <div class="mc-agent-runtime-summary-sub">Live or recently connected agent sessions</div>
        </article>
        <article class="mc-agent-runtime-summary-card">
          <div class="mc-agent-runtime-summary-label">Online Agents</div>
          <div class="mc-agent-runtime-summary-value">${escapeHtml(String(onlineAgents))}</div>
          <div class="mc-agent-runtime-summary-sub">Deepgram, Groq, Cartesia, LiveKit workers</div>
        </article>
        <article class="mc-agent-runtime-summary-card">
          <div class="mc-agent-runtime-summary-label">Latency</div>
          <div class="mc-agent-runtime-summary-value">${escapeHtml(Number.isFinite(avgLatency) && avgLatency > 0 ? `${Math.round(avgLatency)} ms` : '—')}</div>
          <div class="mc-agent-runtime-summary-sub">Average end-to-end agent response</div>
        </article>
        <article class="mc-agent-runtime-summary-card">
          <div class="mc-agent-runtime-summary-label">Tokens / sec</div>
          <div class="mc-agent-runtime-summary-value">${escapeHtml(Number.isFinite(throughput) && throughput > 0 ? throughput.toFixed(1) : '—')}</div>
          <div class="mc-agent-runtime-summary-sub">LLM stream throughput</div>
        </article>
      </div>
    `;
  }

  function buildShell() {
    return `
      <div class="mc-module-wrap mc-agent-runtime-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        <section class="glass-card mc-agent-runtime-hero" id="mc-agent-runtime-hero">
          <div class="mc-agent-runtime-hero-copy">
            <span class="hero-pill">AGENTS</span>
            <div>
              <h1 class="mc-agent-runtime-hero-title">Agent Runtime</h1>
              <p class="mc-agent-runtime-hero-subtitle">Agent sessions, live provider health, metrics, and runtime controls</p>
            </div>
          </div>
          <div class="mc-agent-runtime-hero-actions">
            <div class="mc-agent-runtime-clock-shell">
              <div class="mc-agent-runtime-clock-label">LIVE CLOCK</div>
              <div class="mc-agent-runtime-clock" id="mc-agent-runtime-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-agent-runtime-refresh" id="mc-agent-runtime-refresh">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
              <span>Refresh</span>
            </button>
          </div>
        </section>

        <div class="mc-agent-runtime-tabs" role="tablist" aria-label="Agent Runtime tabs">
          ${TAB_IDS.map((tab) => `
            <button type="button" class="mc-agent-runtime-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">
              ${tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          `).join('')}
        </div>

        <section class="glass-card mc-agent-runtime-panel ${state.activeTab === 'sessions' ? 'active' : ''}" id="mc-agent-runtime-panel-sessions" data-panel="sessions">
          ${renderSessionsPanel()}
        </section>

        <section class="glass-card mc-agent-runtime-panel ${state.activeTab === 'agents' ? 'active' : ''}" id="mc-agent-runtime-panel-agents" data-panel="agents">
          ${renderAgentsPanel()}
        </section>

        <section class="glass-card mc-agent-runtime-panel ${state.activeTab === 'metrics' ? 'active' : ''}" id="mc-agent-runtime-panel-metrics" data-panel="metrics">
          ${renderMetricsPanel()}
        </section>

        <section class="glass-card mc-agent-runtime-panel ${state.activeTab === 'controls' ? 'active' : ''}" id="mc-agent-runtime-panel-controls" data-panel="controls">
          ${renderControlsPanel()}
        </section>
      </div>
    `;
  }

  function renderPanelEmpty(icon, title, desc) {
    return `
      <div class="mc-agent-runtime-empty">
        <div class="mc-agent-runtime-empty-icon"><i data-lucide="${escapeHtml(icon)}" style="width:34px;height:34px;"></i></div>
        <div class="mc-agent-runtime-empty-title">${escapeHtml(title)}</div>
        <div class="mc-agent-runtime-empty-desc">${escapeHtml(desc)}</div>
      </div>
    `;
  }

  function sessionRows() {
    if (Array.isArray(state.sessions) && state.sessions.length) return state.sessions;

    return [
      {
        session_id: 'sess_demo_01',
        tenant: 'Northwind AI',
        phone: '+91 98765 43210',
        duration: 126,
        status: 'active',
        agent: 'Deepgram STT',
      },
      {
        session_id: 'sess_demo_02',
        tenant: 'BluePeak Realty',
        phone: '+91 99887 77665',
        duration: 44,
        status: 'queued',
        agent: 'Groq LLM',
      },
      {
        session_id: 'sess_demo_03',
        tenant: 'Vertex Collections',
        phone: '+91 91234 56789',
        duration: 302,
        status: 'completed',
        agent: 'Cartesia TTS',
      },
      {
        session_id: 'sess_demo_04',
        tenant: 'Saffron Clinics',
        phone: '+91 90000 11223',
        duration: 78,
        status: 'reconnecting',
        agent: 'LiveKit Worker',
      },
    ];
  }

  function renderSessionsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load agent runtime data', 'Agent sessions require admin authentication before the runtime state can be loaded.');
    }

    const rows = sessionRows();
    return `
      <div class="mc-agent-runtime-sessions-shell">
        ${renderSummaryCards()}
        <div>
          <h2 class="mc-agent-runtime-section-title">Active Agent Sessions</h2>
          <p class="mc-agent-runtime-section-subtitle">Session identifier, tenant, phone, duration, status, and agent assignment.</p>
        </div>
        <div class="mc-agent-runtime-table-wrap">
          <table class="mc-agent-runtime-table" aria-label="Agent sessions table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Tenant</th>
                <th>Phone</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Agent</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td class="mc-agent-runtime-mono">${escapeHtml(row.session_id || row.sessionId || row.id || '—')}</td>
                  <td>${escapeHtml(row.tenant || row.tenant_name || row.tenantName || '—')}</td>
                  <td class="mc-agent-runtime-mono">${escapeHtml(row.phone || row.phone_number || row.phoneNumber || '—')}</td>
                  <td class="mc-agent-runtime-mono">${escapeHtml(formatDuration(row.duration || row.duration_sec || row.durationSec || 0))}</td>
                  <td>${renderStatusPill(row.status)}</td>
                  <td>${escapeHtml(row.agent || row.agent_name || row.agentName || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function agentCards() {
    if (Array.isArray(state.liveAgents) && state.liveAgents.length) return state.liveAgents;
    return AGENT_PLACEHOLDERS;
  }

  function renderAgentsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load agent runtime data', 'Live provider health and agent cards appear after admin authentication.');
    }

    const agents = agentCards();
    return `
      <div class="mc-agent-runtime-agents-shell">
        <div>
          <h2 class="mc-agent-runtime-section-title">Live Agent Health</h2>
          <p class="mc-agent-runtime-section-subtitle">Deepgram, Groq, Cartesia, and LiveKit worker status cards.</p>
        </div>
        <div class="mc-agent-runtime-agent-grid">
          ${agents.map((agent) => `
            <article class="mc-agent-runtime-agent-card">
              <div class="mc-agent-runtime-agent-top">
                <div>
                  <h3 class="mc-agent-runtime-agent-name">${escapeHtml(agent.name || agent.label || 'Agent')}</h3>
                  <p class="mc-agent-runtime-agent-detail">${escapeHtml(agent.detail || agent.description || '—')}</p>
                </div>
                ${renderStatusPill(agent.status)}
              </div>
              <div class="mc-agent-runtime-agent-meta">
                <div>
                  <div class="mc-agent-runtime-agent-channel">${escapeHtml(agent.channel || agent.type || 'runtime')}</div>
                  <div class="mc-agent-runtime-agent-metric">${escapeHtml(agent.metric || agent.latency || '—')}</div>
                </div>
                <div class="mc-agent-runtime-summary-sub" style="text-align:right; min-height:auto;">${escapeHtml(agent.accent ? String(agent.accent).replace('var(', '').replace(')', '') : '')}</div>
              </div>
              <div class="mc-agent-runtime-agent-badges">
                <span class="mc-agent-runtime-badge ${statusTone(agent.status) === 'online' ? 'mc-agent-runtime-badge-active' : statusTone(agent.status) === 'warn' ? 'mc-agent-runtime-badge-idle' : 'mc-agent-runtime-badge-offline'}">${escapeHtml(statusLabel(agent.status))}</span>
                ${agent.lastSeen ? `<span class="mc-agent-runtime-badge">last seen ${escapeHtml(formatTimestamp(agent.lastSeen))}</span>` : ''}
                ${agent.region ? `<span class="mc-agent-runtime-badge">${escapeHtml(agent.region)}</span>` : ''}
              </div>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function metricsModel() {
    const metrics = state.metrics || {};
    const values = {
      latencyMs: Number(metrics.latencyMs ?? metrics.avgLatencyMs ?? metrics.meanLatencyMs ?? 0),
      tokensPerSecond: Number(metrics.tokensPerSecond ?? metrics.tokensPerSec ?? 0),
      sttAccuracy: Number(metrics.sttAccuracy ?? metrics.sttAccuracyPercent ?? metrics.recognitionAccuracy ?? 0),
      ttsQuality: Number(metrics.ttsQuality ?? metrics.ttsQualityPercent ?? metrics.voiceQuality ?? 0),
    };

    if (!Number.isFinite(values.latencyMs) || values.latencyMs <= 0) values.latencyMs = 42;
    if (!Number.isFinite(values.tokensPerSecond) || values.tokensPerSecond <= 0) values.tokensPerSecond = 28.4;
    if (!Number.isFinite(values.sttAccuracy) || values.sttAccuracy <= 0) values.sttAccuracy = 98.2;
    if (!Number.isFinite(values.ttsQuality) || values.ttsQuality <= 0) values.ttsQuality = 97.6;

    return values;
  }

  function ensureChartWrapper() {
    if (typeof window.createChart === 'function' && typeof window.destroyChart === 'function') return;
    if (typeof window.Chart !== 'function' && typeof window.Chart !== 'object') return;
    window.__mc_agent_runtime_charts = window.__mc_agent_runtime_charts || {};
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
              legend: { labels: { color: 'rgba(229, 237, 247, 0.72)' } },
            },
            scales: type === 'doughnut' || type === 'pie' ? undefined : {
              x: { ticks: { color: 'rgba(229, 237, 247, 0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
              y: { ticks: { color: 'rgba(229, 237, 247, 0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
            },
            ...options,
          },
        });
        window.__mc_agent_runtime_charts[id] = chart;
        return chart;
      } catch (error) {
        return null;
      }
    };
    window.destroyChart = function (id) {
      try {
        const chart = window.__mc_agent_runtime_charts?.[id];
        if (chart && typeof chart.destroy === 'function') chart.destroy();
        if (window.__mc_agent_runtime_charts) delete window.__mc_agent_runtime_charts[id];
        const container = document.getElementById(id);
        if (container) container.innerHTML = '';
      } catch (error) {
        // ignore
      }
    };
  }

  function destroyCharts() {
    Object.values(CHART_IDS).forEach((id) => {
      try {
        window.destroyChart?.(id);
      } catch (error) {
        // ignore
      }
    });
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
    const labels = config.labels;
    const values = config.values;
    const colors = config.colors;
    const horizontal = Boolean(config.horizontal);
    const maxValue = Math.max(...values, 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(7, 12, 24, 0.55)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + (plotHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(229,237,247,0.72)';
    ctx.font = '12px var(--mc-font-mono)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    if (horizontal) {
      const rowHeight = plotHeight / labels.length;
      labels.forEach((label, index) => {
        const value = values[index];
        const barWidth = (plotWidth * value) / maxValue;
        const y = padding.top + rowHeight * index + rowHeight * 0.2;
        const barHeight = rowHeight * 0.55;
        ctx.fillStyle = 'rgba(229,237,247,0.82)';
        ctx.fillText(label, 8, y + barHeight / 2);
        ctx.fillStyle = colors[index];
        ctx.fillRect(padding.left, y, barWidth, barHeight);
        ctx.fillStyle = 'rgba(229,237,247,0.82)';
        ctx.fillText(`${Math.round(value)}%`, padding.left + barWidth + 8, y + barHeight / 2);
      });
      return;
    }

    const barGap = 22;
    const barWidth = (plotWidth - barGap * (labels.length - 1)) / labels.length;
    labels.forEach((label, index) => {
      const value = values[index];
      const barHeight = (plotHeight * value) / maxValue;
      const x = padding.left + index * (barWidth + barGap);
      const y = padding.top + plotHeight - barHeight;
      const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
      gradient.addColorStop(0, colors[index]);
      gradient.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = 'rgba(229,237,247,0.82)';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barWidth / 2, height - 18);
      ctx.fillText(`${Math.round(value)}`, x + barWidth / 2, y - 12);
    });
  }

  function renderMetricsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load agent runtime data', 'Metrics require admin authentication before latency and throughput charts can be loaded.');
    }

    const model = metricsModel();
    return `
      <div class="mc-agent-runtime-metrics-shell">
        <div>
          <h2 class="mc-agent-runtime-section-title">Agent Performance Metrics</h2>
          <p class="mc-agent-runtime-section-subtitle">Latency, tokens per second, STT accuracy, and TTS quality.</p>
        </div>
        <div class="mc-agent-runtime-summary-row">
          <article class="mc-agent-runtime-summary-card">
            <div class="mc-agent-runtime-summary-label">Latency</div>
            <div class="mc-agent-runtime-summary-value">${escapeHtml(`${Math.round(model.latencyMs)} ms`)}</div>
            <div class="mc-agent-runtime-summary-sub">Average end-to-end agent response</div>
          </article>
          <article class="mc-agent-runtime-summary-card">
            <div class="mc-agent-runtime-summary-label">Tokens / sec</div>
            <div class="mc-agent-runtime-summary-value">${escapeHtml(model.tokensPerSecond.toFixed(1))}</div>
            <div class="mc-agent-runtime-summary-sub">LLM streaming throughput</div>
          </article>
          <article class="mc-agent-runtime-summary-card">
            <div class="mc-agent-runtime-summary-label">STT Accuracy</div>
            <div class="mc-agent-runtime-summary-value">${escapeHtml(`${model.sttAccuracy.toFixed(1)}%`)}</div>
            <div class="mc-agent-runtime-summary-sub">Deepgram recognition quality</div>
          </article>
          <article class="mc-agent-runtime-summary-card">
            <div class="mc-agent-runtime-summary-label">TTS Quality</div>
            <div class="mc-agent-runtime-summary-value">${escapeHtml(`${model.ttsQuality.toFixed(1)}%`)}</div>
            <div class="mc-agent-runtime-summary-sub">Cartesia voice fidelity</div>
          </article>
        </div>

        <div class="mc-agent-runtime-metrics-grid">
          <article class="mc-agent-runtime-chart-card">
            <h3 class="mc-agent-runtime-chart-title">Performance Overview</h3>
            <canvas id="${CHART_IDS.metrics}" class="mc-agent-runtime-chart-container" width="900" height="320"></canvas>
          </article>
          <article class="mc-agent-runtime-chart-card">
            <h3 class="mc-agent-runtime-chart-title">Provider Status</h3>
            <canvas id="${CHART_IDS.status}" class="mc-agent-runtime-chart-container" width="900" height="320"></canvas>
          </article>
        </div>
      </div>
    `;
  }

  function renderControlsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load agent runtime data', 'Runtime control actions require admin authentication.');
    }

    const output = state.controlResult ? JSON.stringify(state.controlResult, null, 2) : 'No control action has been run yet.';
    const actions = [
      { action: 'start-agent', label: 'Start Agent', description: 'Bring the agent runtime online', primary: true },
      { action: 'stop-agent', label: 'Stop Agent', description: 'Shut down the agent runtime', primary: false },
      { action: 'reload-pipeline', label: 'Reload Pipeline', description: 'Reload STT, LLM, and TTS pipeline configuration', primary: false },
      { action: 'flush-session', label: 'Flush Session', description: 'Flush cached session state', primary: false },
      { action: 'clear-cache', label: 'Clear Cache', description: 'Clear worker and runtime caches', primary: false },
    ];

    return `
      <div class="mc-agent-runtime-controls-shell">
        <div>
          <h2 class="mc-agent-runtime-section-title">Agent Control Panel</h2>
          <p class="mc-agent-runtime-section-subtitle">Operational actions for the agent runtime and cached session state.</p>
        </div>
        <div class="mc-agent-runtime-control-grid">
          ${actions.map((action) => `
            <button type="button" class="mc-agent-runtime-control-btn ${action.primary ? 'primary' : ''}" data-control-action="${escapeHtml(action.action)}">
              <span class="mc-agent-runtime-control-label">${escapeHtml(action.label)}</span>
              <span class="mc-agent-runtime-control-desc">${escapeHtml(action.description)}</span>
            </button>
          `).join('')}
        </div>
        <div class="mc-agent-runtime-control-output" id="mc-agent-runtime-control-output">${escapeHtml(output)}</div>
      </div>
    `;
  }

  function renderSessionsTableLike(payload) {
    const rows = safeArray(payload).map((item) => ({
      session_id: item.session_id || item.sessionId || item.id || item.session || '—',
      tenant: item.tenant || item.tenant_name || item.tenantName || item.tenant_id || item.tenantId || '—',
      phone: item.phone || item.phone_number || item.phoneNumber || '—',
      duration: item.duration || item.duration_sec || item.durationSec || 0,
      status: item.status || 'offline',
      agent: item.agent || item.agent_name || item.agentName || item.provider || '—',
    }));

    if (rows.length > 0) {
      state.sessions = rows;
      return;
    }

    state.sessions = sessionRows();
  }

  function normalizeAgent(item) {
    return {
      name: item.name || item.label || item.agent || item.provider || 'Agent',
      status: item.status || item.state || 'offline',
      detail: item.detail || item.description || item.message || '—',
      metric: item.metric || item.value || item.latency || item.health || '—',
      accent: item.accent || item.color || 'var(--mc-cyan)',
      channel: item.channel || item.service || item.provider || 'runtime',
      lastSeen: item.lastSeen || item.last_seen || item.updatedAt || null,
      region: item.region || item.scope || null,
    };
  }

  function normalizeMetrics(payload) {
    if (!payload) return null;
    return {
      latencyMs: Number(payload.latencyMs ?? payload.avgLatencyMs ?? payload.meanLatencyMs ?? 0),
      tokensPerSecond: Number(payload.tokensPerSecond ?? payload.tokensPerSec ?? payload.tokensPerMinute ?? 0),
      sttAccuracy: Number(payload.sttAccuracy ?? payload.sttAccuracyPercent ?? payload.recognitionAccuracy ?? 0),
      ttsQuality: Number(payload.ttsQuality ?? payload.ttsQualityPercent ?? payload.voiceQuality ?? 0),
      statusDistribution: payload.statusDistribution || payload.providerStatus || null,
    };
  }

  function ensureFallbackAgents() {
    if (state.liveAgents && state.liveAgents.length) return;
    state.liveAgents = AGENT_PLACEHOLDERS.map((agent) => ({ ...agent }));
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${window.location.origin}/api/admin${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey(),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function requestFirstAvailable(candidates, options = {}) {
    for (const candidate of candidates) {
      try {
        const payload = window.MCApi?.request
          ? await window.MCApi.request(options.method || 'GET', candidate, options.body)
          : await requestJson(candidate, options);
        return payload;
      } catch (error) {
        // try next candidate
      }
    }
    return null;
  }

  async function loadSessions() {
    if (!getAdminKey()) return null;
    const candidates = ['/agent/sessions', '/agent-runtime/sessions'];
    if (window.MCApi?.getAgentSessions) {
      try {
        return await window.MCApi.getAgentSessions();
      } catch (error) {
        // continue to fallback
      }
    }
    return requestFirstAvailable(candidates);
  }

  async function loadAgents() {
    if (!getAdminKey()) return null;
    const candidates = ['/dev-monitor/health', '/agent/status'];
    if (window.MCApi?.getAgentStatus) {
      try {
        return await window.MCApi.getAgentStatus();
      } catch (error) {
        // continue to fallback
      }
    }
    return requestFirstAvailable(candidates);
  }

  async function loadMetrics() {
    if (!getAdminKey()) return null;
    const candidates = ['/agent/metrics'];
    if (window.MCApi?.getAgentMetrics) {
      try {
        return await window.MCApi.getAgentMetrics();
      } catch (error) {
        // continue to fallback
      }
    }
    return requestFirstAvailable(candidates);
  }

  async function loadAllData() {
    if (!getAdminKey()) {
      state.sessions = [];
      state.metrics = null;
      state.liveAgents = [];
      state.controlResult = null;
      renderPanels();
      return;
    }

    const [sessionsResult, agentsResult, metricsResult] = await Promise.allSettled([
      loadSessions(),
      loadAgents(),
      loadMetrics(),
    ]);

    const sessionsPayload = sessionsResult.status === 'fulfilled' ? sessionsResult.value : null;
    const agentsPayload = agentsResult.status === 'fulfilled' ? agentsResult.value : null;
    const metricsPayload = metricsResult.status === 'fulfilled' ? metricsResult.value : null;

    renderSessionsTableLike(unwrap(sessionsPayload));

    const agentRows = safeArray(unwrap(agentsPayload));
    if (agentRows.length > 0) {
      state.liveAgents = agentRows.map(normalizeAgent);
    } else {
      ensureFallbackAgents();
    }

    state.metrics = normalizeMetrics(unwrap(metricsPayload)) || metricsModel();
    renderPanels();
    if (state.activeTab === 'metrics') renderCharts();
  }

  function destroyCharts() {
    Object.values(CHART_IDS).forEach((id) => {
      try {
        window.destroyChart?.(id);
      } catch (error) {
        // ignore
      }
    });
  }

  function renderCharts() {
    destroyCharts();
    if (!state.metrics) {
      state.metrics = metricsModel();
    }
    ensureChartWrapper();

    const model = metricsModel();
    const cyan = 'rgba(0,212,255,0.9)';
    const emerald = 'rgba(16,185,129,0.9)';
    const violet = 'rgba(139,92,246,0.9)';
    const amber = 'rgba(245,158,11,0.9)';
    const rose = 'rgba(244,63,94,0.9)';

    const metricsData = {
      labels: ['Latency', 'Tokens/sec', 'STT', 'TTS'],
      datasets: [{
        label: 'Agent Runtime',
        data: [model.latencyMs, model.tokensPerSecond, model.sttAccuracy, model.ttsQuality],
        backgroundColor: [rose, cyan, emerald, violet],
        borderRadius: 8,
      }],
    };

    const providerStatus = state.liveAgents.length ? state.liveAgents : AGENT_PLACEHOLDERS;
    const statusData = {
      labels: providerStatus.map((agent) => agent.name),
      datasets: [{
        label: 'Availability',
        data: providerStatus.map((agent) => (statusTone(agent.status) === 'online' ? 100 : statusTone(agent.status) === 'warn' ? 60 : 20)),
        backgroundColor: providerStatus.map((agent) => agent.accent || cyan),
        borderRadius: 8,
      }],
    };

    try {
      window.createChart?.(CHART_IDS.metrics, 'bar', metricsData, {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      });
    } catch (error) {
      // ignore and use fallback canvas below
    }

    if (!document.querySelector(`#${CHART_IDS.metrics} canvas`)) {
      renderCanvasChart(CHART_IDS.metrics, {
        labels: ['Latency', 'Tokens/sec', 'STT', 'TTS'],
        values: [
          Math.max(10, 120 - model.latencyMs),
          model.tokensPerSecond * 3,
          model.sttAccuracy,
          model.ttsQuality,
        ],
        colors: [rose, cyan, emerald, violet],
      });
    }

    try {
      window.createChart?.(CHART_IDS.status, 'bar', statusData, {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: 'rgba(229,237,247,0.72)', callback: (value) => `${value}%` }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: 'rgba(229,237,247,0.72)' }, grid: { display: false } },
        },
      });
    } catch (error) {
      // ignore and use fallback canvas below
    }

    if (!document.querySelector(`#${CHART_IDS.status} canvas`)) {
      renderCanvasChart(CHART_IDS.status, {
        labels: providerStatus.map((agent) => agent.name),
        values: providerStatus.map((agent) => (statusTone(agent.status) === 'online' ? 100 : statusTone(agent.status) === 'warn' ? 60 : 20)),
        colors: providerStatus.map((agent) => agent.accent || cyan),
        horizontal: true,
      });
    }

    if (window.gsap) {
      window.gsap.fromTo(Array.from(document.querySelectorAll('.mc-agent-runtime-chart-card')), { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.08, ease: 'power2.out' });
    }
  }

  function bindShellEvents() {
    const refreshButton = document.getElementById('mc-agent-runtime-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        hydrate();
      });
    }

    document.querySelectorAll('.mc-agent-runtime-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        setActiveTab(button.dataset.tab || 'sessions');
      });
    });
  }

  function bindPanelEvents() {
    document.querySelectorAll('[data-control-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        await executeControlAction(button.dataset.controlAction || '');
      });
    });

    document.querySelectorAll('.mc-agent-runtime-table tbody tr').forEach((row) => {
      row.addEventListener('click', () => {
        const sessionId = row.querySelector('td')?.textContent?.trim();
        if (!sessionId || !window.MCModal?.showModal) return;
        window.MCModal.showModal({
          title: 'Session Details',
          body: `<div style="display:flex;flex-direction:column;gap:12px;">
            <div><div class="mc-input-label">Session ID</div><div class="mc-agent-runtime-mono">${escapeHtml(sessionId)}</div></div>
            <div><div class="mc-input-label">Note</div><div>Session inspection is available once the backend exposes a dedicated detail endpoint.</div></div>
          </div>`,
          buttons: [{ label: 'Close', type: 'secondary' }],
        });
      });
    });
  }

  function renderPanels() {
    const sessionsPanel = document.getElementById('mc-agent-runtime-panel-sessions');
    const agentsPanel = document.getElementById('mc-agent-runtime-panel-agents');
    const metricsPanel = document.getElementById('mc-agent-runtime-panel-metrics');
    const controlsPanel = document.getElementById('mc-agent-runtime-panel-controls');

    if (sessionsPanel) sessionsPanel.innerHTML = renderSessionsPanel();
    if (agentsPanel) agentsPanel.innerHTML = renderAgentsPanel();
    if (metricsPanel) metricsPanel.innerHTML = renderMetricsPanel();
    if (controlsPanel) controlsPanel.innerHTML = renderControlsPanel();

    if (window.lucide) window.lucide.createIcons();
    bindPanelEvents();
  }

  function setActiveTab(tab) {
    if (!TAB_IDS.includes(tab)) return;
    state.activeTab = tab;
    refreshPanelVisibility();
    renderPanels();
    if (state.activeTab === 'metrics') renderCharts();
  }

  function refreshPanelVisibility() {
    document.querySelectorAll('.mc-agent-runtime-panel').forEach((panel) => {
      const active = panel.dataset.panel === state.activeTab;
      panel.classList.remove('active');
      if (active) panel.classList.add('active');
    });

    document.querySelectorAll('.mc-agent-runtime-tab').forEach((tab) => {
      const active = tab.dataset.tab === state.activeTab;
      tab.classList.remove('active');
      if (active) tab.classList.add('active');
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
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
      const hero = document.getElementById('mc-agent-runtime-hero');
      const tabs = document.querySelector('.mc-agent-runtime-tabs');
      const panel = document.querySelector('.mc-agent-runtime-panel.active');
      const timeline = window.gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (hero) timeline.fromTo(hero, { opacity: 0, y: -40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.65 }, 0);
      if (tabs) timeline.fromTo(tabs, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, '<0.1');
      if (panel) timeline.fromTo(panel, { opacity: 0, x: 24, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 }, '<0.1');

      const sessionRows = Array.from(document.querySelectorAll('.mc-agent-runtime-table tbody tr'));
      if (sessionRows.length) {
        window.gsap.fromTo(sessionRows, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.28, stagger: 0.04, ease: 'power2.out', delay: 0.08 });
      }

      const agentCards = Array.from(document.querySelectorAll('.mc-agent-runtime-agent-card'));
      if (agentCards.length) {
        window.gsap.fromTo(agentCards, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out', delay: 0.08 });
      }
    }, root);
  }

  function animateActivePanel(panelId) {
    if (!window.gsap) return;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    window.gsap.fromTo(panel, { opacity: 0, x: 24, scale: 0.985 }, { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'power3.out' });
  }

  function refreshClock() {
    const clock = document.getElementById('mc-agent-runtime-clock');
    if (clock) clock.textContent = formatClock();
  }

  function startClock() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    refreshClock();
    state.clockTimer = window.setInterval(refreshClock, 1000);
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

  function addLiveAgentUpdate(agent) {
    const normalized = normalizeAgent(agent);
    const existingIndex = state.liveAgents.findIndex((item) => item.name === normalized.name);
    if (existingIndex >= 0) {
      state.liveAgents[existingIndex] = normalized;
    } else {
      state.liveAgents.unshift(normalized);
    }
    state.liveAgents = state.liveAgents.slice(0, 8);
    if (state.activeTab === 'agents') renderPanels();
  }

  async function postControlAction(action) {
    const response = await fetch(`${window.location.origin}/api/admin/agent/control`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey(),
      },
      body: JSON.stringify({ action, actor: 'master-control' }),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function executeControlAction(action) {
    if (!action || !getAdminKey()) return;
    try {
      const payload = window.MCApi?.runAgentControl ? await window.MCApi.runAgentControl(action) : await postControlAction(action);
      state.controlResult = unwrap(payload) || payload;
      const output = document.getElementById('mc-agent-runtime-control-output');
      if (output) output.textContent = JSON.stringify(state.controlResult, null, 2);
      if (window.MCToast) {
        window.MCToast.showToastSuccess(state.controlResult?.message || `${action} completed`);
      }
      await loadAllData();
    } catch (error) {
      state.controlResult = { ok: false, action, message: error?.message || `${action} failed` };
      const output = document.getElementById('mc-agent-runtime-control-output');
      if (output) output.textContent = JSON.stringify(state.controlResult, null, 2);
      if (window.MCToast) {
        window.MCToast.showToastError(error?.message || `${action} failed`);
      }
    }
  }

  function connectSse() {
    clearSse();
    const adminKey = getAdminKey();
    if (!adminKey) return;

    const unsubscribers = [];

    if (window.MCState?.subscribe) {
      unsubscribers.push(window.MCState.subscribe('agentHealth', (payload) => {
        if (payload?.agents) {
          state.liveAgents = payload.agents.map(normalizeAgent);
        }
        if (payload?.metrics) {
          state.metrics = normalizeMetrics(payload.metrics);
        }
        if (state.mounted) {
          renderPanels();
          if (state.activeTab === 'metrics') renderCharts();
        }
      }));
    }

    const streamUrl = `${window.location.origin}/api/admin/live-events/stream?adminKey=${encodeURIComponent(adminKey)}`;
    if (window.MCSSE?.subscribe) {
      unsubscribers.push(window.MCSSE.subscribe(streamUrl, {
        eventName: 'admin_live_event',
        onMessage: (event) => {
          try {
            const payload = JSON.parse(event.data);
            const label = String(payload.eventType || payload.stage || payload.type || '').toLowerCase();
            const agentHint = payload.agent || payload.worker || payload.provider || payload.service || null;
            if (label.includes('agent') || label.includes('worker') || label.includes('runtime') || agentHint) {
              addLiveAgentUpdate({
                name: agentHint || payload.provider || 'Agent Runtime',
                status: payload.status || payload.level || 'online',
                detail: payload.message || payload.summary || 'Live update received',
                metric: payload.metric || payload.value || '—',
                accent: 'var(--mc-cyan)',
                channel: payload.channel || payload.eventType || 'sse',
                lastSeen: payload.occurredAt || payload.timestamp || new Date().toISOString(),
                region: payload.region || null,
              });
            }
          } catch (error) {
            // ignore malformed events
          }
        },
      }));
    } else if (window.EventSource) {
      const source = new EventSource(streamUrl);
      source.addEventListener('admin_live_event', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const agentHint = payload.agent || payload.worker || payload.provider || payload.service || null;
          if (agentHint || String(payload.eventType || payload.stage || '').toLowerCase().includes('agent')) {
            addLiveAgentUpdate({
              name: agentHint || payload.provider || 'Agent Runtime',
              status: payload.status || payload.level || 'online',
              detail: payload.message || payload.summary || 'Live update received',
              metric: payload.metric || payload.value || '—',
              accent: 'var(--mc-cyan)',
              channel: payload.channel || payload.eventType || 'sse',
              lastSeen: payload.occurredAt || payload.timestamp || new Date().toISOString(),
              region: payload.region || null,
            });
          }
        } catch (error) {
          // ignore malformed events
        }
      });
      unsubscribers.push(() => {
        try { source.close(); } catch (error) { /* ignore */ }
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
    startClock();
    connectSse();
    loadAllData()
      .then(() => {
        if (seq !== state.hydrateSeq) return;
        refreshPanelVisibility();
      })
      .catch(() => {
        if (seq !== state.hydrateSeq) return;
        state.sessions = state.sessions.length ? state.sessions : sessionRows();
        ensureFallbackAgents();
        state.metrics = state.metrics || metricsModel();
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
    state.sessions = [];
    state.metrics = null;
    state.liveAgents = [];
    state.controlResult = null;
  }

  return { render, hydrate, destroy };
})();