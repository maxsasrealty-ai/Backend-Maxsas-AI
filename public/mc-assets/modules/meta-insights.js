window.MCModMetaInsights = (function () {
  const STYLE_ID = 'mc-meta-insights-styles';
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
    return {
      since: isoDate(since),
      until: isoDate(until),
      breakdown: 'account',
      granularity: 'daily',
    };
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
      .mc-meta-insights-page { display:flex; flex-direction:column; gap:16px; animation:slideUpFade 0.45s ease-out both; }
      .mc-meta-insights-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; }
      .mc-meta-insights-copy { display:flex; flex-direction:column; gap:6px; min-width:220px; }
      .mc-meta-insights-title { margin:0; color:var(--mc-text); font-size:24px; line-height:1.2; font-weight:800; letter-spacing:0; }
      .mc-meta-insights-subtitle { margin:0; max-width:760px; color:var(--mc-muted); font-size:12px; line-height:1.5; }
      .mc-meta-insights-toolbar { display:grid; grid-template-columns:repeat(4,minmax(130px,1fr)) auto; align-items:end; gap:10px; margin-top:15px; }
      .mc-meta-insights-field { min-width:0; display:flex; flex-direction:column; gap:5px; }
      .mc-meta-insights-field label { color:var(--mc-muted); font-size:10px; font-weight:700; }
      .mc-meta-insights-field .mc-input { width:100%; min-width:0; height:34px; }
      .mc-meta-insights-controls { display:flex; gap:8px; align-items:center; }
      .mc-meta-insights-account { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; color:var(--mc-muted); font-size:11px; }
      .mc-meta-insights-account strong { color:var(--mc-text); font-family:var(--mc-font-mono); font-weight:600; overflow-wrap:anywhere; }
      .mc-meta-insights-state { display:flex; align-items:flex-start; gap:9px; padding:11px 13px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.025); color:var(--mc-muted); font-size:12px; line-height:1.5; }
      .mc-meta-insights-state.warn { color:var(--mc-amber); border-color:rgba(251,191,36,0.26); background:var(--mc-amber-dim); }
      .mc-meta-insights-state.bad { color:var(--mc-red); border-color:rgba(244,63,94,0.26); background:var(--mc-red-dim); }
      .mc-meta-insights-loading { display:flex; align-items:center; justify-content:center; gap:10px; min-height:130px; color:var(--mc-muted); font-size:12px; }
      .mc-meta-insights-loading i { color:var(--mc-cyan); animation:mcMetaInsightsSpin 1.1s linear infinite; }
      @keyframes mcMetaInsightsSpin { to { transform:rotate(360deg); } }
      .mc-meta-insights-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .mc-meta-insights-kpi { display:flex; flex-direction:column; gap:6px; min-width:0; padding:12px 13px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.02); }
      .mc-meta-insights-kpi-label { color:var(--mc-muted); font-size:10px; text-transform:uppercase; }
      .mc-meta-insights-kpi-value { color:var(--mc-text); font:700 19px var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-insights-kpi-note { color:var(--mc-faint); font-size:10px; line-height:1.35; }
      .mc-meta-insights-table-wrap { overflow:auto; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); }
      .mc-meta-insights-table { width:100%; min-width:980px; border-collapse:collapse; font-size:11px; }
      .mc-meta-insights-table th { padding:10px 11px; background:var(--mc-panel); color:var(--mc-muted); font-size:10px; font-weight:700; text-align:left; white-space:nowrap; }
      .mc-meta-insights-table td { padding:9px 11px; border-top:1px solid var(--mc-border); color:var(--mc-text); vertical-align:top; }
      .mc-meta-insights-table tr:hover td { background:rgba(255,255,255,0.018); }
      .mc-meta-insights-identity { min-width:150px; max-width:240px; overflow-wrap:anywhere; font-weight:600; }
      .mc-meta-insights-subid { display:block; margin-top:3px; color:var(--mc-faint); font:9px var(--mc-font-mono); }
      .mc-meta-insights-number { font-family:var(--mc-font-mono); white-space:nowrap; }
      .mc-meta-insights-actions { min-width:160px; }
      .mc-meta-insights-actions summary { color:var(--mc-cyan); cursor:pointer; font-size:10px; }
      .mc-meta-insights-actions ul { display:flex; flex-direction:column; gap:3px; margin:7px 0 0; padding:0; list-style:none; }
      .mc-meta-insights-actions li { color:var(--mc-muted); font:10px var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-insights-empty { min-height:100px; display:flex; align-items:center; justify-content:center; color:var(--mc-muted); text-align:center; font-size:12px; }
      .mc-meta-insights-footer { color:var(--mc-faint); font-size:10px; }
      @media (max-width:980px) { .mc-meta-insights-toolbar { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-meta-insights-controls { grid-column:1/-1; } .mc-meta-insights-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
      @media (max-width:560px) { .mc-meta-insights-toolbar,.mc-meta-insights-kpis { grid-template-columns:1fr; } .mc-meta-insights-controls { grid-column:auto; } .mc-meta-insights-controls .mc-btn { flex:1; } }
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

  function sumMetric(rows, key) {
    if (!rows.length) return null;
    const values = rows.map((row) => numberOrNull(row[key]));
    if (values.some((value) => value === null)) return null;
    return values.reduce((total, value) => total + value, 0);
  }

  function backendMetric(rows, key) {
    return rows.length === 1 ? numberOrNull(rows[0][key]) : null;
  }

  function aggregateMetrics(rows) {
    const spend = sumMetric(rows, 'spend');
    const impressions = sumMetric(rows, 'impressions');
    const clicks = sumMetric(rows, 'clicks');
    const reach = backendMetric(rows, 'reach');
    const ctr = impressions > 0 && clicks !== null ? (clicks / impressions) * 100 : backendMetric(rows, 'ctr');
    const cpc = clicks > 0 && spend !== null ? spend / clicks : backendMetric(rows, 'cpc');
    const cpm = impressions > 0 && spend !== null ? (spend / impressions) * 1000 : backendMetric(rows, 'cpm');
    const frequency = backendMetric(rows, 'frequency');
    return { spend, impressions, reach, clicks, ctr, cpc, cpm, frequency };
  }

  function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(value);
  }

  function formatMetric(value, metric) {
    if (value === null || value === undefined) return '--';
    return metric === 'impressions' || metric === 'reach' || metric === 'clicks'
      ? formatNumber(value, 0)
      : formatNumber(value, 2);
  }

  function formatDate(value) {
    if (!value) return '--';
    return escapeHtml(value);
  }

  function errorInfo(category) {
    switch (category) {
      case 'missing_credentials': return { tone: 'warn', message: 'Meta credentials are not configured on the server.' };
      case 'incomplete_configuration': return { tone: 'warn', message: 'A Meta Ad Account is not configured on the server.' };
      case 'invalid_token': return { tone: 'bad', message: 'The Meta access token is invalid or expired. Ask an administrator to review server configuration.' };
      case 'forbidden': return { tone: 'warn', message: 'Meta denied permission to read Insights for this account.' };
      case 'rate_limited': return { tone: 'warn', message: 'Meta rate-limited this request. Wait before refreshing.' };
      case 'timeout': return { tone: 'bad', message: 'Meta Insights request timed out.' };
      case 'network_error': return { tone: 'bad', message: 'The Meta Graph API could not be reached.' };
      case 'meta_unavailable': return { tone: 'bad', message: 'The Meta Graph API is temporarily unavailable.' };
      default: return { tone: 'bad', message: 'Meta Insights could not be loaded. Check the filters and admin access.' };
    }
  }

  function statusNotice(data) {
    if (!data) return '';
    const notices = [];
    if (data.status === 'not_configured' || data.category === 'missing_credentials' || data.category === 'incomplete_configuration') {
      const info = errorInfo(data.category);
      notices.push(`<div class="mc-meta-insights-state warn"><i data-lucide="settings-2" style="width:15px;height:15px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`);
    } else if (data.status === 'permission_denied' || data.category === 'invalid_token' || data.category === 'forbidden') {
      const info = errorInfo(data.category);
      notices.push(`<div class="mc-meta-insights-state ${info.tone}"><i data-lucide="shield-alert" style="width:15px;height:15px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`);
    } else if (data.status === 'error' || data.category !== 'ok') {
      const info = errorInfo(data.category);
      notices.push(`<div class="mc-meta-insights-state ${info.tone}"><i data-lucide="circle-alert" style="width:15px;height:15px;flex-shrink:0;"></i><span>${escapeHtml(info.message)}</span></div>`);
    }
    if (data.status === 'partial' || (data.pagination?.hasMore && !data.pagination?.complete) || data.pagination?.limitReached) {
      notices.push(`<div class="mc-meta-insights-state warn"><i data-lucide="list-restart" style="width:15px;height:15px;flex-shrink:0;"></i><span>Results are partial. The displayed dataset may be incomplete.</span></div>`);
    }
    return notices.join('');
  }

  function dateLabel(row) {
    const start = row.date_start || '';
    const stop = row.date_stop || '';
    if (!start && !stop) return '--';
    return escapeHtml(start === stop || !stop ? start : `${start} - ${stop}`);
  }

  function identityCell(row, primaryName, primaryId, secondaryName, secondaryId, secondaryLabel, tertiaryName, tertiaryId, tertiaryLabel) {
    const name = row[primaryName] || row[primaryId] || '--';
    const subId = row[primaryId] && row[primaryId] !== name ? row[primaryId] : '';
    const secondary = secondaryName ? row[secondaryName] || row[secondaryId] || '--' : '';
    const secondaryIdValue = secondaryId && row[secondaryId] && row[secondaryId] !== secondary ? row[secondaryId] : '';
    const tertiary = tertiaryName ? row[tertiaryName] || row[tertiaryId] || '--' : '';
    const tertiaryIdValue = tertiaryId && row[tertiaryId] && row[tertiaryId] !== tertiary ? row[tertiaryId] : '';
    return `<div class="mc-meta-insights-identity">${escapeHtml(name)}${subId ? `<span class="mc-meta-insights-subid">ID ${escapeHtml(subId)}</span>` : ''}${secondary ? `<span class="mc-meta-insights-subid">${escapeHtml(secondaryLabel)}: ${escapeHtml(secondary)}${secondaryIdValue ? ` · ${escapeHtml(secondaryIdValue)}` : ''}</span>` : ''}${tertiary ? `<span class="mc-meta-insights-subid">${escapeHtml(tertiaryLabel)}: ${escapeHtml(tertiary)}${tertiaryIdValue ? ` · ${escapeHtml(tertiaryIdValue)}` : ''}</span>` : ''}</div>`;
  }

  function rowIdentity(row, breakdown) {
    if (breakdown === 'campaign') return identityCell(row, 'campaign_name', 'campaign_id');
    if (breakdown === 'adset') return identityCell(row, 'adset_name', 'adset_id', 'campaign_name', 'campaign_id', 'Campaign');
    if (breakdown === 'ad') return identityCell(row, 'ad_name', 'ad_id', 'adset_name', 'adset_id', 'Ad Set', 'campaign_name', 'campaign_id', 'Campaign');
    return '';
  }

  function tableHeaders(breakdown) {
    const identity = breakdown === 'account' ? ''
      : breakdown === 'campaign' ? '<th scope="col">Campaign</th>'
        : breakdown === 'adset' ? '<th scope="col">Ad Set / Campaign</th>'
          : '<th scope="col">Ad / Ad Set</th>';
    return `${identity}<th scope="col">Date</th><th scope="col">Spend</th><th scope="col">Impressions</th><th scope="col">Reach</th><th scope="col">Clicks</th><th scope="col">CTR</th><th scope="col">CPC</th><th scope="col">CPM</th><th scope="col">Frequency</th><th scope="col">Actions</th>`;
  }

  function actionsCell(actions) {
    if (!Array.isArray(actions) || !actions.length) return '<span class="mc-meta-insights-footer">--</span>';
    return `<details class="mc-meta-insights-actions"><summary>Actions (${actions.length})</summary><ul>${actions.map((action) => `<li>${escapeHtml(action.action_type)}: ${action.value === null || action.value === undefined ? '--' : formatNumber(numberOrNull(action.value), 2)}</li>`).join('')}</ul></details>`;
  }

  function renderRow(row, breakdown) {
    const identity = rowIdentity(row, breakdown);
    return `<tr>${identity ? `<td>${identity}</td>` : ''}<td class="mc-meta-insights-number">${dateLabel(row)}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.spend), 'spend')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.impressions), 'impressions')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.reach), 'reach')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.clicks), 'clicks')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.ctr), 'ctr')}${row.ctr === null || row.ctr === undefined ? '' : '%'}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.cpc), 'cpc')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.cpm), 'cpm')}</td><td class="mc-meta-insights-number">${formatMetric(numberOrNull(row.frequency), 'frequency')}</td><td>${actionsCell(row.actions)}</td></tr>`;
  }

  function kpiCard(label, value, note, suffix = '') {
    return `<article class="mc-meta-insights-kpi"><div class="mc-meta-insights-kpi-label">${escapeHtml(label)}</div><div class="mc-meta-insights-kpi-value">${escapeHtml(value)}${suffix}</div>${note ? `<div class="mc-meta-insights-kpi-note">${escapeHtml(note)}</div>` : ''}</article>`;
  }

  function renderKpis(rows) {
    const metrics = aggregateMetrics(rows);
    const nonAdditive = rows.length > 1 ? 'Not safely additive across rows' : '';
    return `
      <section class="mc-meta-insights-kpis" aria-label="Insights summary">
        ${kpiCard('Spend', formatMetric(metrics.spend, 'spend'), 'Sum of returned rows')}
        ${kpiCard('Impressions', formatMetric(metrics.impressions, 'impressions'), 'Sum of returned rows')}
        ${kpiCard('Reach', formatMetric(metrics.reach, 'reach'), metrics.reach === null ? nonAdditive : 'Backend value')}
        ${kpiCard('Clicks', formatMetric(metrics.clicks, 'clicks'), 'Sum of returned rows')}
        ${kpiCard('CTR', formatMetric(metrics.ctr, 'ctr'), metrics.ctr === null ? 'Insufficient backend values' : 'Clicks / impressions', metrics.ctr === null ? '' : '%')}
        ${kpiCard('CPC', formatMetric(metrics.cpc, 'cpc'), metrics.cpc === null ? 'Insufficient backend values' : 'Spend / clicks')}
        ${kpiCard('CPM', formatMetric(metrics.cpm, 'cpm'), metrics.cpm === null ? 'Insufficient backend values' : 'Spend / impressions x 1,000')}
        ${kpiCard('Frequency', formatMetric(metrics.frequency, 'frequency'), metrics.frequency === null ? nonAdditive : 'Backend value')}
      </section>
    `;
  }

  function renderTable(data) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!rows.length) return `<section class="mc-card mc-meta-insights-empty">No insights data returned for the selected filters.</section>`;
    return `
      <section class="mc-card">
        <div class="mc-meta-insights-account" style="margin-bottom:10px;"><strong>Insights rows</strong><span>${rows.length} returned</span></div>
        <div class="mc-meta-insights-table-wrap">
          <table class="mc-meta-insights-table">
            <thead><tr>${tableHeaders(data.breakdown)}</tr></thead>
            <tbody>${rows.map((row) => renderRow(row, data.breakdown)).join('')}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function render() {
    injectStyles();
    const root = getRoot();
    if (!root) return;
    state.root = root;
    const data = state.data;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const errorNotice = state.error
      ? `<div class="mc-meta-insights-state bad"><i data-lucide="circle-alert" style="width:15px;height:15px;flex-shrink:0;"></i><span>${escapeHtml(state.error)}</span></div>`
      : '';

    root.innerHTML = `
      <div class="mc-meta-insights-page">
        <section class="mc-card">
          <div class="mc-meta-insights-head">
            <div class="mc-meta-insights-copy">
              <h1 class="mc-meta-insights-title">Meta Insights</h1>
              <p class="mc-meta-insights-subtitle">Read-only delivery metrics from the configured Meta Ad Account.</p>
            </div>
            ${data?.adAccountId ? `<div class="mc-meta-insights-account"><span>Ad Account</span><strong>${escapeHtml(data.adAccountId)}</strong></div>` : ''}
          </div>
          <form class="mc-meta-insights-toolbar" data-form="filters">
            <div class="mc-meta-insights-field"><label for="mc-insights-since">Date From</label><input id="mc-insights-since" class="mc-input" type="date" value="${escapeHtml(state.filters.since)}" required /></div>
            <div class="mc-meta-insights-field"><label for="mc-insights-until">Date To</label><input id="mc-insights-until" class="mc-input" type="date" value="${escapeHtml(state.filters.until)}" required /></div>
            <div class="mc-meta-insights-field"><label for="mc-insights-breakdown">Breakdown</label><select id="mc-insights-breakdown" class="mc-input"><option value="account" ${state.filters.breakdown === 'account' ? 'selected' : ''}>Account</option><option value="campaign" ${state.filters.breakdown === 'campaign' ? 'selected' : ''}>Campaign</option><option value="adset" ${state.filters.breakdown === 'adset' ? 'selected' : ''}>Ad Set</option><option value="ad" ${state.filters.breakdown === 'ad' ? 'selected' : ''}>Ad</option></select></div>
            <div class="mc-meta-insights-field"><label for="mc-insights-granularity">Granularity</label><select id="mc-insights-granularity" class="mc-input"><option value="daily" ${state.filters.granularity === 'daily' ? 'selected' : ''}>Daily</option><option value="summary" ${state.filters.granularity === 'summary' ? 'selected' : ''}>Summary</option></select></div>
            <div class="mc-meta-insights-controls"><button class="mc-btn mc-btn-primary" type="submit" ${state.loading ? 'disabled' : ''}><i data-lucide="refresh-ccw" style="width:13px;height:13px;"></i>${state.loading ? 'Loading...' : 'Refresh'}</button></div>
          </form>
        </section>
        ${errorNotice}
        ${state.loading && !data ? `<section class="mc-card mc-meta-insights-loading"><i data-lucide="loader-circle" style="width:22px;height:22px;"></i><span>Loading Meta Insights...</span></section>` : ''}
        ${data ? `${statusNotice(data)}${rows.length ? renderKpis(rows) : ''}${renderTable(data)}<div class="mc-meta-insights-footer">${rows.length} rows returned for ${escapeHtml(data.dateRange?.since || state.filters.since)} to ${escapeHtml(data.dateRange?.until || state.filters.until)}. Action types are shown as returned by Meta.</div>` : ''}
      </div>
    `;

    const form = root.querySelector('[data-form="filters"]');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const since = root.querySelector('#mc-insights-since')?.value || '';
      const until = root.querySelector('#mc-insights-until')?.value || '';
      if (!since || !until || since > until) {
        state.error = 'Choose a valid date range where Date From is on or before Date To.';
        render();
        return;
      }
      state.filters = {
        since,
        until,
        breakdown: root.querySelector('#mc-insights-breakdown')?.value || 'account',
        granularity: root.querySelector('#mc-insights-granularity')?.value || 'daily',
      };
      void load();
    });

    if (window.lucide) window.lucide.createIcons();
    if (!state.bootstrapped) {
      state.bootstrapped = true;
      void load();
    }
  }

  async function load() {
    const requestSeq = ++state.requestSeq;
    state.loading = true;
    state.error = '';
    render();
    try {
      const response = await MCApi.getMetaInsights(state.filters);
      if (requestSeq !== state.requestSeq) return;
      state.data = response?.data || null;
      if (!state.data) state.error = 'Meta Insights returned no usable data.';
    } catch (error) {
      if (requestSeq !== state.requestSeq) return;
      const message = error?.message || '';
      state.error = message.toLowerCase().includes('admin')
        ? 'Admin access is required to view Meta Insights.'
        : 'Unable to load Meta Insights. Check the connection and selected filters.';
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
    state.root = null;
    state.loading = false;
    state.error = '';
    state.data = null;
    state.bootstrapped = false;
  }

  return { render, destroy };
})();