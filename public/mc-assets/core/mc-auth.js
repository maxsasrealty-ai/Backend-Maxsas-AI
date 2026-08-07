window.MCAuth = (function () {
  const MODULES = [
    { id: 'command-center', label: 'Command Center', icon: 'zap',         color: 'var(--mc-mod-command)',    roles: ['developer','ops','admin'] },
    { id: 'voice-ops',      label: 'Voice Ops',      icon: 'phone-call',  color: 'var(--mc-mod-voice)',      roles: ['developer','ops','admin'] },
    { id: 'monitor',        label: 'Monitor',        icon: 'monitor',     color: 'var(--mc-mod-devtools)',   roles: ['ops','admin'] },
    { id: 'tenant-control', label: 'Tenants',        icon: 'building-2',  color: 'var(--mc-mod-tenant)',     roles: ['ops','admin'] },
    { id: 'finance',        label: 'Finance',        icon: 'credit-card', color: 'var(--mc-mod-finance)',    roles: ['ops','admin'] },
    { id: 'dev-tools',      label: 'Dev Tools',      icon: 'terminal',    color: 'var(--mc-mod-devtools)',   roles: ['developer','admin'] },
    { id: 'analytics',      label: 'Analytics',      icon: 'bar-chart-2', color: 'var(--mc-mod-analytics)',  roles: ['developer','ops','admin'] },
    { id: 'system',         label: 'System',         icon: 'server',      color: 'var(--mc-mod-system)',     roles: ['developer','ops','admin'] },
    { id: 'agent-runtime',  label: 'Agent Runtime',  icon: 'cpu',         color: 'var(--mc-mod-agent)',      roles: ['developer','admin'] },
  ];
  const ACTIONS = {
    'backend-control-write': ['developer','admin'],
    'tenant-patch':          ['ops','admin'],
    'enterprise-actions':    ['admin'],
    'danger-zone':           ['admin'],
    'view-finance':          ['ops','admin'],
    'trigger-call':          ['developer','admin'],
  };
  return {
    getRole()             { return MCState.role; },
    getAdminKey()         { return MCState.adminKey || localStorage.getItem('mc_admin_key') || ''; },
    getVisibleModules()   { const r = this.getRole(); return MODULES.filter(m => m.roles.includes(r)); },
    canSee(moduleId)      { const r = this.getRole(); const m = MODULES.find(x => x.id === moduleId); return m ? m.roles.includes(r) : false; },
    can(action)           { const r = this.getRole(); const a = ACTIONS[action]; return a ? a.includes(r) : false; },
    getAllModules()        { return MODULES; },
  };
})();