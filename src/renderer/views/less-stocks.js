/**
 * FILE: src/renderer/views/less-stocks.js
 * PURPOSE: "Less Stocks" view — employee stock request form with:
 *   - Required employee (auto-resolves department)
 *   - Multi-row request table with per-line balance validation
 *   - Report buttons: by range, month, department, employee
 * CONNECTED TO: app.js (App, toast, refreshHistory, buildOptions, makeAutocomplete)
 *               main/main.js IPC: movements:less, balances:employee, report:print, report:exportPDF
 */

window.LessStocksView = (() => {
  const container = document.getElementById('view-less-stocks');

  let itemRows = [{}];
  let lineErrors = {};
  let empAutocomplete = null;
  let selectedEmployeeId = '';

  /* ── Render ───────────────────────────────────────────────────────────── */
  function render() {
    const stocks = App.stocks.filter(s => s.is_active);
    const depts  = App.departments.filter(d => d.is_active);
    const emps   = App.employees.filter(e => e.is_active);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Less Stocks</h1>
          <p>Issue or request stock items for an employee. Balances are checked before submission.</p>
        </div>
        <div class="report-actions">
          <button class="btn btn-secondary btn-sm" id="btn-report-range">📄 Range Report</button>
          <button class="btn btn-secondary btn-sm" id="btn-report-month">📅 Monthly Report</button>
          <button class="btn btn-secondary btn-sm" id="btn-report-dept">🏢 Department</button>
          <button class="btn btn-secondary btn-sm" id="btn-report-emp">👤 Employee</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Request Details</div>
        <div class="form-row">
          <div class="form-group">
            <label for="less-date">Date</label>
            <input type="date" id="less-date" value="${_today()}">
          </div>
          <div></div>
        </div>
        <div class="form-row" style="margin-top:14px;">
          <div class="form-group">
            <label>Employee <span style="color:var(--error)">*</span></label>
            <input type="text" id="less-emp-input" placeholder="Search employee (required)…" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="less-dept">Department (auto-filled)</label>
            <input type="text" id="less-dept" readonly placeholder="Auto-filled from employee">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Requested Items</div>
        <div class="form-group" style="margin-bottom:12px;max-width:360px;">
          <label>Barcode / QR</label>
          <input type="text" id="less-barcode" placeholder="Scan barcode then press Enter">
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th style="width:36%">Stock</th>
              <th style="width:12%">UOM</th>
              <th style="width:14%">Qty</th>
              <th style="width:14%">Balance</th>
              <th>Note</th>
              <th style="width:40px"></th>
            </tr>
          </thead>
          <tbody id="less-items-body">
            ${renderItemRows(stocks)}
          </tbody>
        </table>
        <div style="margin-top:12px;">
          <button class="btn btn-secondary btn-sm" id="less-row-btn">+ Add Row</button>
        </div>
      </div>

      <div style="display:flex;gap:12px;">
        <button class="btn btn-primary" id="less-submit-btn" style="min-width:160px;">
          Submit Request
        </button>
        <button class="btn btn-secondary" id="less-clear-btn">Clear</button>
      </div>
    `;

    wireEmpAutocomplete(emps, depts, stocks);
    wireItemRows(stocks);
    wireButtons(stocks);
    wireBarcodeScanner(stocks);
    wireReportButtons(depts, emps);
  }

  /* ── Item rows ────────────────────────────────────────────────────────── */
  function renderItemRows(stocks) {
    return itemRows.map((row, i) => renderItemRow(row, i, stocks)).join('');
  }

  function renderItemRow(row, i, stocks) {
    const hasError = lineErrors[i];
    return `
      <tr data-row="${i}" style="${hasError ? 'background:var(--error-bg);' : ''}">
        <td>
          <select class="stock-select" data-row="${i}">
            ${buildOptions(stocks, 'stock_id', 'stock_name', row.stock_id)}
          </select>
          ${hasError ? `<div class="line-error">${hasError}</div>` : ''}
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
          <span class="balance-pill" id="balance-${i}">
            ${row.balance !== undefined ? row.balance : '—'}
          </span>
        </td>
        <td>
          <input type="text" class="note-input" data-row="${i}"
            value="${row.note || ''}" placeholder="Optional">
        </td>
        <td>
          ${itemRows.length > 1 ? `
            <button class="btn btn-danger btn-icon btn-xs remove-row-btn" data-row="${i}" title="Remove">✕</button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  /* ── Employee autocomplete ────────────────────────────────────────────── */
  function wireEmpAutocomplete(emps, depts, stocks) {
    const empInput = document.getElementById('less-emp-input');
    const deptInput = document.getElementById('less-dept');
    if (!empInput) return;

    empAutocomplete = makeAutocomplete(
      empInput,
      emps,
      'employee_id',
      'employee_name',
      async (empId, emp) => {
        selectedEmployeeId = empId;
        if (emp) {
          const dept = depts.find(d => d.department_id === emp.department_id);
          deptInput.value = dept ? dept.department_name : emp.department_id;
          await refreshBalances(stocks);
        } else {
          deptInput.value = '';
          selectedEmployeeId = '';
        }
      }
    );

    empInput.addEventListener('input', () => {
      if (!empInput.value.trim()) {
        deptInput.value = '';
        selectedEmployeeId = '';
      }
    });
  }

  /* ── Balance refresh ──────────────────────────────────────────────────── */
  async function refreshBalances(stocks) {
    if (!selectedEmployeeId) return;
    const tbody = document.getElementById('less-items-body');
    if (!tbody) return;

    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];
      if (!row.stock_id) continue;
      const bal = await api.invoke('balances:employee', {
        employeeId: selectedEmployeeId,
        stockId: row.stock_id,
      });
      itemRows[i].balance = bal;
      const pill = document.getElementById(`balance-${i}`);
      if (pill) pill.textContent = bal;
    }
  }

  /* ── Wire item row events ─────────────────────────────────────────────── */
  function wireItemRows(stocks) {
    const tbody = document.getElementById('less-items-body');
    if (!tbody) return;

    tbody.addEventListener('change', async e => {
      const row = parseInt(e.target.dataset.row);
      if (isNaN(row)) return;

      if (e.target.classList.contains('stock-select')) {
        itemRows[row].stock_id = e.target.value;
        const uomEl = tbody.querySelector(`.uom-label[data-row="${row}"]`);
        if (uomEl) uomEl.textContent = _getUom(e.target.value, stocks);

        // Fetch balance for this stock+employee
        if (selectedEmployeeId && e.target.value) {
          const bal = await api.invoke('balances:employee', {
            employeeId: selectedEmployeeId,
            stockId: e.target.value,
          });
          itemRows[row].balance = bal;
          const pill = document.getElementById(`balance-${row}`);
          if (pill) pill.textContent = bal;
        }
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
      delete lineErrors[row];
      lineErrors = {};
      _rerenderRows(stocks);
    });
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */
  function wireButtons(stocks) {
    document.getElementById('less-row-btn')?.addEventListener('click', () => {
      itemRows.push({});
      _rerenderRows(stocks);
    });

    document.getElementById('less-clear-btn')?.addEventListener('click', () => {
      itemRows = [{}];
      lineErrors = {};
      selectedEmployeeId = '';
      render();
    });

    document.getElementById('less-submit-btn')?.addEventListener('click', () => submit(stocks));
  }

  function wireBarcodeScanner(stocks) {
    const input = document.getElementById('less-barcode');
    if (!input) return;

    input.addEventListener('keydown', async (e) => {
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

      if (selectedEmployeeId) {
        const bal = await api.invoke('balances:employee', {
          employeeId: selectedEmployeeId,
          stockId: stock.stock_id,
        });
        itemRows[rowIndex].balance = bal;
      }

      _rerenderRows(stocks);

      const qtyInput = document.querySelector(`#less-items-body .qty-input[data-row="${rowIndex}"]`);
      if (qtyInput) qtyInput.focus();

      input.value = '';
      toast(`Scanned: ${stock.stock_name}`, 'success', 1500);
    });
  }

  /* ── Submit ───────────────────────────────────────────────────────────── */
  async function submit(stocks) {
    if (!selectedEmployeeId) {
      toast('Please select an employee before submitting.', 'error');
      return;
    }

    _syncRowInputs();

    const btn = document.getElementById('less-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const result = await api.invoke('movements:less', {
      date:        document.getElementById('less-date')?.value || _today(),
      employee_id: selectedEmployeeId,
      items:       itemRows,
    });

    btn.disabled = false;
    btn.textContent = 'Submit Request';

    if (result.ok) {
      toast(`Stock request submitted (${result.movements.length} item(s)).`, 'success');
      itemRows = [{}];
      lineErrors = {};
      await App.refreshLookups();
      render();
      refreshHistory();
    } else {
      lineErrors = result.lineErrors || {};
      if (result.errors?.length) toast(result.errors.join('\n'), 'error');
      // Re-render rows to show per-line errors
      _rerenderRows(stocks);
    }
  }

  /* ── Report buttons ───────────────────────────────────────────────────── */
  function wireReportButtons(depts, emps) {
    document.getElementById('btn-report-range')?.addEventListener('click', () => showReportModal('range', depts, emps));
    document.getElementById('btn-report-month')?.addEventListener('click', () => showReportModal('month', depts, emps));
    document.getElementById('btn-report-dept')?.addEventListener('click', () => showReportModal('department', depts, emps));
    document.getElementById('btn-report-emp')?.addEventListener('click', () => showReportModal('employee', depts, emps));
  }

  function showReportModal(type, depts, emps) {
    let formHTML = '';

    if (type === 'range') {
      formHTML = `
        <div class="form-group"><label>Date From</label><input type="date" id="rp-from" value="${_monthStart()}"></div>
        <div class="form-group" style="margin-top:12px;"><label>Date To</label><input type="date" id="rp-to" value="${_today()}"></div>
      `;
    } else if (type === 'month') {
      formHTML = `
        <div class="form-group"><label>Month</label><input type="month" id="rp-month" value="${_today().slice(0,7)}"></div>
      `;
    } else if (type === 'department') {
      formHTML = `
        <div class="form-group"><label>Department</label>
          <select id="rp-dept">${buildOptions(depts, 'department_id', 'department_name')}</select>
        </div>
        <div class="form-row" style="margin-top:12px;">
          <div class="form-group"><label>Date From</label><input type="date" id="rp-from" value="${_monthStart()}"></div>
          <div class="form-group"><label>Date To</label><input type="date" id="rp-to" value="${_today()}"></div>
        </div>
      `;
    } else if (type === 'employee') {
      formHTML = `
        <div class="form-group"><label>Employee</label>
          <select id="rp-emp">${buildOptions(emps, 'employee_id', 'employee_name')}</select>
        </div>
        <div class="form-row" style="margin-top:12px;">
          <div class="form-group"><label>Date From</label><input type="date" id="rp-from" value="${_monthStart()}"></div>
          <div class="form-group"><label>Date To</label><input type="date" id="rp-to" value="${_today()}"></div>
        </div>
      `;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${_reportTitle(type)}</h2>
        ${formHTML}
        <div class="modal-actions">
          <button class="btn btn-secondary" id="rp-cancel">Cancel</button>
          <button class="btn btn-secondary" id="rp-pdf">Export PDF</button>
          <button class="btn btn-primary" id="rp-print">Print</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#rp-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#rp-print').onclick  = () => executeReport(type, overlay, 'print');
    overlay.querySelector('#rp-pdf').onclick    = () => executeReport(type, overlay, 'pdf');
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  async function executeReport(type, overlay, action) {
    const params = _collectReportParams(type, overlay);
    const channel = action === 'print' ? 'report:print' : 'report:exportPDF';
    overlay.remove();

    toast('Generating report…', 'info');
    const result = await api.invoke(channel, { reportType: type, params });
    if (result.ok) {
      toast(action === 'pdf' ? `PDF saved to: ${result.path}` : 'Print dialog opened.', 'success');
    } else {
      toast(result.error || 'Report failed.', 'error');
    }
  }

  function _collectReportParams(type, overlay) {
    const get = id => overlay.querySelector(`#${id}`)?.value || '';
    if (type === 'range')      return { dateFrom: get('rp-from'), dateTo: get('rp-to') };
    if (type === 'month')      return { month: get('rp-month') };
    if (type === 'department') return { department_id: get('rp-dept'), dateFrom: get('rp-from'), dateTo: get('rp-to') };
    if (type === 'employee')   return { employee_id: get('rp-emp'), dateFrom: get('rp-from'), dateTo: get('rp-to') };
    return {};
  }

  function _reportTitle(type) {
    const titles = { range: 'Date Range Report', month: 'Monthly Report', department: 'Department Report', employee: 'Employee Report' };
    return titles[type] || 'Report';
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function _today() { return new Date().toISOString().slice(0, 10); }
  function _monthStart() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  function _getUom(stockId, stocks) {
    return stocks.find(s => s.stock_id === stockId)?.uom || '—';
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
    const tbody = document.getElementById('less-items-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-row]').forEach(tr => {
      const i = parseInt(tr.dataset.row);
      if (isNaN(i)) return;
      const s = tr.querySelector('.stock-select');
      const q = tr.querySelector('.qty-input');
      const n = tr.querySelector('.note-input');
      if (s) itemRows[i] = { ...itemRows[i], stock_id: s.value };
      if (q) itemRows[i].qty  = parseFloat(q.value) || 0;
      if (n) itemRows[i].note = n.value;
    });
  }
  function _rerenderRows(stocks) {
    const tbody = document.getElementById('less-items-body');
    if (tbody) tbody.innerHTML = renderItemRows(stocks);
    wireItemRows(stocks);
  }

  /* ── Public ───────────────────────────────────────────────────────────── */
  return {
    async init() {
      await App.refreshLookups();
      itemRows = [{}];
      lineErrors = {};
      selectedEmployeeId = '';
      render();
    },
  };
})();
