/**
 * FILE: src/renderer/views/settings.js
 * PURPOSE: "Settings" view with tabbed sections:
 *   1. General — company info, logo upload, signatories
 *   2. Departments — inline CRUD table
 *   3. Employees — inline CRUD with department FK
 *   4. Stocks — inline CRUD
 *   5. Data Tools — backup, restore, open folder
 * CONNECTED TO: app.js (App, toast)
 *               main/main.js IPC: settings:*, departments:*, employees:*, stocks:*, data:*
 *               util/id.js (shortId — generated in renderer via UUID v4 prefix)
 */

window.SettingsView = (() => {
  const container = document.getElementById('view-settings');
  let activeTab = 'general';

  /* ── Shell ────────────────────────────────────────────────────────────── */
  function renderShell() {
    container.innerHTML = `
      <div class="page-header">
        <div><h1>Settings</h1><p>Manage company info, stock catalog, and data tools.</p></div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${activeTab==='general'?'active':''}" data-tab="general">General</button>
        <button class="tab-btn ${activeTab==='departments'?'active':''}" data-tab="departments">Departments</button>
        <button class="tab-btn ${activeTab==='employees'?'active':''}" data-tab="employees">Employees</button>
        <button class="tab-btn ${activeTab==='stocks'?'active':''}" data-tab="stocks">Stocks</button>
        <button class="tab-btn ${activeTab==='data'?'active':''}" data-tab="data">Data Tools</button>
      </div>
      <div id="tab-body"></div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTab();
      });
    });

    renderTab();
  }

  function renderTab() {
    const body = document.getElementById('tab-body');
    if (!body) return;
    switch (activeTab) {
      case 'general':     return renderGeneral(body);
      case 'departments': return renderDepartments(body);
      case 'employees':   return renderEmployees(body);
      case 'stocks':      return renderStocks(body);
      case 'data':        return renderDataTools(body);
    }
  }

  /* ── Tab: General ─────────────────────────────────────────────────────── */
  async function renderGeneral(body) {
    const s = await api.invoke('settings:get');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">

        <div class="card">
          <div class="card-title">Company Details</div>
          <div class="form-group"><label>Company Name</label>
            <input type="text" id="set-name" value="${_esc(s.company_name)}">
          </div>
          <div class="form-group" style="margin-top:12px;"><label>Address</label>
            <input type="text" id="set-addr" value="${_esc(s.company_address)}">
          </div>
          <div class="form-group" style="margin-top:12px;"><label>Phone</label>
            <input type="text" id="set-phone" value="${_esc(s.company_phone)}">
          </div>
          <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
            <button class="btn btn-secondary btn-sm" id="logo-btn">Upload Logo</button>
            <span id="logo-status" style="font-size:12px;color:var(--text-muted);">
              ${s.logo_path ? 'Logo set' : 'No logo uploaded'}
            </span>
          </div>
          <div style="margin-top:16px;">
            <button class="btn btn-primary" id="save-company-btn">Save Company Info</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Signatories</div>
          ${_sigRow('Prepared By', 'sig-prep-name', 'sig-prep-title', s.prepared_by_name, s.prepared_by_title)}
          ${_sigRow('Checked By',  'sig-chk-name',  'sig-chk-title',  s.checked_by_name,  s.checked_by_title,  'margin-top:14px;')}
          ${_sigRow('Approved By', 'sig-apr-name',  'sig-apr-title',  s.approved_by_name, s.approved_by_title, 'margin-top:14px;')}
          <div style="margin-top:16px;">
            <button class="btn btn-primary" id="save-sig-btn">Save Signatories</button>
          </div>
        </div>

      </div>
    `;

    document.getElementById('logo-btn')?.addEventListener('click', async () => {
      const result = await api.invoke('settings:uploadLogo');
      if (result.ok) {
        toast('Logo uploaded successfully.', 'success');
        document.getElementById('logo-status').textContent = 'Logo updated ✓';
      } else if (result.error !== 'Cancelled') {
        toast(result.error || 'Logo upload failed.', 'error');
      }
    });

    document.getElementById('save-company-btn')?.addEventListener('click', async () => {
      const current = await api.invoke('settings:get');
      const updated = {
        ...current,
        company_name:    document.getElementById('set-name').value,
        company_address: document.getElementById('set-addr').value,
        company_phone:   document.getElementById('set-phone').value,
      };
      await api.invoke('settings:save', updated);
      toast('Company info saved.', 'success');
    });

    document.getElementById('save-sig-btn')?.addEventListener('click', async () => {
      const current = await api.invoke('settings:get');
      const updated = {
        ...current,
        prepared_by_name:  document.getElementById('sig-prep-name').value,
        prepared_by_title: document.getElementById('sig-prep-title').value,
        checked_by_name:   document.getElementById('sig-chk-name').value,
        checked_by_title:  document.getElementById('sig-chk-title').value,
        approved_by_name:  document.getElementById('sig-apr-name').value,
        approved_by_title: document.getElementById('sig-apr-title').value,
      };
      await api.invoke('settings:save', updated);
      toast('Signatories saved.', 'success');
    });
  }

  function _sigRow(label, nameId, titleId, name='', title='', style='') {
    return `
      <div style="${style}">
        <div style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
        <div class="form-row">
          <div class="form-group"><label>Name</label><input type="text" id="${nameId}" value="${_esc(name)}"></div>
          <div class="form-group"><label>Title / Designation</label><input type="text" id="${titleId}" value="${_esc(title)}"></div>
        </div>
      </div>
    `;
  }

  /* ── Tab: Departments ─────────────────────────────────────────────────── */
  async function renderDepartments(body) {
    let rows = await api.invoke('departments:get');

    body.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
          Departments
          <button class="btn btn-primary btn-sm" id="dept-add-btn">+ Add Department</button>
        </div>
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Active</th><th style="width:100px">Actions</th></tr></thead>
          <tbody id="dept-tbody"></tbody>
        </table>
      </div>
    `;

    function renderRows() {
      document.getElementById('dept-tbody').innerHTML = rows.map((r, i) => `
        <tr>
          <td><code style="font-size:11px;color:var(--text-muted);">${r.department_id}</code></td>
          <td><input type="text" value="${_esc(r.department_name)}" data-row="${i}" data-field="department_name"></td>
          <td>
            <select data-row="${i}" data-field="is_active">
              <option value="true"  ${r.is_active ? 'selected' : ''}>Active</option>
              <option value="false" ${!r.is_active ? 'selected' : ''}>Inactive</option>
            </select>
          </td>
          <td><button class="btn btn-secondary btn-icon btn-xs del-row trash-btn" data-row="${i}" title="Delete row"><span class="trash-icon">🗑︎</span></button></td>
        </tr>
      `).join('');

      _wireDataTable('dept-tbody', rows, () => saveDepts(rows), {
        redraw: renderRows,
      });
    }

    async function saveDepts(r) {
      await api.invoke('departments:save', r);
      await App.refreshLookups();
      toast('Departments saved.', 'success');
    }

    document.getElementById('dept-add-btn')?.addEventListener('click', () => {
      rows.push({ department_id: _newShortId('D'), department_name: 'New Department', is_active: true });
      renderRows();
    });

    renderRows();
  }

  /* ── Tab: Employees ───────────────────────────────────────────────────── */
  async function renderEmployees(body) {
    let rows = await api.invoke('employees:get');
    const depts = App.departments.filter(d => d.is_active);
    const taskRows = await api.invoke('tasks:get');
    const taskOptions = Array.from(new Set(
      (Array.isArray(taskRows) ? taskRows : [])
        .filter(t => t.is_active !== false)
        .map(t => String(t.task_name || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    body.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Employees</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-secondary btn-sm" id="emp-add-task-btn">+ Add Task</button>
            <button class="btn btn-primary btn-sm" id="emp-add-btn">+ Add Employee</button>
          </div>
        </div>
        <table class="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Task</th><th>Active</th><th style="width:190px">Actions</th></tr></thead>
          <tbody id="emp-tbody"></tbody>
        </table>
      </div>
    `;

    const _taskItems = () => taskOptions.map(t => ({ task_value: t, task_label: t }));

    function renderRows() {
      document.getElementById('emp-tbody').innerHTML = rows.map((r, i) => `
        <tr>
          <td><code style="font-size:11px;color:var(--text-muted);">${r.employee_id}</code></td>
          <td><input type="text" value="${_esc(r.employee_name)}" data-row="${i}" data-field="employee_name"></td>
          <td>
            <select data-row="${i}" data-field="department_id">
              ${buildOptions(depts, 'department_id', 'department_name', r.department_id)}
            </select>
          </td>
          <td>
            <select data-row="${i}" data-field="task">
              ${buildOptions(_taskItems(), 'task_value', 'task_label', r.task || '')}
            </select>
          </td>
          <td>
            <select data-row="${i}" data-field="is_active">
              <option value="true"  ${r.is_active ? 'selected' : ''}>Active</option>
              <option value="false" ${!r.is_active ? 'selected' : ''}>Inactive</option>
            </select>
          </td>
          <td style="display:flex;gap:6px;align-items:center;">
            <button class="btn btn-secondary btn-xs transfer-row" data-row="${i}" title="Transfer employee">Transfer</button>
            <button class="btn btn-warning btn-xs del-row" data-row="${i}" title="Remove employee">Remove</button>
          </td>
        </tr>
      `).join('');

      _wireDataTable('emp-tbody', rows, () => saveEmps(rows), {
        redraw: renderRows,
      });
    }

    async function saveEmps(r) {
      await api.invoke('employees:save', r);
      await App.refreshLookups();
      toast('Employees saved.', 'success');
    }

    async function persistTaskOptions() {
      const rowsToSave = taskOptions.map(taskName => ({ task_name: taskName, is_active: true }));
      await api.invoke('tasks:save', rowsToSave);
    }

    document.getElementById('emp-add-btn')?.addEventListener('click', () => {
      rows.push({
        employee_id: _newShortId('E'),
        employee_name: 'New Employee',
        department_id: depts[0]?.department_id || '',
        task: taskOptions[0] || '',
        is_active: true,
      });
      renderRows();
    });

    document.getElementById('emp-add-task-btn')?.addEventListener('click', async () => {
      const taskName = String(await _promptText('Add Task', 'Enter task name:') || '').trim();
      if (!taskName) return;

      const exists = taskOptions.some(t => t.toLowerCase() === taskName.toLowerCase());
      if (exists) {
        toast('Task already exists.', 'info');
        return;
      }

      taskOptions.push(taskName);
      taskOptions.sort((a, b) => a.localeCompare(b));
      renderRows();
      const saved = await persistTaskOptions();
      if (saved?.ok === false) {
        toast(saved.error || 'Failed to save task list.', 'error');
        return;
      }
      toast('Task added to selection list.', 'success');
    });

    renderRows();
  }

  /* ── Tab: Stocks ──────────────────────────────────────────────────────── */
  async function renderStocks(body) {
    let rows = await api.invoke('stocks:status');
    let lowOnly = false;
    const filters = {
      search: '',
      category: '',
      supplier: '',
      status: 'all',
    };

    body.innerHTML = `
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Stock Catalog</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-secondary btn-sm" id="stock-filter-low">Low Stock Only: Off</button>
            <button class="btn btn-primary btn-sm" id="stock-add-btn">+add New Stock</button>
          </div>
        </div>

        <div class="form-row-4" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Search</label>
            <input type="text" id="stock-filter-search" placeholder="Stock, ID, barcode, category, supplier...">
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="stock-filter-category"></select>
          </div>
          <div class="form-group">
            <label>Supplier</label>
            <select id="stock-filter-supplier"></select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="stock-filter-status">
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="low">Low Stock</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <span id="stock-filter-count" style="font-size:12px;color:var(--text-muted);"></span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-primary btn-sm" id="stock-save-btn">Save</button>
            <button class="btn btn-secondary btn-sm" id="stock-filter-clear">Clear Filters</button>
          </div>
        </div>

        <table class="data-table">
          <thead><tr><th>ID</th><th>Stock Name</th><th>Barcode</th><th>Category</th><th>Supplier</th><th>UOM</th><th>Current</th><th>Min</th><th>Active</th><th style="width:100px">Actions</th></tr></thead>
          <tbody id="stock-tbody"></tbody>
        </table>
      </div>
    `;

    const categoryFilterEl = document.getElementById('stock-filter-category');
    const supplierFilterEl = document.getElementById('stock-filter-supplier');
    const statusFilterEl = document.getElementById('stock-filter-status');
    const searchFilterEl = document.getElementById('stock-filter-search');

    function _distinct(field) {
      return Array.from(new Set(
        rows
          .map(r => String(r[field] || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));
    }

    function _renderSelectOptions(selectEl, items, selected, placeholder) {
      if (!selectEl) return;
      const opts = [`<option value="">${placeholder}</option>`]
        .concat(items.map(item => `<option value="${_esc(item)}" ${item === selected ? 'selected' : ''}>${_esc(item)}</option>`));
      selectEl.innerHTML = opts.join('');
    }

    function _syncFilterOptions() {
      const categories = _distinct('category');
      const suppliers = _distinct('supplier');

      if (filters.category && !categories.includes(filters.category)) filters.category = '';
      if (filters.supplier && !suppliers.includes(filters.supplier)) filters.supplier = '';

      _renderSelectOptions(categoryFilterEl, categories, filters.category, 'All categories');
      _renderSelectOptions(supplierFilterEl, suppliers, filters.supplier, 'All suppliers');
      if (statusFilterEl) statusFilterEl.value = filters.status;
      if (searchFilterEl) searchFilterEl.value = filters.search;
    }

    function _getVisibleRows() {
      const query = filters.search.toLowerCase();

      return rows
        .map((r, idx) => ({ ...r, _idx: idx }))
        .filter(r => {
          if (lowOnly && !r.is_low_stock) return false;
          if (filters.category && String(r.category || '').trim() !== filters.category) return false;
          if (filters.supplier && String(r.supplier || '').trim() !== filters.supplier) return false;

          if (filters.status === 'active' && !r.is_active) return false;
          if (filters.status === 'inactive' && r.is_active) return false;
          if (filters.status === 'low' && !r.is_low_stock) return false;

          if (!query) return true;

          return [
            r.stock_id,
            r.stock_name,
            r.barcode,
            r.category,
            r.supplier,
            r.uom,
          ].join(' ').toLowerCase().includes(query);
        });
    }

    function renderRows() {
      const visibleRows = _getVisibleRows();
      const countEl = document.getElementById('stock-filter-count');
      if (countEl) countEl.textContent = `${visibleRows.length} of ${rows.length} stock`;

      if (visibleRows.length === 0) {
        document.getElementById('stock-tbody').innerHTML = '<tr><td colspan="10" class="empty">No stocks match your filters.</td></tr>';
        return;
      }

      document.getElementById('stock-tbody').innerHTML = visibleRows.map((r, i) => `
        <tr>
          <td><code style="font-size:11px;color:var(--text-muted);">${r.stock_id}</code></td>
          <td><input type="text" value="${_esc(r.stock_name)}" data-row="${r._idx}" data-field="stock_name"></td>
          <td><input type="text" value="${_esc(r.barcode || '')}" data-row="${r._idx}" data-field="barcode" placeholder="Scan or type"></td>
          <td><input type="text" value="${_esc(r.category || '')}" data-row="${r._idx}" data-field="category" placeholder="Category"></td>
          <td><input type="text" value="${_esc(r.supplier || '')}" data-row="${r._idx}" data-field="supplier" placeholder="Supplier"></td>
          <td><input type="text" value="${_esc(r.uom)}" data-row="${r._idx}" data-field="uom" style="width:80px;"></td>
          <td><span class="balance-pill ${r.is_low_stock ? 'low-stock-current' : ''}">${r.current_qty}</span></td>
          <td><input type="number" min="0" step="1" value="${r.min_stock_threshold || 0}" data-row="${r._idx}" data-field="min_stock_threshold" style="width:90px;"></td>
          <td>
            <select data-row="${r._idx}" data-field="is_active">
              <option value="true"  ${r.is_active ? 'selected' : ''}>Active</option>
              <option value="false" ${!r.is_active ? 'selected' : ''}>Inactive</option>
            </select>
          </td>
          <td><button class="btn btn-secondary btn-icon btn-xs del-row trash-btn" data-row="${r._idx}" title="Delete row"><span class="trash-icon">🗑︎</span></button></td>
        </tr>
      `).join('');
    }

    async function saveStocks(r) {
      await api.invoke('stocks:save', r);
      await App.refreshLookups();
      const latestRows = await api.invoke('stocks:status');
      rows.splice(0, rows.length, ...latestRows);
      _syncFilterOptions();
      toast('Stocks saved.', 'success');
      renderRows();
    }

    _wireDataTable('stock-tbody', rows, () => saveStocks(rows), {
      autoSave: false,
      onRowsChanged: () => {
        _syncFilterOptions();
        renderRows();
      },
    });

    document.getElementById('stock-add-btn')?.addEventListener('click', () => {
      rows.push({
        stock_id: _newShortId('S'),
        stock_name: 'New Stock',
        barcode: '',
        category: '',
        supplier: '',
        uom: 'pcs',
        min_stock_threshold: 0,
        current_qty: 0,
        is_low_stock: true,
        is_active: true,
      });
      _syncFilterOptions();
      renderRows();
    });

    document.getElementById('stock-filter-low')?.addEventListener('click', () => {
      lowOnly = !lowOnly;
      const btn = document.getElementById('stock-filter-low');
      if (btn) btn.textContent = `Low Stock Only: ${lowOnly ? 'On' : 'Off'}`;
      renderRows();
    });

    searchFilterEl?.addEventListener('input', () => {
      filters.search = String(searchFilterEl.value || '').trim();
      renderRows();
    });

    categoryFilterEl?.addEventListener('change', () => {
      filters.category = String(categoryFilterEl.value || '');
      renderRows();
    });

    supplierFilterEl?.addEventListener('change', () => {
      filters.supplier = String(supplierFilterEl.value || '');
      renderRows();
    });

    statusFilterEl?.addEventListener('change', () => {
      filters.status = String(statusFilterEl.value || 'all');
      renderRows();
    });

    document.getElementById('stock-filter-clear')?.addEventListener('click', () => {
      filters.search = '';
      filters.category = '';
      filters.supplier = '';
      filters.status = 'all';
      _syncFilterOptions();
      renderRows();
    });

    document.getElementById('stock-save-btn')?.addEventListener('click', async () => {
      await saveStocks(rows);
    });

    _syncFilterOptions();

    renderRows();
  }

  /* ── Tab: Data Tools ──────────────────────────────────────────────────── */
  async function renderDataTools(body) {
    const s = await api.invoke('settings:get');
    const autoEnabled = _toBool(s.auto_backup_enabled, true);
    const intervalHours = _toInt(s.auto_backup_interval_hours, 24);
    const keepLast = _toInt(s.auto_backup_keep_last, 10);
    const lastRun = s.auto_backup_last_run ? new Date(s.auto_backup_last_run).toLocaleString() : 'Never';
    const lockEnabled = _toBool(s.app_lock_enabled, false);
    const uiTheme = String(s.ui_theme || 'dark').trim().toLowerCase() === 'light' ? 'light' : 'dark';
    const uiFontSize = String(s.ui_font_size || 'normal').trim().toLowerCase() === 'large' ? 'large' : 'normal';

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card">
          <div class="card-title">Backup & Restore</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
            Create a timestamped backup of inventory.xlsx, or restore from a previous backup.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-backup">Create Backup</button>
            <button class="btn btn-secondary" id="btn-restore">Restore from Backup…</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Auto Backup</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Automatically create backups in the background while the app is running.
          </p>
          <div class="form-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="auto-backup-enabled" ${autoEnabled ? 'checked' : ''}>
              Enable auto backup
            </label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Interval (hours)</label>
              <input type="number" id="auto-backup-interval" min="1" max="8760" value="${intervalHours}">
            </div>
            <div class="form-group">
              <label>Keep last backups</label>
              <input type="number" id="auto-backup-keep" min="1" max="500" value="${keepLast}">
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px;">Last auto backup: ${_esc(lastRun)}</p>
          <div style="margin-top:12px;">
            <button class="btn btn-primary" id="btn-save-auto-backup">Save Auto Backup Settings</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Import / Export CSV</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Export or import a CSV dataset. Import replaces the selected dataset and creates a backup first.
          </p>
          <div class="form-group" style="margin-bottom:12px;">
            <label>Dataset</label>
            <select id="csv-entity">
              <option value="departments">Departments</option>
              <option value="employees">Employees</option>
              <option value="stocks" selected>Stocks</option>
              <option value="movements">Movements</option>
            </select>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary" id="btn-csv-export">Export CSV</button>
            <button class="btn btn-primary" id="btn-csv-import">Import CSV</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Date Lock</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Require today\'s date as password at startup (auto changes every day).
          </p>
          <div class="form-group" style="margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="app-lock-enabled" ${lockEnabled ? 'checked' : ''}>
              Enable date lock
            </label>
          </div>
          <div style="margin-top:12px;">
            <button class="btn btn-primary" id="btn-save-app-lock">Save Date Lock</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Appearance</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
            Customize the app look for comfort and readability.
          </p>
          <div class="form-row">
            <div class="form-group">
              <label>Theme</label>
              <select id="appearance-theme">
                <option value="dark" ${uiTheme === 'dark' ? 'selected' : ''}>Dark</option>
                <option value="light" ${uiTheme === 'light' ? 'selected' : ''}>Light</option>
              </select>
            </div>
            <div class="form-group">
              <label>Font Size</label>
              <select id="appearance-font-size">
                <option value="normal" ${uiFontSize === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="large" ${uiFontSize === 'large' ? 'selected' : ''}>Large</option>
              </select>
            </div>
          </div>
          <div style="margin-top:12px;">
            <button class="btn btn-primary" id="btn-save-appearance">Save Appearance</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">File Access</div>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
            Open the data folder in your system file manager.
          </p>
          <button class="btn btn-secondary" id="btn-open-folder">Open Data Folder</button>
        </div>
      </div>
    `;

    document.getElementById('btn-backup')?.addEventListener('click', async () => {
      const r = await api.invoke('data:backup');
      if (r.ok) {
        const msg = r.deleted > 0
          ? `Backup saved. Removed ${r.deleted} old backup(s).`
          : `Backup saved to: ${r.path}`;
        toast(msg, 'success');
      } else {
        toast(r.error, 'error');
      }
    });

    document.getElementById('btn-save-auto-backup')?.addEventListener('click', async () => {
      const current = await api.invoke('settings:get');
      const updated = {
        ...current,
        auto_backup_enabled: document.getElementById('auto-backup-enabled').checked,
        auto_backup_interval_hours: Number(document.getElementById('auto-backup-interval').value) || 24,
        auto_backup_keep_last: Number(document.getElementById('auto-backup-keep').value) || 10,
      };

      const result = await api.invoke('settings:save', updated);
      if (result.ok) {
        toast('Auto backup settings saved.', 'success');
      } else {
        toast(result.error || 'Failed to save auto backup settings.', 'error');
      }
    });

    document.getElementById('btn-restore')?.addEventListener('click', async () => {
      const confirmed = await _confirmAction(
        'Restore Backup',
        'Restoring will replace your current inventory data. Continue?'
      );
      if (!confirmed) return;

      const r = await api.invoke('data:restore');
      r.ok ? toast('Backup restored successfully. Please restart.', 'success') : toast(r.error || 'Cancelled.', 'info');
    });

    document.getElementById('btn-csv-export')?.addEventListener('click', async () => {
      const entity = document.getElementById('csv-entity')?.value || 'stocks';
      const r = await api.invoke('data:exportCSV', { entity });
      if (r.ok) {
        toast(`${r.entity} exported (${r.count} row(s)).`, 'success');
      } else if (r.error !== 'Cancelled') {
        toast(r.error || 'Export failed.', 'error');
      }
    });

    document.getElementById('btn-csv-import')?.addEventListener('click', async () => {
      const entity = document.getElementById('csv-entity')?.value || 'stocks';
      const confirmed = await _confirmAction(
        'Import CSV',
        `Import will replace current ${entity} data. A backup will be created first. Continue?`
      );
      if (!confirmed) return;

      const r = await api.invoke('data:importCSV', { entity });
      if (r.ok) {
        toast(`${r.entity} imported (${r.imported} row(s)).`, 'success');
        await App.refreshLookups();
      } else if (r.error !== 'Cancelled') {
        toast(r.error || 'Import failed.', 'error');
      }
    });

    document.getElementById('btn-save-app-lock')?.addEventListener('click', async () => {
      const current = await api.invoke('settings:get');
      const enabled = document.getElementById('app-lock-enabled').checked;

      const updated = {
        ...current,
        app_lock_enabled: enabled,
      };

      const result = await api.invoke('settings:save', updated);
      if (result.ok) {
        toast('Date lock settings saved.', 'success');
      } else {
        toast(result.error || 'Failed to save date lock settings.', 'error');
      }
    });

    document.getElementById('btn-save-appearance')?.addEventListener('click', async () => {
      const current = await api.invoke('settings:get');
      const theme = String(document.getElementById('appearance-theme')?.value || 'dark').trim().toLowerCase();
      const fontSize = String(document.getElementById('appearance-font-size')?.value || 'normal').trim().toLowerCase();

      const updated = {
        ...current,
        ui_theme: theme === 'light' ? 'light' : 'dark',
        ui_font_size: fontSize === 'large' ? 'large' : 'normal',
      };

      const result = await api.invoke('settings:save', updated);
      if (result.ok) {
        if (typeof window.applyUiPreferences === 'function') {
          window.applyUiPreferences(updated);
        }
        toast('Appearance settings saved.', 'success');
      } else {
        toast(result.error || 'Failed to save appearance settings.', 'error');
      }
    });

    document.getElementById('btn-open-folder')?.addEventListener('click', async () => {
      await api.invoke('data:openFolder');
    });
  }

  /* ── Shared CRUD table helper ─────────────────────────────────────────── */
  function _wireDataTable(tbodyId, rows, onSave, options = {}) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const autoSave = options.autoSave !== false;
    const onRowsChanged = typeof options.onRowsChanged === 'function' ? options.onRowsChanged : null;
    const redraw = typeof options.redraw === 'function' ? options.redraw : null;

    // Listen for inline edits
    tbody.addEventListener('change', e => {
      const row = parseInt(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (isNaN(row) || !field) return;
      let val = e.target.value;
      if (val === 'true')  val = true;
      if (val === 'false') val = false;
      rows[row][field] = val;
      if (autoSave) {
        onSave();
      } else if (onRowsChanged) {
        onRowsChanged();
      }
    });
    tbody.addEventListener('input', e => {
      const row = parseInt(e.target.dataset.row);
      const field = e.target.dataset.field;
      if (isNaN(row) || !field || e.target.tagName !== 'INPUT') return;
      rows[row][field] = e.target.value;
      if (autoSave) {
        _debounce(tbodyId, onSave);
      }
    });

    // Delete rows
    tbody.addEventListener('click', e => {
      const transferBtn = e.target.closest('.transfer-row');
      if (transferBtn) {
        const row = parseInt(transferBtn.dataset.row);
        if (isNaN(row)) return;
        const deptSelect = tbody.querySelector(`select[data-row="${row}"][data-field="department_id"]`);
        if (deptSelect) {
          deptSelect.focus();
          toast('Select a new department to transfer employee.', 'info');
        }
        return;
      }

      const btn = e.target.closest('.del-row');
      if (!btn) return;
      const row = parseInt(btn.dataset.row);
      if (isNaN(row) || row < 0 || row >= rows.length) return;
      rows.splice(row, 1);
      if (redraw) redraw();
      if (autoSave) {
        onSave();
      } else if (onRowsChanged) {
        onRowsChanged();
      }
    });
  }

  /* ── Utilities ────────────────────────────────────────────────────────── */
  const _debounceTimers = {};
  function _debounce(key, fn, delay = 250) {
    clearTimeout(_debounceTimers[key]);
    _debounceTimers[key] = setTimeout(fn, delay);
  }

  function _esc(s = '') {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _newShortId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function _toBool(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
    }
    return fallback;
  }

  function _toInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.round(n));
  }

  function _confirmAction(title, message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:460px;">
          <h2>${_esc(title)}</h2>
          <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">${_esc(message)}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="confirm-no">Cancel</button>
            <button class="btn btn-danger" id="confirm-yes">Restore</button>
          </div>
        </div>
      `;

      const close = (value) => {
        overlay.remove();
        resolve(value);
      };

      overlay.querySelector('#confirm-no')?.addEventListener('click', () => close(false));
      overlay.querySelector('#confirm-yes')?.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      document.body.appendChild(overlay);
    });
  }

  function _promptText(title, message, initialValue = '') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:460px;">
          <h2>${_esc(title)}</h2>
          <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">${_esc(message)}</p>
          <div class="form-group" style="margin:10px 0 0;">
            <input type="text" id="prompt-text-value" value="${_esc(initialValue)}" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="prompt-text-cancel">Cancel</button>
            <button class="btn btn-primary" id="prompt-text-ok">Add</button>
          </div>
        </div>
      `;

      const close = (value) => {
        overlay.remove();
        resolve(value);

      const input = overlay.querySelector('#prompt-text-value');
      overlay.querySelector('#prompt-text-cancel')?.addEventListener('click', () => close(''));
      overlay.querySelector('#prompt-text-ok')?.addEventListener('click', () => close(input?.value || ''));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close('');
      });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close('');
        if (e.key === 'Enter') close(input?.value || '');
      });

      document.body.appendChild(overlay);
      setTimeout(() => {
        input?.focus();
        input?.select();
      }, 0);
    });
  }

  /* ── Public ───────────────────────────────────────────────────────────── */
  return {
    async init() {
      alert('SettingsView loaded');
      await App.refreshLookups();
      renderShell();
    },
  };
})();
