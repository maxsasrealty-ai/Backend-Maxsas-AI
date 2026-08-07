window.MCSidebar = (function () {
  function render() {
    const el = document.getElementById('mc-sidebar');
    if (!el) return;
    const modules = MCAuth.getVisibleModules();
    const active = MCState.currentModule;
    el.innerHTML = `
      <div style="padding:0 12px;height:48px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--mc-border);flex-shrink:0;">
        <div>
          <div style="font-size:15px;font-weight:700;letter-spacing:0.3px;font-family:var(--mc-font-sans);">MAXSAS</div>
          <div style="font-size:10px;color:var(--mc-muted);letter-spacing:0.05em;text-transform:uppercase;margin-top:1px;">Master Control OS</div>
        </div>
        <button id="mc-sidebar-toggle" class="mc-btn-icon mc-btn-ghost" style="width:26px;height:26px;" title="Toggle sidebar">
          <i data-lucide="align-justify" style="width:14px;height:14px;"></i>
        </button>
      </div>
      <nav class="mc-sidebar-nav" style="flex:1;overflow-y:auto;padding:8px 8px;">
        ${modules.map(m => `
          <button class="mc-nav-item nav-item ${active === m.id ? 'active' : ''}" data-module="${m.id}"
            style="width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--mc-r-md);border:none;background:${active === m.id ? 'var(--mc-lime-dim)' : 'transparent'};color:${active === m.id ? 'var(--mc-lime)' : 'var(--mc-muted)'};cursor:pointer;font-size:13px;font-weight:${active === m.id ? '600' : '500'};font-family:var(--mc-font-sans);text-align:left;transition:background var(--mc-ease-fast),color var(--mc-ease-fast);margin-bottom:2px;">
            <i data-lucide="${m.icon}" style="width:15px;height:15px;flex-shrink:0;color:${active === m.id ? m.color : 'var(--mc-faint)'};"></i>
            <span class="mc-nav-label">${m.label}</span>
          </button>
        `).join('')}
      </nav>
      <div style="padding:10px 12px;border-top:1px solid var(--mc-border);flex-shrink:0;">
        <div class="mc-input-group" style="margin-bottom:8px;">
          <label class="mc-input-label" style="font-size:10px;">Admin Key</label>
          <input id="mc-key-input" type="password" class="mc-input" style="height:28px;font-size:11px;"
            placeholder="Enter admin key..." value="${MCState.adminKey}" />
        </div>
        <div style="font-size:11px;color:var(--mc-faint);font-family:var(--mc-font-mono);">Role: <span style="color:var(--mc-lime)">${MCState.role}</span></div>
      </div>
    `;
    // Nav click
    el.querySelectorAll('.mc-nav-item').forEach(btn => {
      btn.addEventListener('click', () => MCRouter.navigate(btn.dataset.module));
      btn.addEventListener('mouseenter', () => { if (!btn.classList.contains('active')) { btn.style.background = 'var(--mc-panel-hover)'; btn.style.color = 'var(--mc-text)'; } });
      btn.addEventListener('mouseleave', () => { if (!btn.classList.contains('active')) { btn.style.background = 'transparent'; btn.style.color = 'var(--mc-muted)'; } });
    });
    // Admin key input
    const keyInput = el.querySelector('#mc-key-input');
    if (keyInput) {
      keyInput.addEventListener('change', () => {
        MCState.setAdminKey(keyInput.value.trim());
        MCSSE.reconnect();
        MCToast && MCToast.info('Admin key updated');
      });
    }
    if (window.lucide) lucide.createIcons();
  }

  function init() {
    render();
    MCState.subscribe('currentModule', () => render());
    MCState.subscribe('role', () => render());
    MCState.subscribe('sseConnected', () => render());
    document.addEventListener('click', (e) => {
      if (e.target.closest('#mc-sidebar-toggle')) {
        const shell = document.getElementById('mc-shell');
        shell.classList.toggle('sidebar-collapsed');
        MCState.set('sidebarCollapsed', shell.classList.contains('sidebar-collapsed'));
      }
    });
  }

  return { init, render };
})();