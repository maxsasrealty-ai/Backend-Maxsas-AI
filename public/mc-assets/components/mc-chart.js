window.MCCharts = window.MCCharts || {};

window.MCChart = (function () {
  const resizeHandlers = new Map();

  function resolveContainer(containerId) {
    if (!containerId) return null;
    return typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  }

  function ensureCanvas(container) {
    if (!container) return null;

    if (container.tagName && container.tagName.toLowerCase() === 'canvas') {
      return container;
    }

    let canvas = container.querySelector('canvas[data-role="mc-chart"]');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('data-role', 'mc-chart');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.innerHTML = '';
      container.appendChild(canvas);
    }

    return canvas;
  }

  function getCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function buildOptions(type, options = {}) {
    const borderSoft = getCssVar('--mc-border-soft', 'rgba(255,255,255,0.08)');
    const muted = getCssVar('--mc-muted', '#8892a4');
    const text = getCssVar('--mc-text', '#e6edf7');
    const monoFont = getCssVar('--mc-font-mono', 'DM Mono');

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 350,
      },
      plugins: {
        legend: {
          labels: {
            color: muted,
            font: {
              family: monoFont,
              size: 11,
            },
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: getCssVar('--mc-panel', 'rgba(17, 28, 48, 0.88)'),
          titleColor: text,
          bodyColor: text,
          borderColor: borderSoft,
          borderWidth: 1,
          padding: 12,
          titleFont: {
            family: monoFont,
          },
          bodyFont: {
            family: monoFont,
          },
        },
      },
      scales: type === 'pie' || type === 'doughnut' ? undefined : {
        x: {
          ticks: {
            color: muted,
            font: {
              family: monoFont,
              size: 11,
            },
          },
          grid: {
            color: borderSoft,
            drawBorder: false,
          },
        },
        y: {
          ticks: {
            color: muted,
            font: {
              family: monoFont,
              size: 11,
            },
          },
          grid: {
            color: borderSoft,
            drawBorder: false,
          },
        },
      },
      ...options,
    };
  }

  function destroyChart(containerId) {
    const existing = window.MCCharts?.[containerId];
    if (existing && typeof existing.destroy === 'function') {
      existing.destroy();
    }
    delete window.MCCharts[containerId];

    const handler = resizeHandlers.get(containerId);
    if (handler) {
      window.removeEventListener('resize', handler);
      resizeHandlers.delete(containerId);
    }
  }

  function createChart(containerId, type, data, options = {}) {
    if (!window.Chart) {
      throw new Error('Chart.js is not loaded on window.Chart');
    }

    const container = resolveContainer(containerId);
    if (!container) return null;

    destroyChart(containerId);

    const canvas = ensureCanvas(container);
    if (!canvas) return null;

    const context = canvas.getContext('2d');
    const chart = new window.Chart(context, {
      type,
      data,
      options: buildOptions(type, options),
    });

    window.MCCharts[containerId] = chart;

    const resizeHandler = () => {
      if (window.MCCharts[containerId]) {
        window.MCCharts[containerId].resize();
      }
    };

    resizeHandlers.set(containerId, resizeHandler);
    window.addEventListener('resize', resizeHandler);

    return chart;
  }

  return {
    createChart,
    destroyChart,
  };
})();

window.createChart = function createChart(containerId, type, data, options) {
  return window.MCChart.createChart(containerId, type, data, options);
};

window.destroyChart = function destroyChart(containerId) {
  return window.MCChart.destroyChart(containerId);
};