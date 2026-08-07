window.MCModVoiceOps = (function () {
  const ACTIVE_ROW_STATES = new Set(['connecting', 'live', 'on-hold', 'active', 'ringing']);
  const QUEUED_ROW_STATES = new Set(['queued', 'queue', 'waiting', 'pending']);
  const COMPLETED_ROW_STATES = new Set(['completed', 'complete', 'done', 'finished', 'ended']);

  const state = {
    root: null,
    mounted: false,
    hydrateSeq: 0,
    refreshInFlight: false,
    liveClockTimer: null,
    liveDurationTimer: null,
    autoRefreshTimer: null,
    sseUnsubscribe: null,
    sseAvailable: false,
    sseConnected: false,
    subs: [],
    gsapContext: null,
    tableHandlers: [],
    clockTickCount: 0,
    allCalls: [],
    activeCalls: [],
    completedCalls: [],
    agentSummary: { activeAgents: 0, idleAgents: 0, queueCount: 0 },
    qualityMetrics: null,
    visibleHistoryCount: 20,
    activeCallIds: new Set(),
    callIndex: new Map(),
  };

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

  function toArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  function unwrap(payload) {
    if (!payload) return null;
    if (Array.isArray(payload)) return payload;
    if (payload.success === false) return null;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
  }

  function shortId(value) {
    const text = String(value ?? '');
    if (!text) return '—';
    if (text.length <= 12) return text;
    return `${text.slice(0, 7)}…${text.slice(-4)}`;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN').format(Math.round(number));
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(number);
  }

  function formatTime(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatClock(date = new Date()) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '—';
    const total = Math.round(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatDateTime(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusTone(status) {
    const value = String(status || '').toLowerCase();
    if (value.includes('live') || value.includes('active')) return 'live';
    if (value.includes('connect') || value.includes('hold') || value.includes('queue') || value.includes('wait') || value.includes('ring')) return 'connecting';
    if (value.includes('fail') || value.includes('error') || value.includes('blocked')) return 'failed';
    if (value.includes('complete') || value.includes('end') || value.includes('done')) return 'ended';
    return 'connecting';
  }

  function callTone(call) {
    return statusTone(call.status || call.outcome || 'connecting');
  }

  function isLiveCall(call) {
    const status = String(call.status || '').toLowerCase();
    return ACTIVE_ROW_STATES.has(status) || status.includes('live') || status.includes('active');
  }

  function isCompletedCall(call) {
    const status = String(call.status || '').toLowerCase();
    return COMPLETED_ROW_STATES.has(status) || status === 'completed';
  }

  function isQueuedCall(call) {
    const status = String(call.status || '').toLowerCase();
    return QUEUED_ROW_STATES.has(status);
  }

  function normalizeCall(raw) {
    const call = raw && typeof raw === 'object' ? raw : {};
    const createdAt = call.created_at || call.createdAt || call.initiated_at || call.initiatedAt || call.updated_at || call.updatedAt || Date.now();
    const durationSec = Number(call.duration_s ?? call.durationSec ?? call.duration ?? 0);
    const agent = call.agent_name || call.agentName || call.backend_to_livekit_dispatch?.agent_name || call.backend_to_livekit_dispatch?.agentName || '—';
    const tenant = call.tenant_id || call.tenantId || '—';
    const caller = call.phone_number || call.phoneNumber || '—';
    const cost = call.cost_paise ?? call.cost ?? call.amount ?? call.billing_amount ?? call.billingAmount ?? null;
    const transcriptTurns = Array.isArray(call.transcript_turns) ? call.transcript_turns : Array.isArray(call.transcriptTurns) ? call.transcriptTurns : [];

    return {
      ...call,
      id: String(call.id || call.call_id || call.callId || ''),
      callId: String(call.id || call.call_id || call.callId || ''),
      rowKey: String(call.id || call.call_id || call.callId || ''),
      shortId: shortId(call.id || call.call_id || call.callId || ''),
      tenant,
      caller,
      agent,
      status: String(call.status || call.outcome || 'unknown').toLowerCase(),
      statusLabel: String(call.status || call.outcome || 'unknown'),
      statusTone: callTone(call),
      durationSec: Number.isFinite(durationSec) ? durationSec : 0,
      liveDuration: formatDuration(durationSec || 0),
      createdAt,
      createdLabel: formatDateTime(createdAt),
      outcome: String(call.outcome || call.call_outcome || call.callOutcome || call.status || 'unknown'),
      costValue: cost,
      costDisplay: Number.isFinite(Number(cost)) ? formatCurrency(Number(cost) / (String(cost).includes('.') ? 1 : 100)) : '—',
      transcriptTurns,
      transcriptSnippet: transcriptTurns.slice(0, 4),
      isLive: isLiveCall(call),
      isCompleted: isCompletedCall(call),
      isQueued: isQueuedCall(call),
    };
  }

  function normalizeAgent(raw) {
    const agent = raw && typeof raw === 'object' ? raw : {};
    const status = String(agent.status || agent.state || agent.availability || agent.connectionStatus || 'idle').toLowerCase();
    const activeCalls = Number(agent.activeCalls ?? agent.active_calls ?? agent.callsInProgress ?? 0);
    const queueDepth = Number(agent.queueDepth ?? agent.queue_depth ?? agent.callsQueued ?? 0);
    return {
      id: String(agent.id || agent.agentId || agent.name || agent.agent_name || ''),
      name: String(agent.name || agent.agentName || agent.agent_name || agent.id || 'agent'),
      status,
      activeCalls: Number.isFinite(activeCalls) ? activeCalls : 0,
      queueDepth: Number.isFinite(queueDepth) ? queueDepth : 0,
      statusTone: status.includes('busy') || status.includes('active') || activeCalls > 0 ? 'busy' : status.includes('offline') ? 'offline' : 'online',
    };
  }

  function formatHeaderClock() {
    return formatClock(new Date());
  }

  function getLiveElapsedSeconds(call) {
    const started = new Date(call.createdAt || call.created_at || Date.now()).getTime();
    if (!Number.isFinite(started)) return call.durationSec || 0;
    return Math.max(0, (Date.now() - started) / 1000 + (call.durationSec || 0));
  }

  function renderHero(activeCount = 0) {
    return `
      <section class="glass-card mc-cc-hero mc-voice-section animate-slide-down" id="mc-voice-hero">
        <div class="mc-cc-hero-main">
          <div class="mc-cc-hero-copy">
            <span class="hero-pill" id="mc-voice-live-pill">${formatNumber(activeCount)} LIVE</span>
            <div class="mc-cc-hero-title-wrap">
              <h1 class="mc-cc-title">Voice Operations</h1>
              <p class="mc-cc-subtitle hero-subtitle">Monitor and manage voice sessions in realtime</p>
            </div>
            <div class="hero-glow-line"></div>
          </div>

          <div class="mc-cc-hero-actions">
            <div class="mc-cc-clock-shell">
              <div class="mc-cc-clock-label">LIVE CLOCK</div>
              <div class="mc-cc-clock hero-clock" id="mc-voice-clock">--:--:-- --</div>
            </div>
            <button type="button" class="mc-btn mc-btn-primary" id="mc-voice-refresh">
              <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </section>
    `;
  }

  function renderAgentCards(agentSummary, loading) {
    const cards = [
      {
        label: 'Active Agents',
        value: loading ? '—' : agentSummary.activeAgents,
        icon: 'bot',
        colorVar: 'var(--mc-cyan)',
      },
      {
        label: 'Idle Agents',
        value: loading ? '—' : agentSummary.idleAgents,
        icon: 'users',
        colorVar: 'var(--mc-emerald)',
      },
      {
        label: 'Calls in Queue',
        value: loading ? '—' : agentSummary.queueCount,
        icon: 'phone-forwarded',
        colorVar: 'var(--mc-amber)',
      },
    ];

    return cards.map((card) => window.createKpiCard(card.label, card.value, card.icon, card.colorVar, loading)).join('');
  }

  function renderQualityStrip(metrics, loading) {
    const items = [
      {
        label: 'Avg Call Duration',
        value: loading ? '—' : (metrics?.avgDuration ? formatDuration(metrics.avgDuration) : '—'),
        trend: metrics?.avgDurationTrend || (metrics?.avgDuration ? 'up' : 'down'),
        tone: metrics?.avgDuration != null ? (metrics.avgDuration < 180 ? 'good' : metrics.avgDuration < 420 ? 'warn' : 'bad') : 'warn',
      },
      {
        label: 'Success Rate',
        value: loading ? '—' : (metrics?.successRate != null ? `${Math.round(metrics.successRate)}%` : '—'),
        trend: metrics?.successTrend || 'up',
        tone: metrics?.successRate != null ? (metrics.successRate >= 85 ? 'good' : metrics.successRate >= 65 ? 'warn' : 'bad') : 'warn',
      },
      {
        label: 'Avg Latency',
        value: loading ? '—' : (metrics?.avgLatencyMs != null ? `${Math.round(metrics.avgLatencyMs)} ms` : '—'),
        trend: metrics?.latencyTrend || 'down',
        tone: metrics?.avgLatencyMs != null ? (metrics.avgLatencyMs <= 400 ? 'good' : metrics.avgLatencyMs <= 900 ? 'warn' : 'bad') : 'warn',
      },
      {
        label: 'MOS Score',
        value: loading ? '—' : (metrics?.mosScore != null ? Number(metrics.mosScore).toFixed(1) : '—'),
        trend: metrics?.mosTrend || 'up',
        tone: metrics?.mosScore != null ? (metrics.mosScore >= 4.2 ? 'good' : metrics.mosScore >= 3.4 ? 'warn' : 'bad') : 'warn',
      },
    ];

    return `
      <section class="glass-card mc-voice-section mc-voice-quality-panel animate-slide-up" id="mc-voice-quality-panel">
        <div class="mc-card-header">
          <div class="mc-card-title">
            <i data-lucide="activity" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
            <span>Call Quality Metrics</span>
          </div>
          <div class="mc-section-meta">Realtime operational quality</div>
        </div>
        <div class="mc-grid-2 mc-voice-quality-grid" id="mc-voice-quality-strip">
          ${items.map((item) => `
            <div class="quality-pill ${item.tone}">
              <div class="value">${escapeHtml(item.value)} <span class="trend-arrow ${item.trend === 'down' ? 'down' : 'up'}">${item.trend === 'down' ? '↓' : '↑'}</span></div>
              <div class="label">${escapeHtml(item.label)}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function buildTableColumns(kind) {
    if (kind === 'active') {
      return [
        {
          key: 'callId',
          label: 'Call ID',
          render: (_value, row) => `
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="mc-pulse-dot on animate-dot-pulse"></span>
              <span class="mc-mono">${escapeHtml(shortId(row.callId))}</span>
            </div>
          `,
        },
        {
          key: 'tenant',
          label: 'Tenant',
          render: (_value, row) => `<span>${escapeHtml(row.tenant)}</span>`,
        },
        {
          key: 'caller',
          label: 'Caller',
          render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.caller)}</span>`,
        },
        {
          key: 'agent',
          label: 'Agent',
          render: (_value, row) => `<span>${escapeHtml(row.agent)}</span>`,
        },
        {
          key: 'durationSec',
          label: 'Duration',
          render: (_value, row) => `<span class="live-duration" data-live-duration="${escapeHtml(row.callId)}">${escapeHtml(formatDuration(row.durationSec))}</span>`,
        },
        {
          key: 'status',
          label: 'Status',
          render: (_value, row) => `<span class="call-status-badge ${escapeHtml(row.statusTone)}">${escapeHtml(row.statusLabel)}</span>`,
        },
      ];
    }

    return [
      {
        key: 'createdAt',
        label: 'Time',
        render: (_value, row) => `<span class="mc-mono">${escapeHtml(formatDateTime(row.createdAt))}</span>`,
      },
      {
        key: 'tenant',
        label: 'Tenant',
        render: (_value, row) => `<span>${escapeHtml(row.tenant)}</span>`,
      },
      {
        key: 'caller',
        label: 'Caller',
        render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.caller)}</span>`,
      },
      {
        key: 'agent',
        label: 'Agent',
        render: (_value, row) => `<span>${escapeHtml(row.agent)}</span>`,
      },
      {
        key: 'durationSec',
        label: 'Duration',
        render: (_value, row) => `<span class="mc-mono">${escapeHtml(formatDuration(row.durationSec))}</span>`,
      },
      {
        key: 'outcome',
        label: 'Outcome',
        render: (_value, row) => `<span class="call-status-badge ${escapeHtml(row.statusTone)}">${escapeHtml(row.outcome)}</span>`,
      },
      {
        key: 'costDisplay',
        label: 'Cost',
        render: (_value, row) => `<span class="mc-mono">${escapeHtml(row.costDisplay)}</span>`,
      },
    ];
  }

  function renderActivePanel() {
    const activeCount = state.activeCalls.length;
    const empty = activeCount === 0;

    return `
      <section class="glass-card mc-voice-section mc-voice-active-panel animate-slide-up" id="mc-voice-active-panel">
        <div class="mc-card-header">
          <div class="mc-card-title">
            <span class="live-dot"></span>
            <span>Active Calls</span>
          </div>
          <div class="mc-section-meta">
            <span class="call-status-badge live">${formatNumber(activeCount)} live</span>
          </div>
        </div>
        <div id="mc-voice-active-table-shell">
          ${empty ? `
            <div class="mc-empty">
              <div class="mc-empty-icon"><i data-lucide="phone-off" style="width:34px;height:34px;"></i></div>
              <div class="mc-empty-title">No active calls right now</div>
              <div class="mc-empty-desc">When voice sessions begin, they will appear here with live duration counters and row-level details.</div>
            </div>
          ` : `<div id="mc-voice-active-table"></div>`}
        </div>
      </section>
    `;
  }

  function renderHistoryPanel() {
    const total = state.completedCalls.length;
    const visible = state.completedCalls.slice(0, state.visibleHistoryCount);
    const hasMore = total > visible.length;

    return `
      <section class="glass-card mc-voice-section mc-voice-history-panel animate-slide-up" id="mc-voice-history-panel">
        <div class="mc-card-header">
          <div class="mc-card-title">
            <i data-lucide="history" style="width:16px;height:16px;color:var(--mc-violet);"></i>
            <span>Recent Calls</span>
          </div>
          <div class="mc-section-meta">Latest completed calls</div>
        </div>
        <div id="mc-voice-history-table"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
          ${hasMore ? `<button type="button" class="mc-btn mc-btn-secondary" id="mc-voice-load-more">Load More</button>` : ''}
        </div>
      </section>
    `;
  }

  function renderShell() {
    const loadingAgents = state.agentSummary.activeAgents === 0 && state.agentSummary.idleAgents === 0 && state.agentSummary.queueCount === 0;
    return `
      <div class="mc-module-wrap mc-voice-page" style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:var(--mc-grid-gap);">
        ${renderHero(state.activeCalls.length)}
        <section class="key-metrics-section glass-card mc-voice-section mc-voice-agents-panel animate-slide-up" id="mc-voice-agents-panel">
          <div class="mc-card-header">
            <div class="mc-card-title">
              <i data-lucide="bot" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
              <span>Agent Status</span>
            </div>
            <div class="mc-section-meta">Realtime agent workload</div>
          </div>
          <div class="mc-grid-3" id="mc-voice-agents-grid">
            ${renderAgentCards(state.agentSummary, loadingAgents)}
          </div>
        </section>
        ${renderActivePanel()}
        ${renderQualityStrip(state.qualityMetrics, false)}
        ${renderHistoryPanel()}
      </div>
    `;
  }

  function clearTimers() {
    if (state.liveClockTimer) window.clearInterval(state.liveClockTimer);
    if (state.liveDurationTimer) window.clearInterval(state.liveDurationTimer);
    if (state.autoRefreshTimer) window.clearInterval(state.autoRefreshTimer);
    state.liveClockTimer = null;
    state.liveDurationTimer = null;
    state.autoRefreshTimer = null;
  }

  function clearSse() {
    if (typeof state.sseUnsubscribe === 'function') {
      try { state.sseUnsubscribe(); } catch (err) {}
    }
    state.sseUnsubscribe = null;
    state.sseConnected = false;
  }

  function clearTableHandlers() {
    state.tableHandlers.forEach((off) => {
      try { off(); } catch (err) {}
    });
    state.tableHandlers = [];
  }

  function rebuildCallIndex(calls) {
    state.callIndex = new Map();
    calls.forEach((call) => {
      state.callIndex.set(String(call.callId || call.id), call);
    });
  }

  function computeAgentSummary(calls, agentsPayload) {
    const agentRows = toArray(agentsPayload).map(normalizeAgent);

    if (agentRows.length > 0) {
      const active = agentRows.filter((agent) => agent.statusTone === 'busy' || agent.activeCalls > 0 || agent.status.includes('live') || agent.status.includes('active'));
      const idle = agentRows.filter((agent) => agent.status.includes('idle') || agent.status.includes('available') || (!agent.activeCalls && !agent.status.includes('busy')));
      const queueCount = agentRows.reduce((sum, agent) => sum + (agent.queueDepth || 0), 0);
      return {
        activeAgents: active.length,
        idleAgents: idle.length,
        queueCount,
        raw: agentRows,
        source: 'agents',
      };
    }

    const liveAgents = new Set();
    const allAgents = new Set();
    let queueCount = 0;

    calls.forEach((call) => {
      if (call.agent && call.agent !== '—') {
        allAgents.add(call.agent);
      }
      if (call.isLive && call.agent && call.agent !== '—') {
        liveAgents.add(call.agent);
      }
      if (call.isQueued) {
        queueCount += 1;
      }
    });

    return {
      activeAgents: liveAgents.size || (calls.filter((call) => call.isLive).length > 0 ? calls.filter((call) => call.isLive).length : 0),
      idleAgents: Math.max(allAgents.size - liveAgents.size, 0),
      queueCount,
      raw: [],
      source: 'calls',
    };
  }

  function computeQualityMetrics(calls, metricsPayload) {
    const metric = metricsPayload && typeof metricsPayload === 'object' ? (metricsPayload.data || metricsPayload) : null;
    const completed = calls.filter((call) => call.isCompleted);
    const live = calls.filter((call) => call.isLive);

    const completedDurations = completed
      .map((call) => Number(call.durationSec || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgDuration = completedDurations.length
      ? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
      : null;

    const successRateRaw = metric?.successRate ?? metric?.success_rate ?? metric?.callSuccessRate;
    const successRate = Number.isFinite(Number(successRateRaw))
      ? Number(successRateRaw)
      : calls.length
        ? (completed.length / calls.length) * 100
        : null;

    const latencyRaw = metric?.avgLatencyMs ?? metric?.avg_latency_ms ?? metric?.averageLatencyMs ?? metric?.connectLatencyMs ?? metric?.connect_latency_ms;
    const latencyNumeric = Number(latencyRaw);
    const avgLatencyMs = Number.isFinite(latencyNumeric)
      ? latencyNumeric
      : (() => {
          const candidates = calls
            .map((call) => Number(call.latencyMs ?? call.latency_ms ?? call.setupLatencyMs ?? call.setup_latency_ms ?? call.answerLatencyMs ?? call.answer_latency_ms ?? NaN))
            .filter((value) => Number.isFinite(value) && value >= 0);
          return candidates.length ? candidates.reduce((sum, value) => sum + value, 0) / candidates.length : null;
        })();

    const mosRaw = metric?.mosScore ?? metric?.mos_score ?? metric?.mos;
    const mosNumeric = Number(mosRaw);
    const mosScore = Number.isFinite(mosNumeric)
      ? mosNumeric
      : (() => {
          if (successRate == null) return null;
          const latencyPenalty = avgLatencyMs == null ? 0.35 : Math.min(avgLatencyMs / 2000, 1.25);
          const successBoost = Math.min(successRate / 100 * 2.4, 2.4);
          return Math.max(0, Math.min(5, 2.4 + successBoost - latencyPenalty));
        })();

    const trendUp = live.length > 0 || (successRate != null && successRate >= 80);

    return {
      avgDuration,
      avgDurationTrend: avgDuration != null ? (avgDuration < 240 ? 'down' : 'up') : 'up',
      successRate,
      successTrend: successRate != null && successRate >= 80 ? 'up' : 'down',
      avgLatencyMs,
      latencyTrend: avgLatencyMs != null && avgLatencyMs <= 500 ? 'down' : 'up',
      mosScore,
      mosTrend: trendUp ? 'up' : 'down',
    };
  }

  async function fetchJson(path) {
    const adminKey = getAdminKey();
    const response = await fetch(`${window.location.origin}/api/admin${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async function fetchTranscript(callId) {
    const paths = [
      `/api/admin/calls/${encodeURIComponent(callId)}/transcript`,
      `/api/calls/${encodeURIComponent(callId)}/transcript`,
    ];

    for (const path of paths) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (path.startsWith('/api/admin/')) {
          headers['x-admin-key'] = getAdminKey();
        }
        const response = await fetch(`${window.location.origin}${path}`, { headers });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.success !== false) {
          return Array.isArray(payload.data) ? payload.data : [];
        }
      } catch (err) {
        // fall through
      }
    }

    return null;
  }

  async function loadVoiceData(limit = 100) {
    const callsPromise = window.MCApi?.getCalls ? window.MCApi.getCalls(limit) : fetchJson(`/dev-monitor/calls?limit=${limit}`);

    const [callsRes] = await Promise.allSettled([callsPromise]);

    const calls = toArray(unwrap(callsRes.status === 'fulfilled' ? callsRes.value : null)).map(normalizeCall);
    const activeCalls = calls.filter((call) => call.isLive);
    const completedCalls = calls.filter((call) => call.isCompleted).slice(0, limit);

    return {
      calls,
      activeCalls,
      completedCalls,
      agents: null,
      metrics: null,
    };
  }

  function mountDataTable(containerId, columns, rows, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const html = window.createDataTable(columns, rows, options);
    window.mountDataTable?.(containerId, html);

    const root = container.querySelector('.mc-data-table');
    return root || container.firstElementChild;
  }

  function addDelegatedRowClicks(containerId, rowLookup, handler) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const onClick = (event) => {
      const row = event.target.closest('tr[data-row-key]');
      if (!row) return;
      const key = row.dataset.rowKey;
      const item = rowLookup.get(key) || rowLookup.get(String(key));
      if (!item) return;
      handler(item, row);
    };

    container.addEventListener('click', onClick);
    state.tableHandlers.push(() => container.removeEventListener('click', onClick));
  }

  function renderActiveTable() {
    const shell = document.getElementById('mc-voice-active-table-shell');
    if (!shell) return;

    if (state.activeCalls.length === 0) {
      shell.innerHTML = `
        <div class="mc-empty">
          <div class="mc-empty-icon"><i data-lucide="phone-off" style="width:34px;height:34px;"></i></div>
          <div class="mc-empty-title">No active calls right now</div>
          <div class="mc-empty-desc">When voice sessions begin, they will appear here with live duration counters and row-level details.</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    shell.innerHTML = '<div id="mc-voice-active-table"></div>';

    const columns = buildTableColumns('active');
    const rows = state.activeCalls.map((call) => ({
      ...call,
      __rowKey: call.rowKey,
    }));

    mountDataTable('mc-voice-active-table', columns, rows, { sortable: true, filterable: false, striped: true });

    const lookup = new Map(rows.map((row) => [String(row.rowKey), row]));
    addDelegatedRowClicks('mc-voice-active-table', lookup, (call) => openCallDetails(call));

    if (window.lucide) window.lucide.createIcons();
    animateTableRows('mc-voice-active-table');
  }

  function renderHistoryTable() {
    const container = document.getElementById('mc-voice-history-table');
    if (!container) return;

    const visibleRows = state.completedCalls.slice(0, state.visibleHistoryCount).map((call) => ({
      ...call,
      __rowKey: call.rowKey,
    }));

    const columns = buildTableColumns('history');
    mountDataTable('mc-voice-history-table', columns, visibleRows, { sortable: true, filterable: true, striped: true });

    const lookup = new Map(visibleRows.map((row) => [String(row.rowKey), row]));
    addDelegatedRowClicks('mc-voice-history-table', lookup, (call) => openCallDetails(call));

    if (window.lucide) window.lucide.createIcons();
    animateTableRows('mc-voice-history-table');

    const loadMore = document.getElementById('mc-voice-load-more');
    if (loadMore) {
      loadMore.addEventListener('click', () => {
        state.visibleHistoryCount = Math.min(state.completedCalls.length, state.visibleHistoryCount + 20);
        renderHistoryTable();
      });
    }
  }

  function updateLiveClock() {
    const clock = document.getElementById('mc-voice-clock');
    if (clock) {
      clock.textContent = formatHeaderClock();
    }
  }

  function updateLiveDurationCounters() {
    const targets = document.querySelectorAll('[data-live-duration]');
    targets.forEach((el) => {
      const callId = el.getAttribute('data-live-duration');
      const call = state.callIndex.get(String(callId));
      if (!call) return;
      el.textContent = formatDuration(getLiveElapsedSeconds(call));
    });
  }

  function updateHeroBadge() {
    const badge = document.getElementById('mc-voice-live-pill');
    if (badge) {
      badge.textContent = `${formatNumber(state.activeCalls.length)} LIVE`;
    }
  }

  function animateTableRows(containerId) {
    if (!window.gsap) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    if (!rows.length) return;
    window.gsap.fromTo(rows, { opacity: 0, x: 40, y: 10 }, { opacity: 1, x: 0, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' });
  }

  function animateRefreshPulse() {
    if (!window.gsap) return;
    const targets = Array.from(document.querySelectorAll('#mc-voice-agents-grid .mc-kpi-card, #mc-voice-active-panel .mc-kpi-card'));
    if (!targets.length) return;
    window.gsap.to(targets, {
      scale: 1.02,
      boxShadow: '0 0 32px rgba(0, 212, 255, 0.35)',
      duration: 0.25,
      yoyo: true,
      repeat: 1,
      stagger: 0.08,
    });
  }

  function animateIntro() {
    if (!window.gsap || !state.root) return;

    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try { state.gsapContext.revert(); } catch (err) {}
    }

    state.gsapContext = window.gsap.context(() => {
      const hero = state.root.querySelector('#mc-voice-hero');
      const pill = state.root.querySelector('#mc-voice-live-pill');
      const subtitle = state.root.querySelector('.hero-subtitle');
      const clock = state.root.querySelector('.hero-clock');
      const refresh = state.root.querySelector('#mc-voice-refresh');
      const cards = Array.from(state.root.querySelectorAll('#mc-voice-agents-grid .mc-kpi-card'));
      const activePanel = state.root.querySelector('#mc-voice-active-panel');
      const quality = state.root.querySelector('#mc-voice-quality-panel');
      const history = state.root.querySelector('#mc-voice-history-panel');

      const tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (hero) tl.fromTo(hero, { opacity: 0, y: -40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.65 }, 0);
      if (pill) tl.fromTo(pill, { opacity: 0, x: -30, scale: 0.7, rotate: -15 }, { opacity: 1, x: 0, scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2)' }, '<0.2');
      if (subtitle) tl.fromTo(subtitle, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, '<0.1');
      if (clock) tl.fromTo(clock, { opacity: 0, y: 10, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.35 }, '<0.1');
      if (refresh) tl.fromTo(refresh, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.4 }, '<0.1');
      if (cards.length) tl.fromTo(cards, { opacity: 0, y: 60, scale: 0.92, rotateX: -10 }, { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.6, stagger: 0.14, ease: 'back.out(1.4)' }, '<0.2');
      if (activePanel) tl.fromTo(activePanel, { opacity: 0, x: 50, y: 30 }, { opacity: 1, x: 0, y: 0, duration: 0.6 }, '<0.2');
      if (quality) tl.fromTo(quality, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, '<0.2');
      if (history) tl.fromTo(history, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55 }, '<0.2');

      window.gsap.to('#mc-voice-hero .hero-sparkle-icon', {
        y: -6,
        rotation: 15,
        duration: 2.5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      window.gsap.to('#mc-voice-live-pill', {
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
        duration: 2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    }, state.root);

    if (window.gsap) {
      const bars = Array.from(state.root.querySelectorAll('.mc-kpi-accent-bar'));
      bars.forEach((bar, index) => {
        window.gsap.fromTo(bar, { scaleX: 0, transformOrigin: 'left' }, { scaleX: 1, duration: 0.8, delay: 0.5 + (index * 0.15), ease: 'power2.out' });
      });

      const values = Array.from(state.root.querySelectorAll('.mc-kpi-value'));
      values.forEach((el, index) => {
        const target = Number(el.getAttribute('data-target'));
        if (!Number.isFinite(target) || target <= 0) return;
        const obj = { count: 0 };
        window.gsap.to(obj, {
          count: target,
          duration: 1.8,
          delay: 0.7 + (index * 0.15),
          ease: 'power2.out',
          onUpdate() {
            el.textContent = formatNumber(obj.count);
          },
        });
      });
    }
  }

  function pulseLiveDots() {
    if (!window.gsap) return;
    document.querySelectorAll('#mc-voice-active-panel .mc-pulse-dot.on').forEach((dot) => {
      window.gsap.to(dot, { scale: 1.3, opacity: 0.5, duration: 0.8, yoyo: true, repeat: 3 });
    });
  }

  function updateTables() {
    renderActiveTable();
    renderHistoryTable();
    updateLiveDurationCounters();
    updateHeroBadge();
    if (state.qualityMetrics) {
      const qualitySection = document.getElementById('mc-voice-quality-panel');
      if (qualitySection) {
        qualitySection.outerHTML = renderQualityStrip(state.qualityMetrics, false);
      }
    }
    if (window.lucide) window.lucide.createIcons();
  }

  async function refreshData({ userInitiated = false, limit = 100, animate = false } = {}) {
    const seq = ++state.hydrateSeq;
    const key = getAdminKey();

    if (!key) {
      state.allCalls = [];
      state.activeCalls = [];
      state.completedCalls = [];
      state.agentSummary = { activeAgents: 0, idleAgents: 0, queueCount: 0 };
      state.qualityMetrics = computeQualityMetrics([], null);
      updateTables();
      if (userInitiated && window.MCToast) window.MCToast.showToastInfo('Add an admin key to load Voice Ops data.');
      return;
    }

    const data = await loadVoiceData(limit).catch((error) => {
      console.error('[MCVoiceOps] load failed', error);
      if (window.MCToast && userInitiated) window.MCToast.showToastError(error.message || 'Voice Ops refresh failed');
      return { calls: [], activeCalls: [], completedCalls: [], agents: null, metrics: null };
    });

    if (seq !== state.hydrateSeq) return;

    state.allCalls = data.calls;
    state.activeCalls = data.activeCalls;
    state.completedCalls = data.completedCalls;
    state.agentSummary = computeAgentSummary(data.calls, data.agents);
    state.qualityMetrics = computeQualityMetrics(data.calls, data.metrics);
    rebuildCallIndex(data.calls);

    const activeIds = new Set(state.activeCalls.map((call) => call.callId));
    state.activeCallIds = activeIds;

    updateTables();

    const activeCount = state.activeCalls.length;
    const pill = document.getElementById('mc-voice-live-pill');
    if (pill) pill.textContent = `${formatNumber(activeCount)} LIVE`;

    if (animate && window.gsap) {
      pulseLiveDots();
      animateRefreshPulse();
    }

    if (userInitiated && window.MCToast) {
      window.MCToast.showToastSuccess('Voice Ops refreshed.');
    }
  }

  function startClockTimer() {
    clearInterval(state.liveClockTimer);
    updateLiveClock();
    state.liveClockTimer = window.setInterval(() => {
      updateLiveClock();
      state.clockTickCount += 1;
    }, 1000);
  }

  function startLiveDurationTimer() {
    clearInterval(state.liveDurationTimer);
    state.liveDurationTimer = window.setInterval(() => {
      updateLiveDurationCounters();
    }, 1000);
  }

  function startAutoRefresh() {
    clearInterval(state.autoRefreshTimer);
    if (state.sseAvailable && state.sseConnected) return;
    state.autoRefreshTimer = window.setInterval(() => {
      refreshData({ userInitiated: false, animate: true }).catch(() => {});
    }, 5000);
  }

  function connectSse() {
    clearSse();
    const key = getAdminKey();
    if (!key || !window.MCSSE || typeof window.MCSSE.subscribe !== 'function') {
      state.sseAvailable = false;
      state.sseConnected = false;
      startAutoRefresh();
      return;
    }

    state.sseAvailable = true;
    const streamUrl = `${window.location.origin}/api/admin/live-events/stream?adminKey=${encodeURIComponent(key)}`;
    state.sseUnsubscribe = window.MCSSE.subscribe(streamUrl, {
      eventName: 'admin_live_event',
      onOpen: () => {
        state.sseConnected = true;
        startAutoRefresh();
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          const eventType = String(payload.eventType || payload.event_type || payload.stage || '').toLowerCase();
          const callId = String(payload.callId || payload.call_id || payload.callId || '');
          const isCallEvent = eventType.includes('call') || eventType.includes('voice');

          if (isCallEvent && (eventType.includes('start') || eventType.includes('connected') || eventType.includes('receive'))) {
            animateRefreshPulse();
          }
          if (isCallEvent && (eventType.includes('end') || eventType.includes('complete') || eventType.includes('finish'))) {
            animateRefreshPulse();
          }
          if (isCallEvent && callId) {
            window.setTimeout(() => {
              refreshData({ userInitiated: false, animate: true }).catch(() => {});
            }, 180);
          }
        } catch (err) {
          // ignore malformed live events
        }
      },
      onError: () => {
        state.sseConnected = false;
        startAutoRefresh();
      },
    });
  }

  function openTranscriptModal(call) {
    const turns = Array.isArray(call.transcriptTurns) && call.transcriptTurns.length ? call.transcriptTurns : Array.isArray(call.transcriptSnippet) ? call.transcriptSnippet : [];
    const transcriptBody = turns.length
      ? `
        <div class="call-timeline">
          ${turns.map((turn, index) => `
            <div class="call-timeline-item">
              <strong>${escapeHtml(turn.speaker || 'speaker')}:</strong> ${escapeHtml(turn.text || '')}
            </div>
          `).join('')}
        </div>
      `
      : '<div class="mc-empty-desc">No transcript is available for this call.</div>';

    window.MCModal.showModal({
      title: `Transcript — ${shortId(call.callId)}`,
      body: transcriptBody,
      buttons: [
        { label: 'Close', type: 'secondary' },
      ],
    });
  }

  async function openCallDetails(call) {
    const transcriptTurns = Array.isArray(call.transcriptTurns) && call.transcriptTurns.length
      ? call.transcriptTurns
      : await fetchTranscript(call.callId).catch(() => null);

    const timeline = ['connected', 'ringing', 'active', 'completed'];
    const timelineHtml = timeline.map((step) => `
      <div class="call-timeline-item">${escapeHtml(step)}</div>
    `).join('');

    const transcriptSnippet = Array.isArray(transcriptTurns) && transcriptTurns.length
      ? `
        <div class="mc-card-title" style="margin-bottom:10px;">
          <i data-lucide="file-text" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
          <span>Transcript Snippet</span>
        </div>
        <div class="call-timeline">
          ${transcriptTurns.slice(0, 6).map((turn) => `
            <div class="call-timeline-item"><strong>${escapeHtml(turn.speaker || 'speaker')}:</strong> ${escapeHtml(turn.text || '')}</div>
          `).join('')}
        </div>
      `
      : '<div class="mc-empty-desc">Transcript not available.</div>';

    const body = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="glass-card" style="padding:16px;">
          <div style="display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));">
            <div><div class="mc-input-label">Caller</div><div class="mc-mono">${escapeHtml(call.caller)}</div></div>
            <div><div class="mc-input-label">Tenant</div><div class="mc-mono">${escapeHtml(call.tenant)}</div></div>
            <div><div class="mc-input-label">Agent</div><div class="mc-mono">${escapeHtml(call.agent)}</div></div>
            <div><div class="mc-input-label">Duration</div><div class="mc-mono live-duration">${escapeHtml(formatDuration(call.durationSec))}</div></div>
            <div><div class="mc-input-label">Status</div><div class="call-status-badge ${escapeHtml(call.statusTone)}">${escapeHtml(call.statusLabel)}</div></div>
            <div><div class="mc-input-label">Quality</div><div class="mc-mono">MOS ${escapeHtml(state.qualityMetrics?.mosScore != null ? Number(state.qualityMetrics.mosScore).toFixed(1) : '—')}</div></div>
          </div>
        </div>

        <div class="glass-card" style="padding:16px;">
          <div class="mc-card-title" style="margin-bottom:6px;">
            <i data-lucide="route" style="width:16px;height:16px;color:var(--mc-cyan);"></i>
            <span>Timeline</span>
          </div>
          <div class="call-timeline">${timelineHtml}</div>
        </div>

        <div class="glass-card" style="padding:16px;">
          <div class="mc-card-title" style="margin-bottom:6px;">
            <i data-lucide="message-square-text" style="width:16px;height:16px;color:var(--mc-violet);"></i>
            <span>Transcript</span>
          </div>
          ${transcriptSnippet}
        </div>
      </div>
    `;

    const buttons = [];
    if (Array.isArray(transcriptTurns) && transcriptTurns.length) {
      buttons.push({
        label: 'View Full Transcript',
        type: 'primary',
        onClick: async () => {
          openTranscriptModal({ ...call, transcriptTurns });
          return false;
        },
      });
    }
    buttons.push({ label: 'Close', type: 'secondary' });

    window.MCModal.showModal({
      title: `Call Details — ${shortId(call.callId)}`,
      body,
      buttons,
    });
  }

  function bindRefreshButton() {
    const button = document.getElementById('mc-voice-refresh');
    if (!button) return;
    button.addEventListener('click', () => {
      if (state.refreshInFlight) return;
      state.refreshInFlight = true;
      animateRefreshPulse();
      refreshData({ userInitiated: true, animate: true }).finally(() => {
        state.refreshInFlight = false;
      });
    });
  }

  function mountSubscriptions() {
    state.subs.forEach((unsubscribe) => {
      try { unsubscribe(); } catch (err) {}
    });
    state.subs = [];

    if (window.MCState?.subscribe) {
      state.subs.push(window.MCState.subscribe('adminKeySet', () => {
        refreshData({ userInitiated: false, animate: true }).catch(() => {});
        connectSse();
      }));
      state.subs.push(window.MCState.subscribe('systemHealth', () => {
        if (window.MCState?.systemHealth?.sse === 'connected') {
          state.sseConnected = true;
        } else if (window.MCState?.systemHealth?.sse === 'disconnected' || window.MCState?.systemHealth?.sse === 'failed') {
          state.sseConnected = false;
        }
        startAutoRefresh();
      }));
    }
  }

  function render() {
    const el = rootEl();
    if (!el) return;
    state.root = el;
    state.mounted = true;
    state.visibleHistoryCount = 20;
    el.innerHTML = renderShell();
    bindRefreshButton();
    if (window.lucide) window.lucide.createIcons();
  }

  async function hydrate({ userInitiated = false } = {}) {
    const seq = ++state.hydrateSeq;
    if (!state.mounted) return;

    await refreshData({ userInitiated, limit: 100, animate: userInitiated });
    if (seq !== state.hydrateSeq) return;

    updateTables();
    startClockTimer();
    startLiveDurationTimer();
    connectSse();
    startAutoRefresh();
    mountSubscriptions();
    animateIntro();
  }

  function destroy() {
    state.mounted = false;
    clearTimers();
    clearSse();
    clearTableHandlers();
    if (state.gsapContext && typeof state.gsapContext.revert === 'function') {
      try { state.gsapContext.revert(); } catch (err) {}
    }
    state.gsapContext = null;
    state.root = null;
    state.allCalls = [];
    state.activeCalls = [];
    state.completedCalls = [];
    state.activeCallIds = new Set();
    state.callIndex = new Map();
  }

  return {
    render() {
      if (state.mounted) {
        destroy();
      }
      render();
      hydrate({ userInitiated: false });
    },
    hydrate,
    destroy,
  };
})();