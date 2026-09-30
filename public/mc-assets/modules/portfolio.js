window.MCModPortfolio = (function () {
  const state = { root: null, snapshot: null, handlers: null, keyHandler: null };
  const TABLE_ID = 'mc-portfolio-table';
  const COLORS = ['var(--mc-cyan)', 'var(--mc-green)', 'var(--mc-amber)', 'var(--mc-violet)', 'var(--mc-blue)'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    const amount = Math.round(Number(value) || 0);
    if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(1) + 'Cr';
    if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
    if (amount >= 1000) return '₹' + (amount / 1000).toFixed(1) + 'K';
    return '₹' + amount.toLocaleString('en-IN');
  }

  function number(value) {
    return (Number(value) || 0).toLocaleString('en-IN');
  }

  function percent(value) {
    return (Number(value) || 0).toFixed(1) + '%';
  }

  function timeAgo(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const activityDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (left, right) => left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + ' min ago';
    if (sameDay(activityDate, today)) {
      const hours = Math.floor(minutes / 60);
      return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    }
    if (sameDay(activityDate, yesterday)) return 'Yesterday';
    return Math.floor(minutes / 1440) + ' days ago';
  }

  function displayDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function statusLabel(status) {
    return ({ 'at-risk': 'At Risk', 'low-balance': 'Low Balance', enterprise: 'Enterprise', growing: 'Growing', inactive: 'Inactive', active: 'Active', trial: 'Trial', new: 'New' })[status] || status;
  }

  function statusBadge(status) {
    return `<span class="mc-portfolio-badge mc-portfolio-state-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function customerState(customer) {
    if (customer.status === 'at-risk') return 'at-risk';
    if (customer.status === 'inactive') return 'inactive';
    if (customer.status === 'trial' || customer.status === 'new') return 'trial';
    if (customer.lowBalance) return 'low-balance';
    if (customer.segment === 'Enterprise') return 'enterprise';
    if (customer.segment === 'Growing') return 'growing';
    return 'active';
  }

  function planBadge(plan) {
    const className = String(plan).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<span class="mc-portfolio-badge mc-portfolio-plan-${escapeHtml(className)}">${escapeHtml(plan)}</span>`;
  }

  function ensureStyles() {
    if (document.getElementById('mc-portfolio-styles')) return;
    const style = document.createElement('style');
    style.id = 'mc-portfolio-styles';
    style.textContent = `
      .mc-portfolio { width:100%; max-width:var(--mc-content-max); margin:0 auto; display:flex; flex-direction:column; gap:18px; }
      .mc-portfolio-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
      .mc-portfolio-heading { display:flex; align-items:center; gap:10px; }
      .mc-portfolio-heading h1 { color:var(--mc-text); font-size:22px; font-weight:700; line-height:1.2; }
      .mc-portfolio-heading-icon { display:grid; place-items:center; width:36px; height:36px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); color:var(--mc-cyan); }
      .mc-portfolio-heading-icon i { width:17px; height:17px; }
      .mc-portfolio-subtitle { margin:5px 0 0 46px; color:var(--mc-muted); font-size:12px; }
      .mc-portfolio-header-actions { display:flex; align-items:center; gap:10px; }
      .mc-portfolio-sim-label { display:inline-flex; align-items:center; gap:7px; padding:6px 9px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); color:var(--mc-muted); background:var(--mc-panel); font:10px var(--mc-font-mono); text-transform:uppercase; }
      .mc-portfolio-sim-dot { width:7px; height:7px; border-radius:50%; background:var(--mc-cyan); box-shadow:0 0 9px var(--mc-cyan); }
      .mc-portfolio-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .mc-portfolio-kpis .mc-kpi-card { min-width:0; padding:15px; gap:9px; }
      .mc-portfolio-kpis .mc-kpi-card__value { font-size:22px; }
        .mc-portfolio-kpis .mc-kpi-card__label { font-size:10px; }
        .mc-portfolio-trends { display:flex; flex-direction:column; gap:10px; }
        .mc-portfolio-section-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .mc-portfolio-section-heading h2 { color:var(--mc-text); font-size:13px; font-weight:650; }
        .mc-portfolio-section-heading span { color:var(--mc-faint); font:10px var(--mc-font-mono); }
        .mc-portfolio-chart-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .mc-portfolio-chart-panel { min-width:0; padding:13px 14px 10px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); }
        .mc-portfolio-chart-panel h3 { margin-bottom:8px; color:var(--mc-muted); font-size:10px; font-weight:600; text-transform:uppercase; }
        .mc-portfolio-chart-canvas { position:relative; height:150px; }
        .mc-portfolio-table-heading { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 14px 0; }
        .mc-portfolio-table-heading h2 { color:var(--mc-text); font-size:13px; font-weight:650; }
        .mc-portfolio-table-heading span { color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-portfolio-filters { display:flex; flex-wrap:wrap; gap:8px; padding:0 2px; }
      .mc-portfolio-filter { width:auto; min-width:140px; height:34px; padding:0 28px 0 10px; }
      .mc-portfolio-body { display:grid; grid-template-columns:minmax(0,1fr) 270px; gap:12px; align-items:start; }
      .mc-portfolio-table-shell,.mc-portfolio-activity { min-width:0; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); overflow:hidden; }
      .mc-portfolio-table-shell .mc-data-table { padding:14px; border:0; border-radius:0; background:transparent; box-shadow:none; backdrop-filter:none; }
      .mc-portfolio-activity { padding:15px; }
      .mc-portfolio-panel-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .mc-portfolio-panel-heading h2 { color:var(--mc-text); font-size:13px; font-weight:650; }
      .mc-portfolio-count { color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-portfolio-activity-list { display:flex; flex-direction:column; }
        .mc-portfolio-activity-item { display:grid; grid-template-columns:8px minmax(0,1fr); gap:9px; padding:9px 0; border-top:1px solid var(--mc-border-soft); }
      .mc-portfolio-activity-mark { width:8px; height:8px; margin-top:5px; border-radius:50%; background:var(--activity-color,var(--mc-cyan)); box-shadow:0 0 9px color-mix(in srgb,var(--activity-color,var(--mc-cyan)) 55%,transparent); }
      .mc-portfolio-activity-message { color:var(--mc-text); font-size:11px; line-height:1.45; }
      .mc-portfolio-activity-company { color:var(--mc-muted); }
      .mc-portfolio-activity-time { display:block; margin-top:4px; color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-portfolio-company-cell { display:flex; align-items:center; gap:9px; min-width:165px; }
        .mc-portfolio-company-cell { display:flex; align-items:center; gap:8px; min-width:150px; }
      .mc-portfolio-avatar { display:grid; place-items:center; flex:0 0 30px; width:30px; height:30px; border:1px solid color-mix(in srgb,var(--avatar-color) 46%,transparent); border-radius:9px; background:color-mix(in srgb,var(--avatar-color) 13%,transparent); color:var(--avatar-color); font:600 10px var(--mc-font-mono); }
      .mc-portfolio-company-name { color:var(--mc-text); font-weight:600; white-space:nowrap; }
      .mc-portfolio-company-id { margin-top:2px; color:var(--mc-faint); font:9px var(--mc-font-mono); }
        .mc-portfolio-company-segment { display:block; margin-top:2px; color:var(--mc-muted); font-size:10px; }
      .mc-portfolio-badge { display:inline-flex; align-items:center; padding:3px 7px; border:1px solid transparent; border-radius:999px; font:600 9px var(--mc-font-mono); white-space:nowrap; }
      .mc-portfolio-state-active { color:var(--mc-green); background:var(--mc-green-dim); border-color:color-mix(in srgb,var(--mc-green) 22%,transparent); }
      .mc-portfolio-state-trial { color:var(--mc-cyan); background:var(--mc-cyan-dim); border-color:color-mix(in srgb,var(--mc-cyan) 22%,transparent); }
      .mc-portfolio-state-growing { color:var(--mc-blue); background:var(--mc-blue-dim); border-color:color-mix(in srgb,var(--mc-blue) 22%,transparent); }
      .mc-portfolio-state-enterprise { color:var(--mc-violet); background:var(--mc-violet-dim); border-color:color-mix(in srgb,var(--mc-violet) 22%,transparent); }
      .mc-portfolio-state-low-balance { color:var(--mc-amber); background:var(--mc-amber-dim); border-color:color-mix(in srgb,var(--mc-amber) 22%,transparent); }
      .mc-portfolio-state-at-risk { color:var(--mc-red); background:var(--mc-red-dim); border-color:color-mix(in srgb,var(--mc-red) 22%,transparent); }
      .mc-portfolio-state-inactive { color:var(--mc-faint); background:rgba(148,163,184,.1); border-color:var(--mc-border); }
      .mc-portfolio-plan-lexus { color:var(--mc-cyan); background:var(--mc-cyan-dim); }
      .mc-portfolio-plan-prestige { color:var(--mc-lime); background:var(--mc-lime-dim); }
      .mc-portfolio-plan-enterprise { color:var(--mc-violet); background:var(--mc-violet-dim); }
        .mc-portfolio-detail-highlights { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
        .mc-portfolio-highlight { padding:10px 12px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); }
        .mc-portfolio-highlight span { display:block; color:var(--mc-muted); font-size:9px; text-transform:uppercase; }
        .mc-portfolio-highlight strong { display:block; margin-top:4px; color:var(--mc-text); font:600 15px var(--mc-font-mono); }
        .mc-portfolio-detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .mc-portfolio-history-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .mc-portfolio-history-grid > section:last-child { grid-column:1 / -1; }
      .mc-portfolio-row-button { display:block; width:100%; color:inherit; text-align:left; }
      .mc-portfolio-overlay { position:fixed; inset:0; z-index:var(--mc-z-modal); display:flex; justify-content:flex-end; background:rgba(2,6,12,.72); backdrop-filter:blur(5px); }
      .mc-portfolio-drawer { width:min(820px,96vw); height:100%; overflow:auto; border-left:1px solid var(--mc-border); background:var(--mc-surface); box-shadow:-18px 0 55px rgba(0,0,0,.5); animation:mc-portfolio-enter 220ms cubic-bezier(.16,1,.3,1) both; }
      @keyframes mc-portfolio-enter { from { transform:translateX(24px); opacity:.65; } to { transform:translateX(0); opacity:1; } }
      .mc-portfolio-drawer-header { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border-bottom:1px solid var(--mc-border); background:color-mix(in srgb,var(--mc-surface) 94%,transparent); backdrop-filter:blur(16px); }
      .mc-portfolio-drawer-title { display:flex; align-items:center; gap:11px; min-width:0; }
      .mc-portfolio-drawer-title h2 { overflow:hidden; color:var(--mc-text); font-size:16px; text-overflow:ellipsis; white-space:nowrap; }
      .mc-portfolio-drawer-title p { margin-top:2px; color:var(--mc-muted); font:10px var(--mc-font-mono); }
      .mc-portfolio-drawer-body { display:flex; flex-direction:column; gap:14px; padding:16px 20px 24px; }
      .mc-portfolio-detail-card { min-width:0; padding:13px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); }
      .mc-portfolio-detail-card h3 { display:flex; align-items:center; gap:7px; margin-bottom:12px; color:var(--mc-text); font-size:12px; font-weight:650; }
      .mc-portfolio-detail-card h3 i { width:14px; height:14px; color:var(--mc-cyan); }
      .mc-portfolio-detail-item { display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-top:1px solid var(--mc-border-soft); font-size:10px; }
      .mc-portfolio-detail-item:first-of-type { border-top:0; }
      .mc-portfolio-detail-label { color:var(--mc-muted); }
      .mc-portfolio-detail-value { color:var(--mc-text); font-family:var(--mc-font-mono); text-align:right; }
      .mc-portfolio-history-list { display:flex; flex-direction:column; }
      .mc-portfolio-history-item { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:9px 0; border-top:1px solid var(--mc-border-soft); font-size:11px; }
      .mc-portfolio-history-item:first-child { border-top:0; }
      .mc-portfolio-history-main { min-width:0; color:var(--mc-text); }
      .mc-portfolio-history-meta { margin-top:3px; color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-portfolio-empty { padding:24px 12px; color:var(--mc-faint); font-size:11px; text-align:center; }
      @media (max-width:1100px) { .mc-portfolio-body { grid-template-columns:minmax(0,1fr); } .mc-portfolio-activity { order:-1; } .mc-portfolio-activity-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:18px; } }
        @media (max-width:1100px) { .mc-portfolio-chart-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-portfolio-chart-panel:last-child { grid-column:1 / -1; } }
      @media (max-width:760px) { .mc-portfolio-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-portfolio-header { flex-direction:column; } .mc-portfolio-header-actions { width:100%; justify-content:space-between; } .mc-portfolio-detail-grid { grid-template-columns:minmax(0,1fr); } .mc-portfolio-activity-list { grid-template-columns:minmax(0,1fr); } .mc-portfolio-drawer-body { padding:12px; } .mc-portfolio-drawer-header { padding:13px 12px; } }
        @media (max-width:760px) { .mc-portfolio-chart-grid { grid-template-columns:minmax(0,1fr); } .mc-portfolio-chart-panel:last-child { grid-column:auto; } .mc-portfolio-detail-highlights { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-portfolio-history-grid { grid-template-columns:minmax(0,1fr); } .mc-portfolio-history-grid > section:last-child { grid-column:auto; } }
      @media (max-width:760px) { #mc-shell.mc-portfolio-active { grid-template-columns:var(--mc-sidebar-collapsed) minmax(0,1fr); } #mc-shell.mc-portfolio-active #mc-content { min-width:0; padding:12px; } #mc-shell.mc-portfolio-active #mc-sidebar .mc-nav-label { display:none; } #mc-shell.mc-portfolio-active #mc-sidebar > div:first-child { justify-content:center !important; } #mc-shell.mc-portfolio-active #mc-sidebar > div:first-child > div:first-child { display:none; } #mc-shell.mc-portfolio-active #mc-sidebar > div:last-child { display:none; } #mc-shell.mc-portfolio-active .mc-sidebar-nav { padding:8px 5px !important; } #mc-shell.mc-portfolio-active .mc-nav-item { justify-content:center !important; padding-left:0 !important; padding-right:0 !important; } }
    `;
    document.head.appendChild(style);
  }

  function getCustomers() {
    const status = document.getElementById('mc-portfolio-status')?.value || 'all';
    const plan = document.getElementById('mc-portfolio-plan')?.value || 'all';
    const segment = document.getElementById('mc-portfolio-segment')?.value || 'all';
    return state.snapshot.customers.filter((customer) =>
      (status === 'all' || customer.status === status) &&
      (plan === 'all' || customer.plan === plan) &&
      (segment === 'all' || customer.segment === segment)
    );
  }

  function renderKpis() {
    const customers = state.snapshot.customers;
    const active = customers.filter((customer) => customer.status === 'active').length;
    const activeLast24Hours = customers.filter((customer) => Date.now() - new Date(customer.lastActivity).getTime() <= 24 * 60 * 60 * 1000).length;
    const monthStart = new Date(state.snapshot.generatedAt);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const newThisMonth = customers.filter((customer) => new Date(customer.createdAt) >= monthStart).length;
    const wallet = customers.reduce((sum, customer) => sum + customer.walletBalance, 0);
    const usage = customers.reduce((sum, customer) => sum + customer.currentMonthSpend, 0);
    const qualified = customers.reduce((sum, customer) => sum + customer.mtdQualifiedLeads, 0);
    const revenue = customers.flatMap((customer) => customer.transactions)
      .filter((transaction) => transaction.type === 'Recharge' && new Date(transaction.occurredAt) >= monthStart)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const cards = [
      { label: 'Customers', value: number(customers.length), icon: 'building-2', colorVar: COLORS[0] },
      { label: 'Active', value: number(active), icon: 'activity', colorVar: COLORS[1] },
      { label: 'Activity in 24h', value: number(activeLast24Hours), icon: 'radio', colorVar: COLORS[0] },
      { label: 'New This Month', value: number(newThisMonth), icon: 'user-round-plus', colorVar: COLORS[1] },
      { label: 'Wallet Balance', value: money(wallet), icon: 'wallet', colorVar: COLORS[2] },
      { label: 'MTD Usage', value: money(usage), icon: 'phone-call', colorVar: COLORS[0] },
      { label: 'Qualified Leads', value: number(qualified), icon: 'badge-check', colorVar: COLORS[1] },
      { label: 'MTD Revenue', value: money(revenue), icon: 'trending-up', colorVar: COLORS[2] },
    ];
    const container = document.getElementById('mc-portfolio-kpis');
    if (container) container.innerHTML = window.MCKpiCard.renderKpiCards(cards);
  }

  function hashIndex(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash);
  }

  function tableColumns() {
    return [
      { key: 'companyName', label: 'Customer', render: (_value, row) => `<button type="button" class="mc-portfolio-row-button"><span class="mc-portfolio-company-cell"><span class="mc-portfolio-avatar" style="--avatar-color:${COLORS[hashIndex(row.id) % COLORS.length]};">${escapeHtml(row.initials)}</span><span><span class="mc-portfolio-company-name">${escapeHtml(row.companyName)}</span><span class="mc-portfolio-company-segment">${escapeHtml(row.segment)}</span></span></span></button>` },
      { key: 'plan', label: 'Plan', render: (value) => planBadge(value) },
      { key: 'status', label: 'Status', render: (_value, row) => statusBadge(customerState(row)) },
      { key: 'walletBalance', label: 'Wallet', render: (value) => money(value) },
      { key: 'totalCalls', label: 'Calls', render: (value) => number(value) },
      { key: 'totalMinutes', label: 'Minutes', render: (value) => number(value) + ' min' },
      { key: 'qualifiedLeads', label: 'Qualified Leads', render: (value) => number(value) },
      { key: 'conversionRate', label: 'Conversion', render: (value) => percent(value) },
      { key: 'currentMonthSpend', label: 'MTD Spend', render: (value) => money(value) },
      { key: 'lastActivity', label: 'Last Activity', render: (value) => `<span title="${escapeHtml(displayDate(value))}">${escapeHtml(timeAgo(value))}</span>` },
    ];
  }

  function renderTable() {
    const target = document.getElementById(TABLE_ID);
    if (!target) return;
    window.MCDataTable.destroyDataTable(TABLE_ID);
    const rows = getCustomers();
    const count = document.getElementById('mc-portfolio-customer-count');
    if (count) count.textContent = number(rows.length) + (rows.length === 1 ? ' customer' : ' customers');
    const table = window.MCDataTable.createDataTable(tableColumns(), rows, { sortable: true, filterable: true, striped: true });
    window.MCDataTable.mountDataTable(TABLE_ID, table);
    const search = target.querySelector('[data-role="filter"]');
    if (search) search.placeholder = 'Search customers...';
    if (window.lucide) window.lucide.createIcons();
  }

  function renderCharts() {
    if (!window.Chart || !window.MCChart) return;
    const trend = state.snapshot.dailyTrend;
    const labels = trend.map((item) => new Date(item.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' }));
    const gridColor = 'rgba(255,255,255,0.06)';
    const tickColor = '#8892a4';
    const sharedOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, color: tickColor, font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0, font: { size: 9 } } } } };
    window.MCChart.createChart('mc-portfolio-usage-chart', 'line', {
      labels,
      datasets: [
        { label: 'Calls', data: trend.map((item) => item.calls), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.08)', fill: true, tension: 0.35, pointRadius: 2, yAxisID: 'y' },
        { label: 'Minutes', data: trend.map((item) => item.minutes), borderColor: '#34d399', backgroundColor: 'transparent', tension: 0.35, pointRadius: 2, yAxisID: 'y1' },
      ],
    }, { ...sharedOptions, scales: { ...sharedOptions.scales, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, precision: 0, font: { size: 9 } } } } });
    window.MCChart.createChart('mc-portfolio-leads-chart', 'bar', {
      labels,
      datasets: [{ label: 'Qualified leads', data: trend.map((item) => item.qualifiedLeads), backgroundColor: 'rgba(52,211,153,.6)', borderColor: '#34d399', borderWidth: 1, borderRadius: 3 }],
    }, { ...sharedOptions, plugins: { legend: { display: false } } });
    window.MCChart.createChart('mc-portfolio-wallet-chart', 'bar', {
      labels,
      datasets: [{ label: 'Wallet usage', data: trend.map((item) => item.walletConsumption), backgroundColor: 'rgba(251,191,36,.55)', borderColor: '#fbbf24', borderWidth: 1, borderRadius: 3 }],
    }, { ...sharedOptions, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => money(context.raw) } } }, scales: { ...sharedOptions.scales, y: { ...sharedOptions.scales.y, ticks: { color: tickColor, callback: (value) => money(value), font: { size: 9 } } } } });
  }

  function destroyCharts() {
    ['mc-portfolio-usage-chart', 'mc-portfolio-leads-chart', 'mc-portfolio-wallet-chart'].forEach((id) => window.MCChart?.destroyChart?.(id));
  }

  function activityColor(type) {
    return ({ wallet: COLORS[2], leads: COLORS[1], plan: COLORS[3], usage: COLORS[0] })[type] || COLORS[0];
  }

  function renderActivity() {
    const target = document.getElementById('mc-portfolio-activity-list');
    if (!target) return;
    const items = state.snapshot.activities.slice(0, 8);
    target.innerHTML = items.map((activity) => `
      <div class="mc-portfolio-activity-item" style="--activity-color:${activityColor(activity.type)};">
        <span class="mc-portfolio-activity-mark"></span>
        <div><div class="mc-portfolio-activity-message"><span class="mc-portfolio-activity-company">${escapeHtml(activity.companyName)}</span> ${escapeHtml(activity.message)}</div><time class="mc-portfolio-activity-time" datetime="${escapeHtml(activity.occurredAt)}">${escapeHtml(timeAgo(activity.occurredAt))}</time></div>
      </div>
    `).join('');
    const count = document.getElementById('mc-portfolio-activity-count');
    if (count) count.textContent = number(items.length) + ' events';
  }

  function renderDashboard() {
    state.root.innerHTML = `
      <section class="mc-portfolio" aria-label="Portfolio customer dashboard">
        <header class="mc-portfolio-header">
          <div><div class="mc-portfolio-heading"><span class="mc-portfolio-heading-icon"><i data-lucide="briefcase-business"></i></span><h1>Portfolio</h1></div><p class="mc-portfolio-subtitle">Customer ecosystem &amp; usage overview</p></div>
          <div class="mc-portfolio-header-actions"><span class="mc-portfolio-sim-label"><span class="mc-portfolio-sim-dot"></span>Demo Environment</span><button id="mc-portfolio-refresh" type="button" class="mc-btn mc-btn-ghost mc-btn-sm" title="Refresh demo snapshot"><i data-lucide="refresh-cw" style="width:13px;height:13px;"></i><span>Refresh</span></button></div>
        </header>
        <div id="mc-portfolio-kpis" class="mc-portfolio-kpis"></div>
        <section class="mc-portfolio-trends" aria-label="Portfolio trends">
          <div class="mc-portfolio-section-heading"><h2>Usage &amp; outcomes</h2><span>Rolling 7 days · demo portfolio</span></div>
          <div class="mc-portfolio-chart-grid">
            <article class="mc-portfolio-chart-panel"><h3>Calls &amp; minutes</h3><div class="mc-portfolio-chart-canvas"><canvas id="mc-portfolio-usage-chart"></canvas></div></article>
            <article class="mc-portfolio-chart-panel"><h3>Qualified leads</h3><div class="mc-portfolio-chart-canvas"><canvas id="mc-portfolio-leads-chart"></canvas></div></article>
            <article class="mc-portfolio-chart-panel"><h3>Wallet consumption</h3><div class="mc-portfolio-chart-canvas"><canvas id="mc-portfolio-wallet-chart"></canvas></div></article>
          </div>
        </section>
        <div class="mc-portfolio-filters" aria-label="Customer filters">
          <select id="mc-portfolio-status" class="mc-input mc-portfolio-filter" aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="trial">Trial</option><option value="new">New</option><option value="at-risk">At Risk</option><option value="inactive">Inactive</option></select>
          <select id="mc-portfolio-plan" class="mc-input mc-portfolio-filter" aria-label="Filter by plan"><option value="all">All plans</option><option value="Lexus">Lexus</option><option value="Prestige">Prestige</option><option value="Enterprise">Enterprise</option></select>
          <select id="mc-portfolio-segment" class="mc-input mc-portfolio-filter" aria-label="Filter by segment"><option value="all">All segments</option><option value="Trial / New">Trial / New</option><option value="Small / Low Usage">Small / Low Usage</option><option value="Growing">Growing</option><option value="Established">Established</option><option value="Enterprise">Enterprise</option><option value="At Risk">At Risk</option></select>
        </div>
        <div class="mc-portfolio-body">
          <section class="mc-portfolio-table-shell" aria-label="Portfolio customers"><div class="mc-portfolio-table-heading"><h2>Customers</h2><span id="mc-portfolio-customer-count"></span></div><div id="${TABLE_ID}"></div></section>
          <aside class="mc-portfolio-activity"><div class="mc-portfolio-panel-heading"><h2>Recent activity</h2><span id="mc-portfolio-activity-count" class="mc-portfolio-count"></span></div><div id="mc-portfolio-activity-list" class="mc-portfolio-activity-list"></div></aside>
        </div>
      </section>
    `;
    renderKpis();
    renderTable();
    renderCharts();
    renderActivity();
    if (window.lucide) window.lucide.createIcons();
  }

  function detailItem(label, value) {
    return `<div class="mc-portfolio-detail-item"><span class="mc-portfolio-detail-label">${escapeHtml(label)}</span><span class="mc-portfolio-detail-value">${escapeHtml(value)}</span></div>`;
  }

  function historyRows(items, getTitle, getMeta, getAmount) {
    if (!items.length) return '<div class="mc-portfolio-empty">No history recorded</div>';
    return items.map((item) => `<div class="mc-portfolio-history-item"><div class="mc-portfolio-history-main">${escapeHtml(getTitle(item))}<div class="mc-portfolio-history-meta">${escapeHtml(getMeta(item))}</div></div>${getAmount ? `<span class="mc-portfolio-detail-value">${escapeHtml(getAmount(item))}</span>` : ''}</div>`).join('');
  }

  function openCustomer(customer) {
    document.getElementById('mc-portfolio-overlay')?.remove();
    const connectedRate = customer.totalCalls ? (customer.connectedCalls / customer.totalCalls) * 100 : 0;
    const avgDuration = customer.connectedCalls ? customer.totalMinutes / customer.connectedCalls : 0;
    const tenureDays = Math.max(0, Math.floor((Date.now() - new Date(customer.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
    const overlay = document.createElement('div');
    overlay.id = 'mc-portfolio-overlay';
    overlay.className = 'mc-portfolio-overlay';
    overlay.innerHTML = `
      <section class="mc-portfolio-drawer" role="dialog" aria-modal="true" aria-labelledby="mc-portfolio-detail-title">
        <header class="mc-portfolio-drawer-header"><div class="mc-portfolio-drawer-title"><span class="mc-portfolio-avatar" style="--avatar-color:${COLORS[hashIndex(customer.id) % COLORS.length]};">${escapeHtml(customer.initials)}</span><div><h2 id="mc-portfolio-detail-title">${escapeHtml(customer.companyName)}</h2><p>${escapeHtml(customer.segment)} · ${escapeHtml(customer.plan)}</p></div>${statusBadge(customerState(customer))}</div><button type="button" class="mc-btn mc-btn-ghost mc-btn-sm mc-portfolio-close" aria-label="Close customer details"><i data-lucide="x" style="width:14px;height:14px;"></i></button></header>
        <div class="mc-portfolio-drawer-body">
          <div class="mc-portfolio-detail-highlights">
            <div class="mc-portfolio-highlight"><span>Calls</span><strong>${number(customer.totalCalls)}</strong></div>
            <div class="mc-portfolio-highlight"><span>Qualified leads</span><strong>${number(customer.qualifiedLeads)}</strong></div>
            <div class="mc-portfolio-highlight"><span>Conversion</span><strong>${percent(customer.conversionRate)}</strong></div>
            <div class="mc-portfolio-highlight"><span>MTD spend</span><strong>${money(customer.currentMonthSpend)}</strong></div>
          </div>
          <div class="mc-portfolio-detail-grid">
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="building-2"></i>Overview</h3>${detailItem('Plan', customer.plan)}<div class="mc-portfolio-detail-item"><span class="mc-portfolio-detail-label">Status</span>${statusBadge(customerState(customer))}</div>${detailItem('Customer Since', tenureDays + ' days')}${detailItem('Users', number(customer.users))}${detailItem('Segment', customer.segment)}</section>
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="phone-call"></i>Usage</h3>${detailItem('Calls', number(customer.totalCalls))}${detailItem('Connected Calls', number(customer.connectedCalls))}${detailItem('Minutes', number(customer.totalMinutes) + ' min')}${detailItem('Average Call Duration', avgDuration.toFixed(1) + ' min')}</section>
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="badge-check"></i>Leads</h3>${detailItem('Generated', number(customer.leads))}${detailItem('Qualified', number(customer.qualifiedLeads))}${detailItem('Conversion Rate', percent(customer.conversionRate))}</section>
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="wallet"></i>Financial</h3>${detailItem('Wallet Balance', money(customer.walletBalance))}${detailItem('MTD Spend', money(customer.currentMonthSpend))}${detailItem('Lifetime Spend', money(customer.lifetimeSpend))}${detailItem('Recharge Count', number(customer.rechargeCount))}${detailItem('Last Recharge', customer.lastRecharge ? timeAgo(customer.lastRecharge) : 'No recharge')}</section>
          </div>
          <div class="mc-portfolio-history-grid">
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="layers-3"></i>Plan History</h3><div class="mc-portfolio-history-list">${historyRows(customer.planHistory, (item) => item.action, (item) => displayDate(item.changedAt), (item) => item.amount ? money(item.amount) : '')}</div></section>
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="receipt"></i>Transactions</h3><div class="mc-portfolio-history-list">${historyRows(customer.transactions.slice(0, 8), (item) => item.type, (item) => displayDate(item.occurredAt), (item) => (item.amount < 0 ? '−' : '+') + money(Math.abs(item.amount)))}</div></section>
            <section class="mc-portfolio-detail-card"><h3><i data-lucide="activity"></i>Activity</h3><div class="mc-portfolio-history-list">${historyRows(customer.activityHistory.slice(0, 5), (item) => item.message, (item) => timeAgo(item.occurredAt))}</div></section>
          </div>
        </div>
      </section>
    `;
    state.root.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();
    overlay.querySelector('.mc-portfolio-close')?.focus();
  }

  function bindEvents() {
    const onClick = (event) => {
      const refresh = event.target.closest('#mc-portfolio-refresh');
      if (refresh) {
        state.snapshot = window.MCPortfolioDemoData.getSnapshot();
        renderKpis();
        renderTable();
        destroyCharts();
        renderCharts();
        renderActivity();
        return;
      }
      if (event.target.closest('.mc-portfolio-close') || event.target.id === 'mc-portfolio-overlay') {
        document.getElementById('mc-portfolio-overlay')?.remove();
        return;
      }
      const row = event.target.closest('#mc-portfolio-table tr[data-row-key]');
      if (row) {
        const customer = state.snapshot.customers.find((item) => item.id === row.dataset.rowKey);
        if (customer) openCustomer(customer);
      }
    };
    const onChange = (event) => {
      if (event.target.matches('#mc-portfolio-status, #mc-portfolio-plan, #mc-portfolio-segment')) renderTable();
    };
    state.handlers = { onClick, onChange };
    state.root.addEventListener('click', onClick);
    state.root.addEventListener('change', onChange);
    state.keyHandler = (event) => {
      if (event.key === 'Escape') document.getElementById('mc-portfolio-overlay')?.remove();
    };
    window.addEventListener('keydown', state.keyHandler);
  }

  function render() {
    destroy();
    ensureStyles();
    document.getElementById('mc-shell')?.classList.add('mc-portfolio-active');
    state.root = window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
    if (!state.root) return;
    state.snapshot = window.MCPortfolioDemoData.getSnapshot();
    renderDashboard();
    bindEvents();
  }

  function destroy() {
    if (state.root && state.handlers) {
      state.root.removeEventListener('click', state.handlers.onClick);
      state.root.removeEventListener('change', state.handlers.onChange);
    }
    if (state.keyHandler) window.removeEventListener('keydown', state.keyHandler);
    window.MCDataTable?.destroyDataTable?.(TABLE_ID);
    destroyCharts();
    document.getElementById('mc-portfolio-overlay')?.remove();
    document.getElementById('mc-shell')?.classList.remove('mc-portfolio-active');
    state.handlers = null;
    state.keyHandler = null;
  }

  return { render, destroy };
})();