window.MCModSystem = (function () {
  const STYLE_ID = 'mc-system-styles';
  const TAB_IDS = ['health', 'config', 'deploy', 'logs'];
  const SYSTEM_CSS = `
.mc-system-page { display: flex; flex-direction: column; gap: 20px; animation: slideUpFade 0.5s ease-out both; }
.mc-system-hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 0; }
.mc-system-hero-copy { display: flex; flex-direction: column; gap: 10px; }
.mc-system-hero-title { margin: 0; font-size: 26px; font-weight: 800; color: var(--mc-text); letter-spacing: -0.02em; }
.mc-system-hero-subtitle { margin: 0; font-size: var(--mc-text-sm); color: var(--mc-muted); }
.mc-system-hero-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto; }
.mc-system-clock-shell { display: flex; flex-direction: column; gap: 4px; min-width: 170px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); }
.mc-system-clock-label { font-size: 10px; color: var(--mc-muted); letter-spacing: 0.12em; text-transform: uppercase; }
.mc-system-clock { color: var(--mc-cyan); font-family: var(--mc-font-mono); font-size: 20px; font-weight: 700; text-shadow: 0 0 24px color-mix(in srgb, var(--mc-cyan) 28%, transparent); min-height: 24px; }
.mc-system-refresh { display: inline-flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--mc-cyan-dim); color: white; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.mc-system-refresh:hover { transform: translateY(-1px); box-shadow: 0 0 18px rgba(0, 212, 255, 0.15); border-color: rgba(0, 212, 255, 0.35); }

.mc-system-tabs { display: flex; gap: 4px; align-items: center; background: rgba(7, 12, 24, 0.7); border: 1px solid var(--glass-border-light); border-radius: 12px; padding: 4px; margin: 16px 0 4px; align-self: flex-start; flex-wrap: wrap; }
.mc-system-tab { flex: 0 0 auto; padding: 8px 18px; border-radius: 8px; background: transparent; border: 1px solid transparent; color: var(--mc-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
.mc-system-tab:hover { color: var(--mc-text); background: rgba(255, 255, 255, 0.03); }
.mc-system-tab.active { background: var(--mc-cyan-dim); color: white; border-color: rgba(0, 212, 255, 0.3); box-shadow: 0 0 20px rgba(0, 212, 255, 0.15); }

.mc-system-panels { display: flex; flex-direction: column; gap: 20px; }
.mc-system-panel { display: none; }
.mc-system-panel.active { display: block; }

.mc-system-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 24px; text-align: center; margin: 8px 0; background: rgba(7, 12, 24, 0.5); border: 1px dashed var(--border-subtle); border-radius: 14px; }
.mc-system-empty-icon { width: 40px; height: 40px; color: rgba(255, 255, 255, 0.1); }
.mc-system-empty-title { font-size: var(--mc-text-md); font-weight: 600; color: var(--mc-muted); }
.mc-system-empty-desc { font-size: var(--mc-text-sm); color: rgba(148, 163, 184, 0.75); max-width: 440px; }

.mc-system-summary-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 20px; }
.mc-system-summary-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28); }
.mc-system-summary-label { font-size: 10px; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
.mc-system-summary-value { font-size: 20px; font-weight: 800; color: var(--mc-text); font-family: var(--mc-font-mono); }
.mc-system-summary-sub { font-size: var(--mc-text-xs); color: var(--mc-muted); min-height: 1em; }

.mc-system-health-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mc-grid-gap); margin: 16px 0; }
@media (max-width: 1024px) { .mc-system-health-grid { grid-template-columns: 1fr; } }
.mc-system-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px; overflow: hidden; transition: all 0.25s ease; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02), 0 8px 24px rgba(0, 0, 0, 0.3); }
.mc-system-card:hover { border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 0 0 1px inset rgba(0, 212, 255, 0.08), 0 12px 36px rgba(0, 0, 0, 0.38); }
.mc-system-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.mc-system-card-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.mc-system-card-title::before { content: ''; display: block; width: 3px; height: 14px; border-radius: 2px; background: var(--mc-cyan); }
.mc-system-status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; font-family: var(--mc-font-mono); }
.mc-system-status-ok { background: rgba(16, 185, 129, 0.14); color: var(--mc-emerald); border: 1px solid rgba(16, 185, 129, 0.26); }
.mc-system-status-warn { background: rgba(245, 158, 11, 0.14); color: var(--mc-amber); border: 1px solid rgba(245, 158, 11, 0.26); }
.mc-system-status-bad { background: rgba(244, 63, 94, 0.14); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.24); }
.mc-system-status-neutral { background: rgba(255, 255, 255, 0.06); color: var(--mc-muted); border: 1px solid var(--border-subtle); }
.mc-system-card-lines { display: flex; flex-direction: column; gap: 6px; color: var(--mc-muted); font-size: 12px; }
.mc-system-card-lines span { font-family: var(--mc-font-mono); }

.mc-system-config-shell, .mc-system-deploy-shell, .mc-system-logs-shell { display: flex; flex-direction: column; gap: 16px; }
.mc-system-section-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--mc-text); }
.mc-system-section-subtitle { margin: 0; font-size: var(--mc-text-sm); color: var(--mc-muted); }
.mc-system-mono { font-family: var(--mc-font-mono); }
.mc-system-config-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.mc-system-meta-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 9999px; border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); font-size: 11px; color: var(--mc-muted); font-family: var(--mc-font-mono); }
.mc-system-meta-pill strong { color: var(--mc-text); font-weight: 700; }

.mc-system-table-wrap { overflow: hidden; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-card); }
.mc-system-table { width: 100%; border-collapse: collapse; font-size: var(--mc-text-sm); }
.mc-system-table thead th { padding: 12px 14px; text-align: left; font-size: var(--mc-text-xs); color: var(--mc-muted); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
.mc-system-table tbody td { padding: 12px 14px; color: var(--mc-text); border-bottom: 1px solid var(--mc-border-soft); vertical-align: top; }
.mc-system-table tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
.mc-system-table tbody tr:last-child td { border-bottom: none; }
.mc-system-source-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-family: var(--mc-font-mono); }
.mc-system-source-runtime { background: rgba(0, 212, 255, 0.12); color: var(--mc-cyan); }
.mc-system-source-env { background: rgba(139, 92, 246, 0.12); color: #c4b5fd; }
.mc-system-source-computed { background: rgba(16, 185, 129, 0.12); color: var(--mc-emerald); }
.mc-system-source-readonly { background: rgba(136, 146, 164, 0.12); color: var(--mc-muted); }

.mc-system-deploy-grid { display: grid; grid-template-columns: 1.3fr 0.9fr; gap: var(--mc-grid-gap); margin: 16px 0; }
@media (max-width: 1024px) { .mc-system-deploy-grid { grid-template-columns: 1fr; } }
.mc-system-deploy-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.mc-system-action-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); color: var(--mc-text); cursor: pointer; transition: all 0.2s ease; text-align: left; }
.mc-system-action-btn:hover { border-color: rgba(0, 212, 255, 0.24); transform: translateY(-1px); box-shadow: 0 0 0 1px inset rgba(0, 212, 255, 0.08); }
.mc-system-action-label { font-size: 13px; font-weight: 700; }
.mc-system-action-desc { font-size: 11px; color: var(--mc-muted); line-height: 1.4; }
.mc-system-action-primary { background: var(--mc-cyan-dim); border-color: rgba(0, 212, 255, 0.3); }

.mc-system-env-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 768px) { .mc-system-env-grid { grid-template-columns: 1fr; } }
.mc-system-env-card { background: rgba(7, 12, 24, 0.7); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s ease; }
.mc-system-env-card:hover { border-color: rgba(255, 255, 255, 0.12); transform: translateY(-1px); }
.mc-system-env-card-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.mc-system-env-label { font-size: 12px; font-weight: 700; color: var(--mc-text); }
.mc-system-env-detail { font-size: 12px; color: var(--mc-muted); font-family: var(--mc-font-mono); line-height: 1.45; }
.mc-system-env-sub { font-size: 11px; color: rgba(148, 163, 184, 0.75); }

.mc-system-log-toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; }
.mc-system-log-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.mc-system-log-filter { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); color: var(--mc-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
.mc-system-log-filter.active { color: var(--mc-cyan); background: var(--mc-cyan-dim); border-color: rgba(0, 212, 255, 0.3); }
.mc-system-log-clear { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-subtle); background: rgba(255, 255, 255, 0.02); color: var(--mc-text); font-size: 11px; font-weight: 700; cursor: pointer; }
.mc-system-log-stream { display: flex; flex-direction: column; gap: 8px; max-height: 520px; overflow: auto; padding-right: 4px; }
.mc-system-log-line { display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: start; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(7, 12, 24, 0.68); cursor: pointer; transition: all 0.2s ease; }
.mc-system-log-line:hover { border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 0 0 1px inset rgba(0, 212, 255, 0.06); }
.mc-system-log-line-latest { box-shadow: 0 0 0 1px inset rgba(0, 212, 255, 0.12); }
.mc-system-log-time { color: var(--mc-muted); font-size: 11px; font-family: var(--mc-font-mono); white-space: nowrap; }
.mc-system-log-level { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-family: var(--mc-font-mono); padding: 3px 8px; border-radius: 9999px; }
.mc-system-log-level.INFO { background: rgba(0, 212, 255, 0.12); color: var(--mc-cyan); }
.mc-system-log-level.WARN { background: rgba(245, 158, 11, 0.14); color: var(--mc-amber); }
.mc-system-log-level.ERROR { background: rgba(244, 63, 94, 0.14); color: #fb7185; }
.mc-system-log-level.DEBUG { background: rgba(139, 92, 246, 0.14); color: #c4b5fd; }
.mc-system-log-msg { color: var(--mc-text); font-size: 12px; line-height: 1.45; word-break: break-word; }
.mc-system-log-meta { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.mc-system-log-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--border-subtle); color: var(--mc-muted); font-size: 10px; font-family: var(--mc-font-mono); }
`;

  const state = {
    mounted: false,
    root: null,
    activeTab: 'health',
    health: null,
    config: null,
    deploy: null,
    logs: [],
    logFilter: 'all',
    clockTimer: null,
    sseUnsubscribe: null,
    gsapContext: null,
    hydrateSeq: 0,
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = SYSTEM_CSS;
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

  function formatBytes(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = size;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${Math.max(0, Math.min(100, number)).toFixed(0)}%`;
  }

  function formatBool(value) {
    return value ? 'Enabled' : 'Disabled';
  }

  function normalizeLevel(level) {
    const resolved = String(level || 'info').toLowerCase();
    if (resolved === 'warning') return 'WARN';
    if (resolved === 'warn') return 'WARN';
    if (resolved === 'error') return 'ERROR';
    if (resolved === 'debug') return 'DEBUG';
    return 'INFO';
  }

  function statusTone(status) {
    const resolved = String(status || '').toLowerCase();
    if (resolved === 'ok' || resolved === 'healthy' || resolved === 'connected' || resolved === 'configured') return 'ok';
    if (resolved === 'down' || resolved === 'failed' || resolved === 'error') return 'bad';
    if (resolved === 'warn' || resolved === 'degraded' || resolved === 'unknown') return 'warn';
    return 'neutral';
  }

  function statusLabel(status) {
    const resolved = String(status || 'unknown').toLowerCase();
    if (resolved === 'ok') return 'OK';
    if (resolved === 'healthy') return 'HEALTHY';
    if (resolved === 'connected') return 'CONNECTED';
    if (resolved === 'configured') return 'CONFIGURED';
    if (resolved === 'down') return 'DOWN';
    if (resolved === 'failed') return 'FAILED';
    if (resolved === 'warn') return 'WARN';
    if (resolved === 'degraded') return 'DEGRADED';
    return String(status || 'UNKNOWN').toUpperCase();
  }

  function renderStatusPill(status) {
    const tone = statusTone(status);
    return `<span class="mc-system-status-pill mc-system-status-${tone}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function renderSummaryCards() {
    const health = state.health || {};
    const config = state.config || {};
    const deploy = state.deploy || {};
    const runtime = config.state?.runtime || {};
    const observability = config.observability || {};
    const summary = [
      { label: 'Backend', value: health.backend?.status || '—', sub: health.backend ? `Maintenance: ${formatBool(Boolean(health.backend.maintenanceMode))}` : 'Health unavailable' },
      { label: 'LiveKit', value: health.livekit?.status || '—', sub: health.livekit?.message || 'Probe unavailable' },
      { label: 'Queue', value: runtime.queuePaused ? 'Paused' : 'Running', sub: `Depth: ${observability.queueDepth ?? '—'}` },
      { label: 'SSE', value: window.MCState?.systemHealth?.sse || 'disconnected', sub: 'Live event stream' },
    ];

    return `<div class="mc-system-summary-row">${summary.map((item) => `
      <article class="mc-system-summary-card">
        <div class="mc-system-summary-label">${escapeHtml(item.label)}</div>
        <div class="mc-system-summary-value">${escapeHtml(String(item.value))}</div>
        <div class="mc-system-summary-sub">${escapeHtml(item.sub || '')}</div>
      </article>
    `).join('')}</div>`;
  }

  function buildShell() {
    return `
      <div class="mc-module-wrap mc-system-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        <section class="glass-card mc-system-hero" id="mc-system-hero">
          <div class="mc-system-hero-copy">
            <span class="hero-pill">SYSTEM</span>
            <div>
              <h1 class="mc-system-hero-title">System</h1>
              <p class="mc-system-hero-subtitle">Runtime health, configuration, deployment controls, and live logs</p>
            </div>
          </div>
          <div class="mc-system-hero-actions">
            <div class="mc-system-clock-shell">
              <div class="mc-system-clock-label">LIVE CLOCK</div>
              <div class="mc-system-clock" id="mc-system-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-system-refresh" id="mc-system-refresh">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
              <span>Refresh</span>
            </button>
          </div>
        </section>

        <div class="mc-system-tabs" role="tablist" aria-label="System tabs">
          ${TAB_IDS.map((tab) => `
            <button type="button" class="mc-system-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">
              ${tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          `).join('')}
        </div>

        <section class="glass-card mc-system-panel ${state.activeTab === 'health' ? 'active' : ''}" id="mc-system-panel-health" data-panel="health">
          ${renderHealthPanel()}
        </section>

        <section class="glass-card mc-system-panel ${state.activeTab === 'config' ? 'active' : ''}" id="mc-system-panel-config" data-panel="config">
          ${renderConfigPanel()}
        </section>

        <section class="glass-card mc-system-panel ${state.activeTab === 'deploy' ? 'active' : ''}" id="mc-system-panel-deploy" data-panel="deploy">
          ${renderDeployPanel()}
        </section>

        <section class="glass-card mc-system-panel ${state.activeTab === 'logs' ? 'active' : ''}" id="mc-system-panel-logs" data-panel="logs">
          ${renderLogsPanel()}
        </section>
      </div>
    `;
  }

  function renderPanelEmpty(icon, title, desc) {
    return `
      <div class="mc-system-empty">
        <div class="mc-system-empty-icon"><i data-lucide="${escapeHtml(icon)}" style="width:34px;height:34px;"></i></div>
        <div class="mc-system-empty-title">${escapeHtml(title)}</div>
        <div class="mc-system-empty-desc">${escapeHtml(desc)}</div>
      </div>
    `;
  }

  function renderHealthCard(title, status, lines, icon) {
    return `
      <article class="mc-system-card mc-system-health-card">
        <div class="mc-system-card-header">
          <div class="mc-system-card-title">
            <i data-lucide="${escapeHtml(icon)}" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
            <span>${escapeHtml(title)}</span>
          </div>
          ${renderStatusPill(status)}
        </div>
        <div class="mc-system-card-lines">
          ${lines.map((line) => `<div><span>${escapeHtml(line)}</span></div>`).join('')}
        </div>
      </article>
    `;
  }

  function renderHealthPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load system data', 'System diagnostics need an admin key before health, config, deploy controls, and logs can be loaded.');
    }

    if (!state.health) {
      return renderPanelEmpty('shield-alert', 'Health data unavailable', 'Refresh after the backend becomes reachable to load backend, LiveKit, database, and Redis status.');
    }

    const health = state.health;
    const memory = health.system?.memoryUsage || {};
    const backendLines = [
      `Uptime: ${Math.floor(health.uptimeSec || 0)}s`,
      `Backend enabled: ${formatBool(Boolean(health.backend?.runtimeEnabled))}`,
      `Maintenance mode: ${formatBool(Boolean(health.backend?.maintenanceMode))}`,
      `Queue paused: ${formatBool(Boolean(health.backend?.queuePaused))}`,
    ];
    const livekitLines = [
      `Rooms: ${health.livekit?.roomCount ?? '—'}`,
      `Participants: ${health.livekit?.participantCount ?? '—'}`,
      `Probe: ${health.livekit?.message || 'n/a'}`,
    ];
    const databaseLines = [
      `Latency: ${health.database?.latencyMs ?? '—'} ms`,
      `Connections: ${health.database?.connectionPool ?? '—'}`,
      `Status: ${health.database?.status || 'warn'}`,
    ];
    const redisLines = [
      `Status: unknown`,
      `Target: not exposed by health endpoint`,
      `Fallback: derive from queue and auth behavior`,
    ];

    return `
      <div class="mc-system-config-shell">
        ${renderSummaryCards()}
        <div class="mc-system-health-grid">
          ${renderHealthCard('Backend', health.backend?.status || 'warn', backendLines, 'server')}
          ${renderHealthCard('LiveKit', health.livekit?.status || 'warn', livekitLines, 'radio')}
          ${renderHealthCard('Database', health.database?.status || 'warn', databaseLines, 'database')}
          ${renderHealthCard('Redis', 'unknown', redisLines, 'database-zap')}
        </div>
        <div class="mc-system-summary-row">
          <article class="mc-system-summary-card">
            <div class="mc-system-summary-label">Memory RSS</div>
            <div class="mc-system-summary-value">${escapeHtml(formatBytes(memory.rss || 0))}</div>
            <div class="mc-system-summary-sub">Heap: ${escapeHtml(formatBytes((memory.heapUsedMb || 0) * 1024 * 1024))}</div>
          </article>
          <article class="mc-system-summary-card">
            <div class="mc-system-summary-label">CPU Usage</div>
            <div class="mc-system-summary-value">${escapeHtml(formatPercent(health.quickMetrics?.cpuUsagePercent || 0))}</div>
            <div class="mc-system-summary-sub">Active connections: ${escapeHtml(String(health.quickMetrics?.activeConnections ?? '—'))}</div>
          </article>
          <article class="mc-system-summary-card">
            <div class="mc-system-summary-label">Disk Usage</div>
            <div class="mc-system-summary-value">${escapeHtml(formatPercent(health.system?.diskUsagePercent || 0))}</div>
            <div class="mc-system-summary-sub">Measured from process filesystem</div>
          </article>
        </div>
      </div>
    `;
  }

  function collectConfigRows() {
    const snapshot = state.config;
    if (!snapshot?.schema?.sections || !snapshot?.state) return [];

    const rows = [];
    snapshot.schema.sections.forEach((section) => {
      const sectionState = snapshot.state?.[section.key] || {};
      const sectionSources = snapshot.sources?.[section.key] || {};
      (section.fields || []).forEach((field) => {
        const key = field.key;
        let value;

        if (section.key === 'observability') {
          value = snapshot.observability?.[key];
        } else if (section.key === 'persistence' && key === 'saveState') {
          value = snapshot.updatedAt ? 'saved' : 'unsaved';
        } else {
          value = sectionState[key];
        }

        rows.push({
          section: section.label,
          key: field.label || key,
          rawKey: key,
          value,
          source: sectionSources[key] || field.source || 'runtime',
        });
      });
    });

    return rows;
  }

  function formatConfigValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return formatBool(value);
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
    return String(value);
  }

  function renderSourceBadge(source) {
    const resolved = String(source || 'runtime').toLowerCase();
    const className = resolved === 'env' ? 'mc-system-source-env' : resolved === 'computed' ? 'mc-system-source-computed' : resolved === 'readonly' ? 'mc-system-source-readonly' : 'mc-system-source-runtime';
    return `<span class="mc-system-source-badge ${className}">${escapeHtml(resolved)}</span>`;
  }

  function renderConfigPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load system data', 'Configuration, sources, and observability values are only visible after admin authentication.');
    }

    if (!state.config) {
      return renderPanelEmpty('sliders-horizontal', 'Configuration unavailable', 'Refresh after the backend becomes reachable to load runtime configuration.');
    }

    const rows = collectConfigRows();
    const snapshot = state.config;

    return `
      <div class="mc-system-config-shell">
        <div>
          <h2 class="mc-system-section-title">Runtime Configuration</h2>
          <p class="mc-system-section-subtitle">Key/value/source inventory from the backend control snapshot.</p>
        </div>
        <div class="mc-system-config-meta">
          <span class="mc-system-meta-pill"><strong>Version</strong> ${escapeHtml(String(snapshot.meta?.version ?? 1))}</span>
          <span class="mc-system-meta-pill"><strong>Updated</strong> ${escapeHtml(snapshot.updatedAt ? formatTimestamp(snapshot.updatedAt) : '—')}</span>
          <span class="mc-system-meta-pill"><strong>Source</strong> ${escapeHtml(snapshot.meta?.sourceOfTruth || 'plan-default')}</span>
          <span class="mc-system-meta-pill"><strong>Dirty</strong> ${escapeHtml(snapshot.dirty ? 'yes' : 'no')}</span>
        </div>
        <div class="mc-system-table-wrap">
          <table class="mc-system-table" aria-label="System configuration table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Key</th>
                <th>Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.section)}</td>
                  <td class="mc-system-mono">${escapeHtml(row.key)}</td>
                  <td class="mc-system-mono">${formatConfigValue(row.value)}</td>
                  <td>${renderSourceBadge(row.source)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildDeployModel() {
    const health = state.health || {};
    const config = state.config || {};
    const runtime = config.state?.runtime || {};
    const integrations = config.state?.integrations || {};
    const processing = config.state?.processing || {};
    const safety = config.state?.safety || {};
    const observability = config.observability || {};

    const environments = [
      {
        label: 'Backend',
        status: health.backend?.status || (runtime.backendEnabled ? 'ok' : 'down'),
        detail: runtime.maintenanceMode ? 'Maintenance mode is enabled' : runtime.backendEnabled ? 'Backend enabled' : 'Backend disabled',
        sub: `Queue: ${runtime.queuePaused ? 'paused' : 'running'}`,
      },
      {
        label: 'LiveKit',
        status: health.livekit?.status || 'warn',
        detail: health.livekit?.message || 'Probe unavailable',
        sub: `Rooms: ${health.livekit?.roomCount ?? '—'} / Participants: ${health.livekit?.participantCount ?? '—'}`,
      },
      {
        label: 'Database',
        status: health.database?.status || 'warn',
        detail: health.database?.latencyMs ? `${health.database.latencyMs} ms latency` : 'Latency not measured',
        sub: `Connections: ${health.database?.connectionPool ?? '—'}`,
      },
      {
        label: 'Redis',
        status: 'warn',
        detail: 'Redis target is not exposed by the health endpoint',
        sub: `Queue concurrency: ${processing.outboundQueueConcurrency ?? '—'}`,
      },
    ];

    const actions = [
      { action: 'restart-worker', label: 'Restart Worker', description: 'Restart the outbound worker with current runtime settings', primary: true },
      { action: 'sync-config', label: 'Sync Config', description: 'Reload control state and process queued requests', primary: false },
      { action: 'ping-livekit', label: 'Ping LiveKit', description: 'Probe LiveKit reachability', primary: false },
      { action: 'test-webhook', label: 'Test Webhook', description: 'Run a webhook route test', primary: false },
      { action: runtime.queuePaused ? 'resume-queue' : 'pause-queue', label: runtime.queuePaused ? 'Resume Queue' : 'Pause Queue', description: runtime.queuePaused ? 'Resume outbound processing' : 'Pause outbound processing', primary: false },
      { action: 'flush-queue', label: 'Flush Queue', description: 'Enqueue queued outbound requests immediately', primary: false },
    ];

    return { environments, actions, runtime, integrations, safety, observability };
  }

  function renderEnvCard(item) {
    return `
      <article class="mc-system-env-card">
        <div class="mc-system-env-card-header">
          <div class="mc-system-env-label">${escapeHtml(item.label)}</div>
          ${renderStatusPill(item.status)}
        </div>
        <div class="mc-system-env-detail">${escapeHtml(item.detail || '—')}</div>
        <div class="mc-system-env-sub">${escapeHtml(item.sub || '')}</div>
      </article>
    `;
  }

  function renderDeployPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load system data', 'Deployment controls need admin authentication before environment and action data can be shown.');
    }

    if (!state.deploy) {
      return renderPanelEmpty('rocket', 'Deployment data unavailable', 'Refresh after the backend becomes reachable to load deployment status and action buttons.');
    }

    const deploy = state.deploy;
    const runtime = deploy.runtime || {};
    const observability = deploy.observability || {};

    return `
      <div class="mc-system-deploy-shell">
        <div>
          <h2 class="mc-system-section-title">Deployment Status</h2>
          <p class="mc-system-section-subtitle">Environment rows, runtime switches, and one-click operational actions.</p>
        </div>
        <div class="mc-system-deploy-grid">
          <div class="mc-system-card">
            <div class="mc-system-card-header">
              <div class="mc-system-card-title">
                <i data-lucide="globe" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
                <span>Environments</span>
              </div>
              <span class="mc-system-meta-pill"><strong>Source</strong> ${escapeHtml(state.config?.meta?.sourceOfTruth || 'plan-default')}</span>
            </div>
            <div class="mc-system-env-grid">
              ${deploy.environments.map(renderEnvCard).join('')}
            </div>
          </div>

          <div class="mc-system-card">
            <div class="mc-system-card-header">
              <div class="mc-system-card-title">
                <i data-lucide="play-circle" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
                <span>Actions</span>
              </div>
            </div>
            <div class="mc-system-deploy-actions">
              ${deploy.actions.map((action) => `
                <button type="button" class="mc-system-action-btn ${action.primary ? 'mc-system-action-primary' : ''}" data-action="${escapeHtml(action.action)}">
                  <span class="mc-system-action-label">${escapeHtml(action.label)}</span>
                  <span class="mc-system-action-desc">${escapeHtml(action.description)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="mc-system-table-wrap">
          <table class="mc-system-table" aria-label="Deployment runtime table">
            <thead>
              <tr>
                <th>Runtime Control</th>
                <th>Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              ${[
                ['Backend Enabled', formatBool(Boolean(runtime.backendEnabled)), 'runtime'],
                ['Maintenance Mode', formatBool(Boolean(runtime.maintenanceMode)), 'runtime'],
                ['Queue Paused', formatBool(Boolean(runtime.queuePaused)), 'runtime'],
                ['Outbound Calling', formatBool(Boolean(runtime.outboundCallingEnabled)), 'runtime'],
                ['Voice Test Mode', formatBool(Boolean(runtime.voiceTestMode)), 'runtime'],
                ['Billing Bypass', formatBool(Boolean(runtime.billingBypass)), 'runtime'],
                ['Webhook Bridge', formatBool(Boolean(runtime.webhookBridgeEnabled)), 'runtime'],
                ['Queue Depth', String(observability.queueDepth ?? '—'), 'computed'],
              ].map(([label, value, source]) => `
                <tr>
                  <td>${escapeHtml(label)}</td>
                  <td class="mc-system-mono">${escapeHtml(String(value))}</td>
                  <td>${renderSourceBadge(source)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function filteredLogs() {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    if (state.logFilter === 'all') return logs;
    return logs.filter((log) => normalizeLevel(log.level) === state.logFilter.toUpperCase());
  }

  function renderLogLine(log, index) {
    const level = normalizeLevel(log.level);
    return `
      <article class="mc-system-log-line ${index === 0 ? 'mc-system-log-line-latest' : ''}" data-log-index="${index}">
        <div class="mc-system-log-time">${escapeHtml(formatTimestamp(log.received_at || log.receivedAt || log.timestamp))}</div>
        <div class="mc-system-log-level ${level}">${escapeHtml(level)}</div>
        <div class="mc-system-log-msg">${escapeHtml(log.message || log.event_type || '(event)')}</div>
        <div class="mc-system-log-meta">
          ${log.tenant_id ? `<span class="mc-system-log-chip">tenant:${escapeHtml(log.tenant_id)}</span>` : ''}
          ${log.call_id ? `<span class="mc-system-log-chip">call:${escapeHtml(log.call_id)}</span>` : ''}
          ${log.source ? `<span class="mc-system-log-chip">${escapeHtml(log.source)}</span>` : ''}
        </div>
      </article>
    `;
  }

  function renderLogsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load system data', 'Live system logs are available after admin authentication.');
    }

    const logs = filteredLogs();

    return `
      <div class="mc-system-logs-shell">
        <div>
          <h2 class="mc-system-section-title">Live System Logs</h2>
          <p class="mc-system-section-subtitle">INFO, WARN, and ERROR lines stream here from the admin live-event feed.</p>
        </div>
        <div class="mc-system-log-toolbar">
          <div class="mc-system-log-filters">
            ${['all', 'info', 'warn', 'error'].map((filter) => `
              <button type="button" class="mc-system-log-filter ${state.logFilter === filter ? 'active' : ''}" data-log-filter="${filter}">${filter.toUpperCase()}</button>
            `).join('')}
          </div>
          <button type="button" class="mc-system-log-clear" id="mc-system-clear-logs">Clear</button>
        </div>
        ${logs.length ? `
          <div class="mc-system-log-stream" id="mc-system-log-stream">
            ${logs.map((log, index) => renderLogLine(log, index)).join('')}
          </div>
        ` : renderPanelEmpty('file-text', 'No logs available', 'Logs will appear here once the backend emits live diagnostic events.')}
      </div>
    `;
  }

  function bindShellEvents() {
    const refreshButton = document.getElementById('mc-system-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        hydrate({ userInitiated: true });
      });
    }

    document.querySelectorAll('.mc-system-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        setActiveTab(tab);
      });
    });
  }

  function bindPanelEvents() {
    document.querySelectorAll('[data-log-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.logFilter = button.dataset.logFilter || 'all';
        renderPanels();
      });
    });

    const clearLogsButton = document.getElementById('mc-system-clear-logs');
    if (clearLogsButton) {
      clearLogsButton.addEventListener('click', () => {
        state.logs = [];
        renderPanels();
      });
    }

    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        await executeDeployAction(button.dataset.action || '');
      });
    });

    document.querySelectorAll('.mc-system-log-line[data-log-index]').forEach((line) => {
      line.addEventListener('click', () => {
        const index = Number(line.dataset.logIndex);
        const log = filteredLogs()[index];
        if (!log || !window.MCModal?.showModal) return;
        window.MCModal.showModal({
          title: `Log Details — ${normalizeLevel(log.level)}`,
          body: `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div><div class="mc-input-label">Timestamp</div><div class="mc-system-mono">${escapeHtml(formatTimestamp(log.received_at || log.receivedAt || log.timestamp))}</div></div>
              <div><div class="mc-input-label">Level</div><div class="mc-system-log-level ${normalizeLevel(log.level)}" style="display:inline-flex;">${normalizeLevel(log.level)}</div></div>
              <div><div class="mc-input-label">Message</div><div style="white-space:pre-wrap;">${escapeHtml(log.message || '')}</div></div>
              <div><div class="mc-input-label">Source</div><div class="mc-system-mono">${escapeHtml(log.source || 'n/a')}</div></div>
              ${log.payload ? `<div><div class="mc-input-label">Payload</div><pre style="white-space:pre-wrap;overflow:auto;background:rgba(0,0,0,0.18);padding:12px;border-radius:12px;border:1px solid var(--mc-border-soft);">${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre></div>` : ''}
            </div>
          `,
          buttons: [{ label: 'Close', type: 'secondary' }],
        });
      });
    });
  }

  function refreshClock() {
    const clock = document.getElementById('mc-system-clock');
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

  async function fetchAdminJson(path) {
    const response = await fetch(`${window.location.origin}/api/admin${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey(),
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function loadHealth() {
    if (!getAdminKey()) return null;
    const payload = window.MCApi?.getDevHealth ? await window.MCApi.getDevHealth() : await fetchAdminJson('/dev-monitor/health');
    return unwrap(payload);
  }

  async function loadConfig() {
    if (!getAdminKey()) return null;
    const role = window.MCState?.role || 'developer';
    const payload = window.MCApi?.getBackendControl ? await window.MCApi.getBackendControl() : await fetchAdminJson(`/backend-control?role=${encodeURIComponent(role)}`);
    return unwrap(payload);
  }

  async function loadLogs() {
    if (!getAdminKey()) return [];
    const payload = window.MCState?.adminKey && window.MCApi?.getLogs ? await window.MCApi.getLogs() : await fetchAdminJson('/dev-monitor/logs?limit=120');
    const rows = safeArray(unwrap(payload)).map(normalizeLogEntry);
    rows.reverse();
    return rows;
  }

  function normalizeLogEntry(item) {
    return {
      received_at: item.received_at || item.receivedAt || item.timestamp || new Date().toISOString(),
      level: normalizeLevel(item.level || item.stage || 'info'),
      message: item.message || item.event_type || item.eventType || '(event)',
      event_type: item.event_type || item.eventType || null,
      call_id: item.call_id || item.callId || null,
      tenant_id: item.tenant_id || item.tenantId || null,
      source: item.source || 'sse',
      payload: item.payload || item.payloadJson || null,
    };
  }

  function buildDeployFromState() {
    state.deploy = buildDeployModel();
  }

  async function loadAllData() {
    if (!getAdminKey()) {
      state.health = null;
      state.config = null;
      state.deploy = null;
      state.logs = [];
      renderPanels();
      return;
    }

    const [healthResult, configResult, logsResult] = await Promise.allSettled([
      loadHealth(),
      loadConfig(),
      loadLogs(),
    ]);

    state.health = healthResult.status === 'fulfilled' ? healthResult.value : null;
    state.config = configResult.status === 'fulfilled' ? configResult.value : null;
    state.logs = logsResult.status === 'fulfilled' ? logsResult.value : [];
    buildDeployFromState();
    renderPanels();
  }

  function addLogEntry(log) {
    const normalized = normalizeLogEntry(log);
    state.logs.unshift(normalized);
    if (state.logs.length > 200) {
      state.logs = state.logs.slice(0, 200);
    }
    if (state.activeTab === 'logs') {
      renderPanels();
      scrollLogsToBottom();
    }
  }

  function connectSse() {
    clearSse();
    const adminKey = getAdminKey();
    if (!adminKey) return;

    const unsubscribers = [];

    if (window.MCState?.subscribe) {
      unsubscribers.push(window.MCState.subscribe('systemHealth', () => {
        if (state.mounted && (state.activeTab === 'health' || state.activeTab === 'deploy')) {
          renderPanels();
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
            const level = normalizeLevel(payload.level || payload.payload?.level || payload.stage || 'info');
            const message = payload.message || payload.payload?.message || payload.eventType || payload.event_type || '(event)';
            addLogEntry({
              received_at: payload.occurredAt || payload.received_at || new Date().toISOString(),
              level,
              message,
              event_type: payload.eventType || payload.stage || null,
              call_id: payload.callId || payload.call_id || null,
              tenant_id: payload.tenantId || payload.tenant_id || null,
              source: 'sse',
              payload,
            });
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
          addLogEntry({
            received_at: payload.occurredAt || payload.received_at || new Date().toISOString(),
            level: normalizeLevel(payload.level || payload.stage || 'info'),
            message: payload.message || payload.eventType || '(event)',
            event_type: payload.eventType || payload.stage || null,
            call_id: payload.callId || payload.call_id || null,
            tenant_id: payload.tenantId || payload.tenant_id || null,
            source: 'sse',
            payload,
          });
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

  function renderPanels() {
    const healthPanel = document.getElementById('mc-system-panel-health');
    const configPanel = document.getElementById('mc-system-panel-config');
    const deployPanel = document.getElementById('mc-system-panel-deploy');
    const logsPanel = document.getElementById('mc-system-panel-logs');

    if (healthPanel) healthPanel.innerHTML = renderHealthPanel();
    if (configPanel) configPanel.innerHTML = renderConfigPanel();
    if (deployPanel) deployPanel.innerHTML = renderDeployPanel();
    if (logsPanel) logsPanel.innerHTML = renderLogsPanel();

    if (window.lucide) window.lucide.createIcons();
    bindPanelEvents();

    if (state.activeTab === 'logs') {
      scrollLogsToBottom();
    }
    if (state.activeTab === 'health' || state.activeTab === 'deploy') {
      animateActivePanel(`mc-system-panel-${state.activeTab}`);
    }
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
      const hero = document.getElementById('mc-system-hero');
      const tabs = document.querySelector('.mc-system-tabs');
      const activePanel = document.querySelector('.mc-system-panel.active');
      const timeline = window.gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (hero) timeline.fromTo(hero, { opacity: 0, y: -40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.65 }, 0);
      if (tabs) timeline.fromTo(tabs, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, '<0.1');
      if (activePanel) timeline.fromTo(activePanel, { opacity: 0, x: 24, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 }, '<0.1');

      const healthCards = Array.from(document.querySelectorAll('.mc-system-health-card'));
      if (healthCards.length) {
        window.gsap.fromTo(
          healthCards,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out', delay: 0.1 }
        );
      }
    }, root);
  }

  function refreshPanelVisibility() {
    document.querySelectorAll('.mc-system-panel').forEach((panel) => {
      const isActive = panel.dataset.panel === state.activeTab;
      panel.classList.remove('active');
      if (isActive) panel.classList.add('active');
    });

    document.querySelectorAll('.mc-system-tab').forEach((tab) => {
      const isActive = tab.dataset.tab === state.activeTab;
      tab.classList.remove('active');
      if (isActive) tab.classList.add('active');
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function setActiveTab(tab) {
    if (!TAB_IDS.includes(tab)) return;
    state.activeTab = tab;
    refreshPanelVisibility();
    renderPanels();
  }

  function scrollLogsToBottom() {
    const viewer = document.getElementById('mc-system-log-stream');
    if (viewer) {
      viewer.scrollTop = viewer.scrollHeight;
    }
  }

  async function executeDeployAction(action) {
    if (!action || !getAdminKey()) return;

    try {
      const payload = window.MCApi?.runAction ? await window.MCApi.runAction(action) : await postAction(action);
      if (window.MCToast) {
        window.MCToast.showToastSuccess(payload?.data?.message || payload?.message || `${action} completed`);
      }
      await loadAllData();
    } catch (error) {
      if (window.MCToast) {
        window.MCToast.showToastError(error?.message || `${action} failed`);
      }
    }
  }

  async function postAction(action) {
    const response = await fetch(`${window.location.origin}/api/admin/backend-control/actions/${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': getAdminKey(),
      },
      body: JSON.stringify({ actor: 'master-control' }),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  function startTimers() {
    clearClock();
    refreshClock();
    state.clockTimer = window.setInterval(refreshClock, 1000);
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
  }

  function hydrate() {
    if (!state.mounted) return;
    state.hydrateSeq += 1;
    const seq = state.hydrateSeq;
    startTimers();
    connectSse();
    loadAllData()
      .then(() => {
        if (seq !== state.hydrateSeq) return;
        refreshPanelVisibility();
      })
      .catch(() => {
        if (seq !== state.hydrateSeq) return;
        state.health = state.health || null;
        state.config = state.config || null;
        state.deploy = state.deploy || null;
        state.logs = Array.isArray(state.logs) ? state.logs : [];
        renderPanels();
      });
  }

  function destroy() {
    state.mounted = false;
    clearClock();
    clearSse();
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try {
        state.gsapContext.revert();
      } catch (error) {
        // ignore
      }
    }
    state.gsapContext = null;
    state.root = null;
    state.health = null;
    state.config = null;
    state.deploy = null;
    state.logs = [];
    state.logFilter = 'all';
  }

  return { render, hydrate, destroy };
})();