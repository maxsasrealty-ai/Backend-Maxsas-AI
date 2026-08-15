window.MCRouter = (function () {
  const el = () => document.getElementById('mc-content');
  let currentModuleId = null;
  let mountSeq = 0;
  const REGISTRY = {
    'command-center': () => window.MCModCommandCenter?.render(),
    'voice-ops':      () => window.MCModVoiceOps?.render(),
    'monitor':        () => window.MCModMonitor?.render(),
    'tenant-control': () => window.MCModTenantControl?.render(),
    'finance':        () => window.MCModFinance?.render(),
    'dev-tools':      () => window.MCModDevTools?.render(),
    'analytics':      () => window.MCModAnalytics?.render(),
    'webinar':        () => window.MCModWebinar?.render(),
    'system':         () => window.MCModSystem?.render(),
    'agent-runtime':  () => window.MCModAgentRuntime?.render(),
  };
  function getHash() { return window.location.hash.replace('#','').trim() || 'command-center'; }

  function getModuleObject(moduleId) {
    switch (moduleId) {
      case 'command-center': return window.MCModCommandCenter;
      case 'voice-ops': return window.MCModVoiceOps;
      case 'monitor': return window.MCModMonitor;
      case 'tenant-control': return window.MCModTenantControl;
      case 'finance': return window.MCModFinance;
      case 'dev-tools': return window.MCModDevTools;
      case 'analytics': return window.MCModAnalytics;
      case 'webinar': return window.MCModWebinar;
      case 'system': return window.MCModSystem;
      case 'agent-runtime': return window.MCModAgentRuntime;
      default: return null;
    }
  }

  async function mount(moduleId) {
    const seq = ++mountSeq;
    if (!MCAuth.canSee(moduleId)) {
      moduleId = MCAuth.getVisibleModules()[0]?.id || 'command-center';
      window.location.hash = '#' + moduleId;
      return;
    }

    const content = el();
    if (!content) return;

    if (window.gsap && content.childElementCount > 0) {
      await new Promise((resolve) => {
        window.gsap.to(content, {
          opacity: 0,
          y: -20,
          scale: 0.98,
          duration: 0.25,
          ease: 'power2.in',
          onComplete: resolve,
        });
      });
    }

    if (seq !== mountSeq) return;

    const previousModule = currentModuleId ? getModuleObject(currentModuleId) : null;
    if (previousModule && typeof previousModule.destroy === 'function') {
      try {
        previousModule.destroy();
      } catch (err) {
        console.error('[MCRouter] destroy error', err);
      }
    }

    MCState.set('currentModule', moduleId);
    MCState.set('currentSubTab', null);
    content.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'mc-module-wrap mc-animate-in';
    wrap.style.cssText = 'display:contents';
    content.appendChild(wrap);
    try {
      const fn = REGISTRY[moduleId];
      if (fn) fn();
      else content.innerHTML = '<div class="mc-empty"><p class="mc-empty-title">Module not found</p></div>';
    } catch(e) {
      console.error('[MCRouter]', e);
      content.innerHTML = '<div class="mc-empty"><p class="mc-empty-title">Error loading module</p><p class="mc-empty-desc">' + e.message + '</p></div>';
    }
    currentModuleId = moduleId;
    MCState.emit('currentModule', moduleId);
    if (window.lucide) lucide.createIcons();

    if (window.gsap) {
      window.gsap.fromTo(content,
        { opacity: 0, y: 20, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power3.out' }
      );
    }
  }
  return {
    init() { window.addEventListener('hashchange', () => mount(getHash())); void mount(getHash()); },
    navigate(id) { window.location.hash = '#' + id; },
    mount,
    getActive() { return MCState.currentModule; },
    getContentEl() { return el(); },
  };
})();