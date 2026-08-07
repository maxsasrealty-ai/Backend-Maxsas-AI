window.MCTopbar = (function () {
  function getSseStatusHtml(status) {
    const map = {
      'connected':    { color: 'var(--mc-cyan)',   dot: 'on',   label: 'SSE Live' },
      'reconnecting': { color: 'var(--mc-amber)',  dot: 'warn', label: 'Reconnecting...' },
      'no-key':       { color: 'var(--mc-faint)',  dot: 'off',  label: 'No Key' },
      'failed':       { color: 'var(--mc-red)',    dot: 'off',  label: 'SSE Failed' },
      'disconnected': { color: 'var(--mc-faint)',  dot: 'off',  label: 'Disconnected' },
    };
    const s = map[status] || map['disconnected'];
    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:var(--mc-r-full);background:var(--mc-panel);border:1px solid var(--mc-border);">
      <span class="mc-pulse-dot ${s.dot}"></span>
      <span style="font-size:11px;font-family:var(--mc-font-mono);color:${s.color};">${s.label}</span>
    </div>`;
  }

  function getModuleLabel() {
    const mods = MCAuth.getAllModules();
    const mod = mods.find(m => m.id === MCState.currentModule);
    return mod ? `<span style="color:${mod.color};font-weight:600;">${mod.label}</span>` : 'Master Control';
  }

  function render() {
    const el = document.getElementById('mc-topbar');
    if (!el) return;
    const sseStatus = MCState.systemHealth.sse || 'disconnected';
    const role = MCState.role;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:12px;color:var(--mc-faint);">&#47;</span>
        <span style="font-size:13px;font-family:var(--mc-font-sans);">${getModuleLabel()}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${getSseStatusHtml(sseStatus)}
        <div style="display:flex;gap:4px;padding:3px;background:var(--mc-panel);border:1px solid var(--mc-border);border-radius:var(--mc-r-md);">
          ${['developer','ops','admin'].map(r => `
            <button class="mc-role-btn" data-role="${r}"
              style="padding:3px 10px;font-size:11px;font-weight:500;border-radius:5px;border:none;cursor:pointer;font-family:var(--mc-font-sans);transition:background var(--mc-ease-fast),color var(--mc-ease-fast);
              background:${role===r ? 'var(--mc-lime)' : 'transparent'};
              color:${role===r ? 'var(--mc-inverse)' : 'var(--mc-muted)'};">
              ${r.charAt(0).toUpperCase()+r.slice(1)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    el.querySelectorAll('.mc-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        MCState.setRole(btn.dataset.role);
        MCRouter.navigate(MCAuth.getVisibleModules()[0]?.id || 'command-center');
        MCToast && MCToast.info('Role: ' + btn.dataset.role);
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  function init() {
    render();
    MCState.subscribe('currentModule', () => render());
    MCState.subscribe('sseConnected', () => render());
    MCState.subscribe('role', () => render());
    MCState.subscribe('systemHealth', () => render());
  }

  return { init, render };
})();