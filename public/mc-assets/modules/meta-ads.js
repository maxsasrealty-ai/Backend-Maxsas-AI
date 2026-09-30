window.MCModMetaAds = (function () {
  const STYLE_ID = 'mc-meta-ads-styles';
  const state = {
    root: null,
    loading: false,
    error: '',
    data: null,
    requestSeq: 0,
    bootstrapped: false,
  };

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
      .mc-meta-ads-page { display:flex; flex-direction:column; gap:16px; animation:slideUpFade 0.45s ease-out both; }
      .mc-meta-ads-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      .mc-meta-ads-copy { display:flex; flex-direction:column; gap:6px; min-width:240px; }
      .mc-meta-ads-title { margin:0; color:var(--mc-text); font-size:24px; line-height:1.2; font-weight:800; letter-spacing:0; }
      .mc-meta-ads-subtitle { margin:0; color:var(--mc-muted); font-size:12px; line-height:1.5; }
      .mc-meta-ads-actions { display:flex; align-items:center; gap:8px; }
      .mc-meta-ads-account { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:13px 15px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); }
      .mc-meta-ads-account-label { color:var(--mc-muted); font-size:11px; text-transform:uppercase; }
      .mc-meta-ads-account-id { margin-top:4px; color:var(--mc-text); font:600 12px var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-ads-pill { display:inline-flex; align-items:center; gap:5px; width:max-content; max-width:100%; padding:4px 8px; border:1px solid var(--mc-border); border-radius:var(--mc-r-full); background:rgba(255,255,255,0.035); color:var(--mc-muted); font:700 10px var(--mc-font-mono); text-transform:uppercase; overflow-wrap:anywhere; }
      .mc-meta-ads-pill.ok { color:var(--mc-green); border-color:rgba(16,185,129,0.3); background:var(--mc-green-dim); }
      .mc-meta-ads-pill.warn { color:var(--mc-amber); border-color:rgba(251,191,36,0.3); background:var(--mc-amber-dim); }
      .mc-meta-ads-pill.bad { color:var(--mc-red); border-color:rgba(244,63,94,0.3); background:var(--mc-red-dim); }
      .mc-meta-ads-notice { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.025); color:var(--mc-muted); font-size:11px; line-height:1.5; }
      .mc-meta-ads-notice.warn { color:var(--mc-amber); border-color:rgba(251,191,36,0.25); background:var(--mc-amber-dim); }
      .mc-meta-ads-notice.bad { color:var(--mc-red); border-color:rgba(244,63,94,0.25); background:var(--mc-red-dim); }
      .mc-meta-ads-summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .mc-meta-ads-summary-item { display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:0; padding:11px 12px; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.02); }
      .mc-meta-ads-summary-label { color:var(--mc-muted); font-size:11px; }
      .mc-meta-ads-summary-count { color:var(--mc-text); font:700 12px var(--mc-font-mono); }
      .mc-meta-ads-section { min-width:0; }
      .mc-meta-ads-section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
      .mc-meta-ads-section-title { display:flex; align-items:center; gap:8px; margin:0; color:var(--mc-text); font-size:14px; font-weight:700; }
      .mc-meta-ads-list { display:flex; flex-direction:column; gap:10px; }
      .mc-meta-ads-campaign { overflow:hidden; border:1px solid var(--mc-border); border-radius:var(--mc-r-sm); background:rgba(255,255,255,0.018); }
      .mc-meta-ads-campaign-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:13px 14px; border-bottom:1px solid var(--mc-border); background:rgba(255,255,255,0.018); }
      .mc-meta-ads-name { margin:0; color:var(--mc-text); font-size:13px; line-height:1.4; font-weight:700; overflow-wrap:anywhere; }
      .mc-meta-ads-id { margin-top:3px; color:var(--mc-muted); font:10px var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-ads-fields { display:flex; flex-wrap:wrap; gap:6px; padding:10px 14px 12px; }
      .mc-meta-ads-field { padding:4px 7px; border-radius:3px; background:rgba(255,255,255,0.045); color:var(--mc-muted); font-size:10px; line-height:1.4; overflow-wrap:anywhere; }
      .mc-meta-ads-field strong { color:var(--mc-text); font-weight:600; }
      .mc-meta-ads-children { display:flex; flex-direction:column; gap:8px; margin:0 12px 12px 22px; padding-left:12px; border-left:1px solid var(--mc-border); }
      .mc-meta-ads-adset { padding:10px 11px; border:1px solid var(--mc-border); border-radius:var(--mc-r-xs); background:var(--mc-panel); }
      .mc-meta-ads-adset-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .mc-meta-ads-ads { display:flex; flex-direction:column; gap:6px; margin-top:10px; padding-top:9px; border-top:1px solid var(--mc-border); }
      .mc-meta-ads-ad { display:flex; flex-direction:column; gap:7px; padding:8px; border-radius:3px; background:rgba(255,255,255,0.025); }
      .mc-meta-ads-ad-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .mc-meta-ads-empty { display:flex; align-items:center; gap:8px; min-height:62px; color:var(--mc-muted); font-size:11px; }
      .mc-meta-ads-loading { display:flex; align-items:center; gap:10px; min-height:110px; color:var(--mc-muted); font-size:12px; }
      .mc-meta-ads-loading i { color:var(--mc-cyan); animation:mcMetaAdsSpin 1.1s linear infinite; }
      @keyframes mcMetaAdsSpin { to { transform:rotate(360deg); } }
      @media (max-width:760px) { .mc-meta-ads-summary { grid-template-columns:1fr; } .mc-meta-ads-campaign-head,.mc-meta-ads-adset-head,.mc-meta-ads-ad-head { flex-direction:column; } .mc-meta-ads-children { margin-left:10px; } }
    `;
    document.head.appendChild(style);
  }

  function getRoot() {
    return window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
  }

  function collectionInfo(collection) {
    const category = collection?.category;
    if (category === 'missing_credentials') return { label: 'Not configured', tone: 'warn', message: 'Meta server credentials are not configured.' };
    if (category === 'incomplete_configuration') return { label: 'No Ad Account', tone: 'warn', message: 'Configure a Meta Ad Account to view advertising resources.' };
    if (category === 'invalid_token') return { label: 'Invalid or expired token', tone: 'bad', message: 'The server-side Meta token is invalid or expired.' };
    if (category === 'forbidden') return { label: 'Permission denied', tone: 'warn', message: 'The configured Meta token cannot read this collection.' };
    if (category === 'rate_limited') return { label: 'Rate limited', tone: 'warn', message: 'Meta temporarily limited requests. Refresh later.' };
    if (category === 'timeout') return { label: 'Timed out', tone: 'bad', message: 'Meta did not respond before the request timed out.' };
    if (category === 'network_error') return { label: 'Network error', tone: 'bad', message: 'The Meta Graph API could not be reached.' };
    if (category === 'meta_unavailable') return { label: 'Meta unavailable', tone: 'bad', message: 'The Meta Graph API is temporarily unavailable.' };
    if (collection?.status === 'empty') return { label: 'Empty', tone: 'neutral', message: 'No resources were returned for this collection.' };
    if (collection?.status === 'partial') return { label: 'Partial', tone: 'warn', message: 'Some resources are unavailable; returned items remain visible.' };
    if (collection?.status === 'ok') return { label: 'Available', tone: 'ok', message: '' };
    if (collection?.status === 'not_configured') return { label: 'Not configured', tone: 'warn', message: 'This collection is not configured.' };
    return { label: 'Unavailable', tone: 'bad', message: 'Meta could not return this collection.' };
  }

  function value(value) {
    return value === null || value === undefined || value === '' ? '--' : escapeHtml(value);
  }

  function field(label, item, key) {
    if (item?.[key] === null || item?.[key] === undefined || item?.[key] === '') return '';
    return `<span class="mc-meta-ads-field"><strong>${escapeHtml(label)}:</strong> ${value(item[key])}</span>`;
  }

  function fields(item, definitions) {
    return `<div class="mc-meta-ads-fields">${definitions.map(([label, key]) => field(label, item, key)).join('') || '<span class="mc-meta-ads-field">No additional details</span>'}</div>`;
  }

  function statusPill(collection) {
    const info = collectionInfo(collection);
    return `<span class="mc-meta-ads-pill ${info.tone}">${escapeHtml(info.label)}</span>`;
  }

  function collectionNotice(collection, title) {
    const info = collectionInfo(collection);
    if (!info.message) return '';
    return `<div class="mc-meta-ads-notice ${info.tone === 'bad' ? 'bad' : info.tone === 'warn' ? 'warn' : ''}"><i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(title)}: ${escapeHtml(info.message)}</span></div>`;
  }

  function paginationNotice(collection, title) {
    if (!collection?.pagination?.limitReached || collection.pagination.complete || !collection.pagination.hasMore) return '';
    return `<div class="mc-meta-ads-notice"><i data-lucide="list-restart" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(title)} list is partial. The safe page limit was reached; refresh later to check for newer results.</span></div>`;
  }

  function itemName(item, type) {
    return item?.name || `Unnamed ${type}`;
  }

  function renderAd(ad) {
    return `
      <article class="mc-meta-ads-ad">
        <div class="mc-meta-ads-ad-head"><div><h4 class="mc-meta-ads-name">${escapeHtml(itemName(ad, 'ad'))}</h4><div class="mc-meta-ads-id">Ad ID: ${value(ad.id)}</div></div></div>
        ${fields(ad, [['Status', 'status'], ['Effective status', 'effective_status'], ['Campaign ID', 'campaign_id'], ['Ad Set ID', 'adset_id'], ['Created', 'created_time'], ['Updated', 'updated_time']])}
      </article>
    `;
  }

  function renderAdSet(adset, ads) {
    return `
      <article class="mc-meta-ads-adset">
        <div class="mc-meta-ads-adset-head">
          <div><h4 class="mc-meta-ads-name">${escapeHtml(itemName(adset, 'ad set'))}</h4><div class="mc-meta-ads-id">Ad Set ID: ${value(adset.id)} | Campaign ID: ${value(adset.campaign_id)}</div></div>
        </div>
        ${fields(adset, [['Status', 'status'], ['Effective status', 'effective_status'], ['Optimization', 'optimization_goal'], ['Billing event', 'billing_event'], ['Daily budget (minor units)', 'daily_budget'], ['Lifetime budget (minor units)', 'lifetime_budget'], ['Start', 'start_time'], ['End', 'end_time']])}
        <div class="mc-meta-ads-ads">
          <div class="mc-meta-ads-section-head"><h5 class="mc-meta-ads-section-title">Ads</h5><span class="mc-meta-ads-id">${ads.length} shown</span></div>
          ${ads.length ? ads.map(renderAd).join('') : `<div class="mc-meta-ads-empty">${collectionInfo(state.data?.ads).message ? escapeHtml(collectionInfo(state.data?.ads).message) : 'No ads returned for this ad set.'}</div>`}
        </div>
      </article>
    `;
  }

  function renderCampaign(campaign, adsets, ads) {
    return `
      <article class="mc-meta-ads-campaign">
        <div class="mc-meta-ads-campaign-head">
          <div><h3 class="mc-meta-ads-name">${escapeHtml(itemName(campaign, 'campaign'))}</h3><div class="mc-meta-ads-id">Campaign ID: ${value(campaign.id)}</div></div>
        </div>
        ${fields(campaign, [['Status', 'status'], ['Effective status', 'effective_status'], ['Objective', 'objective'], ['Buying type', 'buying_type'], ['Created', 'created_time'], ['Updated', 'updated_time']])}
        <div class="mc-meta-ads-children">
          ${adsets.length ? adsets.map((adset) => renderAdSet(adset, ads.filter((ad) => ad.adset_id === adset.id))).join('') : `<div class="mc-meta-ads-empty">${collectionInfo(state.data?.adsets).message ? escapeHtml(collectionInfo(state.data?.adsets).message) : 'No ad sets returned for this campaign.'}</div>`}
        </div>
      </article>
    `;
  }

  function renderOrphanSection(title, items, renderer) {
    if (!items.length) return '';
    return `
      <section class="mc-card mc-meta-ads-section">
        <div class="mc-meta-ads-section-head"><h2 class="mc-meta-ads-section-title">${escapeHtml(title)}</h2><span class="mc-meta-ads-id">${items.length} shown</span></div>
        <div class="mc-meta-ads-list">${items.map(renderer).join('')}</div>
      </section>
    `;
  }

  function render() {
    injectStyles();
    const root = getRoot();
    if (!root) return;
    state.root = root;
    const data = state.data;
    const campaigns = Array.isArray(data?.campaigns?.items) ? data.campaigns.items : [];
    const adsets = Array.isArray(data?.adsets?.items) ? data.adsets.items : [];
    const ads = Array.isArray(data?.ads?.items) ? data.ads.items : [];
    const matchedCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
    const matchedAdsetIds = new Set(adsets.map((adset) => adset.id));
    const orphanAdsets = adsets.filter((adset) => !matchedCampaignIds.has(adset.campaign_id));
    const orphanAds = ads.filter((ad) => !matchedAdsetIds.has(ad.adset_id));

    root.innerHTML = `
      <div class="mc-meta-ads-page">
        <section class="mc-card">
          <div class="mc-meta-ads-header">
            <div class="mc-meta-ads-copy">
              <h1 class="mc-meta-ads-title">Meta Ads</h1>
              <p class="mc-meta-ads-subtitle">Live, read-only campaigns, ad sets, and ads from the configured Meta Ad Account.</p>
            </div>
            <div class="mc-meta-ads-actions">
              <button class="mc-btn mc-btn-ghost" data-action="refresh" ${state.loading ? 'disabled' : ''}>
                <i data-lucide="refresh-ccw" style="width:13px;height:13px;"></i>${state.loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>
        ${state.loading && !data ? `<section class="mc-card mc-meta-ads-loading"><i data-lucide="loader-circle" style="width:22px;height:22px;"></i><span>Loading Meta Ads...</span></section>` : ''}
        ${state.error ? `<div class="mc-meta-ads-notice bad"><i data-lucide="circle-alert" style="width:14px;height:14px;flex-shrink:0;"></i><span>${escapeHtml(state.error)}</span></div>` : ''}
        ${data ? `
          <section class="mc-meta-ads-account">
            <div><div class="mc-meta-ads-account-label">Configured Ad Account</div><div class="mc-meta-ads-account-id">${data.adAccountId ? escapeHtml(data.adAccountId) : 'No Ad Account configured'}</div></div>
            ${statusPill(data.campaigns)}
          </section>
          ${!data.adAccountId ? `<div class="mc-meta-ads-notice warn"><i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;"></i><span>No Meta Ad Account is configured on the server.</span></div>` : ''}
          <div class="mc-meta-ads-summary">
            <div class="mc-meta-ads-summary-item"><span class="mc-meta-ads-summary-label">Campaigns</span><span class="mc-meta-ads-summary-count">${campaigns.length}</span></div>
            <div class="mc-meta-ads-summary-item"><span class="mc-meta-ads-summary-label">Ad Sets</span><span class="mc-meta-ads-summary-count">${adsets.length}</span></div>
            <div class="mc-meta-ads-summary-item"><span class="mc-meta-ads-summary-label">Ads</span><span class="mc-meta-ads-summary-count">${ads.length}</span></div>
          </div>
          ${collectionNotice(data.campaigns, 'Campaigns')}${paginationNotice(data.campaigns, 'Campaigns')}
          ${collectionNotice(data.adsets, 'Ad Sets')}${paginationNotice(data.adsets, 'Ad Sets')}
          ${collectionNotice(data.ads, 'Ads')}${paginationNotice(data.ads, 'Ads')}
          <section class="mc-card mc-meta-ads-section">
            <div class="mc-meta-ads-section-head"><h2 class="mc-meta-ads-section-title"><i data-lucide="megaphone" style="width:15px;height:15px;color:var(--mc-cyan);"></i>Campaign hierarchy</h2><span class="mc-meta-ads-id">${campaigns.length} campaigns shown</span></div>
            ${campaigns.length ? `<div class="mc-meta-ads-list">${campaigns.map((campaign) => renderCampaign(campaign, adsets.filter((adset) => adset.campaign_id === campaign.id), ads)).join('')}</div>` : `<div class="mc-meta-ads-empty">${collectionInfo(data.campaigns).message ? escapeHtml(collectionInfo(data.campaigns).message) : 'No campaigns returned for this account.'}</div>`}
          </section>
          ${renderOrphanSection('Ad Sets without a matching campaign', orphanAdsets, (adset) => renderAdSet(adset, ads.filter((ad) => ad.adset_id === adset.id)))}
          ${renderOrphanSection('Ads without a matching ad set', orphanAds, renderAd)}
          <div class="mc-meta-ads-id">Budgets are displayed in the minor currency units returned by Meta.</div>
        ` : ''}
      </div>
    `;

    root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void load());
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
      const response = await MCApi.getMetaAds();
      if (requestSeq !== state.requestSeq) return;
      state.data = response?.data || null;
      if (!state.data) state.error = 'Meta Ads returned no usable data.';
    } catch (error) {
      if (requestSeq !== state.requestSeq) return;
      state.error = error?.message || 'Unable to load Meta Ads.';
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
    state.bootstrapped = false;
    state.loading = false;
    state.error = '';
    state.data = null;
  }

  return { render, destroy };
})();