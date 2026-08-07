window.MCSSE = (function () {
  let _es = null, _reconnectTimer = null, _heartbeatTimer = null, _lastHeartbeat = null;
  const MAX_RETRIES = 8, HB_TIMEOUT = 45000;

  function setStatus(s) {
    MCState.set('sseConnected', s === 'connected');
    MCState.set('systemHealth', { ...MCState.systemHealth, sse: s });
  }
  function cleanup() {
    if (_es) { try { _es.close(); } catch(e){} _es = null; }
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }
  function scheduleReconnect(attempt) {
    const delay = Math.min(1000 * Math.pow(1.8, attempt), 30000);
    MCState.set('sseReconnectAttempts', attempt);
    setStatus('reconnecting');
    _reconnectTimer = setTimeout(() => _connect(attempt + 1), delay);
  }
  function startHB() {
    _lastHeartbeat = Date.now();
    _heartbeatTimer = setInterval(() => {
      if (Date.now() - _lastHeartbeat > HB_TIMEOUT) { cleanup(); scheduleReconnect(0); }
    }, 10000);
  }
  function _connect(attempt) {
    if (!MCState.adminKey) { setStatus('no-key'); return; }
    if (attempt >= MAX_RETRIES) { setStatus('failed'); return; }
    cleanup();
    try { _es = new EventSource(MCApi.getSSEUrl()); } catch(e) { scheduleReconnect(attempt); return; }
    _es.addEventListener('connected', () => { MCState.set('sseReconnectAttempts', 0); setStatus('connected'); startHB(); });
    _es.addEventListener('admin_live_event', (e) => { try { MCState.pushEvent(JSON.parse(e.data)); } catch(err) {} });
    _es.addEventListener('heartbeat', () => { _lastHeartbeat = Date.now(); });
    _es.onerror = () => { cleanup(); scheduleReconnect(attempt); };
  }
  return {
    connect(attempt = 0) { if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; } _connect(attempt); },
    disconnect() { cleanup(); if (_reconnectTimer) clearTimeout(_reconnectTimer); setStatus('disconnected'); },
    reconnect() { this.disconnect(); setTimeout(() => this.connect(0), 300); },
    getStatus() { return MCState.systemHealth.sse; },
    subscribe(url, handlers = {}) {
      if (!url) return () => {};
      const source = new EventSource(url);
      const onMessage = typeof handlers.onMessage === 'function' ? handlers.onMessage : null;
      const eventName = handlers.eventName || 'message';
      const listener = (event) => {
        if (onMessage) onMessage(event);
      };

      if (eventName === 'message') {
        source.onmessage = listener;
      } else {
        source.addEventListener(eventName, listener);
      }

      if (typeof handlers.onOpen === 'function') {
        source.onopen = handlers.onOpen;
      }

      if (typeof handlers.onError === 'function') {
        source.onerror = handlers.onError;
      }

      return () => {
        try { source.close(); } catch (err) {}
      };
    },
  };
})();