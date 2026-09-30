window.MCModVoiceTrials = (function () {
  const state = {
    root: null,
    calls: [],
    registrations: [],
    selectedId: null,
    loading: false,
    creating: false,
    triggeringId: null,
    error: '',
    refreshTimer: null,
    handlers: null,
  };

  const ACTIVE_STATUSES = new Set(['QUEUED', 'INITIATING', 'IN_PROGRESS']);
  const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
  const STATUS_META = {
    QUEUED: { label: 'Queued', tone: 'queued' },
    INITIATING: { label: 'Initiating', tone: 'initiating' },
    IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
    COMPLETED: { label: 'Completed', tone: 'completed' },
    FAILED: { label: 'Failed', tone: 'failed' },
    CANCELLED: { label: 'Cancelled', tone: 'cancelled' },
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || seconds === '') return '—';
    const total = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
  }

  function maskPhone(value) {
    const phone = String(value || '');
    if (phone.length < 7) return phone || '—';
    return `${phone.slice(0, 3)} ${'•'.repeat(Math.max(3, phone.length - 7))} ${phone.slice(-4)}`;
  }

  function statusBadge(status) {
    const meta = STATUS_META[status] || { label: status || 'Unknown', tone: 'unknown' };
    return `<span class="mc-trial-status mc-trial-status--${meta.tone}"><span class="mc-trial-status-dot"></span>${escapeHtml(meta.label)}</span>`;
  }

  function parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function transcriptMessages(value) {
    const parsed = parseJson(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.messages)) return parsed.messages;
    if (typeof value === 'string' && value.trim()) return [{ speaker: 'unknown', text: value }];
    return [];
  }

  function analysisFields(call) {
    const data = parseJson(call.outcomeData);
    const values = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    return [
      ['Outcome', call.outcome],
      ['Summary', values.summary],
      ['Intent', values.intent],
      ['Qualification', values.qualification || values.qualified],
      ['Next Action', values.nextAction || values.next_action],
      ['Sentiment', values.sentiment],
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  }

  function ensureStyles() {
    if (document.getElementById('mc-voice-trials-styles')) return;
    const style = document.createElement('style');
    style.id = 'mc-voice-trials-styles';
    style.textContent = `
      .mc-trials { width:100%; max-width:var(--mc-content-max); margin:0 auto; display:flex; flex-direction:column; gap:18px; }
      .mc-trials-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
      .mc-trials-kicker { color:var(--mc-cyan); font:600 10px var(--mc-font-mono); letter-spacing:.12em; text-transform:uppercase; }
      .mc-trials-title { margin:6px 0 0; color:var(--mc-text); font-size:26px; line-height:1.15; font-weight:800; }
      .mc-trials-subtitle { margin:7px 0 0; color:var(--mc-muted); font-size:12px; max-width:620px; }
      .mc-trials-actions { display:flex; gap:8px; align-items:center; }
      .mc-trials-btn { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:0 13px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); color:var(--mc-text); background:var(--mc-panel); font-size:11px; font-weight:650; cursor:pointer; }
      .mc-trials-btn:hover { border-color:var(--mc-cyan); background:var(--mc-cyan-dim); }
      .mc-trials-btn.primary { color:#061018; border-color:var(--mc-lime); background:var(--mc-lime); }
      .mc-trials-btn:disabled { cursor:not-allowed; opacity:.5; }
      .mc-trials-btn i { width:14px; height:14px; }
      .mc-trials-kpis { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
      .mc-trials-kpi { padding:15px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:linear-gradient(145deg,var(--mc-panel),rgba(8,15,25,.72)); }
      .mc-trials-kpi-label { color:var(--mc-muted); font-size:10px; text-transform:uppercase; letter-spacing:.07em; }
      .mc-trials-kpi-value { margin-top:8px; color:var(--mc-text); font:600 24px var(--mc-font-mono); }
      .mc-trials-kpi--active .mc-trials-kpi-value { color:var(--mc-cyan); }
      .mc-trials-kpi--done .mc-trials-kpi-value { color:var(--mc-green); }
      .mc-trials-kpi--failed .mc-trials-kpi-value { color:var(--mc-red); }
      .mc-trials-table-shell { overflow:hidden; border:1px solid var(--mc-border); border-radius:var(--mc-r-lg); background:var(--mc-panel); box-shadow:var(--mc-shadow-panel); }
      .mc-trials-table-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 16px; border-bottom:1px solid var(--mc-border); }
      .mc-trials-table-head h2 { margin:0; color:var(--mc-text); font-size:13px; }
      .mc-trials-table-head span { color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-trials-table-wrap { overflow-x:auto; }
      .mc-trials-table { width:100%; min-width:780px; border-collapse:collapse; }
      .mc-trials-table th,.mc-trials-table td { padding:12px 16px; border-bottom:1px solid var(--mc-border-soft); text-align:left; vertical-align:middle; }
      .mc-trials-table th { color:var(--mc-muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
      .mc-trials-table td { color:var(--mc-text); font-size:11px; }
      .mc-trials-table tbody tr:hover { background:rgba(0,212,255,.045); }
      .mc-trials-customer { display:flex; flex-direction:column; gap:3px; }
      .mc-trials-customer strong { font-size:11px; }
      .mc-trials-customer small,.mc-trials-muted { color:var(--mc-faint); font:10px var(--mc-font-mono); }
      .mc-trial-status { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border:1px solid transparent; border-radius:999px; font:600 9px var(--mc-font-mono); white-space:nowrap; }
      .mc-trial-status-dot { width:6px; height:6px; border-radius:50%; background:currentColor; }
      .mc-trial-status--queued { color:var(--mc-amber); background:var(--mc-amber-dim); }
      .mc-trial-status--initiating,.mc-trial-status--progress { color:var(--mc-cyan); background:var(--mc-cyan-dim); }
      .mc-trial-status--completed { color:var(--mc-green); background:var(--mc-green-dim); }
      .mc-trial-status--failed { color:var(--mc-red); background:var(--mc-red-dim); }
      .mc-trial-status--cancelled,.mc-trial-status--unknown { color:var(--mc-muted); background:rgba(148,163,184,.1); }
      .mc-trials-row-action { border:0; background:none; color:var(--mc-cyan); font-size:10px; font-weight:700; cursor:pointer; white-space:nowrap; }
      .mc-trials-row-action:hover { color:var(--mc-lime); }
      .mc-trials-empty,.mc-trials-error { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:220px; padding:24px; text-align:center; }
      .mc-trials-empty i,.mc-trials-error i { width:26px; height:26px; color:var(--mc-cyan); }
      .mc-trials-empty strong,.mc-trials-error strong { color:var(--mc-text); font-size:13px; }
      .mc-trials-empty span,.mc-trials-error span { color:var(--mc-muted); font-size:11px; }
      .mc-trials-drawer { position:fixed; inset:0; z-index:var(--mc-z-modal); display:flex; justify-content:flex-end; background:rgba(2,6,12,.74); backdrop-filter:blur(5px); }
      .mc-trials-drawer-panel { width:min(820px,96vw); height:100%; overflow:auto; border-left:1px solid var(--mc-border); background:var(--mc-surface); box-shadow:-18px 0 55px rgba(0,0,0,.5); animation:mc-trials-drawer-in 220ms cubic-bezier(.16,1,.3,1) both; }
      @keyframes mc-trials-drawer-in { from { transform:translateX(24px); opacity:.6; } to { transform:translateX(0); opacity:1; } }
      .mc-trials-drawer-header { position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:17px 20px; border-bottom:1px solid var(--mc-border); background:color-mix(in srgb,var(--mc-surface) 94%,transparent); backdrop-filter:blur(14px); }
      .mc-trials-drawer-header h2 { margin:0; color:var(--mc-text); font-size:17px; }
      .mc-trials-drawer-header p { margin:4px 0 0; color:var(--mc-muted); font:10px var(--mc-font-mono); }
      .mc-trials-close { width:30px; height:30px; display:grid; place-items:center; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); color:var(--mc-muted); background:transparent; cursor:pointer; }
      .mc-trials-close:hover { color:var(--mc-text); border-color:var(--mc-cyan); }
      .mc-trials-drawer-body { display:flex; flex-direction:column; gap:13px; padding:17px 20px 28px; }
      .mc-trials-detail-section { padding:14px; border:1px solid var(--mc-border); border-radius:var(--mc-r-md); background:var(--mc-panel); }
      .mc-trials-detail-section h3 { display:flex; align-items:center; gap:7px; margin:0 0 12px; color:var(--mc-text); font-size:12px; }
      .mc-trials-detail-section h3 i { width:14px; height:14px; color:var(--mc-cyan); }
      .mc-trials-detail-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .mc-trials-detail-field { min-width:0; }
      .mc-trials-detail-field label { display:block; color:var(--mc-muted); font-size:9px; text-transform:uppercase; letter-spacing:.07em; }
      .mc-trials-detail-field strong { display:block; margin-top:4px; color:var(--mc-text); font:11px var(--mc-font-mono); word-break:break-word; }
      .mc-trials-analysis { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .mc-trials-analysis-item { padding:9px 10px; border:1px solid var(--mc-border-soft); border-radius:var(--mc-r-sm); }
      .mc-trials-analysis-item span { display:block; color:var(--mc-muted); font-size:9px; text-transform:uppercase; }
      .mc-trials-analysis-item strong { display:block; margin-top:4px; color:var(--mc-text); font-size:11px; line-height:1.45; white-space:pre-wrap; }
      .mc-trials-transcript { display:flex; flex-direction:column; gap:9px; }
      .mc-trials-message { max-width:84%; padding:9px 11px; border:1px solid var(--mc-border-soft); border-radius:10px; color:var(--mc-text); font-size:11px; line-height:1.5; white-space:pre-wrap; }
      .mc-trials-message.ai { align-self:flex-start; background:rgba(0,212,255,.06); }
      .mc-trials-message.customer { align-self:flex-end; background:rgba(173,255,47,.07); }
      .mc-trials-message.unknown { align-self:flex-start; background:rgba(148,163,184,.08); }
      .mc-trials-message-label { display:block; margin-bottom:4px; color:var(--mc-muted); font:600 9px var(--mc-font-mono); text-transform:uppercase; }
      .mc-trials-recording { display:flex; align-items:center; gap:10px; padding:11px; border:1px dashed var(--mc-border); border-radius:var(--mc-r-sm); color:var(--mc-muted); font-size:11px; }
      .mc-trials-recording i { color:var(--mc-cyan); width:17px; height:17px; }
      .mc-trials-timeline { display:flex; flex-direction:column; gap:0; }
      .mc-trials-timeline-item { display:grid; grid-template-columns:18px minmax(0,1fr); gap:9px; min-height:37px; }
      .mc-trials-timeline-mark { position:relative; display:flex; justify-content:center; }
      .mc-trials-timeline-mark::before { content:''; width:7px; height:7px; margin-top:4px; border-radius:50%; background:var(--mc-cyan); box-shadow:0 0 10px var(--mc-cyan); }
      .mc-trials-timeline-item:not(:last-child) .mc-trials-timeline-mark::after { content:''; position:absolute; top:13px; bottom:-3px; width:1px; background:var(--mc-border); }
      .mc-trials-timeline-label { color:var(--mc-text); font-size:11px; }
      .mc-trials-timeline-time { display:block; margin-top:3px; color:var(--mc-faint); font:9px var(--mc-font-mono); }
      .mc-trials-form { display:flex; flex-direction:column; gap:12px; }
      .mc-trials-form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .mc-trials-form .mc-input { width:100%; }
      @media (max-width:900px) { .mc-trials-kpis { grid-template-columns:repeat(3,minmax(0,1fr)); } }
      @media (max-width:620px) { .mc-trials-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .mc-trials-detail-grid,.mc-trials-form-row,.mc-trials-analysis { grid-template-columns:1fr; } .mc-trials-drawer-panel { width:100%; } .mc-trials-drawer-header,.mc-trials-drawer-body { padding-left:13px; padding-right:13px; } }
    `;
    document.head.appendChild(style);
  }

  function renderKpis() {
    const counts = state.calls.reduce((result, call) => {
      result.total += 1;
      if (call.status === 'QUEUED') result.queued += 1;
      if (call.status === 'IN_PROGRESS' || call.status === 'INITIATING') result.active += 1;
      if (call.status === 'COMPLETED') result.completed += 1;
      if (call.status === 'FAILED') result.failed += 1;
      return result;
    }, { total: 0, queued: 0, active: 0, completed: 0, failed: 0 });
    const target = document.getElementById('mc-trials-kpis');
    if (!target) return;
    target.innerHTML = [
      ['Total Trials', counts.total, ''], ['Queued', counts.queued, ''], ['In Progress', counts.active, 'active'],
      ['Completed', counts.completed, 'done'], ['Failed', counts.failed, 'failed'],
    ].map(([label, value, tone]) => `<div class="mc-trials-kpi mc-trials-kpi--${tone}"><div class="mc-trials-kpi-label">${label}</div><div class="mc-trials-kpi-value">${value}</div></div>`).join('');
  }

  function actionFor(call) {
    if (call.status === 'COMPLETED') return `<button class="mc-trials-row-action" data-action="view" data-id="${escapeHtml(call.id)}">View Call</button>`;
    if (call.status === 'FAILED') return `<button class="mc-trials-row-action" data-action="trigger" data-id="${escapeHtml(call.id)}">Retry Call</button>`;
    if (ACTIVE_STATUSES.has(call.status)) return `<span class="mc-trials-muted">Calling...</span>`;
    if (state.triggeringId === call.id) return '<span class="mc-trials-muted">Starting...</span>';
    return `<button class="mc-trials-row-action" data-action="trigger" data-id="${escapeHtml(call.id)}">Start Trial Call</button>`;
  }

  function renderTable() {
    const target = document.getElementById('mc-trials-table-content');
    if (!target) return;
    if (state.loading) {
      target.innerHTML = '<div class="mc-trials-empty"><i data-lucide="loader-circle"></i><strong>Loading trial calls</strong><span>Reading the latest call status from the backend.</span></div>';
      window.lucide?.createIcons?.();
      return;
    }
    if (state.error) {
      target.innerHTML = `<div class="mc-trials-error"><i data-lucide="triangle-alert"></i><strong>Trial calls unavailable</strong><span>${escapeHtml(state.error)}</span><button class="mc-trials-btn" data-action="refresh"><i data-lucide="refresh-cw"></i>Try again</button></div>`;
      window.lucide?.createIcons?.();
      return;
    }
    if (!state.calls.length) {
      target.innerHTML = '<div class="mc-trials-empty"><i data-lucide="phone-forwarded"></i><strong>Your trial calls will appear here.</strong><span>Start a voice trial for an existing customer to see its progress here.</span><button class="mc-trials-btn primary" data-action="create"><i data-lucide="plus"></i>New Voice Trial</button></div>';
      window.lucide?.createIcons?.();
      return;
    }
    target.innerHTML = `<div class="mc-trials-table-wrap"><table class="mc-trials-table"><thead><tr><th>Customer</th><th>Phone</th><th>Status</th><th>Duration</th><th>Created</th><th>Completed</th><th>Action</th></tr></thead><tbody>${state.calls.map((call) => `
      <tr>
        <td><div class="mc-trials-customer"><strong>${escapeHtml(call.customerName || 'Unnamed customer')}</strong><small>${escapeHtml(call.webinarRegistrationId ? 'Webinar registration linked' : 'Direct trial')}</small></div></td>
        <td class="mc-trials-muted">${escapeHtml(maskPhone(call.phoneNumber))}</td>
        <td>${statusBadge(call.status)}</td>
        <td class="mc-trials-muted">${escapeHtml(formatDuration(call.durationSeconds))}</td>
        <td class="mc-trials-muted">${escapeHtml(formatDate(call.createdAt))}</td>
        <td class="mc-trials-muted">${escapeHtml(formatDate(call.completedAt))}</td>
        <td>${actionFor(call)}</td>
      </tr>`).join('')}</tbody></table></div>`;
    window.lucide?.createIcons?.();
  }

  function render() {
    if (!state.root) return;
    state.root.innerHTML = `<section class="mc-trials" aria-labelledby="mc-trials-title">
      <header class="mc-trials-header"><div><div class="mc-trials-kicker">Master Control / Operations</div><h1 id="mc-trials-title" class="mc-trials-title">Voice Trials</h1><p class="mc-trials-subtitle">Start and review controlled AI voice trials for existing customers. Provider configuration stays server-side.</p></div><div class="mc-trials-actions"><button class="mc-trials-btn" data-action="refresh"><i data-lucide="refresh-cw"></i>Refresh</button><button class="mc-trials-btn primary" data-action="create"><i data-lucide="plus"></i>New Voice Trial</button></div></header>
      <div id="mc-trials-kpis" class="mc-trials-kpis"></div>
      <section class="mc-trials-table-shell"><div class="mc-trials-table-head"><h2>Trial Calls</h2><span>${state.calls.length} recorded</span></div><div id="mc-trials-table-content"></div></section>
    </section>`;
    renderKpis();
    renderTable();
    window.lucide?.createIcons?.();
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const response = await MCApi.getTrialCalls({ take: 100 });
      state.calls = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      state.error = error?.status === 401 || error?.status === 403 ? 'Admin access is required to view trial calls.' : 'The trial call service could not be reached.';
    } finally {
      state.loading = false;
      render();
      scheduleRefresh();
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    if (state.calls.some((call) => ACTIVE_STATUSES.has(call.status))) {
      state.refreshTimer = setTimeout(load, 15000);
    }
  }

  function openCreateModal() {
    const registrationOptions = state.registrations.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || 'Unnamed')} · ${escapeHtml(maskPhone(item.phone))}</option>`).join('');
    MCModal.open({
      title: 'New Voice Trial',
      body: `<form id="mc-trials-create-form" class="mc-trials-form"><div class="mc-trials-form-row"><div class="mc-input-group"><label class="mc-input-label">Customer name</label><input class="mc-input" name="customerName" maxlength="160" placeholder="Customer name" required></div><div class="mc-input-group"><label class="mc-input-label">Phone number</label><input class="mc-input" name="phoneNumber" maxlength="32" placeholder="+91..." required></div></div>${registrationOptions ? `<div class="mc-input-group"><label class="mc-input-label">Existing webinar registration <span class="mc-trials-muted">optional</span></label><select class="mc-input" name="webinarRegistrationId"><option value="">No linked registration</option>${registrationOptions}</select></div>` : '<div class="mc-trials-muted">No webinar registrations were loaded. You can create a direct trial with the customer details above.</div>'}</form>`,
      buttons: [
        { label: 'Cancel', type: 'secondary' },
        { label: 'Create Trial', type: 'primary', onClick: async () => {
          const form = document.getElementById('mc-trials-create-form');
          const data = Object.fromEntries(new FormData(form).entries());
          if (!data.customerName || !data.phoneNumber) return false;
          state.creating = true;
          try {
            await MCApi.createTrialCall({ customerName: data.customerName, phoneNumber: data.phoneNumber, ...(data.webinarRegistrationId ? { webinarRegistrationId: data.webinarRegistrationId } : {}) });
            MCToast.success('Voice trial created');
            await load();
          } catch (_) {
            MCToast.error('The voice trial could not be created. Check the customer details and try again.');
            return false;
          } finally { state.creating = false; }
          return true;
        } },
      ],
    });
  }

  async function create() {
    if (!state.registrations.length) {
      try {
        const response = await MCApi.getWebinarRegistrations();
        state.registrations = Array.isArray(response.data) ? response.data : [];
      } catch (_) { state.registrations = []; }
    }
    openCreateModal();
  }

  async function trigger(id) {
    const call = state.calls.find((item) => item.id === id);
    if (!call || state.triggeringId || ACTIVE_STATUSES.has(call.status)) return;
    state.triggeringId = id;
    renderTable();
    try {
      let response;
      let targetId = id;
      if (call.status === 'FAILED') {
        const created = await MCApi.createTrialCall({
          customerName: call.customerName,
          phoneNumber: call.phoneNumber,
          ...(call.webinarRegistrationId ? { webinarRegistrationId: call.webinarRegistrationId } : {}),
        });
        targetId = created.data?.id;
        if (!targetId) throw new Error('Trial call could not be recreated');
        response = await MCApi.triggerTrialCall(targetId);
      } else {
        response = await MCApi.triggerTrialCall(id);
      }
      const updated = response.data;
      if (updated && targetId === id) state.calls = state.calls.map((item) => item.id === id ? updated : item);
      if (updated?.status === 'FAILED') MCToast.error('The voice trial could not be started.');
      else MCToast.success('Voice trial started');
      if (targetId !== id) await load();
    } catch (_) {
      MCToast.error('The voice trial could not be started. Please try again.');
    } finally {
      state.triggeringId = null;
      render();
      scheduleRefresh();
    }
  }

  function renderTranscript(call) {
    const messages = transcriptMessages(call.transcript);
    if (!messages.length) return '<div class="mc-trials-muted">Transcript not available yet.</div>';
    return `<div class="mc-trials-transcript">${messages.map((message) => {
      const speaker = String(message?.speaker || message?.role || 'unknown').toLowerCase();
      const tone = speaker.includes('assistant') || speaker === 'ai' ? 'ai' : speaker.includes('customer') || speaker === 'user' ? 'customer' : 'unknown';
      const label = tone === 'ai' ? 'AI' : tone === 'customer' ? 'Customer' : 'Speaker';
      const text = typeof message === 'string' ? message : message?.text || message?.content;
      if (!text) return '';
      return `<div class="mc-trials-message ${tone}"><span class="mc-trials-message-label">${label}${message?.timestamp ? ` · ${escapeHtml(formatDate(message.timestamp))}` : ''}</span>${escapeHtml(text)}</div>`;
    }).join('')}</div>`;
  }

  function renderTimeline(call, recordingAvailable = false) {
    const events = [['Call created', call.createdAt], ['Call initiated', call.initiatedAt], ['Call started', call.startedAt], ['Call completed', call.completedAt]]
      .filter(([, timestamp]) => timestamp);
    if (call.recordingUrl || recordingAvailable) events.push(['Recording processed', null]);
    if (call.outcomeData || call.outcome) events.push(['Analysis processed', null]);
    return `<div class="mc-trials-timeline">${events.map(([label, timestamp]) => `<div class="mc-trials-timeline-item"><div class="mc-trials-timeline-mark"></div><div class="mc-trials-timeline-label">${label}${timestamp ? `<span class="mc-trials-timeline-time">${escapeHtml(formatDate(timestamp))}</span>` : ''}</div></div>`).join('')}</div>`;
  }

  async function openDetail(call) {
    let detail = call;
    let recordingAvailable = false;
    try {
      const response = await MCApi.getTrialCall(call.id);
      detail = response.data || call;
    } catch (_) {}
    try {
      const response = await MCApi.getTrialRecording(call.id);
      recordingAvailable = Boolean(response.data?.available);
    } catch (_) {}
    const analysis = analysisFields(detail);
    const recording = recordingAvailable
      ? '<div class="mc-trials-recording"><i data-lucide="audio-lines"></i><span>Recording available. Playback will be enabled when the protected media stream is available.</span></div>'
      : '<div class="mc-trials-muted">Recording not available yet.</div>';
    const overlay = document.createElement('div');
    overlay.id = 'mc-trials-detail-drawer';
    overlay.className = 'mc-trials-drawer';
    overlay.innerHTML = `<aside class="mc-trials-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="mc-trials-detail-title"><header class="mc-trials-drawer-header"><div><h2 id="mc-trials-detail-title">${escapeHtml(detail.customerName || 'Voice Trial')}</h2><p>${escapeHtml(maskPhone(detail.phoneNumber))} · ${statusBadge(detail.status)}</p></div><button class="mc-trials-close" data-close-detail aria-label="Close call details"><i data-lucide="x"></i></button></header><div class="mc-trials-drawer-body">
      <section class="mc-trials-detail-section"><h3><i data-lucide="phone"></i>Call details</h3><div class="mc-trials-detail-grid"><div class="mc-trials-detail-field"><label>Status</label><strong>${escapeHtml(STATUS_META[detail.status]?.label || detail.status || '—')}</strong></div><div class="mc-trials-detail-field"><label>Duration</label><strong>${escapeHtml(formatDuration(detail.durationSeconds))}</strong></div><div class="mc-trials-detail-field"><label>Started</label><strong>${escapeHtml(formatDate(detail.startedAt))}</strong></div><div class="mc-trials-detail-field"><label>Completed</label><strong>${escapeHtml(formatDate(detail.completedAt))}</strong></div><div class="mc-trials-detail-field"><label>Created</label><strong>${escapeHtml(formatDate(detail.createdAt))}</strong></div><div class="mc-trials-detail-field"><label>Customer link</label><strong>${detail.webinarRegistrationId ? 'Webinar registration' : 'Direct trial'}</strong></div></div></section>
      <section class="mc-trials-detail-section"><h3><i data-lucide="sparkles"></i>AI call summary</h3>${analysis.length ? `<div class="mc-trials-analysis">${analysis.map(([label, value]) => `<div class="mc-trials-analysis-item"><span>${label}</span><strong>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</strong></div>`).join('')}</div>` : '<div class="mc-trials-muted">Analysis not available yet.</div>'}</section>
      <section class="mc-trials-detail-section"><h3><i data-lucide="messages-square"></i>Conversation transcript</h3>${renderTranscript(detail)}</section>
      <section class="mc-trials-detail-section"><h3><i data-lucide="headphones"></i>Call recording</h3>${recording}</section>
      <section class="mc-trials-detail-section"><h3><i data-lucide="list-tree"></i>Call timeline</h3>${renderTimeline(detail, recordingAvailable)}</section>
    </div></aside>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-close-detail]')) overlay.remove(); });
    window.lucide?.createIcons?.();
  }

  function onClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const id = event.target.closest('[data-action]')?.dataset.id;
    if (action === 'create') create();
    if (action === 'refresh') load();
    if (action === 'trigger' && id) trigger(id);
    if (action === 'view' && id) {
      const call = state.calls.find((item) => item.id === id);
      if (call) openDetail(call);
    }
  }

  function renderModule() {
    render();
    load();
  }

  function destroy() {
    clearTimeout(state.refreshTimer);
    document.getElementById('mc-trials-detail-drawer')?.remove();
    if (state.root && state.handlers) state.root.removeEventListener('click', state.handlers.onClick);
    state.root = null;
    state.handlers = null;
  }

  function init() {
    destroy();
    ensureStyles();
    state.root = window.MCRouter?.getContentEl?.() || document.getElementById('mc-content');
    state.handlers = { onClick };
    state.root?.addEventListener('click', onClick);
    renderModule();
  }

  return { render: init, destroy };
})();
