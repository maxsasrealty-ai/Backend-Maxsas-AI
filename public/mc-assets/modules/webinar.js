window.MCModWebinar = (function () {
  const FEE_PAISE = 19_900;
  const state = {
    registrations: [],
    summary: null,
    config: null,
    configDraft: null,
    loading: false,
    configLoading: false,
    configSaving: false,
    error: '',
    configError: '',
    search: '',
    statusFilter: 'all',
    selectedId: null,
    savingId: null,
    exporting: false,
    bootstrapped: false,
  };

  const STATUS_OPTIONS = [
    { value: 'OPEN', label: 'Registrations Open' },
    { value: 'SEATS_FULL', label: 'Seats Full' },
    { value: 'COMPLETED', label: 'Event Completed' },
  ];

  const DEFAULT_CONFIG = {
    title: 'Maxsas AI Voice Agent Workshop',
    subTitle: 'Live workshop on AI voice agents for real estate teams',
    eventDate: '2026-08-25',
    eventTime: '4:00 PM IST',
    hostName: 'Anubhav Chaudhary',
    ticketPriceRupees: '199',
    zoomLink: '',
    whatsappGroupLink: '',
    status: 'OPEN',
  };

  const PAYMENT_META = {
    PAID: { label: 'PAID', color: 'var(--mc-green)', bg: 'var(--mc-green-dim)' },
    PENDING: { label: 'PENDING', color: 'var(--mc-amber)', bg: 'var(--mc-amber-dim)' },
    FAILED: { label: 'FAILED', color: 'var(--mc-red)', bg: 'var(--mc-red-dim)' },
    CANCELLED: { label: 'FAILED', color: 'var(--mc-red)', bg: 'var(--mc-red-dim)' },
    REGISTERED: { label: 'PENDING', color: 'var(--mc-amber)', bg: 'var(--mc-amber-dim)' },
    PAYMENT_PENDING: { label: 'PENDING', color: 'var(--mc-amber)', bg: 'var(--mc-amber-dim)' },
  };

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'pending', label: 'Pending' },
    { key: 'failed', label: 'Failed' },
  ];

  function ensureStyles() {
    if (document.getElementById('mc-webinar-module-styles')) return;
    const style = document.createElement('style');
    style.id = 'mc-webinar-module-styles';
    style.textContent = `
      .mc-webinar-page { display:flex; flex-direction:column; gap:20px; }
      .mc-webinar-hero { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      .mc-webinar-hero-copy { display:flex; flex-direction:column; gap:8px; min-width:280px; }
      .mc-webinar-hero-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid rgba(167,139,250,0.25); background:rgba(167,139,250,0.10); color:var(--mc-violet); font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; width:max-content; }
      .mc-webinar-title { margin:0; font-size:26px; font-weight:800; letter-spacing:-0.02em; color:var(--mc-text); }
      .mc-webinar-subtitle { margin:0; color:var(--mc-muted); font-size:13px; max-width:760px; }
      .mc-webinar-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
      .mc-webinar-toolbar { display:grid; grid-template-columns:minmax(260px,1fr) minmax(180px,220px) auto; gap:12px; align-items:end; }
      .mc-webinar-filter-row { display:flex; gap:6px; flex-wrap:wrap; }
      .mc-webinar-filter-chip { border:1px solid var(--mc-border); background:rgba(255,255,255,0.01); color:var(--mc-muted); padding:7px 12px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; transition:all var(--mc-ease-fast); }
      .mc-webinar-filter-chip:hover { color:var(--mc-text); border-color:rgba(0,229,255,0.24); background:rgba(0,229,255,0.05); }
      .mc-webinar-filter-chip.active { color:var(--mc-violet); background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.35); }
      .mc-webinar-summary { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:14px; }
      .mc-webinar-summary .mc-kpi { min-height:112px; }
      .mc-webinar-summary-label { display:flex; align-items:center; gap:6px; }
      .mc-webinar-table-wrap { margin-top:2px; }
      .mc-webinar-company { color:var(--mc-muted); font-size:11px; margin-top:4px; font-family:var(--mc-font-mono); }
      .mc-webinar-payment { display:inline-flex; align-items:center; padding:2px 9px; border-radius:999px; font-size:10px; font-weight:700; font-family:var(--mc-font-mono); letter-spacing:0.08em; }
      .mc-webinar-detail { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; }
      .mc-webinar-detail-field { display:flex; flex-direction:column; gap:4px; padding:12px 14px; border-radius:12px; border:1px solid var(--mc-border); background:rgba(255,255,255,0.02); }
      .mc-webinar-detail-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--mc-muted); font-weight:700; }
      .mc-webinar-detail-value { font-size:13px; color:var(--mc-text); font-family:var(--mc-font-mono); word-break:break-word; }
      .mc-webinar-detail-panel { display:flex; flex-direction:column; gap:14px; }
      .mc-webinar-empty { min-height:180px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:8px; border-radius:14px; border:1px dashed var(--mc-border); background:rgba(255,255,255,0.02); color:var(--mc-muted); }
      .mc-webinar-split { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:16px; align-items:start; }
      .mc-webinar-config-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px; }
      .mc-webinar-config-span-2 { grid-column:1 / -1; }
      .mc-webinar-status-row { display:flex; gap:8px; flex-wrap:wrap; }
      .mc-webinar-status-chip { border:1px solid var(--mc-border); background:rgba(255,255,255,0.02); color:var(--mc-muted); border-radius:999px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; transition:all var(--mc-ease-fast); }
      .mc-webinar-status-chip:hover { color:var(--mc-text); border-color:rgba(167,139,250,0.35); }
      .mc-webinar-status-chip.active { color:var(--mc-violet); background:rgba(167,139,250,0.12); border-color:rgba(167,139,250,0.4); }
      .mc-webinar-field-hint {
  color: var(--mc-faint);
  font-size: 10px;
  font-family: var(--mc-font-mono);
  margin-top: 2px;
}

.mc-webinar-config-grid .mc-input {
  min-width: 0;
}

.mc-webinar-config-grid textarea.mc-input {
  min-height: 58px;
  height: auto;
  resize: vertical;
  line-height: 1.5;
}

.mc-webinar-config-grid input[type="date"],
.mc-webinar-config-grid input[type="time"],
.mc-webinar-config-grid input[type="number"] {
  cursor: text;
}

.mc-webinar-config-grid input[type="date"],
.mc-webinar-config-grid input[type="time"] {
  color-scheme: dark;
}

.mc-webinar-config-grid input[type="date"]::-webkit-calendar-picker-indicator,
.mc-webinar-config-grid input[type="time"]::-webkit-calendar-picker-indicator {
  opacity: 0.8;
  cursor: pointer;
}
      @media (max-width: 1080px) {
        .mc-webinar-toolbar { grid-template-columns:1fr; }
        .mc-webinar-split { grid-template-columns:1fr; }
        .mc-webinar-actions { justify-content:flex-start; }
        .mc-webinar-config-grid { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  }

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

  function normalizeStatus(rawStatus) {
    return String(rawStatus || '').trim().toUpperCase();
  }

  function paymentState(rawStatus) {
    const status = normalizeStatus(rawStatus);
    if (status === 'PAID') return 'PAID';
    if (status === 'FAILED' || status === 'CANCELLED') return 'FAILED';
    return 'PENDING';
  }

  function currency(paise) {
    const amount = Number(paise || 0) / 100;
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
  }

  function formatDate(value) {
    if (!value) return '–';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '–';
    return date.toLocaleString('en-IN');
  }

function formatDateInput(value) {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    return year >= 2000 && year <= 2100 ? raw : '';
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return '';

  return date.toISOString().slice(0, 10);
}

function formatTimeInput(value) {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':').map(Number);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return raw;
    }
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*IST)?$/i);
  if (!match) return '';

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return '';

  if (period === 'AM') {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTimePayload(value) {
  const input = formatTimeInput(value);
  if (!input) return String(value || '').trim();

  const [hoursRaw, minutes] = input.split(':');
  const hours24 = Number(hoursRaw);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes} ${period} IST`;
}

  function formatCurrency(paise) {
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(paise || 0) / 100)}`;
  }

  function toDraft(config) {
    const source = config || DEFAULT_CONFIG;
    return {
      title: source.title || '',
      subTitle: source.subTitle || '',
      eventDate: formatDateInput(source.eventDate) || DEFAULT_CONFIG.eventDate,
      eventTime: formatTimeInput(source.eventTime) || formatTimeInput(DEFAULT_CONFIG.eventTime),
      hostName: source.hostName || '',
      ticketPriceRupees: String(Math.round(Number(source.ticketPrice || 0) / 100) || 0),
      zoomLink: source.zoomLink || '',
      whatsappGroupLink: source.whatsappGroupLink || '',
      status: source.status || 'OPEN',
    };
  }

  function draftToPayload(draft) {
    return {
      title: String(draft.title || '').trim(),
      subTitle: String(draft.subTitle || '').trim(),
      eventDate: draft.eventDate
      ? `${draft.eventDate}T12:00:00.000Z`
      : `${DEFAULT_CONFIG.eventDate}T12:00:00.000Z`,
      eventTime: formatTimePayload(draft.eventTime),
      hostName: String(draft.hostName || '').trim(),
      ticketPrice: Math.round(Number(draft.ticketPriceRupees || 0)) * 100,
      zoomLink: String(draft.zoomLink || '').trim(),
      whatsappGroupLink: String(draft.whatsappGroupLink || '').trim(),
      status: String(draft.status || 'OPEN'),
    };
  }

  function getActiveFeePaise() {
    return state.config?.ticketPrice || 19_900;
  }

  function getVisibleRegistrations() {
    const query = state.search.trim().toLowerCase();
    return state.registrations.filter((registration) => {
      const matchesQuery = !query || [registration.fullName, registration.email, registration.phone, registration.company, registration.razorpayPaymentId]
        .some((field) => String(field || '').toLowerCase().includes(query));
      const matchesStatus = state.statusFilter === 'all' || paymentState(registration.rawStatus) === state.statusFilter.toUpperCase();
      return matchesQuery && matchesStatus;
    });
  }

  function getSelectedRegistration() {
    return state.registrations.find((registration) => registration.id === state.selectedId) || null;
  }

  function paymentMeta(rawStatus) {
    return PAYMENT_META[normalizeStatus(rawStatus)] || PAYMENT_META.REGISTERED;
  }

  function statusBadge(rawStatus) {
    const meta = paymentMeta(rawStatus);
    return `<span class="mc-webinar-payment" style="background:${meta.bg};color:${meta.color};">${meta.label}</span>`;
  }

  function csvEscape(value) {
    const safe = String(value ?? '');
    if (/[",\n]/.test(safe)) {
      return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
  }

  function buildCsv(rows) {
    const headers = [
      'Full Name',
      'Phone (WhatsApp)',
      'Email',
      'Company / Brokerage',
      'Payment Status',
      'Razorpay Payment ID',
      'Razorpay Order ID',
      'Registration Timestamp',
      'Webinar Title',
    ];

    const lines = [headers.join(',')];
    rows.forEach((registration) => {
      lines.push([
        csvEscape(registration.fullName),
        csvEscape(registration.phone),
        csvEscape(registration.email),
        csvEscape(registration.company || ''),
        csvEscape(paymentState(registration.rawStatus)),
        csvEscape(registration.razorpayPaymentId || ''),
        csvEscape(registration.razorpayOrderId || ''),
        csvEscape(registration.registrationTimestamp),
        csvEscape(registration.webinarTitle || ''),
      ].join(','));
    });
    return lines.join('\n');
  }

  function downloadCsv(rows) {
    const blob = new Blob(['\ufeff' + buildCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `webinar-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function loadRegistrations() {
    state.loading = true;
    state.error = '';
    render();

    try {
      const response = await MCApi.getWebinarRegistrations();
      state.registrations = response.data || [];
      state.summary = response.summary || null;
      if (!state.selectedId || !state.registrations.some((registration) => registration.id === state.selectedId)) {
        state.selectedId = state.registrations[0]?.id || null;
      }
    } catch (error) {
      state.error = error?.message || 'Failed to load webinar registrations';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadWebinarConfig() {
    state.configLoading = true;
    state.configError = '';
    render();

    try {
      const response = await MCApi.getWebinarConfig();
      const config = response.data || DEFAULT_CONFIG;
      state.config = config;
      state.configDraft = toDraft(config);
    } catch (error) {
      state.configError = error?.message || 'Failed to load webinar config';
      if (!state.configDraft) {
        state.configDraft = toDraft(DEFAULT_CONFIG);
      }
    } finally {
      state.configLoading = false;
      render();
    }
  }

  async function loadDashboard() {
    await Promise.all([loadRegistrations(), loadWebinarConfig()]);
  }

  async function saveWebinarConfig() {
    if (!state.configDraft) {
      state.configDraft = toDraft(DEFAULT_CONFIG);
    }

    state.configSaving = true;
    state.configError = '';
    render();

    try {
      const response = await MCApi.updateWebinarConfig(draftToPayload(state.configDraft));
      state.config = response.data || state.configDraft;
      state.configDraft = toDraft(state.config);
      MCToast?.success?.('Webinar config saved and synced');
    } catch (error) {
      state.configError = error?.message || 'Failed to save webinar config';
    } finally {
      state.configSaving = false;
      render();
    }
  }

  async function refreshSelectedRegistration(registrationId) {
    state.savingId = registrationId;
    state.error = '';
    render();
    try {
      await MCApi.updateWebinarRegistration(registrationId, { status: 'PAID' });
      await loadRegistrations();
      state.selectedId = registrationId;
      MCToast?.success?.('Registration marked as PAID');
    } catch (error) {
      state.error = error?.message || 'Failed to update registration';
    } finally {
      state.savingId = null;
      render();
    }
  }

  async function exportAllRegistrations() {
    state.exporting = true;
    render();
    try {
      const response = await MCApi.getWebinarRegistrations();
      downloadCsv(response.data || []);
      MCToast?.success?.('CSV exported');
    } catch (error) {
      state.error = error?.message || 'Failed to export CSV';
    } finally {
      state.exporting = false;
      render();
    }
  }

  function renderConfigPanel() {
    const draft = state.configDraft || toDraft(state.config || DEFAULT_CONFIG);
    const activeStatus = String(draft.status || 'OPEN');
    const updatedAt = state.config?.updatedAt ? formatDate(state.config.updatedAt) : 'Not saved yet';

    return `
      <section class="mc-card">
        <div class="mc-webinar-hero">
          <div class="mc-webinar-hero-copy">
            <div class="mc-webinar-hero-pill"><i data-lucide="sliders-horizontal" style="width:12px;height:12px;"></i>Webinar CMS</div>
            <h2 class="mc-webinar-title" style="font-size:22px;">Event settings and live registration state</h2>
            <p class="mc-webinar-subtitle">Edit the public webinar content once, save it here, and the landing page picks it up immediately.</p>
          </div>
          <div class="mc-webinar-actions">
            <button class="mc-btn mc-btn-primary" data-action="save-config" ${state.configSaving ? 'disabled' : ''}>
              <i data-lucide="save" style="width:12px;height:12px;"></i>
              ${state.configSaving ? 'Saving…' : 'Save & Sync'}
            </button>
          </div>
        </div>

        ${state.configLoading ? `
          <div class="mc-webinar-empty" style="margin-top:16px;">
            <i data-lucide="loader-circle" style="width:28px;height:28px;color:var(--mc-violet);"></i>
            <div style="font-weight:700;color:var(--mc-text);">Loading webinar config…</div>
          </div>
        ` : ''}

        ${state.configError ? `<div style="margin-top:12px;color:var(--mc-red);font-size:12px;font-family:var(--mc-font-mono);">${escapeHtml(state.configError)}</div>` : ''}

        <div class="mc-webinar-config-grid" style="margin-top:16px;">
          <div class="mc-input-group mc-webinar-config-span-2">
            <label class="mc-input-label">Title</label>
            <input class="mc-input" data-config-field="title" value="${escapeHtml(draft.title)}" />
          </div>
          <div class="mc-input-group mc-webinar-config-span-2">
            <label class="mc-input-label">Subtitle</label>
            <textarea class="mc-input" data-config-field="subTitle" rows="2">${escapeHtml(draft.subTitle)}</textarea>
          </div>
          <div class="mc-input-group">
            <label class="mc-input-label">Event Date</label>
            <input class="mc-input" type="date" data-config-field="eventDate" value="${escapeHtml(draft.eventDate)}" />
          </div>
          <div class="mc-input-group">
            <label class="mc-input-label">Time</label>
            <input
            class="mc-input mc-webinar-time-input"
            type="time"
            data-config-field="eventTime"
            value="${escapeHtml(formatTimeInput(draft.eventTime))}"
            />
          <div class="mc-webinar-field-hint">IST • 24-hour picker</div>
          </div>
          <div class="mc-input-group">
            <label class="mc-input-label">Host Name</label>
            <input class="mc-input" data-config-field="hostName" value="${escapeHtml(draft.hostName)}" />
          </div>
          <div class="mc-input-group">
            <label class="mc-input-label">Ticket Price (₹)</label>
            <input class="mc-input" type="number" min="0" data-config-field="ticketPriceRupees" value="${escapeHtml(draft.ticketPriceRupees)}" />
          </div>
          <div class="mc-input-group mc-webinar-config-span-2">
            <label class="mc-input-label">Zoom Link</label>
            <input class="mc-input" data-config-field="zoomLink" value="${escapeHtml(draft.zoomLink)}" />
          </div>
          <div class="mc-input-group mc-webinar-config-span-2">
            <label class="mc-input-label">WhatsApp VIP Group Link</label>
            <input class="mc-input" data-config-field="whatsappGroupLink" value="${escapeHtml(draft.whatsappGroupLink)}" />
          </div>
          <div class="mc-input-group mc-webinar-config-span-2">
            <label class="mc-input-label">Registration Status</label>
            <div class="mc-webinar-status-row">
              ${STATUS_OPTIONS.map((option) => `
                <button
                class="mc-webinar-status-chip ${activeStatus === option.value ? 'active' : ''}"
                data-config-status="${option.value}"
                type="button"
                aria-pressed="${activeStatus === option.value ? 'true' : 'false'}"
                >
              ${option.label}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;align-items:center;">
          <div class="mc-webinar-config-note">
            <div>
  Current status:
  <span data-config-status-label style="color:var(--mc-text);font-weight:700;">
    ${statusOptionsLabel(activeStatus)}
  </span>
</div>
            <div>Last synced: ${escapeHtml(updatedAt)}</div>
          </div>
          <div class="mc-webinar-config-note" style="text-align:right;max-width:460px;">
            Changes here update the public landing screen, the register flow, and the payment amount without redeploying frontend code.
          </div>
        </div>
      </section>
    `;
  }

  function statusOptionsLabel(status) {
    const found = STATUS_OPTIONS.find((option) => option.value === status);
    return found ? found.label : 'Registrations Open';
  }

  function renderSummary() {
    const summary = state.summary || {
      totalRegistrations: 0,
      paidCount: 0,
      pendingCount: 0,
      failedCount: 0,
      revenueCollectedPaise: 0,
      revenueCollectedFormatted: currency(0),
    };
    const fee = getActiveFeePaise();

    return `
      <div class="mc-webinar-summary">
        <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-violet);">
          <div class="mc-kpi-label mc-webinar-summary-label"><i data-lucide="users" style="width:12px;height:12px;"></i>Total Registrations</div>
          <div class="mc-kpi-value">${summary.totalRegistrations}</div>
          <div class="mc-kpi-sub">All webinar sign-ups captured in the admin database</div>
        </div>
        <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-green);">
          <div class="mc-kpi-label mc-webinar-summary-label"><i data-lucide="indian-rupee" style="width:12px;height:12px;"></i>Total Revenue Collected</div>
          <div class="mc-kpi-value">${summary.revenueCollectedFormatted || currency(summary.revenueCollectedPaise)}</div>
          <div class="mc-kpi-sub">Based on paid registrations at ${formatCurrency(fee)} each</div>
        </div>
        <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-green);">
          <div class="mc-kpi-label mc-webinar-summary-label"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i>Paid</div>
          <div class="mc-kpi-value">${summary.paidCount}</div>
          <div class="mc-kpi-sub">Confirmed payments, Razorpay verified or overridden</div>
        </div>
        <div class="mc-kpi" style="--mc-kpi-accent:var(--mc-amber);">
          <div class="mc-kpi-label mc-webinar-summary-label"><i data-lucide="clock-3" style="width:12px;height:12px;"></i>Pending</div>
          <div class="mc-kpi-value">${summary.pendingCount}</div>
          <div class="mc-kpi-sub">Checkout attempts still awaiting payment completion</div>
        </div>
      </div>
    `;
  }

  function renderDetailPanel() {
    const selected = getSelectedRegistration();
    if (!selected) {
      return `
        <div class="mc-card mc-webinar-empty">
          <i data-lucide="badge-info" style="width:28px;height:28px;color:var(--mc-violet);"></i>
          <div style="font-weight:700;color:var(--mc-text);">Select a registration</div>
          <div style="font-size:12px;max-width:260px;">Inspect attendee data, view payment state, and apply a manual PAID override if needed.</div>
        </div>
      `;
    }

    const selectedStatus = paymentState(selected.rawStatus);
    const canOverride = selectedStatus !== 'PAID' && state.savingId !== selected.id;

    return `
      <div class="mc-card mc-webinar-detail-panel">
        <div class="mc-card-header" style="margin-bottom:0;">
          <div>
            <div class="mc-card-title">Attendee Detail</div>
            <div style="font-size:11px;color:var(--mc-muted);margin-top:4px;">${escapeHtml(selected.fullName)}</div>
          </div>
          ${statusBadge(selected.rawStatus)}
        </div>
        <div class="mc-webinar-detail">
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Phone</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.phone)}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Email</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.email)}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Company / Brokerage</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.company || '—')}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Razorpay Payment ID</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.razorpayPaymentId || '—')}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Razorpay Order ID</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.razorpayOrderId || '—')}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Registered At</div>
            <div class="mc-webinar-detail-value">${escapeHtml(formatDate(selected.registrationTimestamp))}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Webinar</div>
            <div class="mc-webinar-detail-value">${escapeHtml(selected.webinarTitle || 'Maxsas Webinar')}</div>
          </div>
          <div class="mc-webinar-detail-field">
            <div class="mc-webinar-detail-label">Revenue Credit</div>
            <div class="mc-webinar-detail-value">${selectedStatus === 'PAID' ? formatCurrency(getActiveFeePaise()) : '₹0'}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="mc-btn mc-btn-primary" data-action="mark-paid" data-id="${escapeHtml(selected.id)}" ${canOverride ? '' : 'disabled'}>
            <i data-lucide="check-check" style="width:12px;height:12px;"></i>
            ${state.savingId === selected.id ? 'Updating…' : 'Mark as PAID'}
          </button>
          <button class="mc-btn mc-btn-ghost" data-action="refresh-selected" data-id="${escapeHtml(selected.id)}">
            <i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i>
            Refresh Record
          </button>
        </div>
      </div>
    `;
  }

  function renderTable(rows) {
    if (!rows.length) {
      return `
        <div class="mc-card mc-webinar-empty">
          <i data-lucide="search-x" style="width:28px;height:28px;color:var(--mc-violet);"></i>
          <div style="font-weight:700;color:var(--mc-text);">No webinar attendees found</div>
          <div style="font-size:12px;max-width:300px;">Try a different search or payment status filter, or refresh to pull the latest registrations.</div>
        </div>
      `;
    }

    return `
      <div class="mc-table-wrap mc-webinar-table-wrap">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Phone (WhatsApp)</th>
              <th>Email</th>
              <th>Company / Brokerage</th>
              <th>Status</th>
              <th>Razorpay Payment ID</th>
              <th>Registration Timestamp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((registration) => {
              const isSelected = state.selectedId === registration.id;
              const paymentStatus = paymentState(registration.rawStatus);
              return `
                <tr data-id="${escapeHtml(registration.id)}" style="${isSelected ? 'background:rgba(167,139,250,0.08);' : ''}">
                  <td>
                    <div style="font-weight:700;color:var(--mc-text);font-family:var(--mc-font-mono);">${escapeHtml(registration.fullName)}</div>
                    <div class="mc-webinar-company">${escapeHtml(registration.webinarTitle || 'Webinar')}</div>
                  </td>
                  <td>${escapeHtml(registration.phone)}</td>
                  <td>${escapeHtml(registration.email)}</td>
                  <td>${escapeHtml(registration.company || '—')}</td>
                  <td>${statusBadge(registration.rawStatus)}</td>
                  <td>${escapeHtml(registration.razorpayPaymentId || '—')}</td>
                  <td>${escapeHtml(formatDate(registration.registrationTimestamp))}</td>
                  <td>
                    <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
                      <button class="mc-btn mc-btn-ghost mc-btn-sm" data-action="inspect" data-id="${escapeHtml(registration.id)}">
                        <i data-lucide="eye" style="width:11px;height:11px;"></i>
                      </button>
                      ${paymentStatus !== 'PAID' ? `
                        <button class="mc-btn mc-btn-primary mc-btn-sm" data-action="mark-paid" data-id="${escapeHtml(registration.id)}">
                          <i data-lucide="check" style="width:11px;height:11px;"></i>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function render() {
    ensureStyles();
    const root = getRoot();
    if (!root) return;

    const visibleRegistrations = getVisibleRegistrations();

    root.innerHTML = `
      <div class="mc-webinar-page mc-animate-in">
        <section class="mc-card">
          <div class="mc-webinar-hero">
            <div class="mc-webinar-hero-copy">
              <div class="mc-webinar-hero-pill"><i data-lucide="calendar-days" style="width:12px;height:12px;"></i>Webinar Management</div>
              <h1 class="mc-webinar-title">Webinar registrations, payments, and attendee control</h1>
              <p class="mc-webinar-subtitle">Monitor sign-ups, reconcile payment outcomes, export the attendee list, and override payment state for manual admin fixes when required.</p>
            </div>
            <div class="mc-webinar-actions">
              <button class="mc-btn mc-btn-ghost" data-action="refresh" ${state.loading ? 'disabled' : ''}>
                <i data-lucide="refresh-ccw" style="width:12px;height:12px;"></i>
                ${state.loading ? 'Refreshing…' : 'Manual Sync'}
              </button>
              <button class="mc-btn mc-btn-primary" data-action="export" ${state.exporting ? 'disabled' : ''}>
                <i data-lucide="download" style="width:12px;height:12px;"></i>
                ${state.exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>
        </section>

        ${renderConfigPanel()}

        ${renderSummary()}

        <section class="mc-card">
          <div class="mc-webinar-toolbar">
            <div class="mc-input-group">
              <label class="mc-input-label">Search attendees</label>
              <input class="mc-input" data-field="search" placeholder="Search by name, email, phone, company, payment id" value="${escapeHtml(state.search)}" />
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Filter by status</label>
              <div class="mc-webinar-filter-row">
                ${FILTERS.map((filter) => `
                  <button class="mc-webinar-filter-chip ${state.statusFilter === filter.key ? 'active' : ''}" data-action="filter" data-filter="${filter.key}">${filter.label}</button>
                `).join('')}
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Snapshot</label>
              <div style="display:flex;align-items:center;gap:8px;min-height:30px;color:var(--mc-muted);font-size:12px;font-family:var(--mc-font-mono);">
                <i data-lucide="sparkles" style="width:12px;height:12px;color:var(--mc-violet);"></i>
                ${visibleRegistrations.length} shown • ${state.registrations.length} loaded
              </div>
            </div>
          </div>

          ${state.error ? `<div style="margin-top:14px;color:var(--mc-red);font-size:12px;font-family:var(--mc-font-mono);">${escapeHtml(state.error)}</div>` : ''}

          <div style="margin-top:16px;">
            ${state.loading && state.registrations.length === 0 ? `
              <div class="mc-webinar-empty">
                <i data-lucide="loader-circle" style="width:28px;height:28px;color:var(--mc-violet);"></i>
                <div style="font-weight:700;color:var(--mc-text);">Loading webinar registrations…</div>
              </div>
            ` : renderTable(visibleRegistrations)}
          </div>
        </section>

        <div class="mc-webinar-split">
          <section>${renderDetailPanel()}</section>
          <section class="mc-card">
            <div class="mc-card-header">
              <div class="mc-card-title"><i data-lucide="shield-check" style="width:14px;height:14px;"></i>Admin Controls</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;color:var(--mc-muted);font-size:12px;line-height:1.6;">
              <div>• The endpoint is protected by the shared admin access guard and only resolves data from the WebinarRegistration Prisma model.</div>
              <div>• CSV export is generated locally from the latest fetched dataset for WhatsApp broadcasts and email tools.</div>
              <div>• Manual PAID override updates the selected registration in place and re-syncs the list immediately.</div>
              <div>• Revenue is calculated at <span style="color:var(--mc-text);font-weight:700;">${formatCurrency(getActiveFeePaise())}</span> per successful registration.</div>
            </div>
          </section>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-action="refresh"]').forEach((button) => {
      button.addEventListener('click', () => void loadDashboard());
    });
    root.querySelectorAll('[data-action="export"]').forEach((button) => {
      button.addEventListener('click', () => void exportAllRegistrations());
    });
    root.querySelectorAll('[data-action="filter"]').forEach((button) => {
      button.addEventListener('click', () => {
        state.statusFilter = button.dataset.filter || 'all';
        render();
      });
    });
    root.querySelectorAll('[data-action="inspect"]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedId = button.dataset.id || null;
        render();
      });
    });
    root.querySelectorAll('[data-action="mark-paid"]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) return;
        const registration = state.registrations.find((entry) => entry.id === id);
        if (!registration) return;
        const proceed = window.confirm(`Mark ${registration.fullName} as PAID?`);
        if (!proceed) return;
        void refreshSelectedRegistration(id);
      });
    });
    root.querySelectorAll('[data-field="search"]').forEach((input) => {
      input.addEventListener('input', () => {
        state.search = input.value || '';
        render();
      });
    });
    root.querySelectorAll('[data-action="save-config"]').forEach((button) => {
      button.addEventListener('click', () => void saveWebinarConfig());
    });
    root.querySelectorAll('[data-config-status]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!state.configDraft) {
      state.configDraft = toDraft(DEFAULT_CONFIG);
    }

    const nextStatus = button.dataset.configStatus || 'OPEN';

    state.configDraft = {
      ...state.configDraft,
      status: nextStatus,
    };

    root.querySelectorAll('[data-config-status]').forEach((statusButton) => {
      const active = statusButton.dataset.configStatus === nextStatus;

      statusButton.classList.toggle('active', active);
      statusButton.setAttribute(
        'aria-pressed',
        active ? 'true' : 'false'
      );
    });

    const statusLabel = root.querySelector('[data-config-status-label]');

    if (statusLabel) {
      statusLabel.textContent = statusOptionsLabel(nextStatus);
    }
  });
});
    root.querySelectorAll('[data-config-field]').forEach((input) => {
  const syncConfigField = () => {
    if (!state.configDraft) {
      state.configDraft = toDraft(DEFAULT_CONFIG);
    }

    const field = input.dataset.configField;
    if (!field) return;

    state.configDraft = {
      ...state.configDraft,
      [field]: input.value,
    };
  };

  input.addEventListener('input', syncConfigField);
  input.addEventListener('change', syncConfigField);  
  });
    if (window.lucide) window.lucide.createIcons();

    if (!state.bootstrapped) {
      state.bootstrapped = true;
      void loadDashboard();
    }
  }

  return {
    render,
    destroy() {
      state.search = '';
      state.statusFilter = 'all';
      state.selectedId = null;
      state.savingId = null;
      state.exporting = false;
    },
  };
})();