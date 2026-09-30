window.MCModMetaAssets = (function () {
  const STYLE_ID = 'mc-meta-assets-styles';
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
      .mc-meta-assets-page { display:flex; flex-direction:column; gap:20px; animation:slideUpFade 0.5s ease-out both; }
      .mc-meta-assets-hero { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      .mc-meta-assets-copy { display:flex; flex-direction:column; gap:8px; min-width:280px; }
      .mc-meta-assets-title { margin:0; font-size:26px; font-weight:800; color:var(--mc-text); letter-spacing:-0.02em; }
      .mc-meta-assets-subtitle { margin:0; max-width:760px; color:var(--mc-muted); font-size:13px; line-height:1.55; }
      .mc-meta-assets-actions { display:flex; align-items:center; gap:10px; }
      .mc-meta-assets-connection { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 16px; border:1px solid var(--mc-border); border-radius:var(--mc-r-lg); background:rgba(255,255,255,0.02); }
      .mc-meta-assets-connection-main { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--mc-text); }
      .mc-meta-assets-connection-meta { display:flex; gap:12px; flex-wrap:wrap; color:var(--mc-muted); font-size:11px; font-family:var(--mc-font-mono); }
      .mc-meta-assets-status { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; font-size:10px; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; font-family:var(--mc-font-mono); }
      .mc-meta-assets-status.ok { color:var(--mc-green); background:var(--mc-green-dim); border:1px solid rgba(16,185,129,0.28); }
      .mc-meta-assets-status.warn { color:var(--mc-amber); background:var(--mc-amber-dim); border:1px solid rgba(251,191,36,0.28); }
      .mc-meta-assets-status.bad { color:var(--mc-red); background:var(--mc-red-dim); border:1px solid rgba(244,63,94,0.28); }
      .mc-meta-assets-status.neutral { color:var(--mc-muted); background:rgba(136,146,164,0.12); border:1px solid var(--mc-border); }
      .mc-meta-assets-notice { padding:12px 14px; border-radius:var(--mc-r-md); border:1px solid var(--mc-border); color:var(--mc-muted); background:rgba(255,255,255,0.02); font-size:12px; line-height:1.5; }
      .mc-meta-assets-notice.bad { color:var(--mc-red); border-color:rgba(244,63,94,0.28); background:var(--mc-red-dim); }
      .mc-meta-assets-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:16px; }
      .mc-meta-assets-card { min-width:0; }
      .mc-meta-assets-card-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--mc-border); }
      .mc-meta-assets-card-title { display:flex; align-items:center; gap:8px; color:var(--mc-text); font-size:14px; font-weight:700; }
      .mc-meta-assets-count { color:var(--mc-muted); font-size:11px; font-family:var(--mc-font-mono); }
      .mc-meta-assets-list { display:flex; flex-direction:column; gap:8px; }
      .mc-meta-assets-item { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:11px 12px; border-radius:var(--mc-r-md); border:1px solid var(--mc-border); background:rgba(255,255,255,0.018); }
      .mc-meta-assets-item-main { min-width:0; display:flex; flex-direction:column; gap:4px; }
      .mc-meta-assets-item-name { color:var(--mc-text); font-size:13px; font-weight:700; overflow-wrap:anywhere; }
      .mc-meta-assets-item-id { color:var(--mc-muted); font-size:10px; font-family:var(--mc-font-mono); overflow-wrap:anywhere; }
      .mc-meta-assets-item-meta { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; }
      .mc-meta-assets-pill { padding:4px 7px; border-radius:999px; color:var(--mc-muted); background:rgba(255,255,255,0.05); font-size:10px; font-family:var(--mc-font-mono); }
      .mc-meta-assets-empty { min-height:92px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; color:var(--mc-muted); text-align:center; font-size:12px; }
      .mc-meta-assets-error { color:var(--mc-red); font-size:11px; font-family:var(--mc-font-mono); line-height:1.5; }
      @media (max-width:900px) { .mc-meta-assets-grid { grid-template-columns:1fr; } }
      @media (max-width:640px) { .mc-meta-assets-title { font-size:22px; } .mc-meta-assets-item { flex-direction:column; } .mc-meta-assets-item-meta { justify-content:flex-start; } }
    `;
    document.head.appendChild(style);
  }

  function getRoot() {
    return window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
  }

  function statusInfo(status, category) {
    if (status === 'ok') return { label: 'Available', tone: 'ok' };
    if (status === 'not_configured') return { label: 'Not configured', tone: 'neutral' };
    if (status === 'permission_denied' || category === 'invalid_token') return { label: 'Permission denied', tone: 'warn' };
    return { label: 'Unavailable', tone: 'bad' };
  }

  function connectionInfo(connection) {
    if (!connection) return { label: 'Unavailable', tone: 'bad', detail: 'No connection response received.' };
    if (connection.token?.status === 'invalid' || connection.response?.category === 'invalid_token') {
      return { label: 'Invalid or expired token', tone: 'bad', detail: 'Refresh the server-side Meta access token and try again.' };
    }
    if (connection.response?.category === 'missing_credentials' || connection.response?.category === 'incomplete_configuration') {
      return { label: 'Not configured', tone: 'neutral', detail: 'Required server-side Meta connection settings are not complete.' };
    }
    if (connection.connected) return { label: 'Connected', tone: 'ok', detail: 'Business and configured account access verified.' };
    if (connection.response?.category === 'forbidden') {
      return { label: 'Permission denied', tone: 'warn', detail: 'The configured token cannot access one or more configured resources.' };
    }
    return { label: 'Connection unavailable', tone: 'bad', detail: 'Meta returned an error or could not be reached.' };
  }

  function formatCollectionNotice(collection) {
    const info = statusInfo(collection?.status, collection?.category);
    if (info.tone === 'ok') return '';
    const category = collection?.category ? ` (${escapeHtml(collection.category)})` : '';
    return `<div class="mc-meta-assets-error">${escapeHtml(info.label)}${category}</div>`;
  }

  function renderItem(item, fields) {
    const name = item.name || item.username || item.id || 'Unnamed asset';
    const pills = fields
      .filter((field) => item[field.key] !== null && item[field.key] !== undefined && item[field.key] !== '')
      .map((field) => `<span class="mc-meta-assets-pill">${escapeHtml(field.label)}: ${escapeHtml(item[field.key])}</span>`)
      .join('');
    return `
      <div class="mc-meta-assets-item">
        <div class="mc-meta-assets-item-main">
          <div class="mc-meta-assets-item-name">${escapeHtml(name)}</div>
          <div class="mc-meta-assets-item-id">ID: ${escapeHtml(item.id || '—')}</div>
        </div>
        ${pills ? `<div class="mc-meta-assets-item-meta">${pills}</div>` : ''}
      </div>
    `;
  }

  function renderCollection(title, icon, collection, fields) {
    const items = Array.isArray(collection?.items) ? collection.items : [];
    const info = statusInfo(collection?.status, collection?.category);
    return `
      <section class="mc-card mc-meta-assets-card">
        <div class="mc-meta-assets-card-header">
          <div class="mc-meta-assets-card-title"><i data-lucide="${icon}" style="width:15px;height:15px;color:var(--mc-cyan);"></i>${escapeHtml(title)}</div>
          <div style="display:flex;align-items:center;gap:8px;"><span class="mc-meta-assets-status ${info.tone}">${escapeHtml(info.label)}</span><span class="mc-meta-assets-count">${items.length} found</span></div>
        </div>
        ${formatCollectionNotice(collection)}
        ${items.length ? `<div class="mc-meta-assets-list">${items.map((item) => renderItem(item, fields)).join('')}</div>` : `<div class="mc-meta-assets-empty"><i data-lucide="inbox" style="width:20px;height:20px;"></i><span>${info.tone === 'ok' ? 'No accessible assets found.' : 'No assets available to display.'}</span></div>`}
      </section>
    `;
  }

  function render() {
    injectStyles();
    const root = getRoot();
    if (!root) return;
    state.root = root;
    const connection = connectionInfo(state.data?.connection);
    const collections = state.data || {};
    const partial = [collections.adAccounts, collections.pages, collections.instagramAccounts, collections.pixels, collections.datasets]
      .some((collection) => collection && collection.status !== 'ok');

    root.innerHTML = `
      <div class="mc-meta-assets-page">
        <section class="mc-card">
          <div class="mc-meta-assets-hero">
            <div class="mc-meta-assets-copy">
              <h1 class="mc-meta-assets-title">Meta Assets</h1>
              <p class="mc-meta-assets-subtitle">Read-only inventory of the Meta Business assets available to the configured server-side connection.</p>
            </div>
            <div class="mc-meta-assets-actions">
              <button class="mc-btn mc-btn-ghost" data-action="refresh" ${state.loading ? 'disabled' : ''}>
                <i data-lucide="refresh-ccw" style="width:12px;height:12px;"></i>${state.loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        ${state.loading && !state.data ? `<section class="mc-card mc-meta-assets-empty"><i data-lucide="loader-circle" style="width:28px;height:28px;color:var(--mc-cyan);"></i><strong style="color:var(--mc-text);">Loading Meta assets…</strong><span>Reading the configured Business connection.</span></section>` : ''}
        ${state.error ? `<div class="mc-meta-assets-notice bad">${escapeHtml(state.error)}</div>` : ''}
        ${state.data ? `
          <section class="mc-meta-assets-connection">
            <div class="mc-meta-assets-connection-main"><span class="mc-meta-assets-status ${connection.tone}">${escapeHtml(connection.label)}</span><span>Meta Graph connection</span></div>
            <div class="mc-meta-assets-connection-meta">
              <span>API ${escapeHtml(state.data.connection?.apiVersion || '—')}</span>
              <span>Business ${escapeHtml(state.data.connection?.businessId || '—')}</span>
              <span>Ad account ${escapeHtml(state.data.connection?.adAccountId || '—')}</span>
            </div>
          </section>
          ${connection.detail ? `<div class="mc-meta-assets-notice ${connection.tone === 'bad' ? 'bad' : ''}">${escapeHtml(connection.detail)}</div>` : ''}
          ${partial && connection.tone === 'ok' ? `<div class="mc-meta-assets-notice">Partial asset access: some Meta collections are unavailable or require additional permissions. Available collections remain visible.</div>` : ''}
          <div class="mc-meta-assets-grid">
            ${renderCollection('Business', 'building-2', collections.business, [{ key: 'verificationStatus', label: 'Verification' }])}
            ${renderCollection('Ad Accounts', 'wallet-cards', collections.adAccounts, [{ key: 'accountId', label: 'Account' }, { key: 'status', label: 'Status' }, { key: 'currency', label: 'Currency' }])}
            ${renderCollection('Facebook Pages', 'globe-2', collections.pages, [{ key: 'username', label: 'Username' }, { key: 'category', label: 'Category' }, { key: 'verificationStatus', label: 'Verification' }])}
            ${renderCollection('Instagram Accounts', 'camera', collections.instagramAccounts, [{ key: 'pageId', label: 'Page' }, { key: 'username', label: 'Username' }])}
            ${renderCollection('Pixels', 'scan-line', collections.pixels, [{ key: 'lastFiredTime', label: 'Last fired' }])}
            ${renderCollection('Datasets', 'database', collections.datasets, [{ key: 'updatedTime', label: 'Updated' }])}
          </div>
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
      const response = await MCApi.getMetaAssets();
      if (requestSeq !== state.requestSeq) return;
      state.data = response?.data || null;
      if (!state.data) state.error = 'Meta Assets returned no usable data.';
    } catch (error) {
      if (requestSeq !== state.requestSeq) return;
      state.error = error?.message || 'Unable to load Meta assets.';
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
