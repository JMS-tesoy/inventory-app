/**
 * FILE: src/renderer/views/audit-log.js
 * PURPOSE: Dedicated movement audit log page (detached from RCM).
 */

window.AuditLogView = (() => {
  const container = document.getElementById('view-audit-log');
  const PAGE_SIZE = 25;

  let allRows = [];
  let filteredRows = [];
  let page = 1;

  function _today() {
    return new Date().toISOString().slice(0, 10);
  }

  function render() {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Audit Log</h1>
          <p>Track stock movement history with filters and search.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Filters</div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Date From</label>
            <input type="date" id="audit-from">
          </div>
          <div class="form-group">
            <label>Date To</label>
            <input type="date" id="audit-to" value="${_today()}">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select id="audit-type">
              <option value="">All</option>
              <option value="ADD">ADD</option>
              <option value="LESS">LESS</option>
            </select>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <input type="text" id="audit-search" placeholder="Search stock, employee, department…" style="max-width:420px;">
          <button class="btn btn-secondary btn-sm" id="audit-clear">Clear</button>
          <span id="audit-count" style="font-size:12px;color:var(--text-dim);"></span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Movement History</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Employee</th>
              <th>Department</th>
              <th>Stock</th>
              <th>Qty</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody id="audit-tbody"></tbody>
        </table>
        <div class="pagination" id="audit-pagination" style="display:none;"></div>
      </div>
    `;

    wireEvents();
  }

  function wireEvents() {
    ['audit-from', 'audit-to', 'audit-type', 'audit-search'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', applyFilters);
      el.addEventListener('change', applyFilters);
    });

    document.getElementById('audit-clear')?.addEventListener('click', () => {
      const from = document.getElementById('audit-from');
      const to = document.getElementById('audit-to');
      const type = document.getElementById('audit-type');
      const search = document.getElementById('audit-search');
      if (from) from.value = '';
      if (to) to.value = _today();
      if (type) type.value = '';
      if (search) search.value = '';
      applyFilters();
    });
  }

  function applyFilters() {
    const from = document.getElementById('audit-from')?.value || '';
    const to = document.getElementById('audit-to')?.value || '';
    const type = document.getElementById('audit-type')?.value || '';
    const q = (document.getElementById('audit-search')?.value || '').toLowerCase().trim();

    filteredRows = allRows.filter(r => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (type && r.type !== type) return false;
      if (!q) return true;

      return [r.stock_name, r.employee_name, r.department_name, r.note, r.type, r.date]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });

    page = 1;
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('audit-tbody');
    const count = document.getElementById('audit-count');
    const pagination = document.getElementById('audit-pagination');
    if (!tbody || !count || !pagination) return;

    count.textContent = `${filteredRows.length} record(s)`;

    if (filteredRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No records found.</td></tr>';
      pagination.style.display = 'none';
      return;
    }

    const pages = Math.ceil(filteredRows.length / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const rows = filteredRows.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td><span class="history-type ${r.type}">${r.type}</span></td>
        <td>${r.employee_name || '—'}</td>
        <td>${r.department_name || '—'}</td>
        <td>${r.stock_name || '—'}</td>
        <td>${r.qty} ${r.uom || ''}</td>
        <td>${r.note || '—'}</td>
      </tr>
    `).join('');

    if (pages <= 1) {
      pagination.style.display = 'none';
      return;
    }

    pagination.style.display = 'flex';
    pagination.innerHTML = `
      <button class="btn btn-secondary btn-xs" ${page <= 1 ? 'disabled' : ''} id="audit-prev">‹</button>
      <span class="page-info">Page ${page} / ${pages}</span>
      <button class="btn btn-secondary btn-xs" ${page >= pages ? 'disabled' : ''} id="audit-next">›</button>
    `;

    document.getElementById('audit-prev')?.addEventListener('click', () => {
      page = Math.max(1, page - 1);
      renderTable();
    });
    document.getElementById('audit-next')?.addEventListener('click', () => {
      page = Math.min(pages, page + 1);
      renderTable();
    });
  }

  return {
    async init() {
      await App.refreshLookups();
      allRows = await api.invoke('movements:history', {});
      filteredRows = [...allRows];
      render();
      renderTable();
    },
  };
})();
