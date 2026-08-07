window.MCModTenantControl = (function () {

  // ── Helpers ──────────────────────────────────────────────────
  function paise(v) {
    if (v == null || isNaN(Number(v))) return '–';
    return '₹' + (Number(v) / 100).toFixed(2);
  }

  function pct(a, b) {
    if (!b || b === 0) return '0%';
    return ((a / b) * 100).toFixed(1) + '%';
  }

  function timeAgo(ts) {
    if (!ts) return '–';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60)    return diff + 's ago';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAdminKey() {
    return window.MCAuth?.getAdminKey?.() || window.MCState?.adminKey || '';
  }

  function showAuthModal(message) {
    if (!window.MCModal?.showModal) return;
    window.MCModal.showModal({
      title: 'Tenant Control Access',
      body: `<div style="display:flex;flex-direction:column;gap:10px;"><div>${message}</div><div style="font-family:var(--mc-font-mono);font-size:11px;color:var(--mc-muted);">Set the admin key in MCAuth / MCState, then refresh the module.</div></div>`,
      buttons: [{ label: 'Close', type: 'secondary' }],
    });
  }

  function badge(label, colorVar, bgVar) {
    return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;font-family:var(--mc-font-mono);letter-spacing:0.05em;background:var(${bgVar});color:var(${colorVar});">${label}</span>`;
  }

  function planBadge(plan) {
    const map = {
      enterprise: ['--mc-violet',  '--mc-violet-dim'],
      pro:        ['--mc-lime',    '--mc-lime-dim'],
      starter:    ['--mc-cyan',    '--mc-cyan-dim'],
      free:       ['--mc-muted',   'rgba(148,163,184,0.1)'],
    };
    const key = String(plan || 'free').toLowerCase();
    const [c, bg] = map[key] || map.free;
    return badge(String(plan || 'FREE').toUpperCase(), c, bg);
  }

  function statusDot(active) {
    const color = active ? 'var(--mc-green)' : 'var(--mc-faint)';
    return `<span class="mc-pulse-dot ${active ? 'on' : 'off'}" style="background:${color};"></span>`;
  }

  // ── Stat box ─────────────────────────────────────────────────
  function statBox(label, value, icon, colorVar) {
    return `
      <div style="background:var(--mc-panel-2);border:1px solid var(--mc-border);border-radius:var(--mc-r-md);padding:12px 14px;display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <i data-lucide="${icon}" style="width:12px;height:12px;color:var(${colorVar});"></i>
          <span style="font-size:10px;color:var(--mc-muted);text-transform:uppercase;letter-spacing:0.07em;">${label}</span>
        </div>
        <div style="font-size:20px;font-weight:700;font-family:var(--mc-font-mono);color:var(--mc-text);">${value}</div>
      </div>
    `;
  }

  // ── Progress bar ─────────────────────────────────────────────
  function progressBar(value, total, colorVar) {
    const pctNum = total > 0 ? Math.min(100, (value / total) * 100) : 0;
    return `
      <div style="width:100%;height:5px;background:var(--mc-panel-2);border-radius:999px;overflow:hidden;">
        <div style="width:${pctNum}%;height:100%;background:var(${colorVar});border-radius:999px;transition:width 600ms ease;"></div>
      </div>
    `;
  }

  // ── Tenant list card ─────────────────────────────────────────
  function tenantCard(t) {
    const isActive = t.isActive !== false;
    const calls = t.totalCalls || t.callCount || 0;
    const success = t.successfulCalls || t.successCalls || 0;
    const balance = t.walletBalancePaise || t.currentBalanceMinor || t.balance || 0;

    return `
      <div class="mc-tenant-card" data-id="${t.id}"
        style="background:var(--mc-panel);border:1px solid var(--mc-border);border-radius:var(--mc-r-lg);padding:16px 18px;cursor:pointer;transition:border-color var(--mc-ease-fast),transform var(--mc-ease-fast),box-shadow var(--mc-ease-fast);"
        onmouseenter="this.style.borderColor='rgba(184,255,90,0.3)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'"
        onmouseleave="this.style.borderColor='var(--mc-border)';this.style.transform='translateY(0)';this.style.boxShadow='none'">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:8px;">
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${statusDot(isActive)}
              <span style="font-size:13px;font-weight:600;color:var(--mc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${t.name || t.companyName || t.id}</span>
              ${planBadge(t.plan || t.planType)}
            </div>
            <div style="font-size:11px;color:var(--mc-faint);font-family:var(--mc-font-mono);margin-top:3px;">${t.id}</div>
            ${t.email ? `<div style="font-size:11px;color:var(--mc-muted);margin-top:2px;">${t.email}</div>` : ''}
          </div>
          <button class="mc-btn mc-btn-ghost mc-btn-sm mc-open-tenant" data-id="${t.id}" style="flex-shrink:0;">
            <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:var(--mc-font-mono);color:var(--mc-text);">${calls}</div>
            <div style="font-size:9px;color:var(--mc-faint);text-transform:uppercase;letter-spacing:0.06em;">Calls</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:var(--mc-font-mono);color:var(--mc-green);">${pct(success, calls)}</div>
            <div style="font-size:9px;color:var(--mc-faint);text-transform:uppercase;letter-spacing:0.06em;">Success</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:18px;font-weight:700;font-family:var(--mc-font-mono);color:var(--mc-lime);">${paise(balance)}</div>
            <div style="font-size:9px;color:var(--mc-faint);text-transform:uppercase;letter-spacing:0.06em;">Balance</div>
          </div>
        </div>

        ${progressBar(success, calls, '--mc-green')}
        <div style="font-size:10px;color:var(--mc-faint);font-family:var(--mc-font-mono);margin-top:4px;">
          ${success}/${calls} calls successful · Created ${timeAgo(t.createdAt)}
        </div>
      </div>
    `;
  }

  // ── Tenant detail panel (right drawer) ───────────────────────
  async function openTenantPanel(tenantId) {
    const adminKey = getAdminKey();
    if (adminKey && MCState?.set) MCState.set('adminKey', adminKey);

    // Remove existing
    document.getElementById('mc-tenant-drawer')?.remove();

    const drawer = document.createElement('div');
    drawer.id = 'mc-tenant-drawer';
    drawer.style.cssText = `
      position:fixed;top:var(--mc-topbar-h);right:0;bottom:0;width:560px;max-width:96vw;
      background:var(--mc-panel-2);border-left:1px solid var(--mc-border);
      z-index:var(--mc-z-modal);overflow-y:auto;
      animation:mc-slidein 220ms cubic-bezier(0.16,1,0.3,1) forwards;
      box-shadow:-12px 0 40px rgba(0,0,0,0.6);
    `;
    drawer.innerHTML = `
      <div style="position:sticky;top:0;z-index:2;background:var(--mc-panel-2);border-bottom:1px solid var(--mc-border);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;">
          <i data-lucide="building-2" style="width:15px;height:15px;color:var(--mc-mod-tenant);"></i>
          Tenant Intelligence
        </div>
        <button id="mc-tenant-drawer-close" class="mc-btn mc-btn-ghost mc-btn-sm">
          <i data-lucide="x" style="width:13px;height:13px;"></i> Close
        </button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--mc-border);background:var(--mc-panel-2);">
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-edit-name">
          <i data-lucide="pencil" style="width:11px;height:11px;"></i> Edit Name
        </button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-toggle-status">
          <i data-lucide="power" style="width:11px;height:11px;"></i> Toggle Active
        </button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-add-balance">
          <i data-lucide="plus-circle" style="width:11px;height:11px;color:var(--mc-lime);"></i> Add Balance
        </button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-change-plan">
          <i data-lucide="layers" style="width:11px;height:11px;color:var(--mc-violet);"></i> Change Plan
        </button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-set-limits">
          <i data-lucide="sliders" style="width:11px;height:11px;color:var(--mc-cyan);"></i> Set Limits
        </button>
        <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-ta-view-raw">
          <i data-lucide="code" style="width:11px;height:11px;"></i> Raw JSON
        </button>
        <button class="mc-btn mc-btn-danger mc-btn-sm" id="mc-ta-delete" style="margin-left:auto;">
          <i data-lucide="trash-2" style="width:11px;height:11px;"></i> Delete Tenant
        </button>
      </div>
      <div id="mc-tenant-drawer-body" style="padding:18px;display:flex;flex-direction:column;gap:16px;">
        <div style="color:var(--mc-faint);font-size:12px;font-family:var(--mc-font-mono);text-align:center;padding:40px 0;">
          Loading tenant data…
          <div class="mc-skeleton" style="height:14px;width:60%;margin:12px auto 6px;border-radius:4px;"></div>
          <div class="mc-skeleton" style="height:14px;width:40%;margin:0 auto;border-radius:4px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);

    if (!document.getElementById('mc-slidein-style')) {
      const s = document.createElement('style');
      s.id = 'mc-slidein-style';
      s.textContent = `
        @keyframes mc-slidein{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        .mc-tenant-sub-tab{padding:6px 12px;font-size:12px;color:var(--mc-muted);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;font-weight:500;transition:color 150ms,border-color 150ms;}
        .mc-tenant-sub-tab:hover{color:var(--mc-text);}
        .mc-tenant-sub-tab.active{color:var(--mc-accent);border-bottom-color:var(--mc-accent);}
      `;
      document.head.appendChild(s);
    }

    if (window.lucide) lucide.createIcons();
    drawer.querySelector('#mc-tenant-drawer-close').addEventListener('click', () => drawer.remove());

    try {
      // Fetch all data in parallel
      const [tenantRes, usageRes, walletRes, callsRes] = await Promise.allSettled([
        MCApi.getTenantControlCenter(tenantId),
        MCApi.getTenantUsage(tenantId),
        MCApi.getTenantWallet(tenantId),
        MCApi.getCalls(200),
      ]);

      const tenant = tenantRes.value?.data || tenantRes.value || {};
      const usage  = usageRes.value?.data  || usageRes.value  || {};
      const wallet = walletRes.value?.data  || walletRes.value  || {};
      const allCalls = callsRes.value?.data || callsRes.value || [];

      // Filter calls for this tenant
      const tCalls = Array.isArray(allCalls)
        ? allCalls.filter(c => c.tenantId === tenantId || c.tenant_id === tenantId)
        : [];

      renderTenantDrawerContent(drawer, tenant, usage, wallet, tCalls, tenantId);
      attachTenantActions(drawer, tenant, tenantId);

    } catch (err) {
      if (/unauthor/i.test(String(err?.message || '')) || err?.status === 401) {
        showAuthModal('This endpoint rejected the request because the admin key is missing or invalid.');
      }
      document.getElementById('mc-tenant-drawer-body').innerHTML =
        `<div style="color:var(--mc-red);font-size:12px;padding:24px;font-family:var(--mc-font-mono);">Failed: ${err.message}</div>`;
    }
  }

  function renderTenantDrawerContent(drawer, tenant, usage, wallet, calls, tenantId) {
    const body = document.getElementById('mc-tenant-drawer-body');
    if (!body) return;

    // ── Compute analytics ──────────────────────────────────────
    const totalCalls    = calls.length;
    const successCalls  = calls.filter(c => ['completed','success','answered'].includes(String(c.status||'').toLowerCase())).length;
    const failedCalls   = calls.filter(c => ['failed','error','no-answer','busy'].includes(String(c.status||'').toLowerCase())).length;
    const pendingCalls  = calls.filter(c => ['initiated','ringing','active','live'].includes(String(c.status||'').toLowerCase())).length;
    const successRatio  = pct(successCalls, totalCalls);

    // Duration analytics
    const durCalls = calls.filter(c => c.durationSeconds || c.duration);
    const avgDur   = durCalls.length
      ? Math.round(durCalls.reduce((s,c) => s + (c.durationSeconds || c.duration || 0), 0) / durCalls.length)
      : 0;

    // Today's calls
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const callsToday = calls.filter(c => new Date(c.createdAt || c.initiatedAt || 0) >= todayStart).length;

    // Balance info
    const balance = wallet.currentBalancePaise || wallet.balancePaise || wallet.currentBalanceMinor || tenant.walletBalancePaise || 0;
    const totalTopups = wallet.totalTopupPaise || wallet.totalCredited || 0;
    const totalSpent  = wallet.totalSpentPaise  || wallet.totalDebited  || 0;

    // Users
    const users = usage.users || tenant.users || [];

    body.innerHTML = `
      <!-- Identity card -->
      <div class="mc-card" style="background:linear-gradient(135deg,rgba(59,130,246,0.08),rgba(167,139,250,0.06)),var(--mc-panel);border-color:rgba(167,139,250,0.25);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--mc-text);">${tenant.name || tenant.companyName || tenantId}</div>
            <div style="font-size:11px;color:var(--mc-faint);font-family:var(--mc-font-mono);margin-top:2px;">${tenantId}</div>
            ${tenant.email ? `<div style="font-size:12px;color:var(--mc-muted);margin-top:4px;">${tenant.email}</div>` : ''}
            ${tenant.phone ? `<div style="font-size:12px;color:var(--mc-muted);">${tenant.phone}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            ${planBadge(tenant.plan || tenant.planType)}
            <span style="font-size:10px;color:var(--mc-faint);">Since ${timeAgo(tenant.createdAt)}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:11px;font-family:var(--mc-font-mono);">
          ${[
            ['Timezone', tenant.timezone || '–'],
            ['Country',  tenant.country  || '–'],
            ['Language', tenant.language || tenant.preferredLanguage || '–'],
            ['Status',   tenant.isActive !== false ? '🟢 Active' : '🔴 Inactive'],
            ['Max Concurrent', tenant.maxConcurrentCalls || usage.maxConcurrentCalls || '–'],
            ['Features', (tenant.features || []).join(', ') || '–'],
          ].map(([k,v]) => `
            <div style="background:var(--mc-panel-2);border-radius:var(--mc-r-sm);padding:6px 10px;">
              <div style="color:var(--mc-faint);font-size:9px;text-transform:uppercase;letter-spacing:0.07em;">${k}</div>
              <div style="color:var(--mc-text);font-size:11px;margin-top:2px;word-break:break-all;">${v}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Call analytics KPIs -->
      <div>
        <div style="font-size:11px;color:var(--mc-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <i data-lucide="phone-call" style="width:12px;height:12px;color:var(--mc-mod-voice);"></i>
          Call Analytics
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          ${statBox('Total Calls',   totalCalls,   'phone',        '--mc-mod-voice')}
          ${statBox('Today',         callsToday,   'calendar',     '--mc-cyan')}
          ${statBox('Successful',    successCalls, 'check-circle', '--mc-green')}
          ${statBox('Failed',        failedCalls,  'x-circle',     '--mc-error')}
          ${statBox('Live / Active', pendingCalls, 'activity',     '--mc-cyan')}
          ${statBox('Avg Duration',  avgDur ? avgDur+'s' : '–', 'clock', '--mc-muted')}
        </div>
      </div>

      <!-- Success ratio -->
      <div class="mc-card" style="background:var(--mc-panel);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
            <i data-lucide="target" style="width:13px;height:13px;color:var(--mc-green);"></i>
            Call Success Ratio
          </div>
          <div style="font-size:22px;font-weight:700;font-family:var(--mc-font-mono);color:var(--mc-green);">${successRatio}</div>
        </div>
        ${progressBar(successCalls, totalCalls, '--mc-green')}
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;font-family:var(--mc-font-mono);color:var(--mc-faint);">
          <span>${successCalls} success</span>
          <span>${failedCalls} failed</span>
          <span>${pendingCalls} active</span>
        </div>
      </div>

      <!-- Wallet / Finance -->
      <div>
        <div style="font-size:11px;color:var(--mc-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <i data-lucide="wallet" style="width:12px;height:12px;color:var(--mc-mod-finance);"></i>
          Wallet & Finance
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${statBox('Balance',      paise(balance),     'indian-rupee',   '--mc-lime')}
          ${statBox('Total Topup',  paise(totalTopups), 'arrow-down-circle','--mc-green')}
          ${statBox('Total Spent',  paise(totalSpent),  'arrow-up-circle',  '--mc-amber')}
        </div>
      </div>

      <!-- Recent calls table -->
      <div class="mc-card" style="padding:0;overflow:hidden;">
        <div style="padding:12px 14px;border-bottom:1px solid var(--mc-border);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
            <i data-lucide="list" style="width:13px;height:13px;color:var(--mc-mod-voice);"></i>
            Recent Calls
          </div>
          <span style="font-size:11px;color:var(--mc-faint);font-family:var(--mc-font-mono);">${totalCalls} total</span>
        </div>
        ${calls.length === 0
          ? `<div class="mc-empty" style="padding:32px;"><div class="mc-empty-title">No calls found for this tenant</div></div>`
          : `<div style="overflow-x:auto;">
              <table class="mc-table">
                <thead>
                  <tr>
                    <th>Call ID</th>
                    <th>Status</th>
                    <th>Duration</th>
                    <th>Agent</th>
                    <th>User / Phone</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${calls.slice(0, 40).map(c => {
                    const st = String(c.status || '').toLowerCase();
                    const stMap = {
                      completed:  ['--mc-green', '--mc-green-dim'],
                      success:    ['--mc-green', '--mc-green-dim'],
                      failed:     ['--mc-error',  '--mc-red-dim'],
                      active:     ['--mc-cyan',   '--mc-cyan-dim'],
                      live:       ['--mc-cyan',   '--mc-cyan-dim'],
                      initiated:  ['--mc-amber',  '--mc-amber-dim'],
                      ringing:    ['--mc-amber',  '--mc-amber-dim'],
                    };
                    const [sc, sbg] = stMap[st] || ['--mc-muted', 'rgba(148,163,184,0.1)'];
                    const dur = c.durationSeconds || c.duration;
                    return `
                      <tr>
                        <td style="font-size:10px;">${(c.id||'').slice(0,14)}…</td>
                        <td><span style="font-size:10px;font-weight:600;font-family:var(--mc-font-mono);color:var(${sc});background:var(${sbg});padding:2px 7px;border-radius:999px;">${String(c.status||'–').toUpperCase()}</span></td>
                        <td>${dur ? dur + 's' : '–'}</td>
                        <td style="font-size:10px;color:var(--mc-muted);">${c.agentId || c.assistantId || '–'}</td>
                        <td style="font-size:10px;color:var(--mc-muted);">${c.phoneNumber || c.toNumber || c.userId || '–'}</td>
                        <td style="font-size:10px;color:var(--mc-faint);">${timeAgo(c.createdAt || c.initiatedAt)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>

      <!-- User accounts under this tenant -->
      ${users.length > 0 ? `
        <div class="mc-card" style="padding:0;overflow:hidden;">
          <div style="padding:12px 14px;border-bottom:1px solid var(--mc-border);display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
              <i data-lucide="users" style="width:13px;height:13px;color:var(--mc-mod-tenant);"></i>
              User Accounts
            </div>
            <span style="font-size:11px;color:var(--mc-faint);font-family:var(--mc-font-mono);">${users.length} users</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="mc-table">
              <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Calls</th><th>Last Seen</th></tr></thead>
              <tbody>
                ${users.slice(0,20).map(u => `
                  <tr>
                    <td style="font-size:11px;">${u.name || u.fullName || u.id || '–'}</td>
                    <td style="font-size:10px;color:var(--mc-muted);">${u.email || '–'}</td>
                    <td>${badge(String(u.role||'user').toUpperCase(), '--mc-cyan', '--mc-cyan-dim')}</td>
                    <td style="font-family:var(--mc-font-mono);font-size:11px;">${u.callCount || u.totalCalls || 0}</td>
                    <td style="font-size:10px;color:var(--mc-faint);">${timeAgo(u.lastSeenAt || u.updatedAt)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Config / Settings snapshot -->
      ${(tenant.config || tenant.settings) ? `
        <div class="mc-card" style="background:var(--mc-panel);">
          <div class="mc-card-header">
            <div class="mc-card-title"><i data-lucide="settings" style="width:13px;height:13px;color:var(--mc-muted);"></i> Config Snapshot</div>
          </div>
          <pre style="font-family:var(--mc-font-mono);font-size:10px;color:var(--mc-muted);overflow-x:auto;white-space:pre-wrap;word-break:break-all;background:var(--mc-panel-2);padding:10px;border-radius:var(--mc-r-sm);">${JSON.stringify(tenant.config || tenant.settings, null, 2)}</pre>
        </div>
      ` : ''}
    `;

    if (window.lucide) lucide.createIcons();
  }

  function attachTenantActions(drawer, tenant, tenantId) {
    drawer.querySelector('#mc-ta-edit-name')?.addEventListener('click', () => {
      const current = tenant.name || tenant.companyName || '';
      MCModal.open({
        title: 'Edit Tenant Name',
        content: `
          <div class="mc-input-group">
            <label class="mc-input-label">Display Name</label>
            <input id="mc-edit-name-input" class="mc-input" value="${escapeHtml(current)}" placeholder="Company or workspace name" style="height:34px;" />
          </div>
          <div style="margin-top:10px;">
            <div class="mc-input-group">
              <label class="mc-input-label">Company Name (optional)</label>
              <input id="mc-edit-company-input" class="mc-input" value="${escapeHtml(tenant.companyName || '')}" placeholder="Legal company name" style="height:34px;" />
            </div>
          </div>
        `,
        confirmLabel: 'Save Changes',
        confirmClass: 'mc-btn-primary',
        onConfirm: async () => {
          const newName = document.getElementById('mc-edit-name-input')?.value?.trim();
          const newCompany = document.getElementById('mc-edit-company-input')?.value?.trim();
          if (!newName) { MCToast?.error('Name cannot be empty'); return; }
          try {
            await MCApi.updateTenant(tenantId, {
              name: newName,
              ...(newCompany ? { companyName: newCompany } : {}),
            });
            MCToast?.success('Tenant name updated');
            openTenantPanel(tenantId);
            loadTenants();
          } catch (e) {
            MCToast?.error('Update failed: ' + e.message);
          }
        },
      });
    });

    drawer.querySelector('#mc-ta-toggle-status')?.addEventListener('click', () => {
      const isActive = tenant.isActive !== false;
      MCModal.open({
        title: isActive ? '⚠️ Suspend Tenant' : '✅ Activate Tenant',
        content: `
          <p style="color:var(--mc-text);font-size:13px;line-height:1.6;">
            ${isActive
              ? `<strong>${escapeHtml(tenant.name || tenantId)}</strong> ko suspend karne se unke sab API calls block ho jayenge aur voice agent kaam karna band kar dega.`
              : `<strong>${escapeHtml(tenant.name || tenantId)}</strong> ko activate karne se unka access restore ho jayega.`
            }
          </p>
          ${isActive ? `<div style="margin-top:12px;padding:10px 12px;background:var(--mc-red-dim);border:1px solid rgba(244,63,94,0.3);border-radius:var(--mc-r-md);font-size:12px;color:var(--mc-red);">
            ⚠️ Active calls immediately terminate ho sakti hain.
          </div>` : ''}
        `,
        confirmLabel: isActive ? 'Yes, Suspend' : 'Yes, Activate',
        confirmClass: isActive ? 'mc-btn-danger' : 'mc-btn-primary',
        onConfirm: async () => {
          try {
            await MCApi.updateTenant(tenantId, { isActive: !isActive });
            MCToast?.[isActive ? 'warn' : 'success'](`Tenant ${isActive ? 'suspended' : 'activated'}`);
            openTenantPanel(tenantId);
            loadTenants();
          } catch (e) {
            MCToast?.error('Failed: ' + e.message);
          }
        },
      });
    });

    drawer.querySelector('#mc-ta-add-balance')?.addEventListener('click', () => {
      MCModal.open({
        title: '💳 Add Wallet Balance',
        content: `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div class="mc-input-group">
              <label class="mc-input-label">Amount (₹ Rupees)</label>
              <input id="mc-bal-amount" class="mc-input" type="number" min="1" placeholder="e.g. 500" style="height:34px;" />
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Reason / Note</label>
              <input id="mc-bal-note" class="mc-input" placeholder="e.g. Manual credit, refund, promo" style="height:34px;" />
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${[100,250,500,1000].map(v =>
                `<button type="button" class="mc-btn mc-btn-ghost mc-btn-sm mc-quick-amt" data-val="${v}">+₹${v}</button>`
              ).join('')}
            </div>
          </div>
        `,
        confirmLabel: 'Credit Balance',
        confirmClass: 'mc-btn-primary',
        onConfirm: async () => {
          const rupees = parseFloat(document.getElementById('mc-bal-amount')?.value);
          const note = document.getElementById('mc-bal-note')?.value?.trim();
          if (!rupees || rupees <= 0) { MCToast?.error('Valid amount enter karo'); return; }
          const paise = Math.round(rupees * 100);
          try {
            await MCApi.updateTenant(tenantId, {
              _action: 'credit_wallet',
              amountPaise: paise,
              note: note || 'Manual credit from Master Control',
            });
            MCToast?.success(`₹${rupees} credited to ${tenant.name || tenantId}`);
            openTenantPanel(tenantId);
            loadTenants();
          } catch (e) {
            MCToast?.error('Credit failed: ' + e.message);
          }
        },
      });

      setTimeout(() => {
        document.querySelectorAll('.mc-quick-amt').forEach(btn => {
          btn.addEventListener('click', () => {
            const input = document.getElementById('mc-bal-amount');
            if (input) input.value = btn.dataset.val;
          });
        });
      }, 100);
    });

    drawer.querySelector('#mc-ta-change-plan')?.addEventListener('click', () => {
      const current = tenant.plan || tenant.planType || 'free';
      const plans = ['free', 'starter', 'pro', 'enterprise'];
      MCModal.open({
        title: '🔼 Change Tenant Plan',
        content: `
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:12px;color:var(--mc-muted);">Current plan: <strong style="color:var(--mc-violet);">${String(current).toUpperCase()}</strong></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              ${plans.map(p => `
                <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--mc-r-md);border:1px solid ${p===current ? 'var(--mc-lime)' : 'var(--mc-border)'};background:${p===current ? 'var(--mc-lime-dim)' : 'var(--mc-panel-2)'};cursor:pointer;">
                  <input type="radio" name="mc-plan-select" value="${p}" ${p===current ? 'checked' : ''} style="accent-color:var(--mc-lime);" />
                  <span style="font-size:12px;font-weight:600;font-family:var(--mc-font-mono);color:var(--mc-text);">${p.toUpperCase()}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `,
        confirmLabel: 'Update Plan',
        confirmClass: 'mc-btn-primary',
        onConfirm: async () => {
          const selected = document.querySelector('input[name="mc-plan-select"]:checked')?.value;
          if (!selected) return;
          try {
            await MCApi.updateTenant(tenantId, { plan: selected, planType: selected });
            MCToast?.success(`Plan changed to ${selected.toUpperCase()}`);
            openTenantPanel(tenantId);
            loadTenants();
          } catch (e) {
            MCToast?.error('Plan change failed: ' + e.message);
          }
        },
      });
    });

    drawer.querySelector('#mc-ta-set-limits')?.addEventListener('click', () => {
      MCModal.open({
        title: '⚙️ Set Usage Limits',
        content: `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div class="mc-input-group">
              <label class="mc-input-label">Max Concurrent Calls</label>
              <input id="mc-lim-concurrent" class="mc-input" type="number" min="1" max="500"
                value="${escapeHtml(tenant.maxConcurrentCalls || '')}" placeholder="e.g. 10" style="height:34px;" />
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Monthly Call Limit</label>
              <input id="mc-lim-monthly" class="mc-input" type="number" min="0"
                value="${escapeHtml(tenant.monthlyCallLimit || '')}" placeholder="0 = unlimited" style="height:34px;" />
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Daily Call Limit</label>
              <input id="mc-lim-daily" class="mc-input" type="number" min="0"
                value="${escapeHtml(tenant.dailyCallLimit || '')}" placeholder="0 = unlimited" style="height:34px;" />
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Min Wallet Balance (₹) to allow calls</label>
              <input id="mc-lim-minbal" class="mc-input" type="number" min="0"
                value="${escapeHtml(tenant.minBalanceRupees || (tenant.minBalancePaise ? tenant.minBalancePaise / 100 : ''))}"
                placeholder="e.g. 10" style="height:34px;" />
            </div>
          </div>
        `,
        confirmLabel: 'Save Limits',
        confirmClass: 'mc-btn-primary',
        onConfirm: async () => {
          const concurrent = parseInt(document.getElementById('mc-lim-concurrent')?.value);
          const monthly = parseInt(document.getElementById('mc-lim-monthly')?.value);
          const daily = parseInt(document.getElementById('mc-lim-daily')?.value);
          const minBal = parseFloat(document.getElementById('mc-lim-minbal')?.value);
          const payload = {};
          if (!isNaN(concurrent) && concurrent > 0) payload.maxConcurrentCalls = concurrent;
          if (!isNaN(monthly)) payload.monthlyCallLimit = monthly;
          if (!isNaN(daily)) payload.dailyCallLimit = daily;
          if (!isNaN(minBal)) payload.minBalancePaise = Math.round(minBal * 100);
          try {
            await MCApi.updateTenant(tenantId, payload);
            MCToast?.success('Limits updated');
            openTenantPanel(tenantId);
          } catch (e) {
            MCToast?.error('Failed: ' + e.message);
          }
        },
      });
    });

    drawer.querySelector('#mc-ta-view-raw')?.addEventListener('click', () => {
      MCModal.open({
        title: '{ } Raw Tenant JSON',
        content: `
          <pre style="font-family:var(--mc-font-mono);font-size:10px;color:var(--mc-muted);
            overflow:auto;max-height:400px;white-space:pre-wrap;word-break:break-all;
            background:var(--mc-panel-2);padding:12px;border-radius:var(--mc-r-md);
            border:1px solid var(--mc-border);">${escapeHtml(JSON.stringify(tenant, null, 2))}</pre>
        `,
      });
    });

    drawer.querySelector('#mc-ta-delete')?.addEventListener('click', () => {
      const name = tenant.name || tenant.companyName || tenantId;
      MCModal.open({
        title: '🚨 Delete Tenant — Irreversible',
        content: `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="padding:12px;background:var(--mc-red-dim);border:1px solid rgba(244,63,94,0.4);border-radius:var(--mc-r-md);">
              <div style="font-size:13px;font-weight:600;color:var(--mc-red);margin-bottom:4px;">⚠️ Permanent Deletion</div>
              <div style="font-size:12px;color:var(--mc-text);line-height:1.6;">
                <strong>${escapeHtml(name)}</strong> aur unke saare data — calls, wallet, users, campaigns — permanently delete ho jayenge.
                Ye action undo nahi ho sakta.
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-input-label">Confirm karne ke liye tenant name type karo:</label>
              <input id="mc-delete-confirm-input" class="mc-input" placeholder="${escapeHtml(name)}" style="height:34px;" />
            </div>
          </div>
        `,
        confirmLabel: 'Permanently Delete',
        confirmClass: 'mc-btn-danger',
        onConfirm: async () => {
          const typed = document.getElementById('mc-delete-confirm-input')?.value?.trim();
          if (typed !== name) {
            MCToast?.error('Name match nahi kiya — deletion cancelled');
            return;
          }
          try {
            await MCApi.request('DELETE', '/tenants/' + tenantId);
            MCToast?.warn(`Tenant "${name}" deleted`);
            drawer.remove();
            loadTenants();
          } catch (e) {
            MCToast?.error('Delete failed: ' + e.message);
          }
        },
      });
    });
  }

  // ── Main render ───────────────────────────────────────────────
  async function render() {
    const el = MCRouter.getContentEl();
    if (!el) return;

    const adminKey = getAdminKey();
    if (adminKey && MCState?.set) MCState.set('adminKey', adminKey);

    el.innerHTML = `
      <div style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:20px;">
        <div class="mc-section-header">
          <div>
            <div class="mc-section-title" style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="building-2" style="width:18px;height:18px;color:var(--mc-mod-tenant);"></i>
              Tenant Control
            </div>
            <div class="mc-section-meta" style="margin-top:4px;">Click any tenant to view full intelligence — calls, users, wallet, analytics</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <input id="mc-tc-search" class="mc-input" style="width:200px;" placeholder="Search tenants…" />
            <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-tc-refresh">
              <i data-lucide="refresh-cw" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </div>

        <div id="mc-tc-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;"></div>

        <div id="mc-tc-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
          ${[1,2,3,4,5,6].map(() => `
            <div class="mc-card">
              <div class="mc-skeleton" style="height:16px;width:60%;margin-bottom:8px;border-radius:4px;"></div>
              <div class="mc-skeleton" style="height:12px;width:40%;margin-bottom:16px;border-radius:4px;"></div>
              <div class="mc-skeleton" style="height:40px;border-radius:6px;"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Search
    document.getElementById('mc-tc-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.mc-tenant-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.closest('div[style*="grid"]') || card;
        card.style.display = text.includes(q) ? '' : 'none';
      });
    });

    // Refresh
    document.getElementById('mc-tc-refresh')?.addEventListener('click', () => {
      MCToast?.info('Refreshing tenants…');
      loadTenants();
    });

    loadTenants();
  }

  async function loadTenants() {
    try {
      const adminKey = getAdminKey();
      if (adminKey && MCState?.set) MCState.set('adminKey', adminKey);

      const res = await MCApi.getTenants();
      const tenants = res?.data || res || [];

      MCState.set('tenants', tenants);

      // KPIs
      const active   = tenants.filter(t => t.isActive !== false).length;
      const enterprise = tenants.filter(t => String(t.plan||'').toLowerCase() === 'enterprise').length;
      const pro      = tenants.filter(t => String(t.plan||'').toLowerCase() === 'pro').length;
      const totalBal = tenants.reduce((s,t) => s + (t.walletBalancePaise || t.currentBalanceMinor || 0), 0);

      document.getElementById('mc-tc-kpis').innerHTML = [
        `<div class="mc-kpi" style="--mc-kpi-accent:var(--mc-mod-tenant);">${`<div class="mc-kpi-label">Total Tenants</div><div class="mc-kpi-value">${tenants.length}</div>`}</div>`,
        `<div class="mc-kpi" style="--mc-kpi-accent:var(--mc-green);">${`<div class="mc-kpi-label">Active</div><div class="mc-kpi-value">${active}</div>`}</div>`,
        `<div class="mc-kpi" style="--mc-kpi-accent:var(--mc-violet);">${`<div class="mc-kpi-label">Enterprise</div><div class="mc-kpi-value">${enterprise}</div><div class="mc-kpi-sub">${pro} Pro</div>`}</div>`,
        `<div class="mc-kpi" style="--mc-kpi-accent:var(--mc-lime);">${`<div class="mc-kpi-label">Total Wallet</div><div class="mc-kpi-value">${paise(totalBal)}</div>`}</div>`,
      ].join('');

      // Tenant grid
      const grid = document.getElementById('mc-tc-grid');
      if (grid) {
        grid.innerHTML = tenants.length
          ? tenants.map(tenantCard).join('')
          : `<div class="mc-empty" style="grid-column:1/-1;">
              <div class="mc-empty-icon"><i data-lucide="building-2" style="width:32px;height:32px;"></i></div>
              <div class="mc-empty-title">No tenants found</div>
              <div class="mc-empty-desc">Tenants will appear here once provisioned.</div>
            </div>`;
      }

      if (window.lucide) lucide.createIcons();

      // Click handlers
      document.querySelectorAll('.mc-tenant-card, .mc-open-tenant').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.id;
          if (id) openTenantPanel(id);
        });
      });

    } catch (err) {
      if (/unauthor/i.test(String(err?.message || '')) || err?.status === 401) {
        showAuthModal('The tenant list could not load because the admin key is missing or invalid.');
      }
      const grid = document.getElementById('mc-tc-grid');
      if (grid) grid.innerHTML = `
        <div class="mc-empty" style="grid-column:1/-1;">
          <div class="mc-empty-icon"><i data-lucide="alert-triangle" style="width:28px;height:28px;color:var(--mc-red);"></i></div>
          <div class="mc-empty-title" style="color:var(--mc-red);">Failed to load tenants</div>
          <div class="mc-empty-desc">${err.message}<br>Check: admin key set hai? /api/admin/tenants respond kar raha hai?</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
    }
  }

  return { render };
})();