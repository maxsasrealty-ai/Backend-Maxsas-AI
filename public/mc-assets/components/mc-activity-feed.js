window.MCActivityFeed = (function () {
  const STYLE_ID = 'mc-activity-feed-styles';
  const instances = new Map();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mc-activity-feed {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border);
        background: linear-gradient(180deg, var(--mc-panel) 0%, var(--mc-surface) 100%);
        box-shadow: var(--mc-shadow-panel);
        backdrop-filter: blur(14px) saturate(1.1);
      }

      .mc-activity-feed__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .mc-activity-feed__title {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--mc-text);
        font-size: var(--mc-text-lg);
        font-weight: 600;
      }

      .mc-activity-feed__status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--mc-border-soft);
        color: var(--mc-muted);
        font-size: var(--mc-text-xs);
        font-family: var(--mc-font-mono);
      }

      .mc-activity-feed__status-dot {
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: var(--mc-amber);
        box-shadow: 0 0 12px currentColor;
        flex-shrink: 0;
      }

      .mc-activity-feed__status-dot.live {
        background: var(--mc-lime);
        color: var(--mc-lime);
      }

      .mc-activity-feed__status-dot.loading {
        background: var(--mc-cyan);
        color: var(--mc-cyan);
      }

      .mc-activity-feed__status-dot.disconnected {
        background: var(--mc-red);
        color: var(--mc-red);
      }

      .mc-activity-feed__panel {
        overflow: hidden;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border-soft);
        background: rgba(7, 12, 20, 0.24);
      }

      .mc-activity-feed__scroll {
        max-height: 420px;
        overflow-y: auto;
      }

      .mc-activity-feed__list {
        display: flex;
        flex-direction: column;
      }

      .mc-feed-item {
        display: flex;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--mc-border-soft);
      }

      .mc-feed-item:last-child {
        border-bottom: 0;
      }

      .mc-feed-item:hover {
        background: rgba(0, 212, 255, 0.04);
      }

      .mc-feed-item.mc-feed-item-new {
        background: rgba(0, 212, 255, 0.08);
      }

      .mc-feed-item.mc-feed-item-new .mc-feed-badge {
        animation: mc-feed-badge-pop 0.45s ease-out 1;
      }

      .mc-feed-dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        margin-top: 4px;
        flex-shrink: 0;
        box-shadow: 0 0 12px currentColor;
      }

      .mc-feed-icon {
        width: 14px;
        height: 14px;
        margin-top: 2px;
        flex-shrink: 0;
      }

      .mc-feed-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mc-feed-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: var(--mc-muted);
        font-size: var(--mc-text-xs);
        font-family: var(--mc-font-mono);
      }

      .mc-feed-timestamp {
        color: var(--mc-muted);
        white-space: nowrap;
      }

      .mc-feed-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        font-family: var(--mc-font-mono);
        border: 1px solid transparent;
      }

      .mc-feed-badge.lime {
        color: var(--mc-lime);
        background: var(--mc-lime-dim);
        border-color: color-mix(in srgb, var(--mc-lime) 30%, transparent);
      }

      .mc-feed-badge.cyan {
        color: var(--mc-cyan);
        background: var(--mc-cyan-dim);
        border-color: color-mix(in srgb, var(--mc-cyan) 30%, transparent);
      }

      .mc-feed-badge.amber {
        color: var(--mc-amber);
        background: var(--mc-amber-dim);
        border-color: color-mix(in srgb, var(--mc-amber) 30%, transparent);
      }

      .mc-feed-badge.red {
        color: var(--mc-red);
        background: var(--mc-red-dim);
        border-color: color-mix(in srgb, var(--mc-red) 30%, transparent);
      }

      .mc-feed-message {
        color: var(--mc-text);
        font-size: var(--mc-text-sm);
        line-height: 1.5;
        word-break: break-word;
      }

      .mc-activity-feed__empty,
      .mc-activity-feed__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 220px;
        text-align: center;
        padding: var(--mc-s8);
        color: var(--mc-muted);
      }

      .mc-activity-feed__empty-content,
      .mc-activity-feed__loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .mc-activity-feed__pulse {
        animation: mc-activity-feed-pulse 1.7s ease-in-out infinite;
      }

      .mc-activity-feed__pulse-dot {
        width: 12px;
        height: 12px;
        border-radius: 9999px;
        background: var(--mc-cyan);
        box-shadow: 0 0 14px var(--mc-cyan);
      }

      .mc-activity-feed__loading-text,
      .mc-activity-feed__empty-title {
        color: var(--mc-text);
        font-size: var(--mc-text-md);
        font-weight: 600;
      }

      .mc-activity-feed__empty-desc {
        max-width: 36ch;
        color: var(--mc-muted);
        font-size: var(--mc-text-sm);
      }

      @keyframes mc-activity-feed-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(0.95); }
      }

      @keyframes mc-feed-badge-pop {
        0% { transform: scale(0.92); }
        50% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }

      @media (max-width: 768px) {
        .mc-activity-feed {
          padding: 16px;
        }

        .mc-activity-feed__scroll {
          max-height: 360px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeEvent(event) {
    const record = event && typeof event === 'object' ? event : {};
    const eventType = String(record.event_type || record.eventType || record.stage || '').trim();
    const message = String(record.message || record.summary || record.description || '(event)').trim();

    return {
      eventId: record.event_id || record.eventId || record.streamEventId || record.id || '',
      occurredAt: record.occurred_at || record.occurredAt || record.createdAt || record.timestamp || new Date().toISOString(),
      stage: String(record.stage || '').trim(),
      tenantId: record.tenant_id || record.tenantId || '',
      callId: record.call_id || record.callId || '',
      eventType,
      message,
      raw: record,
    };
  }

  function getBadgeTone(event) {
    const source = `${event.eventType} ${event.stage}`.toLowerCase();
    if (source.includes('success') || source.includes('complete') || source.includes('done') || source.includes('live')) return 'lime';
    if (source.includes('warn') || source.includes('pending') || source.includes('progress') || source.includes('stage')) return 'amber';
    if (source.includes('error') || source.includes('fail') || source.includes('denied') || source.includes('blocked')) return 'red';
    return 'cyan';
  }

  function getEventIcon(event) {
    const source = `${event.eventType} ${event.stage} ${event.message}`.toLowerCase();
    if (source.includes('error') || source.includes('fail')) return 'alert-circle';
    if (source.includes('success') || source.includes('complete') || source.includes('done')) return 'check-circle-2';
    if (source.includes('live') || source.includes('started') || source.includes('connected')) return 'radio';
    if (source.includes('warning') || source.includes('pending') || source.includes('progress')) return 'triangle-alert';
    return 'sparkles';
  }

  function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function renderLoading() {
    return `
      <div class="mc-activity-feed__loading">
        <div class="mc-activity-feed__loading-content">
          <div class="mc-activity-feed__pulse-dot mc-activity-feed__pulse"></div>
          <div class="mc-activity-feed__loading-text">Waiting for live events...</div>
        </div>
      </div>
    `;
  }

  function renderEmpty() {
    return `
      <div class="mc-activity-feed__empty">
        <div class="mc-activity-feed__empty-content">
          <div class="mc-empty-title">No events yet</div>
          <div class="mc-empty-desc">Connect the admin live event stream to see realtime activity here.</div>
        </div>
      </div>
    `;
  }

  function renderNoKey() {
    return `
      <div class="mc-activity-feed__empty">
        <div class="mc-activity-feed__empty-content">
          <div class="mc-activity-feed__pulse-dot mc-activity-feed__pulse"></div>
          <div class="mc-activity-feed__empty-title">Enter admin key to start streaming</div>
          <div class="mc-activity-feed__empty-desc">Live events will appear here once the admin key is added in the sidebar.</div>
        </div>
      </div>
    `;
  }

  function renderItems(items) {
    return items.map((item) => {
      const tone = getBadgeTone(item);
      const label = item.eventType || item.stage || 'event';
      const metaParts = [
        item.stage ? `stage:${item.stage}` : '',
        item.tenantId ? `tenant:${item.tenantId}` : '',
        item.callId ? `call:${item.callId}` : '',
      ].filter(Boolean);

      return `
        <article class="mc-feed-item" data-event-id="${item.eventId}">
          <div class="mc-feed-dot" style="background:var(--mc-${tone});color:var(--mc-${tone});"></div>
          <i data-lucide="${getEventIcon(item)}" class="mc-feed-icon" style="color:var(--mc-${tone});"></i>
          <div class="mc-feed-body">
            <div class="mc-feed-meta">
              <span class="mc-feed-timestamp">${formatTimestamp(item.occurredAt)}</span>
              <span class="mc-feed-badge ${tone}">${label}</span>
            </div>
            <div class="mc-feed-message">${item.message}</div>
            ${metaParts.length ? `<div class="mc-feed-meta">${metaParts.map((part) => `<span>${part}</span>`).join('')}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function resolveContainer(containerId) {
    return typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  }

  function getHeaderText(state) {
    if (state.loading) return 'Loading live events';
    if (!state.connected) return 'Disconnected';
    return 'Live';
  }

  function render(root, state) {
    const statusClass = state.loading ? 'loading' : state.connected ? 'live' : 'disconnected';
    const statusText = getHeaderText(state);
    const listHtml = state.loading
      ? renderLoading()
      : state.noKey
        ? renderNoKey()
      : state.items.length
        ? `
          <div class="mc-activity-feed__scroll" data-role="scroll">
            <div class="mc-activity-feed__list" data-role="list">
              ${renderItems(state.items)}
            </div>
          </div>
        `
        : renderEmpty();

    root.innerHTML = `
      <section class="mc-activity-feed">
        <div class="mc-activity-feed__header">
          <div class="mc-activity-feed__title">
            <i data-lucide="activity" style="width:18px;height:18px;color:var(--mc-cyan);"></i>
            <span>Activity Feed</span>
          </div>
          <div class="mc-activity-feed__status">
            <span class="mc-activity-feed__status-dot ${statusClass}"></span>
            <span>${statusText}</span>
          </div>
        </div>
        <div class="mc-activity-feed__panel">
          ${listHtml}
        </div>
      </section>
    `;

    if (window.lucide) lucide.createIcons();

    const scroll = root.querySelector('[data-role="scroll"]');
    if (scroll) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  function flashLatestItem(root, eventId) {
    if (!eventId) return;
    const escapeSelector = (value) => {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(String(value));
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    };
    const item = root.querySelector(`.mc-feed-item[data-event-id="${escapeSelector(eventId)}"]`);
    if (!item) return;

    item.classList.add('mc-feed-item-new');
    const badge = item.querySelector('.mc-feed-badge');
    if (window.gsap) {
      window.gsap.fromTo(item,
        { opacity: 0, x: -50, backgroundColor: 'rgba(0,212,255,0.08)' },
        { opacity: 1, x: 0, backgroundColor: 'transparent', duration: 0.5, ease: 'power2.out' }
      );
      if (badge) {
        window.gsap.fromTo(badge, { scale: 0.92 }, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
      }
    }
    window.setTimeout(() => item.classList.remove('mc-feed-item-new'), 800);
  }

  async function seed(state) {
    const adminKey = window.MCAuth.getAdminKey();
    if (!adminKey) {
      state.loading = false;
      state.connected = false;
      state.noKey = true;
      state.items = [];
      return;
    }

    state.noKey = false;

    const response = await fetch(`${window.location.origin}/api/admin/live-events/recent?limit=50`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    state.items = rows
      .map((item) => normalizeEvent(item))
      .slice(-50)
      .reverse();
  }

  function connectStream(state, root, instance) {
    const adminKey = window.MCAuth.getAdminKey();
    if (!adminKey || !window.MCSSE || typeof window.MCSSE.subscribe !== 'function') {
      state.connected = false;
      state.loading = false;
      render(root, state);
      return;
    }

    const streamUrl = `${window.location.origin}/api/admin/live-events/stream?adminKey=${encodeURIComponent(adminKey)}`;
    state.connected = false;
    state.loading = false;
    render(root, state);

    instance.unsubscribeStream = window.MCSSE.subscribe(streamUrl, {
      eventName: 'admin_live_event',
      onOpen: () => {
        state.connected = true;
        render(root, state);
      },
      onMessage: (event) => {
        try {
          const item = normalizeEvent(JSON.parse(event.data));
          const nextEventId = item.eventId;
          state.items.push(item);
          if (state.items.length > 200) {
            state.items = state.items.slice(-200);
          }
          state.connected = true;
          render(root, state);
          flashLatestItem(root, nextEventId);
        } catch (err) {
          console.error('[MCActivityFeed] Failed to parse live event', err);
        }
      },
      onError: () => {
        state.connected = false;
        render(root, state);
        if (typeof instance.unsubscribeStream === 'function') {
          instance.unsubscribeStream();
          instance.unsubscribeStream = null;
        }
        if (!instance.stopped) {
          clearTimeout(instance.reconnectTimer);
          instance.reconnectTimer = setTimeout(() => connectStream(state, root, instance), 3000);
        }
      },
    });
  }

  function createActivityFeed(containerId) {
    ensureStyles();

    const root = resolveContainer(containerId);
    if (!root) return null;

    const state = {
      items: [],
      loading: true,
      connected: false,
      noKey: false,
    };

    const instance = {
      root,
      state,
      stopped: false,
      reconnectTimer: null,
      unsubscribeStream: null,
      unsubscribeAdminKey: null,
    };

    instances.set(containerId, instance);
    render(root, state);

    instance.unsubscribeAdminKey = window.MCState.subscribe('adminKey', async () => {
      if (instance.stopped) return;
      await start(instance);
    });

    async function start(current) {
      clearTimeout(current.reconnectTimer);
      if (current.unsubscribeStream) {
        current.unsubscribeStream();
        current.unsubscribeStream = null;
      }

      if (current.stopped) {
        return;
      }

      current.state.loading = true;
      current.state.connected = false;
      render(current.root, current.state);

      try {
        await seed(current.state);
      } catch (err) {
        current.state.items = [];
        current.state.connected = false;
        console.error('[MCActivityFeed] Seed failed', err);
        if (window.MCToast) window.MCToast.warn('Unable to load live events');
      } finally {
        if (current.stopped) {
          return;
        }
        current.state.loading = false;
        render(current.root, current.state);
      }

      if (current.stopped) {
        return;
      }

      connectStream(current.state, current.root, current);
    }

    start(instance).catch((err) => {
      console.error('[MCActivityFeed] Initialization failed', err);
    });

    return root;
  }

  function stopActivityFeed(containerId) {
    const instance = instances.get(containerId);
    if (!instance) return;

    instance.stopped = true;
    clearTimeout(instance.reconnectTimer);
    if (typeof instance.unsubscribeStream === 'function') {
      instance.unsubscribeStream();
    }
    if (typeof instance.unsubscribeAdminKey === 'function') {
      instance.unsubscribeAdminKey();
    }
    instances.delete(containerId);
  }

  return {
    createActivityFeed,
    stopActivityFeed,
  };
})();

window.createActivityFeed = function createActivityFeed(containerId) {
  return window.MCActivityFeed.createActivityFeed(containerId);
};

window.stopActivityFeed = function stopActivityFeed(containerId) {
  return window.MCActivityFeed.stopActivityFeed(containerId);
};