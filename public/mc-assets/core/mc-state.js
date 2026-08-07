window.MCState = (function () {
  const _listeners = {};
  const state = {
    role: localStorage.getItem('mc_role') || 'developer',
    adminKey: localStorage.getItem('mc_admin_key') || '',
    adminKeyConfirmed: false,
    calls: [],
    liveEvents: [],
    tenants: [],
    activeCallCount: 0,
    systemHealth: { backend: null, livekit: null, sse: 'disconnected' },
    currentModule: 'command-center',
    currentSubTab: null,
    sidebarCollapsed: false,
    selectedCallId: null,
    selectedTenantId: null,
    sseConnected: false,
    sseReconnectAttempts: 0,
    subscribe(key, fn) {
      if (!_listeners[key]) _listeners[key] = [];
      _listeners[key].push(fn);
      return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); };
    },
    emit(key, data) {
      (_listeners[key] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[MCState]', key, e); } });
    },
    set(key, value) { this[key] = value; this.emit(key, value); },
    setRole(role) { this.role = role; localStorage.setItem('mc_role', role); this.emit('role', role); },
    setAdminKey(key) {
      this.adminKey = key;
      localStorage.setItem('mc_admin_key', key);
      this.emit('adminKey', key);
      this.emit('adminKeySet', key);
    },
    pushEvent(event) {
      this.liveEvents.unshift(event);
      if (this.liveEvents.length > 200) this.liveEvents.pop();
      this.emit('liveEvents', this.liveEvents);
    },
  };
  return state;
})();