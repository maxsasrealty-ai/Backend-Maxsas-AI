window.MCKpiCard = (function () {
  const STYLE_ID = 'mc-kpi-card-styles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mc-kpi-card {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 20px;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border);
        border-top: 3px solid var(--card-accent, var(--mc-cyan));
        background: linear-gradient(180deg, var(--mc-panel) 0%, var(--mc-surface) 100%);
        box-shadow: var(--mc-shadow-panel);
        backdrop-filter: blur(14px) saturate(1.15);
        transition: transform var(--mc-ease-fast), box-shadow var(--mc-ease-fast), border-color var(--mc-ease-fast);
      }

      .mc-kpi-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(700px 180px at 100% -20%, color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 16%, transparent), transparent 55%);
        opacity: 0.85;
        pointer-events: none;
      }

      .mc-kpi-card:hover {
        transform: translateY(-4px);
        border-color: color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 42%, white 8%);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.42), 0 0 0 1px color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 32%, transparent);
      }

      .mc-kpi-card__head,
      .mc-kpi-card__body,
      .mc-kpi-card__meta {
        position: relative;
        z-index: 1;
      }

      .mc-kpi-card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .mc-kpi-card__label {
        color: var(--mc-muted);
        font-size: var(--mc-text-xs);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 600;
      }

      .mc-kpi-card__icon {
        width: 18px;
        height: 18px;
        color: var(--card-accent, var(--mc-cyan));
        flex-shrink: 0;
        filter: drop-shadow(0 0 10px color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 50%, transparent));
      }

      .mc-kpi-icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .mc-kpi-card__body {
        display: flex;
        align-items: baseline;
        gap: 10px;
        min-height: 38px;
      }

      .mc-kpi-card__value {
        font-size: 28px;
        line-height: 1;
        font-weight: 700;
        font-family: var(--mc-font-mono);
        color: var(--mc-text);
        text-shadow: 0 0 30px var(--text-glow, rgba(255,255,255,0.35));
      }

      .mc-kpi-value {
        display: inline-flex;
        align-items: baseline;
      }

      .mc-kpi-accent-bar {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 3px;
        transform-origin: left center;
        background: linear-gradient(90deg, var(--card-accent, var(--mc-cyan)), color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 20%, transparent));
        box-shadow: 0 0 18px color-mix(in srgb, var(--card-accent, var(--mc-cyan)) 45%, transparent);
      }

      .mc-kpi-card__value.is-loading {
        min-width: 72px;
        color: transparent;
        background: linear-gradient(90deg,
          rgba(255, 255, 255, 0.05) 0%,
          rgba(255, 255, 255, 0.16) 50%,
          rgba(255, 255, 255, 0.05) 100%
        );
        background-size: 220px 100%;
        background-repeat: no-repeat;
        -webkit-background-clip: text;
        background-clip: text;
        animation: mc-kpi-card-shimmer 1.5s ease-in-out infinite;
      }

      .mc-kpi-card__meta {
        color: var(--mc-muted);
        font-size: var(--mc-text-xs);
        font-family: var(--mc-font-mono);
        letter-spacing: 0.01em;
      }

      .mc-kpi-card__spark {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.28;
      }

      @keyframes mc-kpi-card-shimmer {
        0% { background-position: -220px 0; }
        100% { background-position: 220px 0; }
      }
    `;

    document.head.appendChild(style);
  }

  function resolveValue(value, loading) {
    if (loading) return '—';
    return value ?? '—';
  }

  function createKpiCard(label, value, icon, colorVar, loading = false) {
    ensureStyles();

    const safeLabel = String(label ?? '');
    const safeValue = resolveValue(value, loading);
    const safeIcon = String(icon ?? 'activity');
    const safeColor = String(colorVar ?? 'var(--mc-cyan)');

    const displayTarget = loading ? '' : escapeAttribute(safeValue);

    return `
      <article class="mc-kpi-card" style="--card-accent: ${safeColor};">
        <div class="mc-kpi-accent-bar"></div>
        <div class="mc-kpi-card__spark"></div>
        <div class="mc-kpi-card__head">
          <div class="mc-kpi-card__label">${safeLabel}</div>
          <span class="mc-kpi-icon-wrapper">
            <i data-lucide="${safeIcon}" class="mc-kpi-card__icon"></i>
          </span>
        </div>
        <div class="mc-kpi-card__body">
          <div class="mc-kpi-card__value mc-kpi-value ${loading ? 'is-loading' : ''}" data-target="${displayTarget}">${safeValue}</div>
        </div>
      </article>
    `;
  }

  function escapeAttribute(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderKpiCards(cards) {
    const html = (cards || []).map((card) => createKpiCard(
      card.label,
      card.value,
      card.icon,
      card.colorVar,
      card.loading,
    )).join('');

    if (window.lucide) {
      requestAnimationFrame(() => lucide.createIcons());
    }

    return html;
  }

  return {
    createKpiCard,
    renderKpiCards,
  };
})();

window.createKpiCard = function createKpiCard(label, value, icon, colorVar, loading = false) {
  return window.MCKpiCard.createKpiCard(label, value, icon, colorVar, loading);
};