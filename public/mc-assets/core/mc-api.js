window.MCApi = (function () {
  function base() { return window.location.origin + '/api/admin'; }
  function headers() { return { 'Content-Type': 'application/json', 'x-admin-key': MCState.adminKey || '' }; }
  async function request(method, path, body) {
    const url = base() + path;
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(url, opts);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'HTTP ' + res.status);
      return json;
    } catch (err) {
      if (window.MCToast) MCToast.error('API Error: ' + err.message);
      throw err;
    }
  }
  return {
    request: request,
    getLiveEvents(limit = 50)      { return request('GET', '/live-events/recent?limit=' + limit); },
    getSSEUrl()                     { return base() + '/live-events/stream?adminKey=' + encodeURIComponent(MCState.adminKey); },
    getCalls(limit = 50)           { return request('GET', '/dev-monitor/calls?limit=' + limit); },
    getActiveCalls()               { return request('GET', '/dev-monitor/calls'); },
    getCompletedCalls(limit = 20)  { return request('GET', '/dev-monitor/calls?limit=' + limit + '&status=completed'); },
    getCallDetails(id)             { return request('GET', '/dev-monitor/calls/' + encodeURIComponent(id)); },
    getQualityMetrics()            { return request('GET', '/dev-monitor/metrics'); },
    getAgents()                    { return request('GET', '/dev-monitor/agents'); },
    getDevHealth()                 { return request('GET', '/dev-monitor/health'); },
    getDevMetrics(range = '1h')    { return request('GET', '/dev-monitor/metrics?range=' + encodeURIComponent(range)); },
    getDevCommands()               { return request('GET', '/dev-monitor/commands'); },
    runDevCommand(cmd)             { return request('POST', '/dev-monitor/command', { cmd }); },
    getCallEvents(id)              { return request('GET', '/dev-monitor/call-events/' + id); },
    getLogs(since)                 { return request('GET', '/dev-monitor/logs' + (since ? '?since=' + since : '')); },
    getPayments(limit = 50)        { return request('GET', '/dev-monitor/payments?limit=' + limit); },
    getPaymentEvents(id)           { return request('GET', '/dev-monitor/payment-events/' + id); },
    getLivekitRoom(name)           { return request('GET', '/dev-monitor/livekit-room/' + encodeURIComponent(name)); },
    getTenants()                   { return request('GET', '/tenants'); },
    getTenant(id)                  { return request('GET', '/tenants/' + id); },
    getTenantControlCenter(id)     { return request('GET', '/tenants/' + id + '/control-center'); },
    getTenantUsage(id)             { return request('GET', '/tenants/' + id + '/usage'); },
    getTenantWallet(id)            { return request('GET', '/tenants/' + id + '/wallet'); },
    getTenantCampaigns(id, p = 1)  { return request('GET', '/tenants/' + id + '/campaigns?page=' + p); },
    updateTenant(id, body)         { return request('PATCH', '/tenants/' + id, body); },
    createTenant(body)             { return request('POST', '/tenants', body); },
    createEnterpriseTenant(body)   { return request('POST', '/tenants/enterprise', body); },
    getWebinarRegistrations(params = {}) {
      const query = new URLSearchParams();
      if (params.query) query.set('query', params.query);
      if (params.status && params.status !== 'all') query.set('status', params.status);
      return request('GET', '/webinar-registrations' + (query.toString() ? '?' + query.toString() : ''));
    },
    getWebinarConfig() { return request('GET', '/webinar/config'); },
    updateWebinarConfig(body) { return request('PUT', '/webinar/config', body); },
    updateWebinarRegistration(id, body) { return request('PATCH', '/webinar-registrations/' + encodeURIComponent(id), body); },
    convertEnterprise(id, body)    { return request('POST', '/tenants/' + id + '/enterprise/convert', body); },
    cloneEnterprise(id, body)      { return request('POST', '/tenants/' + id + '/enterprise/clone', body); },
    getBackendControl()            { return request('GET', '/backend-control?role=' + MCState.role); },
    updateBackendControl(body)     { return request('PATCH', '/backend-control', body); },
    resetBackendControl()          { return request('POST', '/backend-control/reset', { actor: 'master-control' }); },
    runAction(action)              { return request('POST', '/backend-control/actions/' + action, { actor: 'master-control' }); },
    getUsers(q = '', limit = 50)   { return request('GET', '/users?query=' + encodeURIComponent(q) + '&limit=' + limit); },
  };
})();