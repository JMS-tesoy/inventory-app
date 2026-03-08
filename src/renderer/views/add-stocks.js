/**
 * FILE: src/renderer/views/add-stocks.js
 * PURPOSE: "Add Stocks" view — form with:
 *   - Manual date, optional employee, auto-filled department
 *   - Multi-row stock items table (stock dropdown + qty + note)
 *   - Submit writes ADD movements to Excel
 * CONNECTED TO: app.js (App.refreshLookups, refreshHistory, buildOptions, toast)
 *               main/main.js IPC: movements:add, departments:get, employees:get
 */

window.AddStocksView = (() => {
  const container = document.getElementById('view-add-stocks');

  /** Rows in the items grid — each { stock_id, qty, note } */
  let itemRows = [{}];
  let empAutocomplete = null;

  /* ── Render the full view ──────────────────────────────────────────────── */
  async function render() {
    const depts = App.departments.filter(d => d.is_active);
    const balances = await api.invoke('balances:get');

    const totalByStock = new Map();
    for (const row of balances) {
      const current = totalByStock.get(row.stock_id) || 0;
      totalByStock.set(row.stock_id, current + (Number(row.balance_qty) || 0));
    }

    const stocks = App.stocks
      .filter(s => s.is_active)
      .map(s => ({ ...s, current_qty: totalByStock.get(s.stock_id) || 0 }));

    const dashboard = await _buildDashboardStats(stocks);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Add Stocks</h1>
          <p>Record incoming inventory — one or more items per transaction.</p>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="dashboard-label">Total Items</div>
          <div class="dashboard-value">${dashboard.totalItems}</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-label">Low Stock</div>
          <div class="dashboard-value">${dashboard.lowStockCount}</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-label">Top Categories</div>
          <div class="dashboard-sub">${_esc(dashboard.topCategories)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Transaction Details</div>
        <div class="form-row">
          <div class="form-group">
            <label for="add-date">Date</label>
            <input type="date" id="add-date" value="${_today()}">
          </div>
          <div></div>
        </div>
        <div class="form-row" style="margin-top:14px;">
          <div class="form-group">
            <label>Employee (optional)</label>
            <input type="text" id="add-emp-input" placeholder="Search employee…" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="add-dept">Department</label>
            <select id="add-dept">
              ${buildOptions(depts, 'department_id', 'department_name')}
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Stock Items</div>
        <div class="form-group" style="margin-bottom:12px;max-width:360px;">
          <label>Barcode / QR</label>
          <input type="text" id="add-barcode" placeholder="Scan barcode then press Enter">
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width:38%">Stock</th>
              <th style="width:14%">UOM</th>
              <th style="width:14%">Quantity</th>
              <th>Note</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="add-items-body">
            ${renderItemRows(stocks)}
          </tbody>
        </table>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <button class="btn btn-secondary btn-sm" id="add-row-btn">
            + Add Row
          </button>
          <span id="add-stock-availability" style="font-size:12px;color:var(--text-dim);"></span>
        </div>
      </div>

      <div style="display:flex;gap:12px;">
        <button class="btn btn-primary" id="add-submit-btn" style="min-width:160px;">
          Submit Transaction
        </button>
        <button class="btn btn-secondary" id="add-clear-btn">Clear</button>
      </div>
    `;

    wireEmployeeAutocomplete();
    wireItemRows(stocks);
    wireButtons(stocks);
    wireBarcodeScanner(stocks);
    _updateStockAvailabilityText(stocks);
  }

  /* ── Item rows HTML ───────────────────────────────────────────────────── */
  function renderItemRows(stocks) {
    return itemRows.map((row, i) => renderItemRow(row, i, stocks)).join('');
  }

  function renderItemRow(row, i, stocks) {
    return `
      <tr data-row="${i}">
        <td>
          <select class="stock-select" data-row="${i}">
            ${buildOptions(stocks, 'stock_id', 'stock_name', row.stock_id)}
          </select>
        </td>
        <td>
          <span class="uom-label" data-row="${i}" style="color:var(--text-muted);font-size:12px;">
            ${_getUom(row.stock_id, stocks)}
          </span>
        </td>
        <td>
          <input type="number" class="qty-input" data-row="${i}"
            min="0.001" step="any" value="${row.qty || ''}" placeholder="0">
        </td>
        <td>
          <input type="text" class="note-input" data-row="${i}"
            value="${row.note || ''}" placeholder="Optional note">
        </td>
        <td>
          ${itemRows.length > 1 ? `
            <button class="btn btn-danger btn-icon btn-xs remove-row-btn" data-row="${i}" title="Remove row">✕</button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  /* ── Wire item row events ─────────────────────────────────────────────── */
  function wireItemRows(stocks) {
    const tbody = document.getElementById('add-items-body');
    if (!tbody) return;

    tbody.addEventListener('change', e => {
      const row = parseInt(e.target.dataset.row);
      if (isNaN(row)) return;

      if (e.target.classList.contains('stock-select')) {
        itemRows[row].stock_id = e.target.value;
        // Update UOM label
        const uomEl = tbody.querySelector(`.uom-label[data-row="${row}"]`);
        if (uomEl) uomEl.textContent = _getUom(e.target.value, stocks);
        _updateStockAvailabilityText(stocks);
      }
      if (e.target.classList.contains('qty-input')) {
        itemRows[row].qty = parseFloat(e.target.value) || 0;
      }
      if (e.target.classList.contains('note-input')) {
        itemRows[row].note = e.target.value;
      }
    });

    tbody.addEventListener('click', e => {
      const btn = e.target.closest('.remove-row-btn');
      if (!btn) return;
      const row = parseInt(btn.dataset.row);
      itemRows.splice(row, 1);
      _rerenderRows(stocks);
    });
  }

  /* ── Employee autocomplete ────────────────────────────────────────────── */
  function wireEmployeeAutocomplete() {
    const empInput = document.getElementById('add-emp-input');
    const deptSel  = document.getElementById('add-dept');
    if (!empInput) return;

    empAutocomplete = makeAutocomplete(
      empInput,
      App.employees.filter(e => e.is_active),
      'employee_id',
      'employee_name',
      (empId, emp) => {
        if (emp) {
          deptSel.value = emp.department_id;
          deptSel.setAttribute('disabled', 'disabled');
        }
      }
    );

    empInput.addEventListener('input', () => {
      if (!empInput.value.trim()) {
        deptSel.removeAttribute('disabled');
      }
    });
  }

  /* ── Button wiring ────────────────────────────────────────────────────── */
  function wireButtons(stocks) {
    document.getElementById('add-row-btn')?.addEventListener('click', () => {
      itemRows.push({});
      _rerenderRows(stocks);
    });

    document.getElementById('add-clear-btn')?.addEventListener('click', () => {
      itemRows = [{}];
      render();
    });

    document.getElementById('add-submit-btn')?.addEventListener('click', () => submit(stocks));
  }

  function wireBarcodeScanner(stocks) {
    const input = document.getElementById('add-barcode');
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();

      const code = String(input.value || '').trim();
      if (!code) return;

      const stock = _findStockByBarcode(stocks, code);
      if (!stock) {
        toast('Barcode not found in stock catalog.', 'error');
        return;
      }

      let rowIndex = itemRows.findIndex(r => !r.stock_id);
      if (rowIndex < 0) {
        itemRows.push({});
        rowIndex = itemRows.length - 1;
      }

      itemRows[rowIndex].stock_id = stock.stock_id;
      _rerenderRows(stocks);

      const qtyInput = document.querySelector(`#add-items-body .qty-input[data-row="${rowIndex}"]`);
      if (qtyInput) qtyInput.focus();

      input.value = '';
      toast(`Scanned: ${stock.stock_name}`, 'success', 1500);
    });
  }

  /* ── Submit ───────────────────────────────────────────────────────────── */
  async function submit(stocks) {
    const date        = document.getElementById('add-date')?.value || _today();
    const employee_id = empAutocomplete?.getValue() || '';
    const dept_el     = document.getElementById('add-dept');
    const department_id = (dept_el && !dept_el.disabled) ? dept_el.value : '';

    // Sync current input values into itemRows
    _syncRowInputs();

    const btn = document.getElementById('add-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const result = await api.invoke('movements:add', {
      date,
      employee_id,
      department_id,
      items: itemRows,
    });

    btn.disabled = false;
    btn.textContent = 'Submit Transaction';

    if (result.ok) {
      toast(`Added ${result.movements.length} movement(s) successfully.`, 'success');
      itemRows = [{}];
      await App.refreshLookups();
      await render();
      refreshHistory();
    } else {
      const msg = result.errors?.join('\n') || result.error || 'Unknown error';
      toast(msg, 'error');
    }
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function _today() {
    return new Date().toISOString().slice(0, 10);
  }

  function _esc(s = '') {
    return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function _buildDashboardStats(stocks) {
    const totalItems = stocks.reduce((sum, s) => sum + (Number(s.current_qty) || 0), 0);
    const lowStockCount = stocks.filter(s => {
      const current = Number(s.current_qty) || 0;
      const threshold = Math.max(0, Number(s.min_stock_threshold) || 0);
      return current <= threshold;
    }).length;

    const history = await api.invoke('movements:history', {});
    const deptCounter = new Map();
    history.forEach(row => {
      const name = String(row.department_name || '').trim();
      if (!name || name === '—') return;
      deptCounter.set(name, (deptCounter.get(name) || 0) + 1);
    });

    const topCategories = [...deptCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
      .join(', ') || 'No data yet';

    return { totalItems, lowStockCount, topCategories };
  }

  function _getUom(stockId, stocks) {
    const s = stocks.find(s => s.stock_id === stockId);
    return s?.uom || '—';
  }

  function _findStockByBarcode(stocks, barcode) {
    const needle = String(barcode || '').trim().toLowerCase();
    if (!needle) return null;
    return stocks.find(s => {
      const code = String(s.barcode || '').trim().toLowerCase();
      const stockId = String(s.stock_id || '').trim().toLowerCase();
      return code === needle || stockId === needle;
    }) || null;
  }

  function _syncRowInputs() {
    const tbody = document.getElementById('add-items-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-row]').forEach(tr => {
      const i = parseInt(tr.dataset.row);
      if (isNaN(i)) return;
      const stockSel = tr.querySelector('.stock-select');
      const qtyIn    = tr.querySelector('.qty-input');
      const noteIn   = tr.querySelector('.note-input');
      if (stockSel) itemRows[i] = { ...itemRows[i], stock_id: stockSel.value };
      if (qtyIn)    itemRows[i].qty  = parseFloat(qtyIn.value) || 0;
      if (noteIn)   itemRows[i].note = noteIn.value;
    });
  }

  function _rerenderRows(stocks) {
    const tbody = document.getElementById('add-items-body');
    if (tbody) tbody.innerHTML = renderItemRows(stocks);
    wireItemRows(stocks);
    _updateStockAvailabilityText(stocks);
  }

  function _updateStockAvailabilityText(stocks) {
    const el = document.getElementById('add-stock-availability');
    if (!el) return;

    const selectedIds = new Set(
      itemRows
        .map(r => r.stock_id)
        .filter(Boolean)
    );

    if (selectedIds.size === 0) {
      el.textContent = '';
      return;
    }

    let selectedCurrentQty = 0;
    selectedIds.forEach(id => {
      const stock = stocks.find(s => s.stock_id === id);
      const qty = Number(stock?.current_qty) || 0;
      selectedCurrentQty += qty;
    });

    el.textContent = `${selectedCurrentQty} stocks available`;
  }

  /* ── Public API ───────────────────────────────────────────────────────── */
  return {
    async init() {
      await App.refreshLookups();
      itemRows = [{}];
      await render();
    },
  };
})();

// Init on first load
document.addEventListener('DOMContentLoaded', () => AddStocksView.init());
