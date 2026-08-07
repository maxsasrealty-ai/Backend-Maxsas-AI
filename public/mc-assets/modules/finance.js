window.MCModFinance = (function () {
  const state = {
    payments: [],
    loading: false,
  };

  const STATUS = {
    success:    { c: 'var(--mc-green)',  bg: 'var(--mc-green-dim)',  label: 'SUCCESS' },
    completed:  { c: 'var(--mc-green)',  bg: 'var(--mc-green-dim)',  label: 'COMPLETED' },
    pending:    { c: 'var(--mc-amber)',  bg: 'var(--mc-amber-dim)',  label: 'PENDING' },
    processing: { c: 'var(--mc-cyan)',   bg: 'var(--mc-cyan-dim)',   label: 'PROCESSING' },
    initiated:  { c: 'var(--mc-cyan)',   bg: 'var(--mc-cyan-dim)',   label: 'INITIATED' },
    failed:     { c: 'var(--mc-red)',    bg: 'var(--mc-red-dim)',    label: 'FAILED' },
    refunded:   { c: 'var(--mc-violet)', bg: 'var(--mc-violet-dim)', label: 'REFUNDED' },
    cancelled:  { c: 'var(--mc-faint)',  bg: 'rgba(148,163,184,0.12)', label: 'CANCELLED' },
  };

  function getRoot() {
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

  function statusBadge(status) {
    const key = String(status || '').toLowerCase();
    const mapped = STATUS[key] || { c: 'var(--mc-muted)', bg: 'rgba(148,163,184,0.1)', label: String(status || 'UNKNOWN').toUpperCase() };
    return `<span style="display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:600;font-family:var(--mc-font-mono);letter-spacing:0.06em;background:${mapped.bg};color:${mapped.c};">${mapped.label}</span>`;
  }

  function paise(value) {
    if (value == null || Number.isNaN(Number(value))) return '–';
    return '₹' + (Number(value) / 100).toFixed(2);
  }

  function timeAgo(timestamp) {
    if (!timestamp) return '–';
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function lifecyclePipeline(order) {
    const steps = [
      { label: 'User Initiated',   icon: 'user',        ts: order.createdAt },
      { label: 'Backend Received',  icon: 'server',      ts: order.updatedAt },
      { label: 'Gateway Response',  icon: 'credit-card', ts: order.gatewayUpdatedAt || order.updatedAt },
      { label: 'DB Saved',          icon: 'database',    ts: order.updatedAt },
      { label: 'Wallet Credited',   icon: 'wallet',      ts: order.walletCreditedAt || null },
    ];

    const statusKey = String(order.status || '').toLowerCase();
    const isFailed = statusKey === 'failed' || statusKey === 'cancelled';
    const isSuccess = statusKey === 'success' || statusKey === 'completed';

    return `
      <div style="display:flex;align-items:center;gap:0;flex-wrap:wrap;margin:12px 0;">
        ${steps.map((step, index) => {
          const reached = isSuccess ? true : (isFailed && index <= 2) ? true : index === 0;
          const failed = isFailed && index === 3;
          const color = failed ? 'var(--mc-red)' : reached ? 'var(--mc-lime)' : 'var(--mc-border)';
          const textColor = failed ? 'var(--mc-red)' : reached ? 'var(--mc-text)' : 'var(--mc-faint)';
          return `
            <div style="display:flex;align-items:center;gap:0;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:80px;">
                <div style="width:32px;height:32px;border-radius:50%;border:2px solid ${color};display:flex;align-items:center;justify-content:center;background:${reached && !failed ? 'rgba(184,255,90,0.1)' : failed ? 'var(--mc-red-dim)' : 'transparent'};">
                  <i data-lucide="${step.icon}" style="width:13px;height:13px;color:${color};"></i>
                </div>
                <span style="font-size:9px;color:${textColor};text-align:center;font-family:var(--mc-font-mono);max-width:70px;line-height:1.3;">${step.label}</span>
                ${step.ts && reached ? `<span style="font-size:8px;color:var(--mc-faint);font-family:var(--mc-font-mono);">${timeAgo(step.ts)}</span>` : ''}
              </div>
              ${index < steps.length - 1 ? `<div style="width:28px;height:2px;background:${reached && !failed ? 'var(--mc-lime)' : 'var(--mc-border)'};flex-shrink:0;margin-bottom:20px;"></div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderEvents(events) {
    if (!events || !events.length) {
      return `<div style="padding:16px;color:var(--mc-faint);font-size:12px;font-family:var(--mc-font-mono);">No webhook events recorded for this order.</div>`;
    }

    return events.map((event) => {
      const type = String(event.eventType || event.event_type || '').toLowerCase();
      let color = 'var(--mc-muted)';
      if (type.includes('success') || type.includes('completed')) color = 'var(--mc-green)';
      else if (type.includes('fail') || type.includes('error')) color = 'var(--mc-red)';
      else if (type.includes('webhook') || type.includes('notify')) color = 'var(--mc-cyan)';
      else if (type.includes('wallet') || type.includes('credit')) color = 'var(--mc-lime)';

      return `
        <div class="mc-feed-item">
          <div class="mc-feed-dot" style="background:${color};"></div>
          <div class="mc-feed-body">
            <div class="mc-feed-event" style="color:${color};">${escapeHtml(event.eventType || event.event_type || 'event')}</div>
            <div class="mc-feed-meta">
              ${event.occurredAt || event.occurred_at ? `<span>${new Date(event.occurredAt || event.occurred_at).toLocaleTimeString()}</span> · ` : ''}
              ${event.rawPayload ? `<span style="color:var(--mc-faint);">${escapeHtml(JSON.stringify(event.rawPayload).slice(0, 80))}…</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function kpiRow(payments) {
    const total = payments.length;
    const success = payments.filter((payment) => ['success', 'completed'].includes(String(payment.status).toLowerCase())).length;
    const failed = payments.filter((payment) => ['failed', 'cancelled'].includes(String(payment.status).toLowerCase())).length;
    const pending = payments.filter((payment) => ['pending', 'processing', 'initiated'].includes(String(payment.status).toLowerCase())).length;
    const revenue = payments
      .filter((payment) => ['success', 'completed'].includes(String(payment.status).toLowerCase()))
      .reduce((sum, payment) => sum + (payment.amountPaise || payment.amount || 0), 0);

    function kpi(label, value, accentVar, icon) {
      return `
        <div class="mc-kpi" style="--mc-kpi-accent:var(${accentVar});">
          <div class="mc-kpi-label" style="display:flex;align-items:center;gap:4px;">
            <i data-lucide="${icon}" style="width:11px;height:11px;"></i>${label}
          </div>
          <div class="mc-kpi-value">${value}</div>
        </div>
      `;
    }

    return `
      <div class="mc-grid-4" style="margin-bottom:20px;">
        ${kpi('Total Orders', total, '--mc-mod-finance', 'receipt')}
        ${kpi('Successful', success, '--mc-mod-analytics', 'check-circle')}
        ${kpi('Failed', failed, '--mc-error', 'x-circle')}
        ${kpi('Pending', pending, '--mc-amber', 'clock')}
      </div>
      <div style="margin-top:-8px; margin-bottom:16px;">
        <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-lime); max-width:240px;">
          <div class="mc-kpi-label" style="display:flex;align-items:center;gap:4px;">
            <i data-lucide="indian-rupee" style="width:11px;height:11px;"></i>Revenue
          </div>
          <div class="mc-kpi-value">${paise(revenue)}</div>
        </div>
      </div>
    `;
  }

  function paymentsTable(payments) {
    if (!payments.length) {
      return `
        <div class="mc-empty">
          <div class="mc-empty-icon"><i data-lucide="credit-card" style="width:32px;height:32px;"></i></div>
          <div class="mc-empty-title">No payment orders found</div>
          <div class="mc-empty-desc">Payment orders will appear here once users initiate wallet top-ups.</div>
        </div>
      `;
    }

    return `
      <div class="mc-table-wrap">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Order ID / Txn</th>
              <th>Tenant</th>
              <th>Amount</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Wallet</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${payments.slice(0, 100).map((payment) => {
              const walletUpdated = payment.balanceUpdated || payment.walletCreditedAt;
              return `
                <tr class="mc-pay-row" data-id="${escapeHtml(payment.id)}" style="cursor:pointer;">
                  <td>
                    <div style="font-size:11px;color:var(--mc-text);">${escapeHtml((payment.id || '').slice(0, 16))}…</div>
                    <div style="font-size:10px;color:var(--mc-faint);">${escapeHtml(payment.merchantTransactionId || payment.txnId || '–')}</div>
                  </td>
                  <td style="font-size:11px;">${escapeHtml(payment.tenantId || '–')}</td>
                  <td style="color:var(--mc-lime);font-weight:600;">${paise(payment.amountPaise || payment.amount)}</td>
                  <td>
                    <span style="font-size:10px;font-family:var(--mc-font-mono);color:var(--mc-muted);">${escapeHtml(String(payment.provider || payment.paymentProvider || '–').toUpperCase())}</span>
                  </td>
                  <td>${statusBadge(payment.status)}</td>
                  <td>
                    <span style="font-size:11px;color:${walletUpdated ? 'var(--mc-green)' : 'var(--mc-faint)'};">
                      <i data-lucide="${walletUpdated ? 'check-circle' : 'clock'}" style="width:12px;height:12px;vertical-align:middle;"></i>
                      ${walletUpdated ? 'Credited' : 'Pending'}
                    </span>
                  </td>
                  <td style="font-size:10px;color:var(--mc-faint);">${timeAgo(payment.createdAt)}</td>
                  <td>
                    <button class="mc-btn mc-btn-ghost mc-btn-sm mc-pay-inspect" data-id="${escapeHtml(payment.id)}">
                      <i data-lucide="eye" style="width:11px;height:11px;"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function openDrawer(orderId) {
    const root = getRoot();
    if (!root) return;

    const existing = root.querySelector('#mc-pay-drawer');
    if (existing) existing.remove();

    const drawer = document.createElement('div');
    drawer.id = 'mc-pay-drawer';
    drawer.style.cssText = `
      position:fixed;top:var(--mc-topbar-h);right:0;bottom:0;width:480px;max-width:95vw;
      background:var(--mc-panel-2);border-left:1px solid var(--mc-border);
      z-index:var(--mc-z-modal);overflow-y:auto;padding:20px;
      animation:mc-slidein 200ms cubic-bezier(0.16,1,0.3,1) forwards;
      box-shadow:-8px 0 32px rgba(0,0,0,0.5);
    `;
    drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:600;">Payment Detail</div>
        <button id="mc-pay-drawer-close" class="mc-btn mc-btn-ghost mc-btn-sm">
          <i data-lucide="x" style="width:13px;height:13px;"></i> Close
        </button>
      </div>
      <div id="mc-pay-drawer-body" style="color:var(--mc-muted);font-size:12px;font-family:var(--mc-font-mono);">Loading…</div>
    `;
    document.body.appendChild(drawer);
    if (window.lucide) window.lucide.createIcons();

    drawer.querySelector('#mc-pay-drawer-close')?.addEventListener('click', () => drawer.remove());
    drawer.addEventListener('click', (event) => { if (event.target === drawer) drawer.remove(); });

    if (!document.getElementById('mc-pay-drawer-style')) {
      const style = document.createElement('style');
      style.id = 'mc-pay-drawer-style';
      style.textContent = '@keyframes mc-slidein{from{transform:translateX(100%)}to{transform:translateX(0)}}';
      document.head.appendChild(style);
    }

    try {
      const payment = state.payments.find((item) => String(item.id) === String(orderId)) || {};
      const eventsResponse = await MCApi.getPaymentEvents(orderId);
      const events = eventsResponse?.data || eventsResponse || [];

      const body = drawer.querySelector('#mc-pay-drawer-body');
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="mc-card" style="background:var(--mc-panel);">
            <div class="mc-card-header">
              <div class="mc-card-title">
                <i data-lucide="receipt" style="width:14px;height:14px;color:var(--mc-amber);"></i>
                Order #${escapeHtml(payment.id || orderId)}
              </div>
              ${statusBadge(payment.status)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${[
                ['Amount', paise(payment.amountPaise || payment.amount)],
                ['Provider', payment.provider || payment.paymentProvider || '–'],
                ['Tenant', payment.tenantId || '–'],
                ['User', payment.userId || '–'],
                ['Txn ID', payment.merchantTransactionId || payment.txnId || '–'],
                ['Gateway Txn', payment.gatewayTransactionId || '–'],
                ['Created', payment.createdAt ? new Date(payment.createdAt).toLocaleString() : '–'],
                ['Updated', payment.updatedAt ? new Date(payment.updatedAt).toLocaleString() : '–'],
              ].map(([label, value]) => `
                <div>
                  <div style="font-size:9px;color:var(--mc-faint);text-transform:uppercase;letter-spacing:0.07em;">${label}</div>
                  <div style="font-size:12px;color:var(--mc-text);font-family:var(--mc-font-mono);word-break:break-all;">${escapeHtml(value)}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="mc-card" style="background:var(--mc-panel);">
            <div class="mc-card-header">
              <div class="mc-card-title">
                <i data-lucide="git-branch" style="width:14px;height:14px;color:var(--mc-lime);"></i>
                Payment Pipeline
              </div>
            </div>
            ${lifecyclePipeline(payment)}
          </div>

          <div class="mc-card" style="background:var(--mc-panel);">
            <div class="mc-card-header">
              <div class="mc-card-title">
                <i data-lucide="webhook" style="width:14px;height:14px;color:var(--mc-cyan);"></i>
                Webhook / Event Timeline
              </div>
            </div>
            ${renderEvents(Array.isArray(events) ? events : [])}
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    } catch (error) {
      drawer.querySelector('#mc-pay-drawer-body').innerHTML = `<div style="color:var(--mc-red);">Failed to load: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadData() {
    state.loading = true;
    try {
      const response = await MCApi.getPayments(100);
      const payments = response?.data || response || [];
      state.payments = Array.isArray(payments) ? payments : [];

      const kpis = document.getElementById('mc-fin-kpis');
      const table = document.getElementById('mc-fin-table');
      const count = document.getElementById('mc-fin-count');

      if (kpis) kpis.innerHTML = kpiRow(state.payments);
      if (table) table.innerHTML = paymentsTable(state.payments);
      if (count) count.textContent = state.payments.length + ' orders';

      if (window.lucide) window.lucide.createIcons();

      document.querySelectorAll('.mc-pay-inspect, .mc-pay-row').forEach((row) => {
        row.addEventListener('click', (event) => {
          event.stopPropagation();
          const id = row.dataset.id;
          if (id) openDrawer(id);
        });
      });
    } catch (error) {
      const table = document.getElementById('mc-fin-table');
      if (table) {
        table.innerHTML = `
          <div class="mc-empty">
            <div class="mc-empty-icon"><i data-lucide="alert-triangle" style="width:28px;height:28px;color:var(--mc-red);"></i></div>
            <div class="mc-empty-title" style="color:var(--mc-red);">Failed to load payments</div>
            <div class="mc-empty-desc">${escapeHtml(error.message)}<br><br>Check: admin key correct hai? Backend /api/admin/dev-monitor/payments respond kar raha hai?</div>
          </div>
        `;
      }
      if (window.lucide) window.lucide.createIcons();
    } finally {
      state.loading = false;
    }
  }

  function render() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = `
      <div style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:20px;">
        <div class="mc-section-header">
          <div>
            <div class="mc-section-title" style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="credit-card" style="width:18px;height:18px;color:var(--mc-amber);"></i>
              Finance & Payments Monitor
            </div>
            <div class="mc-section-meta" style="margin-top:4px;">
              Full lifecycle: initiation → gateway → DB → wallet credit
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-fin-refresh">
              <i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> Refresh
            </button>
          </div>
        </div>

          <div class="mc-card" style="padding:12px;display:flex;gap:12px;align-items:center;justify-content:space-between;">
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="font-weight:600;">PayU Runtime Controls</div>
              <div style="font-size:12px;color:var(--mc-faint);">Control PayU redirect target and server return base at runtime.</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="mc-payu-frontend-target" style="padding:6px;border-radius:6px;background:var(--mc-panel);border:1px solid var(--mc-border);">
                <option value="production">Production (maxsasrealtyai.in)</option>
                <option value="local">Local (localhost)</option>
              </select>
              <select id="mc-payu-mode" style="padding:6px;border-radius:6px;background:var(--mc-panel);border:1px solid var(--mc-border);">
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
              <input id="mc-payu-server-base" placeholder="PayU server return base (optional)" style="min-width:320px;padding:6px;border-radius:6px;background:var(--mc-panel);border:1px solid var(--mc-border);" />
              <button id="mc-payu-save" class="mc-btn mc-btn-primary mc-btn-sm">Save</button>
            </div>
          </div>

        <div id="mc-fin-kpis">
          <div class="mc-grid-4">
            ${['Orders', 'Success', 'Failed', 'Revenue'].map((label) => `
              <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-mod-finance);">
                <div class="mc-kpi-label">${label}</div>
                <div class="mc-kpi-value mc-skeleton" style="width:60px;height:28px;"></div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="mc-card" id="mc-fin-table-card" style="padding:0;overflow:hidden;">
          <div class="mc-card-header" style="padding:14px 16px;">
            <div class="mc-card-title">
              <i data-lucide="list" style="width:15px;height:15px;color:var(--mc-amber);"></i>
              Payment Orders
            </div>
            <div class="mc-section-meta" id="mc-fin-count">Loading…</div>
          </div>
          <div id="mc-fin-table" style="padding:0 16px 16px;">
            <div style="color:var(--mc-faint);font-size:12px;padding:24px 0;text-align:center;font-family:var(--mc-font-mono);">
              Fetching payment orders from /api/admin/dev-monitor/payments…
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    document.getElementById('mc-fin-refresh')?.addEventListener('click', () => {
      window.MCToast?.info('Refreshing payments…');
      loadData();
    });

    // PayU controls
    async function loadPayUControls() {
      try {
        const resp = await MCApi.getBackendControl();
        const snapshot = resp.data || resp;
        const integrations = snapshot.state && snapshot.state.integrations ? snapshot.state.integrations : {};
        const modeEl = document.getElementById('mc-payu-mode');
        const targetEl = document.getElementById('mc-payu-frontend-target');
        const baseEl = document.getElementById('mc-payu-server-base');
        if (modeEl) modeEl.value = integrations.payuMode || 'test';
        if (targetEl) targetEl.value = integrations.payuFrontendTarget || 'production';
        if (baseEl) baseEl.value = integrations.payuServerReturnBase || '';
      } catch (err) {
        // ignore; MCApi will show toast
      }
    }

    document.getElementById('mc-payu-save')?.addEventListener('click', async () => {
      const mode = document.getElementById('mc-payu-mode').value;
      const target = document.getElementById('mc-payu-frontend-target').value;
      const base = document.getElementById('mc-payu-server-base').value.trim();

      try {
        window.MCToast?.info('Saving PayU settings…');
        const body = { integrations: { payuMode: mode, payuFrontendTarget: target, payuServerReturnBase: base } };
        const result = await MCApi.updateBackendControl(body);
        window.MCToast?.success('PayU settings saved');
        await loadPayUControls();
      } catch (err) {
        // MCApi shows toast and throws
      }
    });

    // initial load
    loadPayUControls();

    loadData();
  }

  return { render };
})();