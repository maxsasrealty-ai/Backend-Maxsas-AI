window.MCModDevTools = (function () {

  // Sub-tabs config — add more URLs as needed
  const TABS = [
    {
      id: 'dev-monitor',
      label: 'Dev Monitor',
      icon: 'monitor',
      color: 'var(--mc-mod-devtools)',
      url: '/admin-panel',                // existing dev monitor page
    },
    {
      id: 'admin-panel',
      label: 'Admin Panel',
      icon: 'layout-dashboard',
      color: 'var(--mc-mod-devtools)',
      url: '/admin',                       // existing admin console
    },
    {
      id: 'payments-panel',
      label: 'Payments Panel',
      icon: 'receipt',
      color: 'var(--mc-mod-finance)',
      url: '/payments-panel',              // existing payments page
    },
  ];

  let activeTab = 'dev-monitor';

  function tabsHtml() {
    return TABS.map(t => `
      <button class="mc-subtab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}"
        style="display:flex;align-items:center;gap:6px;">
        <i data-lucide="${t.icon}" style="width:13px;height:13px;"></i>
        <span>${t.label}</span>
      </button>
    `).join('');
  }

  function iframeHtml(url) {
    return `
      <div style="
        width:100%;
        height:calc(100vh - var(--mc-topbar-h) - 100px);
        border:1px solid var(--mc-border);
        border-radius:var(--mc-r-lg);
        overflow:hidden;
        background:var(--mc-surface);
        box-shadow:var(--mc-shadow-panel);
      ">
        <iframe
          src="${url}"
          style="width:100%;height:100%;border:none;display:block;"
          loading="lazy"
          title="${url}"
        ></iframe>
      </div>
    `;
  }

  function render() {
    const el = MCRouter.getContentEl();
    if (!el) return;

    const tab = TABS.find(t => t.id === activeTab) || TABS[0];

    el.innerHTML = `
      <div style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:16px;">
        <div class="mc-section-header">
          <div>
            <div class="mc-section-title" style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="terminal" style="width:18px;height:18px;color:var(--mc-mod-devtools);"></i>
              Dev Tools
            </div>
            <div class="mc-section-meta" style="margin-top:4px;">
              Embedded internal panels — no separate tab needed
            </div>
          </div>
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-dt-open-new">
            <i data-lucide="external-link" style="width:12px;height:12px;"></i>
            Open in new tab
          </button>
        </div>

        <div class="mc-subtabs" id="mc-dt-tabs">
          ${tabsHtml()}
        </div>

        <div id="mc-dt-iframe-wrap">
          ${iframeHtml(tab.url)}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Tab switching
    el.querySelectorAll('.mc-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        const t = TABS.find(x => x.id === activeTab);

        // Update active state
        el.querySelectorAll('.mc-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Swap iframe
        const wrap = document.getElementById('mc-dt-iframe-wrap');
        if (wrap && t) wrap.innerHTML = iframeHtml(t.url);
      });
    });

    // Open in new tab
    document.getElementById('mc-dt-open-new')?.addEventListener('click', () => {
      const t = TABS.find(x => x.id === activeTab);
      if (t) window.open(t.url, '_blank');
    });
  }

  return { render };
})();

  function renderLogFilters() {
    const filters = ['all', 'info', 'warn', 'error', 'debug'];
    return `<div class="mc-dev-tabs" style="margin-bottom:16px;">${filters.map((filter) => `<button type="button" class="mc-dev-tab ${state.logFilter === filter ? 'active' : ''}" data-log-filter="${filter}">${filter.toUpperCase()}</button>`).join('')}</div>`;
  }

  function renderLogsPanel() {
    const logs = filteredLogs();
    return `
      <div class="mc-dev-panel-wrap">
        <div class="mc-dev-log-toolbar">
          <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="terminal-square" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Logs</span></div><div class="mc-section-meta">Live diagnostic streaming</div></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><button type="button" class="mc-btn mc-btn-secondary" id="mc-dev-clear-logs">Clear</button></div>
        </div>
        ${renderLogFilters()}
        ${logs.length ? `<div class="mc-dev-log-stream" id="mc-dev-log-viewer">${logs.map((log, index) => `<div class="mc-dev-log-line ${index === logs.length - 1 ? 'mc-dev-log-line-latest' : ''}" data-log-index="${index}"><div class="mc-dev-log-time">${escapeHtml(formatTimestamp(log.received_at || log.receivedAt || log.timestamp))}</div><div class="mc-dev-log-level ${escapeHtml(normalizeLevel(log.level))}">${escapeHtml(normalizeLevel(log.level))}</div><div class="mc-dev-log-msg">${escapeHtml(log.message || log.event_type || '(no message)')}</div><div class="mc-dev-log-meta">${log.call_id ? `<span class="mc-dev-pill mc-dev-pill-neutral">Call ${escapeHtml(log.call_id)}</span>` : ''}${log.tenant_id ? `<span class="mc-dev-pill mc-dev-pill-neutral">Tenant ${escapeHtml(log.tenant_id)}</span>` : ''}</div></div>`).join('')}</div>` : renderPanelEmpty('file-text', 'No logs available', 'Logs will stream here when diagnostic activity is available.')}
      </div>
    `;
  }

  function renderTerminalLine(line) {
    if (line.type === 'command') return `<div class="mc-dev-terminal-response"><span class="mc-dev-terminal-prompt-text">maxsas@backend $</span> ${escapeHtml(line.text)}</div>`;
    return `<div class="mc-dev-terminal-response">${escapeHtml(line.text)}</div>`;
  }

  function renderTerminalPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Terminal requires admin access', 'Add the admin key in the sidebar to enable diagnostics commands. Type help to see available commands.');
    }

    return `
      <div class="mc-dev-terminal">
        <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="terminal" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Terminal Console</span></div><div class="mc-section-meta">Type help to see available commands</div></div>
        <div class="mc-dev-table-wrap" style="padding:14px;">
          <div class="mc-dev-terminal-output" id="mc-dev-terminal-output">${state.terminalLines.length ? state.terminalLines.map(renderTerminalLine).join('') : '<div class="mc-dev-terminal-response">Type help to see available commands.</div>'}</div>
          <form class="mc-dev-terminal-prompt" id="mc-dev-terminal-form"><span class="mc-dev-terminal-prompt-text">maxsas@backend $</span><input type="text" class="mc-dev-terminal-input" id="mc-dev-terminal-input" autocomplete="off" spellcheck="false" placeholder="Enter command..." value="${escapeHtml(state.inputValue || '')}" /></form>
        </div>
      </div>
    `;
  }

  function renderMetricChartCard(title, containerId) {
    return `<article class="mc-dev-chart-card"><div class="mc-dev-chart-title">${escapeHtml(title)}</div><div id="${containerId}" class="mc-dev-chart-container"></div></article>`;
  }

  function renderMetricsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('bar-chart-3', 'Metrics unavailable', 'Load metrics once the admin key is available.');
    }

    return `
      <div class="mc-dev-metrics-shell">
        <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="activity" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Metrics</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${['1h','6h','24h','7d'].map((range) => `<button type="button" class="mc-btn ${state.metricsRange === range ? 'mc-btn-primary' : 'mc-btn-secondary'}" data-range="${range}">${range}</button>`).join('')}</div></div>
        <div class="mc-dev-metrics-grid">
          ${renderMetricChartCard('API Requests / minute', CHART_IDS.requests)}
          ${renderMetricChartCard('Call Volume', CHART_IDS.calls)}
          ${renderMetricChartCard('Error Rate', CHART_IDS.errors)}
          ${renderMetricChartCard('Memory Usage Over Time', CHART_IDS.memory)}
        </div>
      </div>
    `;
  }

  function renderShell() {
    return `
      <div class="mc-module-wrap mc-dev-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        <section class="glass-card mc-dev-hero" id="mc-dev-hero">
          <div class="mc-dev-hero-copy">
            <span class="hero-pill">DEV</span>
            <div>
              <h1 class="mc-dev-hero-title">Dev Tools</h1>
              <p class="mc-dev-hero-subtitle">System diagnostics, logs, terminal, and live metrics</p>
            </div>
          </div>
          <div class="mc-dev-hero-actions">
            <div class="mc-dev-clock-shell">
              <div class="mc-dev-clock-label">LIVE CLOCK</div>
              <div class="mc-dev-clock" id="mc-dev-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-dev-refresh" id="mc-dev-refresh"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i><span>Refresh</span></button>
          </div>
        </section>

        <div class="mc-dev-tabs" role="tablist" aria-label="Dev Tools tabs">
          ${TAB_IDS.map((tab) => `<button type="button" class="mc-dev-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>`).join('')}
        </div>

        <section class="glass-card mc-dev-panel ${state.activeTab === 'health' ? 'active' : ''}" id="mc-dev-panel-health" data-panel="health"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'logs' ? 'active' : ''}" id="mc-dev-panel-logs" data-panel="logs"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'terminal' ? 'active' : ''}" id="mc-dev-panel-terminal" data-panel="terminal"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'metrics' ? 'active' : ''}" id="mc-dev-panel-metrics" data-panel="metrics"></section>
      </div>
    `;
  }

  function renderPanels() {
    const healthPanel = document.getElementById('mc-dev-panel-health');
    const logsPanel = document.getElementById('mc-dev-panel-logs');
    const terminalPanel = document.getElementById('mc-dev-panel-terminal');
    const metricsPanel = document.getElementById('mc-dev-panel-metrics');

    if (healthPanel) healthPanel.innerHTML = renderHealthPanel();
    if (logsPanel) logsPanel.innerHTML = renderLogsPanel();
    if (terminalPanel) terminalPanel.innerHTML = renderTerminalPanel();
    if (metricsPanel) metricsPanel.innerHTML = renderMetricsPanel();

    window.lucide?.createIcons?.();
    applyProgressWidths();
    bindPanelEvents();
    if (state.activeTab === 'metrics' && state.metrics) renderCharts();
    if (state.activeTab === 'logs') scrollLogsToBottom();
    if (state.activeTab === 'terminal') focusTerminalInput();
  }

  function applyProgressWidths() {
    const fills = Array.from(document.querySelectorAll('.mc-progress-fill[data-progress-value]'));
    if (!fills.length) return;
    fills.forEach((fill) => {
      const target = Number(fill.getAttribute('data-progress-value') || '0');
      fill.style.width = '0%';
      window.requestAnimationFrame(() => { fill.style.width = `${Math.max(0, Math.min(100, target))}%`; });
    });
  }

  function refreshPanelVisibility() {
    document.querySelectorAll('.mc-dev-panel').forEach((panel) => {
      const active = panel.dataset.panel === state.activeTab;
      panel.classList.remove('active');
      if (active) panel.classList.add('active');
    });

    document.querySelectorAll('.mc-dev-tab[data-tab]').forEach((tab) => {
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
    window.gsap.fromTo(panel, { opacity: 0, x: 24, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'power3.out' });
  }

  function animateIntro() {
    if (!window.gsap) return;
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try { state.gsapContext.revert(); } catch (error) { /* ignore */ }
    }

    const root = state.root || rootEl();
    if (!root) return;

    state.gsapContext = window.gsap.context(() => {
      const hero = document.getElementById('mc-dev-hero');
      const tabs = document.querySelector('.mc-dev-tabs');
      const panel = document.querySelector('.mc-dev-panel.active');
      const tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (hero) tl.fromTo(hero, { opacity: 0, y: -40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.65 }, 0);
      if (tabs) tl.fromTo(tabs, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, '<0.1');
      if (panel) tl.fromTo(panel, { opacity: 0, x: 24, scale: 0.98 }, { opacity: 1, x: 0, scale: 1, duration: 0.4 }, '<0.1');
      window.gsap.fromTo(Array.from(document.querySelectorAll('.mc-dev-summary-card, .mc-dev-card, .mc-dev-chart-card')), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out', delay: 0.08 });
    }, root);
  }

  function animateRefreshPulse() {
    const cards = Array.from(document.querySelectorAll('.mc-dev-summary-card, .mc-dev-card, .mc-dev-chart-card'));
    if (!cards.length) return;
    if (window.gsap) {
      window.gsap.to(cards, {
        scale: 1.015,
        boxShadow: '0 0 32px rgba(0, 212, 255, 0.2)',
        duration: 0.25,
        yoyo: true,
        repeat: 1,
        stagger: 0.03,
      });
      return;
    }
    cards.forEach((card) => {
      card.style.transition = 'transform 120ms ease';
      card.style.transform = 'translateY(-2px) scale(0.99)';
      window.setTimeout(() => { card.style.transform = ''; }, 140);
    });
  }

  function startClock() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    const tick = () => {
      const clock = document.getElementById('mc-dev-clock');
      if (clock) clock.textContent = formatClock();
    };
    tick();
    state.clockTimer = window.setInterval(tick, 1000);
  }

  function clearTimers() {
    if (state.clockTimer) window.clearInterval(state.clockTimer);
    if (state.metricsTimer) window.clearInterval(state.metricsTimer);
    if (state.refreshPulseTimer) window.clearInterval(state.refreshPulseTimer);
    state.clockTimer = null;
    state.metricsTimer = null;
    state.refreshPulseTimer = null;
  }

  function clearSse() {
    if (typeof state.sseUnsubscribe === 'function') {
      try { state.sseUnsubscribe(); } catch (error) { /* ignore */ }
    }
    state.sseUnsubscribe = null;
  }

  function destroyCharts() {
    state.chartIds.forEach((chartId) => {
      try { window.destroyChart?.(chartId); } catch (error) { /* ignore */ }
    });
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

  async function loadHealth() {
    if (!getAdminKey()) return null;
    if (window.MCApi?.getDevHealth) {
      try { return unwrap(await window.MCApi.getDevHealth()); } catch (error) { /* continue */ }
    }
    const payload = await requestFirstAvailable(['/dev-monitor/health']);
    return unwrap(payload);
  }

  async function loadLogs() {
    if (!getAdminKey()) return [];
    if (window.MCApi?.getLogs) {
      try {
        const payload = await window.MCApi.getLogs();
        const rows = safeArray(unwrap(payload));
        return rows.reverse();
      } catch (error) { /* continue */ }
    }
    const payload = await requestFirstAvailable(['/dev-monitor/logs?limit=100&level=info', '/dev-monitor/logs']);
    const rows = safeArray(unwrap(payload));
    return rows.length ? rows.reverse() : [];
  }

  async function loadCommands() {
    if (!getAdminKey()) return [];
    if (window.MCApi?.getDevCommands) {
      try { return safeArray(unwrap(await window.MCApi.getDevCommands())); } catch (error) { /* continue */ }
    }
    const payload = await requestFirstAvailable(['/dev-monitor/commands']);
    return safeArray(unwrap(payload));
  }

  async function loadMetrics(range = '1h') {
    if (!getAdminKey()) return null;
    if (window.MCApi?.getDevMetrics) {
      try { return unwrap(await window.MCApi.getDevMetrics(range)); } catch (error) { /* continue */ }
    }
    const payload = await requestFirstAvailable([`/dev-monitor/metrics?range=${encodeURIComponent(range)}`]);
    return unwrap(payload);
  }

  function useDemoHealth() {
    return {
      backend: { status: 'ok', message: 'Dev monitor healthy' },
      livekit: { status: 'ok', message: 'Streaming diagnostics active', roomCount: 12, participantCount: 31 },
      database: { status: 'warn', message: 'Latency elevated', latencyMs: 18, connectionPool: 22 },
      uptimeSec: 36420,
      system: { memoryUsage: { rss: 478412800, heapUsedMb: 174, heapTotalMb: 256 } },
      quickMetrics: { cpuUsagePercent: 42, memoryUsagePercent: 64, diskUsagePercent: 58, activeConnections: 14 },
    };
  }

  function useDemoMetrics() {
    return JSON.parse(JSON.stringify(DEMO_METRICS));
  }

  function loadFallbackState() {
    if (!getAdminKey()) {
      state.health = null;
      state.logs = [];
      state.commands = [];
      state.metrics = null;
      state.terminalLines = [];
      return;
    }
    state.health = state.health || useDemoHealth();
    state.logs = state.logs.length ? state.logs : DEMO_LOGS.map((row) => ({ ...row }));
    state.commands = state.commands.length ? state.commands : DEMO_COMMANDS.map((row) => ({ ...row }));
    state.metrics = state.metrics || useDemoMetrics();
  }

  async function loadAllData() {
    if (!getAdminKey()) {
      state.health = null;
      state.logs = [];
      state.commands = [];
      state.metrics = null;
      renderPanels();
      return;
    }

    const [healthResult, logsResult, commandsResult, metricsResult] = await Promise.allSettled([
      loadHealth(),
      loadLogs(),
      loadCommands(),
      loadMetrics(state.metricsRange),
    ]);

    state.health = healthResult.status === 'fulfilled' && healthResult.value ? healthResult.value : useDemoHealth();
    state.logs = logsResult.status === 'fulfilled' && logsResult.value && logsResult.value.length ? logsResult.value : DEMO_LOGS.map((row) => ({ ...row }));
    state.commands = commandsResult.status === 'fulfilled' && commandsResult.value && commandsResult.value.length ? commandsResult.value : DEMO_COMMANDS.map((row) => ({ ...row }));
    state.metrics = metricsResult.status === 'fulfilled' && metricsResult.value ? metricsResult.value : useDemoMetrics();

    renderPanels();
    if (state.activeTab === 'metrics') renderCharts();
  }

  function filteredLogs() {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    const activeFilter = String(state.logFilter || 'all').toUpperCase();
    if (activeFilter === 'ALL') return logs;
    return logs.filter((log) => normalizeLevel(log.level) === activeFilter);
  }

  function addLogEntry(log) {
    const normalized = {
      received_at: log.received_at || new Date().toISOString(),
      level: normalizeLevel(log.level || log.stage || 'info'),
      message: log.message || log.event_type || '(event)',
      event_type: log.event_type || log.eventType || null,
      call_id: log.call_id || log.callId || null,
      tenant_id: log.tenant_id || log.tenantId || null,
      source: log.source || 'sse',
      payload: log.payload || null,
    };

    state.logs.push(normalized);
    if (state.logs.length > 200) state.logs = state.logs.slice(-200);
    if (state.activeTab === 'logs') {
      renderPanels();
      animateNewLogLine();
      scrollLogsToBottom();
    }
  }

  function animateNewLogLine() {
    if (!window.gsap) return;
    const latest = document.querySelector('.mc-dev-log-line.mc-dev-log-line-latest');
    if (!latest) return;
    window.gsap.fromTo(latest, { opacity: 0, x: -26 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
  }

  function connectSse() {
    clearSse();
    const adminKey = getAdminKey();
    if (!adminKey) return;

    const unsubscribers = [];
    const streamUrl = `${window.location.origin}/api/admin/live-events/stream?adminKey=${encodeURIComponent(adminKey)}`;

    if (window.MCState?.subscribe) {
      const unsub = window.MCState.subscribe('devTools', (payload) => {
        if (!payload) return;
        const text = String(payload.message || payload.eventType || payload.stage || '').toLowerCase();
        if (text.includes('log') || text.includes('health') || text.includes('metric') || text.includes('command')) {
          addLogEntry({
            received_at: payload.occurredAt || payload.received_at || new Date().toISOString(),
            level: payload.level || payload.stage || 'info',
            message: payload.message || payload.eventType || '(event)',
            event_type: payload.eventType || payload.stage || null,
            call_id: payload.callId || payload.call_id || null,
            tenant_id: payload.tenantId || payload.tenant_id || null,
            source: 'mc-state',
            payload,
          });
        }
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    }

    if (window.MCSSE?.subscribe) {
      const unsub = window.MCSSE.subscribe(streamUrl, {
        eventName: 'admin_live_event',
        onMessage: (event) => {
          try {
            const payload = JSON.parse(event.data);
            const text = String(payload.message || payload.eventType || payload.stage || '').toLowerCase();
            if (text.includes('log') || text.includes('health') || text.includes('metric') || text.includes('command')) {
              addLogEntry({
                received_at: payload.occurredAt || payload.received_at || new Date().toISOString(),
                level: payload.level || payload.stage || 'info',
                message: payload.message || payload.eventType || '(event)',
                event_type: payload.eventType || payload.stage || null,
                call_id: payload.callId || payload.call_id || null,
                tenant_id: payload.tenantId || payload.tenant_id || null,
                source: 'sse',
                payload,
              });
            }
          } catch (error) {
            // ignore malformed live events
          }
        },
      });
      if (typeof unsub === 'function') unsubscribers.push(unsub);
    } else if (window.EventSource) {
      const source = new EventSource(streamUrl);
      source.addEventListener('admin_live_event', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const text = String(payload.message || payload.eventType || payload.stage || '').toLowerCase();
          if (text.includes('log') || text.includes('health') || text.includes('metric') || text.includes('command')) {
            addLogEntry({
              received_at: payload.occurredAt || payload.received_at || new Date().toISOString(),
              level: payload.level || payload.stage || 'info',
              message: payload.message || payload.eventType || '(event)',
              event_type: payload.eventType || payload.stage || null,
              call_id: payload.callId || payload.call_id || null,
              tenant_id: payload.tenantId || payload.tenant_id || null,
              source: 'eventsource',
              payload,
            });
          }
        } catch (error) {
          // ignore malformed live events
        }
      });
      unsubscribers.push(() => { try { source.close(); } catch (error) { /* ignore */ } });
    }

    state.sseUnsubscribe = () => {
      unsubscribers.forEach((unsubscribe) => {
        try { unsubscribe?.(); } catch (error) { /* ignore */ }
      });
    };
  }

  function appendTerminalLine(line) {
    state.terminalLines.push(line);
    if (state.terminalLines.length > 200) state.terminalLines = state.terminalLines.slice(-200);
    if (state.activeTab === 'terminal') {
      const output = document.getElementById('mc-dev-terminal-output');
      if (output) {
        output.innerHTML = state.terminalLines.map(renderTerminalLine).join('');
        window.requestAnimationFrame(() => {
          if (output.parentElement) output.parentElement.scrollTop = output.parentElement.scrollHeight;
        });
      }
    }
  }

  function scrollLogsToBottom() {
    const viewer = document.getElementById('mc-dev-log-viewer');
    if (viewer) viewer.scrollTop = viewer.scrollHeight;
  }

  function focusTerminalInput() {
    const input = document.getElementById('mc-dev-terminal-input');
    if (input) input.focus();
  }

  function bindShellEvents() {
    const refreshButton = document.getElementById('mc-dev-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        hydrate({ userInitiated: true });
      });
    }

    document.querySelectorAll('.mc-dev-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });
  }

  function bindPanelEvents() {
    const clearLogsButton = document.getElementById('mc-dev-clear-logs');
    if (clearLogsButton) {
      clearLogsButton.addEventListener('click', () => {
        state.logs = [];
        renderPanels();
      });
    }

    document.querySelectorAll('[data-log-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.logFilter = button.dataset.logFilter || 'all';
        renderPanels();
        if (state.activeTab === 'logs') scrollLogsToBottom();
      });
    });

    document.querySelectorAll('.mc-dev-log-line[data-log-index]').forEach((line) => {
      line.addEventListener('click', () => {
        const index = Number(line.dataset.logIndex);
        const log = filteredLogs()[index];
        if (!log || !window.MCModal?.showModal) return;
        window.MCModal.showModal({
          title: `Log Details — ${normalizeLevel(log.level)}`,
          body: `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div><div class="mc-input-label">Timestamp</div><div class="mc-mono">${escapeHtml(formatTimestamp(log.received_at))}</div></div>
              <div><div class="mc-input-label">Level</div><div class="mc-dev-pill mc-dev-pill-${levelTone(log.level)}" style="display:inline-flex;">${normalizeLevel(log.level)}</div></div>
              <div><div class="mc-input-label">Message</div><div style="white-space:pre-wrap;">${escapeHtml(log.message || '')}</div></div>
              <div><div class="mc-input-label">Source</div><div class="mc-mono">${escapeHtml(log.source || 'n/a')}</div></div>
              ${log.payload ? `<div><div class="mc-input-label">Payload</div><pre style="white-space:pre-wrap;overflow:auto;background:rgba(0,0,0,0.18);padding:12px;border-radius:12px;border:1px solid var(--mc-border-soft);">${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre></div>` : ''}
            </div>
          `,
          buttons: [{ label: 'Close', type: 'secondary' }],
        });
      });
    });

    const terminalForm = document.getElementById('mc-dev-terminal-form');
    const terminalInput = document.getElementById('mc-dev-terminal-input');
    if (terminalForm && terminalInput) {
      terminalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const command = String(terminalInput.value || '').trim();
        if (!command) return;
        terminalInput.value = '';
        state.inputValue = '';
        appendTerminalLine({ type: 'command', text: command });
        try {
          const payload = window.MCApi?.runDevCommand
            ? await window.MCApi.runDevCommand(command)
            : await requestJson('/dev-monitor/command', { method: 'POST', body: { cmd: command } });
          const result = unwrap(payload) || {};
          appendTerminalLine({ type: 'response', text: result.output || result.message || 'Command completed.' });
          if (window.MCToast) window.MCToast.showToastSuccess(result.message || 'Command completed.');
        } catch (error) {
          appendTerminalLine({ type: 'response', text: error?.message || 'Command failed.' });
          if (window.MCToast) window.MCToast.showToastError(error?.message || 'Command failed');
        }
      });

      terminalInput.addEventListener('keydown', () => {
        state.inputValue = terminalInput.value || '';
      });
    }

    document.querySelectorAll('[data-range]').forEach((button) => {
      button.addEventListener('click', async () => {
        const range = button.dataset.range || '1h';
        state.metricsRange = range;
        await refreshMetrics({ userInitiated: true });
      });
    });
  }

  function refreshClock() {
    const clock = document.getElementById('mc-dev-clock');
    if (clock) clock.textContent = formatClock();
  }

  function renderMetricCard(label, value, percent) {
    const pct = Number(percent) || 0;
    const tone = metricTone(pct);
    return `
      <article class="mc-dev-health-metric">
        <div class="mc-dev-health-metric-top">
          <div style="font-size:12px;color:var(--mc-muted);text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(label)}</div>
          <div style="font-family:var(--mc-font-mono);font-size:14px;color:var(--mc-text);">${escapeHtml(value)}</div>
        </div>
        <div class="mc-dev-progress"><span class="mc-progress-fill ${tone}" data-progress-value="${Math.max(0, Math.min(100, pct))}"></span></div>
      </article>
    `;
  }

  function renderHealthPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Add admin key to load diagnostics', 'Dev Tools requires the admin key before health, logs, terminal, and metrics can be loaded.');
    }

    if (!state.health) {
      return renderPanelEmpty('shield-alert', 'Health data unavailable', 'Refresh once the backend becomes reachable to load backend, LiveKit, and database checks.');
    }

    const health = state.health;
    const memoryUsage = health.system?.memoryUsage || {};
    return `
      <div class="mc-dev-panel-wrap">
        <div class="mc-dev-summary-row">
          <article class="mc-dev-summary-card"><div class="mc-dev-summary-label">Backend</div><div class="mc-dev-summary-value">${escapeHtml(String(health.backend?.status || '—').toUpperCase())}</div><div class="mc-dev-summary-sub">${escapeHtml(health.backend?.message || 'Admin health snapshot')}</div></article>
          <article class="mc-dev-summary-card"><div class="mc-dev-summary-label">LiveKit</div><div class="mc-dev-summary-value">${escapeHtml(String(health.livekit?.status || '—').toUpperCase())}</div><div class="mc-dev-summary-sub">${escapeHtml(health.livekit?.message || 'Voice transport')}</div></article>
          <article class="mc-dev-summary-card"><div class="mc-dev-summary-label">Database</div><div class="mc-dev-summary-value">${escapeHtml(String(health.database?.status || '—').toUpperCase())}</div><div class="mc-dev-summary-sub">${escapeHtml(health.database?.message || 'Storage checks')}</div></article>
          <article class="mc-dev-summary-card"><div class="mc-dev-summary-label">SSE</div><div class="mc-dev-summary-value">${escapeHtml(String(window.MCState?.systemHealth?.sse || 'DISCONNECTED').toUpperCase())}</div><div class="mc-dev-summary-sub">Live events stream</div></article>
        </div>
        <div class="mc-dev-health-grid">
          <article class="mc-dev-card"><div class="mc-dev-card-header"><div class="mc-dev-card-title"><i data-lucide="server" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Backend</span></div>${renderStatusPill(health.backend?.status || 'warn')}</div><div style="display:flex;flex-direction:column;gap:6px;color:var(--mc-muted);font-size:12px;"><div>Uptime: ${escapeHtml(Math.floor(health.uptimeSec || 0))}s</div><div>Memory: ${escapeHtml(formatBytes(memoryUsage.rss || 0))} RSS</div><div>Heap: ${escapeHtml(formatBytes((memoryUsage.heapUsedMb || 0) * 1024 * 1024))} used / ${escapeHtml(formatBytes((memoryUsage.heapTotalMb || 0) * 1024 * 1024))}</div></div></article>
          <article class="mc-dev-card"><div class="mc-dev-card-header"><div class="mc-dev-card-title"><i data-lucide="radio" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>LiveKit</span></div>${renderStatusPill(health.livekit?.status || 'warn')}</div><div style="display:flex;flex-direction:column;gap:6px;color:var(--mc-muted);font-size:12px;"><div>Rooms: ${escapeHtml(health.livekit?.roomCount ?? '—')}</div><div>Participants: ${escapeHtml(health.livekit?.participantCount ?? '—')}</div><div>Probe: ${escapeHtml(health.livekit?.message || 'n/a')}</div></div></article>
          <article class="mc-dev-card"><div class="mc-dev-card-header"><div class="mc-dev-card-title"><i data-lucide="database" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Database</span></div>${renderStatusPill(health.database?.status || 'warn')}</div><div style="display:flex;flex-direction:column;gap:6px;color:var(--mc-muted);font-size:12px;"><div>Latency: ${escapeHtml(health.database?.latencyMs ?? '—')} ms</div><div>Connections: ${escapeHtml(health.database?.connectionPool ?? '—')}</div><div>Status: ${escapeHtml(health.database?.status || 'warn')}</div></div></article>
          <article class="mc-dev-card"><div class="mc-dev-card-header"><div class="mc-dev-card-title"><i data-lucide="memory-stick" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Resource Load</span></div><span class="mc-dev-pill mc-dev-pill-neutral">LIVE</span></div><div style="display:flex;flex-direction:column;gap:12px;">${renderMetricCard('CPU Usage', formatPercent(health.quickMetrics?.cpuUsagePercent || 0), health.quickMetrics?.cpuUsagePercent || 0)}${renderMetricCard('Memory Usage', formatPercent(health.quickMetrics?.memoryUsagePercent || 0), health.quickMetrics?.memoryUsagePercent || 0)}${renderMetricCard('Disk Usage', formatPercent(health.quickMetrics?.diskUsagePercent || 0), health.quickMetrics?.diskUsagePercent || 0)}${renderMetricCard('Active Connections', String(health.quickMetrics?.activeConnections || 0), health.quickMetrics?.activeConnections || 0)}</div></article>
        </div>
      </div>
    `;
  }

  function renderLogsPanel() {
    const logs = filteredLogs();
    return `
      <div class="mc-dev-panel-wrap">
        <div class="mc-dev-log-toolbar">
          <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="terminal-square" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Logs</span></div><div class="mc-section-meta">Live diagnostic streaming</div></div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><button type="button" class="mc-btn mc-btn-secondary" id="mc-dev-clear-logs">Clear</button></div>
        </div>
        ${renderLogFilters()}
        ${logs.length ? `<div class="mc-dev-log-stream" id="mc-dev-log-viewer">${logs.map((log, index) => `<div class="mc-dev-log-line ${index === logs.length - 1 ? 'mc-dev-log-line-latest' : ''}" data-log-index="${index}"><div class="mc-dev-log-time">${escapeHtml(formatTimestamp(log.received_at || log.receivedAt || log.timestamp))}</div><div class="mc-dev-log-level ${escapeHtml(normalizeLevel(log.level))}">${escapeHtml(normalizeLevel(log.level))}</div><div class="mc-dev-log-msg">${escapeHtml(log.message || log.event_type || '(no message)')}</div><div class="mc-dev-log-meta">${log.call_id ? `<span class="mc-dev-pill mc-dev-pill-neutral">Call ${escapeHtml(log.call_id)}</span>` : ''}${log.tenant_id ? `<span class="mc-dev-pill mc-dev-pill-neutral">Tenant ${escapeHtml(log.tenant_id)}</span>` : ''}</div></div>`).join('')}</div>` : renderPanelEmpty('file-text', 'No logs available', 'Logs will stream here when diagnostic activity is available.')}
      </div>
    `;
  }

  function renderTerminalPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('lock', 'Terminal requires admin access', 'Add the admin key in the sidebar to enable diagnostics commands. Type help to see available commands.');
    }

    return `
      <div class="mc-dev-terminal">
        <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="terminal" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Terminal Console</span></div><div class="mc-section-meta">Type help to see available commands</div></div>
        <div class="mc-dev-table-wrap" style="padding:14px;">
          <div class="mc-dev-terminal-output" id="mc-dev-terminal-output">${state.terminalLines.length ? state.terminalLines.map(renderTerminalLine).join('') : '<div class="mc-dev-terminal-response">Type help to see available commands.</div>'}</div>
          <form class="mc-dev-terminal-prompt" id="mc-dev-terminal-form"><span class="mc-dev-terminal-prompt-text">maxsas@backend $</span><input type="text" class="mc-dev-terminal-input" id="mc-dev-terminal-input" autocomplete="off" spellcheck="false" placeholder="Enter command..." value="${escapeHtml(state.inputValue || '')}" /></form>
        </div>
      </div>
    `;
  }

  function renderMetricChartCard(title, containerId) {
    return `<article class="mc-dev-chart-card"><div class="mc-dev-chart-title">${escapeHtml(title)}</div><div id="${containerId}" class="mc-dev-chart-container"></div></article>`;
  }

  function renderMetricsPanel() {
    if (!getAdminKey()) {
      return renderPanelEmpty('bar-chart-3', 'Metrics unavailable', 'Load metrics once the admin key is available.');
    }

    return `
      <div class="mc-dev-metrics-shell">
        <div class="mc-card-header"><div class="mc-card-title"><i data-lucide="activity" style="width:16px;height:16px;color:var(--mc-cyan);"></i><span>Metrics</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${['1h','6h','24h','7d'].map((range) => `<button type="button" class="mc-btn ${state.metricsRange === range ? 'mc-btn-primary' : 'mc-btn-secondary'}" data-range="${range}">${range}</button>`).join('')}</div></div>
        <div class="mc-dev-metrics-grid">
          ${renderMetricChartCard('API Requests / minute', CHART_IDS.requests)}
          ${renderMetricChartCard('Call Volume', CHART_IDS.calls)}
          ${renderMetricChartCard('Error Rate', CHART_IDS.errors)}
          ${renderMetricChartCard('Memory Usage Over Time', CHART_IDS.memory)}
        </div>
      </div>
    `;
  }

  function renderShell() {
    return `
      <div class="mc-module-wrap mc-dev-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        <section class="glass-card mc-dev-hero" id="mc-dev-hero">
          <div class="mc-dev-hero-copy">
            <span class="hero-pill">DEV</span>
            <div>
              <h1 class="mc-dev-hero-title">Dev Tools</h1>
              <p class="mc-dev-hero-subtitle">System diagnostics, logs, terminal, and live metrics</p>
            </div>
          </div>
          <div class="mc-dev-hero-actions">
            <div class="mc-dev-clock-shell">
              <div class="mc-dev-clock-label">LIVE CLOCK</div>
              <div class="mc-dev-clock" id="mc-dev-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-dev-refresh" id="mc-dev-refresh"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i><span>Refresh</span></button>
          </div>
        </section>

        <div class="mc-dev-tabs" role="tablist" aria-label="Dev Tools tabs">
          ${TAB_IDS.map((tab) => `<button type="button" class="mc-dev-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.activeTab === tab ? 'true' : 'false'}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>`).join('')}
        </div>

        <section class="glass-card mc-dev-panel ${state.activeTab === 'health' ? 'active' : ''}" id="mc-dev-panel-health" data-panel="health"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'logs' ? 'active' : ''}" id="mc-dev-panel-logs" data-panel="logs"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'terminal' ? 'active' : ''}" id="mc-dev-panel-terminal" data-panel="terminal"></section>
        <section class="glass-card mc-dev-panel ${state.activeTab === 'metrics' ? 'active' : ''}" id="mc-dev-panel-metrics" data-panel="metrics"></section>
      </div>
    `;
  }

  function renderPanels() {
    const healthPanel = document.getElementById('mc-dev-panel-health');
    const logsPanel = document.getElementById('mc-dev-panel-logs');
    const terminalPanel = document.getElementById('mc-dev-panel-terminal');
    const metricsPanel = document.getElementById('mc-dev-panel-metrics');

    if (healthPanel) healthPanel.innerHTML = renderHealthPanel();
    if (logsPanel) logsPanel.innerHTML = renderLogsPanel();
    if (terminalPanel) terminalPanel.innerHTML = renderTerminalPanel();
    if (metricsPanel) metricsPanel.innerHTML = renderMetricsPanel();

    window.lucide?.createIcons?.();
    applyProgressWidths();
    bindPanelEvents();
    if (state.activeTab === 'metrics' && state.metrics) renderCharts();
    if (state.activeTab === 'logs') scrollLogsToBottom();
    if (state.activeTab === 'terminal') focusTerminalInput();
  }

  function renderCharts() {
    destroyCharts();
    if (!state.metrics) return;

    const metrics = state.metrics;
    const cyan = 'rgba(0, 212, 255, 0.9)';
    const cyanFill = 'rgba(0, 212, 255, 0.18)';
    const violet = 'rgba(139, 92, 246, 0.9)';
    const amber = 'rgba(245, 158, 11, 0.9)';
    const rose = 'rgba(244, 63, 94, 0.9)';

    try {
      window.createChart?.(CHART_IDS.requests, 'line', { labels: metrics.apiRequestsPerMinute?.labels || [], datasets: [{ label: 'Requests', data: metrics.apiRequestsPerMinute?.values || [], borderColor: cyan, backgroundColor: cyanFill, fill: true, tension: 0.35, pointRadius: 0 }] }, { plugins: { legend: { display: false } } });
    } catch (error) { /* ignore */ }

    try {
      window.createChart?.(CHART_IDS.calls, 'bar', { labels: metrics.callVolume?.labels || [], datasets: [{ label: 'Calls', data: metrics.callVolume?.values || [], backgroundColor: violet, borderRadius: 8 }] }, { plugins: { legend: { display: false } } });
    } catch (error) { /* ignore */ }

    try {
      window.createChart?.(CHART_IDS.errors, 'line', {
        labels: metrics.errorRate?.labels || [],
        datasets: [
          { label: 'Error Rate', data: metrics.errorRate?.values || [], borderColor: rose, backgroundColor: 'rgba(244, 63, 94, 0.12)', fill: true, tension: 0.3, pointRadius: 0 },
          { label: 'Threshold', data: Array.from({ length: (metrics.errorRate?.labels || []).length }, () => metrics.errorRate?.threshold || 5), borderColor: amber, borderDash: [6, 6], pointRadius: 0, fill: false },
        ],
      }, { plugins: { legend: { display: false } } });
    } catch (error) { /* ignore */ }

    try {
      window.createChart?.(CHART_IDS.memory, 'line', { labels: metrics.memoryUsageOverTime?.labels || [], datasets: [{ label: 'Memory', data: metrics.memoryUsageOverTime?.values || [], borderColor: cyan, backgroundColor: cyanFill, fill: true, tension: 0.35, pointRadius: 0 }] }, { plugins: { legend: { display: false } } });
    } catch (error) { /* ignore */ }

    if (window.gsap) {
      window.gsap.fromTo(Array.from(document.querySelectorAll('.mc-dev-chart-card')), { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.08, ease: 'power2.out' });
    }
  }

  function applyProgressWidths() {
    const fills = Array.from(document.querySelectorAll('.mc-progress-fill[data-progress-value]'));
    if (!fills.length) return;
    fills.forEach((fill) => {
      const target = Number(fill.getAttribute('data-progress-value') || '0');
      fill.style.width = '0%';
      window.requestAnimationFrame(() => { fill.style.width = `${Math.max(0, Math.min(100, target))}%`; });
    });
  }

  function animateNewLogLine() {
    if (!window.gsap) return;
    const latest = document.querySelector('.mc-dev-log-line.mc-dev-log-line-latest');
    if (!latest) return;
    window.gsap.fromTo(latest, { opacity: 0, x: -26 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' });
  }

  function refreshMetrics({ userInitiated = false } = {}) {
    if (!getAdminKey()) return Promise.resolve();
    return loadMetrics(state.metricsRange)
      .then((payload) => {
        state.metrics = payload || useDemoMetrics();
        if (state.activeTab === 'metrics') {
          renderPanels();
          renderCharts();
        }
        if (userInitiated && window.MCToast) window.MCToast.showToastSuccess('Metrics refreshed.');
      })
      .catch((error) => {
        if (userInitiated && window.MCToast) window.MCToast.showToastError(error?.message || 'Metrics refresh failed');
      });
  }

  function startTimers() {
    clearTimers();
    refreshClock();
    state.clockTimer = window.setInterval(refreshClock, 1000);
    state.metricsTimer = window.setInterval(() => { refreshMetrics({ userInitiated: false }).catch(() => {}); }, 60000);
    state.refreshPulseTimer = window.setInterval(() => {
      if (state.activeTab === 'health' || state.activeTab === 'metrics') animateRefreshPulse();
    }, 120000);
  }

  function loadFallbackState() {
    if (!getAdminKey()) {
      state.health = null;
      state.logs = [];
      state.commands = [];
      state.metrics = null;
      state.terminalLines = [];
      return;
    }
    state.health = state.health || useDemoHealth();
    state.logs = state.logs.length ? state.logs : DEMO_LOGS.map((row) => ({ ...row }));
    state.commands = state.commands.length ? state.commands : DEMO_COMMANDS.map((row) => ({ ...row }));
    state.metrics = state.metrics || useDemoMetrics();
  }

  function hydrate() {
    if (!state.mounted) return;
    state.hydrateSeq += 1;
    const seq = state.hydrateSeq;

    if (getAdminKey()) {
      loadFallbackState();
      renderPanels();
      if (state.activeTab === 'metrics') renderCharts();
    }

    startTimers();
    connectSse();
    loadAllData().then(() => {
      if (seq !== state.hydrateSeq) return;
      refreshPanelVisibility();
    }).catch(() => {
      if (seq !== state.hydrateSeq) return;
      loadFallbackState();
      renderPanels();
      if (state.activeTab === 'metrics') renderCharts();
    });
  }

  function bindPanelEvents() {
    const clearLogsButton = document.getElementById('mc-dev-clear-logs');
    if (clearLogsButton) {
      clearLogsButton.addEventListener('click', () => {
        state.logs = [];
        renderPanels();
      });
    }

    document.querySelectorAll('[data-log-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.logFilter = button.dataset.logFilter || 'all';
        renderPanels();
        if (state.activeTab === 'logs') scrollLogsToBottom();
      });
    });

    document.querySelectorAll('.mc-dev-log-line[data-log-index]').forEach((line) => {
      line.addEventListener('click', () => {
        const index = Number(line.dataset.logIndex);
        const log = filteredLogs()[index];
        if (!log || !window.MCModal?.showModal) return;
        window.MCModal.showModal({
          title: `Log Details — ${normalizeLevel(log.level)}`,
          body: `
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div><div class="mc-input-label">Timestamp</div><div class="mc-mono">${escapeHtml(formatTimestamp(log.received_at))}</div></div>
              <div><div class="mc-input-label">Level</div><div class="mc-dev-pill mc-dev-pill-${levelTone(log.level)}" style="display:inline-flex;">${normalizeLevel(log.level)}</div></div>
              <div><div class="mc-input-label">Message</div><div style="white-space:pre-wrap;">${escapeHtml(log.message || '')}</div></div>
              <div><div class="mc-input-label">Source</div><div class="mc-mono">${escapeHtml(log.source || 'n/a')}</div></div>
              ${log.payload ? `<div><div class="mc-input-label">Payload</div><pre style="white-space:pre-wrap;overflow:auto;background:rgba(0,0,0,0.18);padding:12px;border-radius:12px;border:1px solid var(--mc-border-soft);">${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre></div>` : ''}
            </div>
          `,
          buttons: [{ label: 'Close', type: 'secondary' }],
        });
      });
    });

    const terminalForm = document.getElementById('mc-dev-terminal-form');
    const terminalInput = document.getElementById('mc-dev-terminal-input');
    if (terminalForm && terminalInput) {
      terminalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const command = String(terminalInput.value || '').trim();
        if (!command) return;
        terminalInput.value = '';
        state.inputValue = '';
        appendTerminalLine({ type: 'command', text: command });
        try {
          const payload = window.MCApi?.runDevCommand
            ? await window.MCApi.runDevCommand(command)
            : await requestJson('/dev-monitor/command', { method: 'POST', body: { cmd: command } });
          const result = unwrap(payload) || {};
          appendTerminalLine({ type: 'response', text: result.output || result.message || 'Command completed.' });
          if (window.MCToast) window.MCToast.showToastSuccess(result.message || 'Command completed.');
        } catch (error) {
          appendTerminalLine({ type: 'response', text: error?.message || 'Command failed.' });
          if (window.MCToast) window.MCToast.showToastError(error?.message || 'Command failed');
        }
      });

      terminalInput.addEventListener('keydown', () => {
        state.inputValue = terminalInput.value || '';
      });
    }

    document.querySelectorAll('[data-range]').forEach((button) => {
      button.addEventListener('click', async () => {
        const range = button.dataset.range || '1h';
        state.metricsRange = range;
        await refreshMetrics({ userInitiated: true });
      });
    });
  }

  function bindShellEvents() {
    const refreshButton = document.getElementById('mc-dev-refresh');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        animateRefreshPulse();
        hydrate();
      });
    }

    document.querySelectorAll('.mc-dev-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });
  }

  function setActiveTab(tab) {
    if (!TAB_IDS.includes(tab)) return;
    state.activeTab = tab;
    refreshPanelVisibility();
    renderPanels();
    animateActivePanel(`mc-dev-panel-${tab}`);
  }

  function render() {
    injectStyles();
    state.root = rootEl();
    if (!state.root) return;
    state.mounted = true;
    state.root.innerHTML = renderShell();
    bindShellEvents();
    refreshPanelVisibility();
    animateIntro();
    hydrate();
  }

  function destroy() {
    state.mounted = false;
    clearTimers();
    clearSse();
    destroyCharts();
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try { state.gsapContext.revert(); } catch (error) { /* ignore */ }
    }
    state.gsapContext = null;
    state.root = null;
    state.health = null;
    state.logs = [];
    state.commands = [];
    state.terminalLines = [];
    state.metrics = null;
    state.inputValue = '';
  }

  function filteredLogs() {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    if (state.logFilter === 'all') return logs;
    return logs.filter((log) => normalizeLevel(log.level) === state.logFilter.toUpperCase());
  }

  return { render, hydrate, destroy };
})();