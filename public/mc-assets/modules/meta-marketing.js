window.MCModMetaMarketing = (function () {
  const TABLE_ID = 'mc-meta-marketing-table';
  const STYLE_ID = 'mc-meta-marketing-styles';
  const state = {
    root: null,
    loading: false,
    error: '',
    data: null,
    requestSeq: 0,
    bootstrapped: false,
    filters: defaultFilters(),
  };

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function defaultFilters() {
    const until = new Date();
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - 6);
    return { since: isoDate(since), until: isoDate(until), breakdown: 'campaign' };
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mc-meta-marketing-page { display:flex; flex-direction:column; gap:15px; animation:slideUpFade 0.45s ease-out both; }
      .mc-meta-marketing-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
      .mc-meta-marketing-copy { display:flex; flex-direction:column; gap:6px; min-width:220px; }
      .mc-meta-marketing-title { margin:0; color:var(--mc-text); font-size:24px; line-height:1.2; font-weight:800; letter-spacing:0; }
      .mc-meta-marketing-subtitle { margin:0; color:var(--mc-muted); font-size:12px; line-height:1.5; }
      .mc-meta-marketing-toolbar { display:grid; grid-template-columns:repeat(3,minmax(135px,1fr)) auto; align-items:end; gap:10px; margin-top:14px; }
      .mc-meta-marketing-field { min-width:0; display:flex; flex-direction:column; gap:5px; }
      .mc-meta-marketing-field label { color:var(--mc-muted); font-size:10px; font-weight:700; }
      .mc-meta-marketing-field .mc-input { width:100%; min-width:0; height:34px; }
      .mc-meta-marketing-actions { display:flex; align-items:center; gap:8px; }
      .mc-meta-marketing-state { display:flex; align-items:flex-start; gap:9px; padding:10px 12px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.025); color:var(--mc-muted); font-size:11px; line-height:1.5; }
      .mc-meta-marketing-state.warn { color:var(--mc-amber); border-color:rgba(251,191,36,0.26); background:var(--mc-amber-dim); }
      .mc-meta-marketing-state.bad { color:var(--mc-red); border-color:rgba(244,63,94,0.26); background:var(--mc-red-dim); }
      .mc-meta-marketing-loading { display:flex; align-items:center; justify-content:center; gap:10px; min-height:120px; color:var(--mc-muted); font-size:12px; }
      .mc-meta-marketing-loading i { color:var(--mc-cyan); animation:mcMetaMarketingSpin 1.1s linear infinite; }
      @keyframes mcMetaMarketingSpin { to { transform:rotate(360deg); } }
      .mc-meta-marketing-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; }
      .mc-meta-marketing-kpi { display:flex; flex-direction:column; gap:5px; min-width:0; padding:11px 12px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.02); }
      .mc-meta-marketing-kpi-label { color:var(--mc-muted); font-size:10px; text-transform:uppercase; }
      .mc-meta-marketing-kpi-value { color:var(--mc-text); font:700 18px var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-marketing-kpi-note { color:var(--mc-faint); font-size:9px; line-height:1.35; }
      .mc-meta-marketing-unmatched { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .mc-meta-marketing-unmatched-item { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 11px; border:1px solid var(--mc-border); border-radius:var(--mc-r-xs); background:rgba(255,255,255,0.015); color:var(--mc-muted); font-size:10px; }
      .mc-meta-marketing-unmatched-item strong { color:var(--mc-text); font:700 12px var(--mc-font-mono); }
      .mc-meta-marketing-match { display:inline-flex; align-items:center; width:max-content; margin-top:4px; padding:2px 6px; border:1px solid var(--mc-border); border-radius:var(--mc-r-full); color:var(--mc-muted); font:700 9px var(--mc-font-mono); text-transform:uppercase; }
      .mc-meta-marketing-match.unresolved { color:var(--mc-amber); border-color:rgba(251,191,36,0.26); }
      .mc-meta-marketing-match.unmatched { color:var(--mc-red); border-color:rgba(244,63,94,0.25); }
      .mc-meta-marketing-empty { min-height:100px; display:flex; align-items:center; justify-content:center; padding:18px; color:var(--mc-muted); text-align:center; font-size:12px; }
      .mc-meta-marketing-footnote { color:var(--mc-faint); font-size:10px; line-height:1.45; }
      @media (max-width:900px) { .mc-meta-marketing-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-meta-marketing-toolbar { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-meta-marketing-actions { grid-column:1/-1; } }
      @media (max-width:560px) { .mc-meta-marketing-toolbar,.mc-meta-marketing-kpis,.mc-meta-marketing-unmatched { grid-template-columns:1fr; } .mc-meta-marketing-actions { grid-column:auto; } .mc-meta-marketing-actions .mc-btn { flex:1; } }
    `;
    document.head.appendChild(style);
  }

  function getRoot() {
    return window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
  }

  function numberOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function sumRows(rows, key) {
    const values = rows.map((row) => numberOrNull(row[key])).filter((value) => value !== null);
    if (!values.length) return null;
    return values.reduce((total, value) => total + value, 0);
  }

  function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(value);
  }

  function formatCount(value) {
    return value === null || value === undefined ? '--' : formatNumber(Number(value), 0);
  }

  function metaSpend(rows) {
    const total = sumRows(rows, 'spend');
    return total === null ? '--' : formatNumber(total, 2);
  }

  function mapError(category) {
    switch (category) {
      case 'missing_credentials':
      case 'incomplete_configuration':
        return { tone: 'warn', message: 'Meta Ads configuration is incomplete on the server.' };
      case 'invalid_token':
        return { tone: 'bad', message: 'The Meta access token is invalid or expired. Ask an administrator to review server configuration.' };
      case 'forbidden':
        return { tone: 'warn', message: 'Meta denied permission to read advertising metrics.' };
      case 'rate_limited':
        return { tone: 'warn', message: 'Meta rate-limited this request. Refresh later.' };
      case 'timeout':
        return { tone: 'bad', message: 'Meta analytics request timed out.' };
      case 'network_error':
      case 'meta_unavailable':
        return { tone: 'bad', message: 'The Meta Graph API could not be reached.' };
      case 'database_error':
      case 'DATABASE_ERROR':
        return { tone: 'bad', message: 'Registration analytics could not be loaded from the database.' };
      default:
        return { tone: 'bad', message: 'Marketing analytics could not be loaded. Check the filters and admin access.' };
    }
  }

  function backendNotice(data) {
    if (!data) return '';
    const status = data.metaStatus?.status;
    const category = data.metaStatus?.category;
    if (status === 'not_configured' || category === 'missing_credentials' || category === 'incomplete_configuration') {
      const info = mapError(category);
      return `<div class="mc-meta-marketing-state warn"><i data-lucide="settings-2" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`;
    }
    if (status === 'permission_denied' || category === 'invalid_token' || category === 'forbidden') {
      const info = mapError(category);
      return `<div class="mc-meta-marketing-state ${info.tone}"><i data-lucide="shield-alert" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`;
    }
    if (status === 'error' || (category && category !== 'ok')) {
      const info = mapError(category);
      return `<div class="mc-meta-marketing-state ${info.tone}"><i data-lucide="circle-alert" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`;
    }
    return '';
  }

  function partialNotice(data) {
    return data?.partial === true
      ? '<div class="mc-meta-marketing-state warn"><i data-lucide="list-restart" style="width:14px;height:14px;flex-shrink:0;"></i><span>Results are partial. Some Meta or registration data may be incomplete.</span></div>'
      : '';
  }

  function kpi(label, value, note) {
    return `<article class="mc-meta-marketing-kpi"><div class="mc-meta-marketing-kpi-label">${escapeHtml(label)}</div><div class="mc-meta-marketing-kpi-value">${escapeHtml(value)}</div>${note ? `<div class="mc-meta-marketing-kpi-note">${escapeHtml(note)}</div>` : ''}</article>`;
  }

  function renderKpis(data) {
    const summary = data.summary || {};
    const rows = Array.isArray(data.rows) ? data.rows : [];
    return `
      <section class="mc-meta-marketing-kpis" aria-label="Marketing summary">
        ${kpi('Meta Spend (account currency)', metaSpend(rows), 'Sum of returned Meta entities; no conversion applied')}
        ${kpi('Impressions', formatCount(sumRows(rows, 'impressions')), 'Sum of returned entities')}
        ${kpi('Clicks', formatCount(sumRows(rows, 'clicks')), 'Sum of returned entities')}
        ${kpi('Webinar Registrations', formatCount(summary.totalRegistrations))}
        ${kpi('Attributed Registrations', formatCount(summary.attributedRegistrations))}
        ${kpi('Paid Registrations', formatCount(summary.paidRegistrations))}
        ${kpi('Paid Attributed Registrations', formatCount(summary.paidAttributedRegistrations))}
        ${kpi('Unresolved Attributions', formatCount(summary.unresolvedRegistrations), 'Attribution signal exists but selected Meta ID is missing')}
      </section>
    `;
  }

  function renderUnmatched(data) {
    const summary = data.summary || {};
    return `
      <section class="mc-meta-marketing-unmatched" aria-label="Unmatched attribution summary">
        <div class="mc-meta-marketing-unmatched-item"><span>Unresolved registrations</span><strong>${formatCount(summary.unresolvedRegistrations)}</strong></div>
        <div class="mc-meta-marketing-unmatched-item"><span>Attributed IDs without Insights entity</span><strong>${formatCount(summary.unmatchedAttributedRegistrations)}</strong></div>
        <div class="mc-meta-marketing-unmatched-item"><span>Insights entities without attributed registrations</span><strong>${formatCount(summary.unmatchedMetaRows)}</strong></div>
      </section>
    `;
  }

  function dimensionCell(name, id, matchStatus, label) {
    const displayName = name || id || '--';
    const safeId = id && id !== displayName ? `<span class="mc-meta-marketing-footnote">ID ${escapeHtml(id)}</span>` : '';
    const status = matchStatus && matchStatus !== 'matched'
      ? `<span class="mc-meta-marketing-match ${escapeHtml(matchStatus)}">${escapeHtml(matchStatus)}</span>`
      : '';
    return `<div>${escapeHtml(displayName)}${safeId}${status ? `<br>${status}` : ''}</div>`;
  }

  function columnsFor(breakdown) {
    const columns = [];
    columns.push({
      key: 'campaignName',
      label: 'Campaign',
      render: (_value, row) => dimensionCell(row.campaignName, row.campaignId, row.matchStatus, 'Campaign'),
    });
    if (breakdown === 'adset' || breakdown === 'ad') {
      columns.push({
        key: 'adsetName',
        label: 'Ad Set',
        render: (_value, row) => dimensionCell(row.adsetName, row.adsetId, row.matchStatus, 'Ad Set'),
      });
    }
    if (breakdown === 'ad') {
      columns.push({
        key: 'adName',
        label: 'Ad',
        render: (_value, row) => dimensionCell(row.adName, row.adId, row.matchStatus, 'Ad'),
      });
    }
    columns.push(
      { key: 'spend', label: 'Spend (Meta currency)', render: (value) => formatNumber(numberOrNull(value), 2) },
      { key: 'impressions', label: 'Impressions', render: (value) => formatCount(value) },
      { key: 'reach', label: 'Reach', render: (value) => formatCount(value) },
      { key: 'clicks', label: 'Clicks', render: (value) => formatCount(value) },
      { key: 'ctr', label: 'CTR', render: (value) => `${formatNumber(numberOrNull(value), 2)}${numberOrNull(value) === null ? '' : '%'}` },
      { key: 'cpc', label: 'CPC', render: (value) => formatNumber(numberOrNull(value), 2) },
      { key: 'cpm', label: 'CPM', render: (value) => formatNumber(numberOrNull(value), 2) },
      { key: 'registrations', label: 'Registrations', render: (value) => formatCount(value) },
      { key: 'attributedRegistrations', label: 'Attributed Registrations', render: (value) => formatCount(value) },
      { key: 'paidRegistrations', label: 'Paid Registrations', render: (value) => formatCount(value) },
      { key: 'paidAttributedRegistrations', label: 'Paid Attributed', render: (value) => formatCount(value) },
      { key: 'unresolvedRegistrations', label: 'Unresolved', render: (value) => formatCount(value) },
    );
    return columns;
  }

  function renderTable(data) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) {
      return '<section class="mc-card mc-meta-marketing-empty">No marketing analytics data returned for the selected filters.</section>';
    }
    const columns = columnsFor(data.breakdown || state.filters.breakdown);
    const tableHtml = MCDataTable.createDataTable(columns, rows, { sortable: true, filterable: false });
    return `<section class="mc-card"><div id="${TABLE_ID}">${tableHtml}</div></section>`;
  }

  function render() {
    const root = state.root || getRoot();
    if (!root) return;
    if (window.MCDataTable) window.MCDataTable.destroyDataTable(TABLE_ID);
    state.root = root;
    const data = state.data;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const summary = data?.summary || {};
    const errorNotice = state.error
      ? `<div class="mc-meta-marketing-state bad"><i data-lucide="circle-alert" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(state.error)}</span></div>`
      : '';

    root.innerHTML = `
      <div class="mc-meta-marketing-page">
        <section class="mc-card">
          <div class="mc-meta-marketing-head">
            <div class="mc-meta-marketing-copy">
              <h1 class="mc-meta-marketing-title">Meta Marketing</h1>
              <p class="mc-meta-marketing-subtitle">Read-only Meta delivery and attributed webinar registration counts.</p>
            </div>
          </div>
          <form class="mc-meta-marketing-toolbar" data-form="filters">
            <div class="mc-meta-marketing-field"><label for="mc-meta-marketing-since">Date From</label><input id="mc-meta-marketing-since" class="mc-input" type="date" value="${escapeHtml(state.filters.since)}" required /></div>
            <div class="mc-meta-marketing-field"><label for="mc-meta-marketing-until">Date To</label><input id="mc-meta-marketing-until" class="mc-input" type="date" value="${escapeHtml(state.filters.until)}" required /></div>
            <div class="mc-meta-marketing-field"><label for="mc-meta-marketing-breakdown">Breakdown</label><select id="mc-meta-marketing-breakdown" class="mc-input"><option value="campaign" ${state.filters.breakdown === 'campaign' ? 'selected' : ''}>Campaign</option><option value="adset" ${state.filters.breakdown === 'adset' ? 'selected' : ''}>Ad Set</option><option value="ad" ${state.filters.breakdown === 'ad' ? 'selected' : ''}>Ad</option></select></div>
            <div class="mc-meta-marketing-actions"><button class="mc-btn mc-btn-primary" type="submit" ${state.loading ? 'disabled' : ''}><i data-lucide="refresh-ccw" style="width:13px;height:13px;"></i>${state.loading ? 'Refreshing...' : 'Refresh'}</button></div>
          </form>
        </section>
        ${errorNotice}
        ${state.loading && !data ? '<section class="mc-card mc-meta-marketing-loading"><i data-lucide="loader-circle" style="width:22px;height:22px;"></i><span>Loading Meta Marketing Analytics...</span></section>' : ''}
        ${data ? `${backendNotice(data)}${partialNotice(data)}${renderKpis(data)}${renderUnmatched(data)}${rows.length ? renderTable(data) : '<section class="mc-card mc-meta-marketing-empty">No marketing analytics data returned for the selected filters.</section>'}<div class="mc-meta-marketing-footnote">Meta date range: ${escapeHtml(data.metaDateRange?.since || state.filters.since)} to ${escapeHtml(data.metaDateRange?.until || state.filters.until)}. Registration date range uses creation date: ${escapeHtml(data.registrationDateRange?.since || state.filters.since)} to ${escapeHtml(data.registrationDateRange?.until || state.filters.until)}. Spend is shown in the Meta account currency as returned; no conversion is applied.</div>` : ''}
      </div>
    `;

    const form = root.querySelector('[data-form="filters"]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const since = root.querySelector('#mc-meta-marketing-since')?.value || '';
      const until = root.querySelector('#mc-meta-marketing-until')?.value || '';
      if (!since || !until || since > until) {
        state.error = 'Choose a valid date range where Date From is on or before Date To.';
        render();
        return;
      }
      state.filters = {
        since,
        until,
        breakdown: root.querySelector('#mc-meta-marketing-breakdown')?.value || 'campaign',
      };
      void load();
    });

    if (data && rows.length && window.MCDataTable) {
      window.MCDataTable.mountDataTable(TABLE_ID, root.querySelector(`#${TABLE_ID}`).innerHTML);
    }
    if (window.lucide) window.lucide.createIcons();
    if (!state.bootstrapped) {
      state.bootstrapped = true;
      void load();
    }
  }

  function getRoot() {
    return window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
  }

  async function load() {
    const requestSeq = ++state.requestSeq;
    state.loading = true;
    state.error = '';
    render();
    try {
      const response = await MCApi.getMetaMarketingAnalytics(state.filters);
      if (requestSeq !== state.requestSeq) return;
      state.data = response?.data || null;
      if (!state.data) state.error = 'Marketing analytics returned no usable data.';
    } catch (error) {
      if (requestSeq !== state.requestSeq) return;
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('database') || message.includes('analytics data could not be loaded')) state.error = mapError('DATABASE_ERROR').message;
      else if (message.includes('rate')) state.error = mapError('rate_limited').message;
      else if (message.includes('timed out') || message.includes('timeout')) state.error = mapError('timeout').message;
      else if (message.includes('token')) state.error = mapError('invalid_token').message;
      else if (message.includes('permission') || message.includes('admin')) state.error = mapError('forbidden').message;
      else state.error = mapError('network_error').message;
      state.data = null;
    } finally {
      if (requestSeq === state.requestSeq) {
        state.loading = false;
        render();
      }
    }
  }

  function destroy() {
    state.requestSeq += 1;
    if (window.MCDataTable) window.MCDataTable.destroyDataTable(TABLE_ID);
    state.root = null;
    state.loading = false;
    state.error = '';
    state.data = null;
    state.bootstrapped = false;
  }

  return { render, destroy };
})();