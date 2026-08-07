window.MCModMonitor = (function () {
  const TABS = [
    {
      id: 'dev-monitor',
      label: 'Dev Monitor',
      icon: 'monitor',
      url: '/admin-panel',
    },
    {
      id: 'agent-server-monitor',
      label: 'Agent Server Monitor',
      icon: 'cpu',
      url: 'http://157.245.108.130:8080/admin',
    },
  ];

  let activeTab = 'dev-monitor';

  function tabButtonsHtml() {
    return TABS.map((tab) => `
      <button class="mc-subtab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}"
        style="display:flex;align-items:center;gap:6px;">
        <i data-lucide="${tab.icon}" style="width:13px;height:13px;"></i>
        <span>${tab.label}</span>
      </button>
    `).join('');
  }

  function iframeHtml(url, title) {
    return `
      <div style="width:100%;height:calc(100vh - var(--mc-topbar-h) - 100px);border:1px solid var(--mc-border);border-radius:var(--mc-r-lg);overflow:hidden;background:var(--mc-surface);box-shadow:var(--mc-shadow-panel);">
        <iframe
          src="${url}"
          title="${title}"
          loading="lazy"
          style="width:100%;height:100%;border:none;display:block;"
        ></iframe>
      </div>
    `;
  }

  function render() {
    const el = MCRouter.getContentEl();
    if (!el) return;

    const tab = TABS.find((item) => item.id === activeTab) || TABS[0];

    el.innerHTML = `
      <div style="max-width:var(--mc-content-max);margin:0 auto;display:flex;flex-direction:column;gap:16px;">
        <div class="mc-section-header">
          <div>
            <div class="mc-section-title" style="display:flex;align-items:center;gap:8px;">
              <i data-lucide="monitor" style="width:18px;height:18px;color:var(--mc-mod-devtools);"></i>
              Monitor
            </div>
            <div class="mc-section-meta" style="margin-top:4px;">
              Maxsas Voice · Dev Monitor and Agent Server Monitor
            </div>
          </div>
          <button class="mc-btn mc-btn-ghost mc-btn-sm" id="mc-monitor-open-new">
            <i data-lucide="external-link" style="width:12px;height:12px;"></i>
            Open in new tab
          </button>
        </div>

        <div class="mc-subtabs" id="mc-monitor-tabs">
          ${tabButtonsHtml()}
        </div>

        <div id="mc-monitor-frame-wrap">
          ${iframeHtml(tab.url, tab.label)}
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    el.querySelectorAll('.mc-subtab').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab;
        const nextTab = TABS.find((item) => item.id === activeTab) || TABS[0];

        el.querySelectorAll('.mc-subtab').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');

        const wrap = document.getElementById('mc-monitor-frame-wrap');
        if (wrap && nextTab) {
          wrap.innerHTML = iframeHtml(nextTab.url, nextTab.label);
        }

        if (window.lucide) lucide.createIcons();
      });
    });

    document.getElementById('mc-monitor-open-new')?.addEventListener('click', () => {
      const currentTab = TABS.find((item) => item.id === activeTab) || TABS[0];
      window.open(currentTab.url, '_blank');
    });
  }

  return { render };
})();