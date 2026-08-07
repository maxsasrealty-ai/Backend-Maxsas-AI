window.MCModal = (function () {
  const MODAL_ID = 'mc-modal-active';
  const STYLE_ID = 'mc-modal-styles';
  let activeEscapeHandler = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mc-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--mc-z-modal);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--mc-s6);
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(6px);
        animation: mc-modal-backdrop-in 180ms ease-out;
      }

      .mc-modal {
        position: relative;
        width: min(720px, 100%);
        max-height: min(84vh, 860px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border-radius: var(--mc-r-xl);
        border: 1px solid var(--mc-border);
        background: linear-gradient(180deg, var(--mc-surface) 0%, var(--mc-panel) 100%);
        box-shadow: var(--mc-shadow-lg);
        color: var(--mc-text);
        animation: mc-modal-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .mc-modal__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: var(--mc-s5) var(--mc-s5) var(--mc-s4);
        border-bottom: 1px solid var(--mc-border-soft);
      }

      .mc-modal__title-wrap {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .mc-modal__title {
        font-size: var(--mc-text-lg);
        font-weight: 700;
        color: var(--mc-text);
        line-height: 1.2;
      }

      .mc-modal__subtitle {
        font-size: var(--mc-text-sm);
        color: var(--mc-muted);
        line-height: 1.5;
      }

      .mc-modal__close {
        width: 30px;
        height: 30px;
        border-radius: 9999px;
        border: 1px solid transparent;
        color: var(--mc-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
      }

      .mc-modal__close:hover {
        color: var(--mc-text);
        border-color: var(--mc-border);
        background: rgba(255, 255, 255, 0.04);
      }

      .mc-modal__body {
        padding: var(--mc-s5);
        overflow: auto;
        color: var(--mc-text);
      }

      .mc-modal__footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        padding: 0 var(--mc-s5) var(--mc-s5);
        flex-wrap: wrap;
      }

      .mc-modal__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 34px;
        padding: 0 14px;
        border-radius: var(--mc-r-md);
        font-size: var(--mc-text-sm);
        font-weight: 600;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        user-select: none;
      }

      .mc-modal__btn:hover {
        transform: translateY(-1px);
      }

      .mc-modal__btn.primary {
        color: #051018;
        background: var(--mc-lime);
        border: 1px solid color-mix(in srgb, var(--mc-lime) 72%, white 8%);
        box-shadow: 0 8px 24px color-mix(in srgb, var(--mc-lime) 30%, transparent);
      }

      .mc-modal__btn.secondary {
        color: var(--mc-text);
        background: transparent;
        border: 1px solid var(--mc-border);
      }

      .mc-modal__btn.secondary:hover {
        border-color: var(--mc-lime);
        background: rgba(0, 212, 255, 0.05);
      }

      .mc-modal__btn.danger {
        color: var(--mc-red);
        background: transparent;
        border: 1px solid var(--mc-red);
      }

      .mc-modal__btn.danger:hover {
        background: rgba(244, 63, 94, 0.08);
      }

      .mc-modal__btn:focus-visible,
      .mc-modal__close:focus-visible {
        outline: 2px solid var(--mc-lime);
        outline-offset: 2px;
      }

      @keyframes mc-modal-in {
        from {
          opacity: 0;
          transform: scale(0.95);
        }

        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes mc-modal-backdrop-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @media (max-width: 640px) {
        .mc-modal-backdrop {
          padding: 12px;
          align-items: flex-end;
        }

        .mc-modal {
          width: 100%;
          max-height: 92vh;
          border-radius: 18px 18px 14px 14px;
        }

        .mc-modal__footer {
          justify-content: stretch;
        }

        .mc-modal__btn {
          flex: 1 1 120px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closeModal() {
    const existing = document.getElementById(MODAL_ID);
    if (existing) {
      existing.remove();
    }

    if (activeEscapeHandler) {
      document.removeEventListener('keydown', activeEscapeHandler);
      activeEscapeHandler = null;
    }
  }

  function getButtonClass(type) {
    const normalized = String(type || 'secondary').toLowerCase();
    if (normalized === 'primary') return 'mc-modal__btn primary';
    if (normalized === 'danger') return 'mc-modal__btn danger';
    return 'mc-modal__btn secondary';
  }

  function normalizeButtonType(buttonClass) {
    const className = String(buttonClass || '').toLowerCase();
    if (className.includes('danger')) return 'danger';
    if (className.includes('primary')) return 'primary';
    return 'secondary';
  }

  function showModal(config = {}) {
    ensureStyles();
    closeModal();

    const title = config.title == null ? '' : String(config.title);
    const body = config.body == null ? String(config.content ?? '') : String(config.body);
    const buttons = Array.isArray(config.buttons)
      ? config.buttons
      : (config.confirmLabel || typeof config.onConfirm === 'function')
        ? [{
            label: config.confirmLabel ?? 'Confirm',
            type: normalizeButtonType(config.confirmClass),
            onClick: async () => {
              if (typeof config.onConfirm === 'function') {
                return await config.onConfirm();
              }
            },
          }]
        : [];
    const onClose = typeof config.onClose === 'function' ? config.onClose : null;
    const activeRole = window.MCState?.role || 'unknown';

    const backdrop = document.createElement('div');
    backdrop.id = MODAL_ID;
    backdrop.className = 'mc-modal-backdrop';
    backdrop.dataset.mcRole = activeRole;
    backdrop.innerHTML = `
      <div class="mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-modal-title">
        <div class="mc-modal__header">
          <div class="mc-modal__title-wrap">
            <div id="mc-modal-title" class="mc-modal__title">${escapeHtml(title)}</div>
          </div>
          <button type="button" class="mc-modal__close" aria-label="Close modal">
            <i data-lucide="x" style="width:15px;height:15px;"></i>
          </button>
        </div>
        <div class="mc-modal__body">${body}</div>
        ${buttons.length ? `<div class="mc-modal__footer">
          ${buttons.map((button, index) => `
            <button type="button" class="${getButtonClass(button?.type)}" data-button-index="${index}">${escapeHtml(button?.label ?? 'Button')}</button>
          `).join('')}
        </div>` : ''}
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeButtons = backdrop.querySelectorAll('.mc-modal__close');
    closeButtons.forEach((button) => button.addEventListener('click', () => {
      closeModal();
      onClose && onClose();
    }));

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        closeModal();
        onClose && onClose();
      }
    });

    backdrop.querySelectorAll('.mc-modal__btn').forEach((button) => {
      const index = Number(button.getAttribute('data-button-index'));
      const action = buttons[index];
      button.addEventListener('click', async () => {
        try {
          if (typeof action?.onClick === 'function') {
            const shouldClose = await action.onClick({ closeModal, showToast: window.MCToast?.showToast || window.MCToast?.info });
            if (shouldClose !== false) {
              closeModal();
              onClose && onClose();
            }
          } else {
            closeModal();
            onClose && onClose();
          }
        } catch (err) {
          if (window.MCToast) {
            window.MCToast.showToastError(err?.message || 'Action failed');
          }
        }
      });
    });

    activeEscapeHandler = (event) => {
      if (event.key === 'Escape') {
        closeModal();
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', activeEscapeHandler);

    if (window.lucide) {
      window.lucide.createIcons();
    }

    return backdrop;
  }

  function open(config = {}) {
    return showModal(config);
  }

  return {
    showModal,
    closeModal,
    open,
    close: closeModal,
  };
})();