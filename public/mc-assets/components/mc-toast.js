window.MCToast = (function () {
  const MAX_VISIBLE = 4;
  const DEFAULT_DURATION = 4000;
  const ERROR_DURATION = 8000;
  const STYLE_ID = 'mc-toast-styles';

  const icons = {
    success: 'check-circle-2',
    info: 'info',
    warning: 'alert-triangle',
    error: 'x-circle',
  };

  const tones = {
    success: 'var(--mc-lime)',
    info: 'var(--mc-cyan)',
    warning: 'var(--mc-amber)',
    error: 'var(--mc-red)',
  };

  const queue = [];
  const active = new Map();
  const latest = [];

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mc-toast-root {
        position: fixed;
        right: var(--mc-s6);
        bottom: var(--mc-s6);
        z-index: var(--mc-z-toast);
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        width: min(360px, calc(100vw - 24px));
      }

      .mc-toast {
        pointer-events: auto;
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border);
        border-left: 3px solid var(--mc-toast-color, var(--mc-border));
        background: linear-gradient(180deg, var(--mc-panel) 0%, var(--mc-surface) 100%);
        color: var(--mc-text);
        box-shadow: var(--mc-shadow-lg);
        backdrop-filter: blur(16px) saturate(1.15);
        overflow: hidden;
        animation: mc-toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
        transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
        cursor: pointer;
      }

      .mc-toast::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(600px 120px at 100% 0%, color-mix(in srgb, var(--mc-toast-color, var(--mc-cyan)) 14%, transparent), transparent 58%);
        opacity: 0.9;
        pointer-events: none;
      }

      .mc-toast:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--mc-toast-color, var(--mc-cyan)) 34%, var(--mc-border));
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.44), 0 0 0 1px color-mix(in srgb, var(--mc-toast-color, var(--mc-cyan)) 22%, transparent);
      }

      .mc-toast.is-dismissing {
        opacity: 0;
        transform: translateX(24px);
      }

      .mc-toast__icon {
        position: relative;
        z-index: 1;
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--mc-toast-color, var(--mc-cyan));
        margin-top: 1px;
        filter: drop-shadow(0 0 10px color-mix(in srgb, var(--mc-toast-color, var(--mc-cyan)) 42%, transparent));
      }

      .mc-toast__body {
        position: relative;
        z-index: 1;
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .mc-toast__title {
        font-size: var(--mc-text-sm);
        font-weight: 600;
        color: var(--mc-text);
        line-height: 1.3;
      }

      .mc-toast__message {
        font-size: var(--mc-text-sm);
        color: var(--mc-muted);
        line-height: 1.45;
        word-break: break-word;
      }

      .mc-toast__dismiss {
        position: relative;
        z-index: 1;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        border-radius: 9999px;
        border: 1px solid transparent;
        color: var(--mc-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
      }

      .mc-toast__dismiss:hover {
        color: var(--mc-text);
        border-color: var(--mc-border);
        background: rgba(255, 255, 255, 0.04);
      }

      @keyframes mc-toast-in {
        from {
          opacity: 0;
          transform: translateX(28px) scale(0.98);
        }

        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }

      @media (max-width: 640px) {
        #mc-toast-root {
          right: 12px;
          left: 12px;
          bottom: 12px;
          width: auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getRoot() {
    if (window.MCState && window.MCState.toastRootId && document.getElementById(window.MCState.toastRootId)) {
      return document.getElementById(window.MCState.toastRootId);
    }

    let root = document.getElementById('mc-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'mc-toast-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function normalizeType(type) {
    const value = String(type || 'info').toLowerCase();
    if (value === 'warn') return 'warning';
    if (value === 'success' || value === 'info' || value === 'warning' || value === 'error') return value;
    return 'info';
  }

  function normalizeDuration(type, duration) {
    if (typeof duration === 'number' && !Number.isNaN(duration)) return duration;
    return type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function processQueue() {
    if (active.size >= MAX_VISIBLE) return;
    const next = queue.shift();
    if (!next) return;
    mountToast(next);
  }

  function dismissToast(id) {
    const entry = active.get(id);
    if (!entry) return;

    clearTimeout(entry.timer);
    entry.element.classList.add('is-dismissing');
    window.setTimeout(() => {
      try {
        entry.element.remove();
      } catch (err) {}
      active.delete(id);
      processQueue();
    }, 180);
  }

  function mountToast(item) {
    ensureStyles();
    const root = getRoot();

    if (active.size >= MAX_VISIBLE) {
      queue.push(item);
      return item.id;
    }

    const toast = document.createElement('div');
    toast.className = `mc-toast mc-toast--${item.type}`;
    toast.setAttribute('role', item.type === 'error' ? 'alert' : 'status');
    toast.style.setProperty('--mc-toast-color', tones[item.type]);
    toast.innerHTML = `
      <i data-lucide="${icons[item.type]}" class="mc-toast__icon"></i>
      <div class="mc-toast__body">
        <div class="mc-toast__title">${escapeHtml(item.title)}</div>
        <div class="mc-toast__message">${escapeHtml(item.message)}</div>
      </div>
      <button type="button" class="mc-toast__dismiss" aria-label="Dismiss toast">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    `;

    const entry = {
      id: item.id,
      element: toast,
      timer: null,
    };

    const dismiss = () => dismissToast(item.id);
    toast.addEventListener('click', dismiss);
    toast.querySelector('.mc-toast__dismiss')?.addEventListener('click', (event) => {
      event.stopPropagation();
      dismiss();
    });

    active.set(item.id, entry);
    root.appendChild(toast);

    if (window.lucide) {
      window.requestAnimationFrame(() => window.lucide.createIcons());
    }

    entry.timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return item.id;
  }

  function showToast(type, message, duration) {
    ensureStyles();

    const normalizedType = normalizeType(type);
    const item = {
      id: `mc-toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: normalizedType,
      message: message == null ? '' : String(message),
      title: normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1),
      duration: normalizeDuration(normalizedType, duration),
    };

    latest.unshift(item);
    if (latest.length > 20) latest.pop();

    return mountToast(item);
  }

  function showToastSuccess(message, duration) {
    return showToast('success', message, duration);
  }

  function showToastError(message, duration = ERROR_DURATION) {
    return showToast('error', message, duration);
  }

  function showToastInfo(message, duration) {
    return showToast('info', message, duration);
  }

  function showToastWarning(message, duration) {
    return showToast('warning', message, duration);
  }

  function clearAll() {
    [...active.keys()].forEach((id) => dismissToast(id));
    queue.splice(0, queue.length);
  }

  ensureStyles();

  return {
    showToast,
    showToastSuccess,
    showToastError,
    showToastInfo,
    showToastWarning,
    clearAll,
    // Legacy aliases used across the current modules.
    success: showToastSuccess,
    error: showToastError,
    info: showToastInfo,
    warning: showToastWarning,
    warn: showToastWarning,
  };
})();