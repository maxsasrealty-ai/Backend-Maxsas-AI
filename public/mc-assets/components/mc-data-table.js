window.MCDataTable = (function () {
  const STYLE_ID = 'mc-data-table-styles';
  const instances = new Map();

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mc-data-table {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border);
        background: linear-gradient(180deg, var(--mc-panel) 0%, var(--mc-surface) 100%);
        box-shadow: var(--mc-shadow-panel);
        backdrop-filter: blur(14px) saturate(1.1);
        overflow: hidden;
      }

      .mc-data-table__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }

      .mc-data-table__search {
        position: relative;
        min-width: min(360px, 100%);
        flex: 1 1 280px;
      }

      .mc-data-table__search input {
        width: 100%;
        padding: 11px 14px 11px 40px;
        border-radius: var(--mc-r-md);
        border: 1px solid var(--mc-border);
        background: rgba(255, 255, 255, 0.02);
        color: var(--mc-text);
        outline: none;
        transition: border-color var(--mc-ease-fast), box-shadow var(--mc-ease-fast), background var(--mc-ease-fast);
      }

      .mc-data-table__search input::placeholder {
        color: var(--mc-faint);
      }

      .mc-data-table__search input:focus {
        border-color: var(--mc-border-focus);
        box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
        background: rgba(255, 255, 255, 0.03);
      }

      .mc-data-table__search-icon {
        position: absolute;
        left: 13px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--mc-muted);
        width: 16px;
        height: 16px;
        pointer-events: none;
      }

      .mc-data-table__meta {
        color: var(--mc-muted);
        font-size: var(--mc-text-xs);
        font-family: var(--mc-font-mono);
        white-space: nowrap;
      }

      .mc-data-table__wrap {
        overflow-x: auto;
        border-radius: var(--mc-r-lg);
        border: 1px solid var(--mc-border-soft);
        background: rgba(7, 12, 20, 0.24);
      }

      .mc-data-table__table {
        width: 100%;
        min-width: 760px;
        border-collapse: collapse;
      }

      .mc-data-table__table thead th {
        position: sticky;
        top: 0;
        z-index: 1;
        background: linear-gradient(90deg, rgba(0, 212, 255, 0.08), rgba(139, 92, 246, 0.06));
        border-bottom: 1px solid var(--mc-border);
      }

      .mc-data-table__table th,
      .mc-data-table__table td {
        padding: 12px 14px;
        text-align: left;
        color: var(--mc-text);
        border-bottom: 1px solid var(--mc-border-soft);
        vertical-align: middle;
      }

      .mc-data-table__table th {
        font-size: var(--mc-text-xs);
        color: var(--mc-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 600;
        user-select: none;
      }

      .mc-data-table__table tbody tr {
        transition: background var(--mc-ease-fast), transform var(--mc-ease-fast);
      }

      .mc-data-table__table tbody tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.015);
      }

      .mc-data-table__table tbody tr:hover {
        background: rgba(0, 212, 255, 0.05);
      }

      .mc-data-table__table th button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: inherit;
        font: inherit;
        background: none;
        border: 0;
        padding: 0;
        cursor: pointer;
      }

      .mc-data-table__sort-indicator {
        font-size: 10px;
        line-height: 1;
        color: var(--card-accent, var(--mc-cyan));
      }

      .mc-data-table__empty,
      .mc-data-table__loading {
        padding: 24px;
        text-align: center;
        color: var(--mc-muted);
      }

      .mc-data-table__skeleton {
        position: relative;
        overflow: hidden;
        height: 12px;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.06);
      }

      .mc-data-table__skeleton::after {
        content: '';
        position: absolute;
        inset: 0;
        transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
        animation: mc-data-table-shimmer 1.4s ease-in-out infinite;
      }

      .mc-data-table__skeleton-row td {
        padding-top: 16px;
        padding-bottom: 16px;
      }

      @keyframes mc-data-table-shimmer {
        100% { transform: translateX(100%); }
      }

      @media (max-width: 768px) {
        .mc-data-table {
          padding: 16px;
        }

        .mc-data-table__table {
          min-width: 680px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function normalizeText(value) {
    if (value == null) return '';
    return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function getCellHtml(column, row) {
    const rawValue = row?.[column.key];
    if (typeof column.render === 'function') {
      return column.render(rawValue, row);
    }
    return rawValue == null || rawValue === '' ? '—' : String(rawValue);
  }

  function getSortableValue(column, row) {
    const rawValue = row?.[column.key];
    if (rawValue == null) return '';
    if (typeof rawValue === 'number') return rawValue;
    if (rawValue instanceof Date) return rawValue.getTime();
    if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
    if (typeof rawValue === 'string') return rawValue.toLowerCase();
    return normalizeText(getCellHtml(column, row));
  }

  function resolveColumns(columns) {
    return Array.isArray(columns) ? columns : [];
  }

  function resolveRows(rows) {
    return Array.isArray(rows) ? rows : [];
  }

  function createDataTable(columns, rows, options = {}) {
    ensureStyles();

    const resolvedColumns = resolveColumns(columns);
    const resolvedRows = resolveRows(rows);
    const mergedOptions = {
      sortable: true,
      filterable: true,
      striped: true,
      ...options,
    };
    const tableId = `mc-data-table-${Math.random().toString(36).slice(2, 10)}`;

    const headerHtml = resolvedColumns.map((column) => `
      <th scope="col">
        ${mergedOptions.sortable ? `<button type="button" data-role="sort" data-key="${column.key}" aria-label="Sort by ${column.label}">
          <span>${column.label}</span>
          <span class="mc-data-table__sort-indicator" data-sort-indicator="${column.key}">↕</span>
        </button>` : `<span>${column.label}</span>`}
      </th>
    `).join('');

    const loadingRows = resolvedRows.length === 0
      ? Array.from({ length: 5 }).map(() => `
          <tr class="mc-data-table__skeleton-row">
            ${resolvedColumns.map(() => '<td><div class="mc-data-table__skeleton"></div></td>').join('')}
          </tr>
        `).join('')
      : resolvedRows.map((row, index) => {
          const rowText = normalizeText(resolvedColumns.map((column) => {
            const rendered = getCellHtml(column, row);
            return typeof rendered === 'string' ? rendered : String(rendered);
          }).join(' '));

          const rowKey = row?.__rowKey ?? row?.id ?? row?.key ?? index;

          return `
            <tr data-row-index="${index}" data-row-key="${String(rowKey)}" data-row-text="${rowText}">
              ${resolvedColumns.map((column) => `<td>${getCellHtml(column, row)}</td>`).join('')}
            </tr>
          `;
        }).join('');

    return `
      <div
        id="${tableId}"
        class="mc-data-table"
        data-sortable="${mergedOptions.sortable ? 'true' : 'false'}"
        data-filterable="${mergedOptions.filterable ? 'true' : 'false'}"
        data-striped="${mergedOptions.striped ? 'true' : 'false'}"
      >
        <div class="mc-data-table__toolbar">
          ${mergedOptions.filterable ? `
            <div class="mc-data-table__search">
              <i data-lucide="search" class="mc-data-table__search-icon"></i>
              <input
                type="text"
                value=""
                placeholder="Filter rows..."
                data-role="filter"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          ` : '<div></div>'}
          <div class="mc-data-table__meta" data-role="meta">${resolvedRows.length} rows</div>
        </div>

        <div class="mc-data-table__wrap">
          <table class="mc-data-table__table">
            <thead>
              <tr>${headerHtml}</tr>
            </thead>
            <tbody data-role="tbody">
              ${loadingRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function mountDataTable(containerId, html) {
    ensureStyles();

    const container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;

    if (!container) return null;

    container.innerHTML = html;

    const root = container.firstElementChild;
    if (!root) return null;

    const sortable = root.dataset.sortable === 'true';
    const filterable = root.dataset.filterable === 'true';
    const tbody = root.querySelector('[data-role="tbody"]');
    const meta = root.querySelector('[data-role="meta"]');
    const filterInput = root.querySelector('[data-role="filter"]');
    const rows = Array.from(tbody ? tbody.querySelectorAll('tr[data-row-index]') : []);
    const columns = Array.from(root.querySelectorAll('th [data-role="sort"]'));

    const state = {
      sortKey: null,
      sortDirection: 'asc',
      filterText: '',
      columns: Array.from(root.querySelectorAll('thead th')).map((th, index) => ({
        key: columns[index]?.dataset.key || String(index),
      })),
      rows,
    };

    function updateSortIndicators() {
      root.querySelectorAll('[data-sort-indicator]').forEach((indicator) => {
        const key = indicator.dataset.sortIndicator;
        indicator.textContent = key === state.sortKey ? (state.sortDirection === 'asc' ? '↑' : '↓') : '↕';
      });
    }

    function applyState() {
      if (!tbody) return;

      let nextRows = [...state.rows];

      if (filterable && state.filterText) {
        const query = normalizeText(state.filterText);
        nextRows = nextRows.filter((row) => normalizeText(row.dataset.rowText).includes(query));
      }

      if (sortable && state.sortKey) {
        nextRows.sort((leftRow, rightRow) => {
          const leftCell = leftRow.querySelector(`td:nth-child(${getColumnIndex(state.sortKey, root)})`);
          const rightCell = rightRow.querySelector(`td:nth-child(${getColumnIndex(state.sortKey, root)})`);
          const leftValue = normalizeText(leftCell ? leftCell.textContent : '');
          const rightValue = normalizeText(rightCell ? rightCell.textContent : '');

          const leftNumber = Number(leftValue);
          const rightNumber = Number(rightValue);
          let compare = 0;

          if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && leftValue !== '' && rightValue !== '') {
            compare = leftNumber - rightNumber;
          } else {
            compare = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
          }

          return state.sortDirection === 'asc' ? compare : -compare;
        });
      }

      if (nextRows.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="${root.querySelectorAll('thead th').length}">
              <div class="mc-data-table__empty">No matching records found.</div>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = nextRows.map((row) => row.outerHTML).join('');
      }

      if (meta) {
        meta.textContent = `${nextRows.length} row${nextRows.length === 1 ? '' : 's'}`;
      }

      updateSortIndicators();
      if (window.lucide) lucide.createIcons();
    }

    function getColumnIndex(key, rootEl) {
      const buttons = Array.from(rootEl.querySelectorAll('th [data-role="sort"]'));
      const index = buttons.findIndex((button) => button.dataset.key === key);
      return index >= 0 ? index + 1 : 1;
    }

    if (sortable) {
      root.querySelectorAll('th [data-role="sort"]').forEach((button) => {
        button.addEventListener('click', () => {
          const key = button.dataset.key;
          if (state.sortKey === key) {
            state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            state.sortDirection = 'asc';
          }
          applyState();
        });
      });
    }

    if (filterable && filterInput) {
      filterInput.addEventListener('input', (event) => {
        state.filterText = event.target.value || '';
        applyState();
      });
    }

    if (window.MCState && typeof window.MCState.subscribe === 'function') {
      const unsubscribe = window.MCState.subscribe('currentModule', () => applyState());
      instances.set(containerId, { unsubscribe, root });
    }

    applyState();
    return root;
  }

  function destroyDataTable(containerId) {
    const instance = instances.get(containerId);
    if (instance?.unsubscribe) instance.unsubscribe();
    instances.delete(containerId);
  }

  return {
    createDataTable,
    mountDataTable,
    destroyDataTable,
  };
})();

window.createDataTable = function createDataTable(columns, rows, options) {
  return window.MCDataTable.createDataTable(columns, rows, options);
};

window.mountDataTable = function mountDataTable(containerId, html) {
  return window.MCDataTable.mountDataTable(containerId, html);
};