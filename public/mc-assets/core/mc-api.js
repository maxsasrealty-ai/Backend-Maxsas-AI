window.MCApi = (function () {
  function base() { return window.location.origin + '/api/admin'; }
  function trialBase() { return window.location.origin + '/api/master-control/trial-calls'; }
  function headers() { return { 'Content-Type': 'application/json', 'x-admin-key': MCState.adminKey || '' }; }
  async function requestAt(root, method, path, body, notify = true) {
    const url = root + path;
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(url, opts);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(json?.error?.message || 'Request failed');
        error.status = res.status;
        throw error;
      }
      return json;
    } catch (err) {
      if (notify && window.MCToast) MCToast.error('API Error: ' + err.message);
      throw err;
    }
  }
  function request(method, path, body) { return requestAt(base(), method, path, body); }
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
    getTrialCalls(params = {}) {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.tenantId) query.set('tenantId', params.tenantId);
      if (params.take) query.set('take', String(params.take));
      return requestAt(trialBase(), 'GET', query.toString() ? '?' + query.toString() : '', undefined, false);
    },
    getTrialCall(id) { return requestAt(trialBase(), 'GET', '/' + encodeURIComponent(id), undefined, false); },
    createTrialCall(body) { return requestAt(trialBase(), 'POST', '', body, false); },
    triggerTrialCall(id) { return requestAt(trialBase(), 'POST', '/' + encodeURIComponent(id) + '/trigger', {}, false); },
    getTrialRecording(id) { return requestAt(trialBase(), 'GET', '/' + encodeURIComponent(id) + '/recording', undefined, false); },
    convertEnterprise(id, body)    { return request('POST', '/tenants/' + id + '/enterprise/convert', body); },
    cloneEnterprise(id, body)      { return request('POST', '/tenants/' + id + '/enterprise/clone', body); },
    getBackendControl()            { return request('GET', '/backend-control?role=' + MCState.role); },
    updateBackendControl(body)     { return request('PATCH', '/backend-control', body); },
    resetBackendControl()          { return request('POST', '/backend-control/reset', { actor: 'master-control' }); },
    runAction(action)              { return request('POST', '/backend-control/actions/' + action, { actor: 'master-control' }); },
    getUsers(q = '', limit = 50)   { return request('GET', '/users?query=' + encodeURIComponent(q) + '&limit=' + limit); },
    getMetaAssets()                { return request('GET', '/meta/assets'); },
    getMetaAds()                   { return request('GET', '/meta/ads'); },
    getMetaInsights(params = {}) {
      const query = new URLSearchParams();
      if (params.since) query.set('since', params.since);
      if (params.until) query.set('until', params.until);
      if (params.breakdown) query.set('breakdown', params.breakdown);
      if (params.granularity) query.set('granularity', params.granularity);
      return request('GET', '/meta/insights?' + query.toString());
    },
    getMetaMarketingAnalytics(params = {}) {
      const query = new URLSearchParams();
      if (params.since) query.set('since', params.since);
      if (params.until) query.set('until', params.until);
      if (params.breakdown) query.set('breakdown', params.breakdown);
      return request('GET', '/meta/marketing-analytics?' + query.toString());
    },
  };
})();