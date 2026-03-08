/**
 * FILE: src/domain/reports.js
 * PURPOSE: Builds structured report data for printing/PDF export.
 *          Each function returns a report object consumed by print.js.
 * CONNECTED TO: main/main.js (IPC 'printReport' handler)
 *               main/print.js (renders HTML and prints)
 *               domain/inventory.js (uses getHistory)
 */

'use strict';

const db    = require('../db/excel');
const { getHistory } = require('./inventory');
const { formatDisplay, monthLabel, isBetween } = require('../util/date');

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Builds common report header data from Settings sheet */
function buildHeader() {
  const s = db.getSettings();
  return {
    companyName:    s.company_name,
    companyAddress: s.company_address,
    companyPhone:   s.company_phone,
    logoPath:       s.logo_path,
    signatories: {
      preparedBy:  { name: s.prepared_by_name,  title: s.prepared_by_title },
      checkedBy:   { name: s.checked_by_name,   title: s.checked_by_title },
      approvedBy:  { name: s.approved_by_name,  title: s.approved_by_title },
    },
  };
}

/** Summarises a list of movement rows into { stockId → { in, out, net } } */
function summariseMovements(rows) {
  const summary = {};
  const stockMap = Object.fromEntries(db.getStocks().map(s => [s.stock_id, s]));

  for (const m of rows) {
    if (!summary[m.stock_id]) {
      summary[m.stock_id] = {
        stock_id:   m.stock_id,
        stock_name: stockMap[m.stock_id]?.stock_name || m.stock_id,
        uom:        stockMap[m.stock_id]?.uom || '',
        in:  0,
        out: 0,
      };
    }
    if (m.type === 'ADD')  summary[m.stock_id].in  += m.qty;
    if (m.type === 'LESS') summary[m.stock_id].out += m.qty;
  }

  for (const row of Object.values(summary)) {
    row.net = row.in - row.out;
  }

  return Object.values(summary);
}

// ─── Report builders ──────────────────────────────────────────────────────────

/**
 * buildRangeReport({ dateFrom, dateTo }) — all movements in a date range.
 */
function buildRangeReport({ dateFrom, dateTo }) {
  const rows = getHistory({ dateFrom, dateTo });
  return {
    type:    'range',
    title:   `Stock Movement Report`,
    subtitle: `${formatDisplay(dateFrom)} – ${formatDisplay(dateTo)}`,
    header:  buildHeader(),
    rows,
    summary: summariseMovements(rows),
  };
}

/**
 * buildMonthReport({ month }) — movements for a given month ('yyyy-mm').
 */
function buildMonthReport({ month }) {
  const dateFrom = `${month}-01`;
  const dateTo   = `${month}-31`; // safe upper bound for any month
  const rows = getHistory({ dateFrom, dateTo });
  return {
    type:    'month',
    title:   `Monthly Stock Report`,
    subtitle: monthLabel(`${month}-01`),
    header:  buildHeader(),
    rows,
    summary: summariseMovements(rows),
  };
}

/**
 * buildDepartmentReport({ department_id, dateFrom, dateTo }) — movements for a dept.
 */
function buildDepartmentReport({ department_id, dateFrom, dateTo }) {
  const depts = db.getDepartments();
  const dept = depts.find(d => d.department_id === department_id);
  const rows = getHistory({ department_id, dateFrom, dateTo });
  return {
    type:    'department',
    title:   `Department Stock Report`,
    subtitle: dept ? dept.department_name : department_id,
    header:  buildHeader(),
    rows,
    summary: summariseMovements(rows),
    dateRange: dateFrom && dateTo ? `${formatDisplay(dateFrom)} – ${formatDisplay(dateTo)}` : '',
  };
}

/**
 * buildEmployeeReport({ employee_id, dateFrom, dateTo }) — movements for an employee.
 */
function buildEmployeeReport({ employee_id, dateFrom, dateTo }) {
  const emps = db.getEmployees();
  const emp = emps.find(e => e.employee_id === employee_id);
  const rows = getHistory({ employee_id, dateFrom, dateTo });
  return {
    type:    'employee',
    title:   `Employee Stock Report`,
    subtitle: emp ? emp.employee_name : employee_id,
    header:  buildHeader(),
    rows,
    summary: summariseMovements(rows),
    dateRange: dateFrom && dateTo ? `${formatDisplay(dateFrom)} – ${formatDisplay(dateTo)}` : '',
  };
}

/**
 * buildReportHTML(report) — renders a report object to a self-contained HTML string
 * for printing or PDF export via Electron's printToPDF.
 * @param {object} report  From any build*Report function
 * @returns {string} HTML
 */
function buildReportHTML(report) {
  const { header, title, subtitle, rows, summary, dateRange } = report;
  const { companyName, companyAddress, companyPhone, logoPath, signatories } = header;

  const logoTag = logoPath
    ? `<img src="${logoPath}" alt="Logo" style="height:60px;object-fit:contain;">`
    : '';

  const summaryRows = summary.map(s => `
    <tr>
      <td>${s.stock_name}</td>
      <td>${s.uom}</td>
      <td class="num">${s.in}</td>
      <td class="num">${s.out}</td>
      <td class="num ${s.net < 0 ? 'neg' : ''}">${s.net}</td>
    </tr>
  `).join('');

  const detailRows = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td class="badge ${r.type === 'ADD' ? 'add' : 'less'}">${r.type}</td>
      <td>${r.stock_name}</td>
      <td>${r.uom}</td>
      <td class="num">${r.qty}</td>
      <td>${r.employee_name}</td>
      <td>${r.department_name}</td>
      <td>${r.note}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a2e; padding: 20px; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #2E7CF6; padding-bottom: 12px; }
  .company-info h2 { font-size: 16px; color: #2E7CF6; }
  .company-info p { color: #555; font-size: 10px; }
  .report-title { text-align: right; }
  .report-title h1 { font-size: 18px; color: #0F172A; }
  .report-title .subtitle { color: #2E7CF6; font-size: 13px; font-weight: bold; }
  .report-title .daterange { color: #666; font-size: 10px; margin-top: 2px; }
  h3 { margin: 16px 0 6px; font-size: 12px; color: #2E7CF6; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #2E7CF6; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e8eaf0; font-size: 10px; }
  tr:nth-child(even) td { background: #f5f8ff; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .neg { color: #e53e3e; }
  .badge { font-weight: bold; font-size: 9px; padding: 2px 6px; border-radius: 3px; text-align: center; }
  .badge.add { color: #22543d; background: #c6f6d5; }
  .badge.less { color: #742a2a; background: #fed7d7; }
  .signatories { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
  .sig-block { text-align: center; }
  .sig-line { border-bottom: 1px solid #333; height: 40px; margin-bottom: 6px; }
  .sig-name { font-weight: bold; font-size: 11px; }
  .sig-title { color: #666; font-size: 10px; }
  .sig-label { font-size: 9px; color: #2E7CF6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<div class="report-header">
  <div style="display:flex;align-items:center;gap:12px;">
    ${logoTag}
    <div class="company-info">
      <h2>${companyName}</h2>
      <p>${companyAddress}</p>
      <p>${companyPhone}</p>
    </div>
  </div>
  <div class="report-title">
    <h1>${title}</h1>
    <div class="subtitle">${subtitle}</div>
    ${dateRange ? `<div class="daterange">${dateRange}</div>` : ''}
  </div>
</div>

<h3>Summary by Stock</h3>
<table>
  <thead><tr><th>Stock</th><th>UOM</th><th>Total In</th><th>Total Out</th><th>Net</th></tr></thead>
  <tbody>${summaryRows || '<tr><td colspan="5">No data</td></tr>'}</tbody>
</table>

<h3>Movement Detail</h3>
<table>
  <thead><tr><th>Date</th><th>Type</th><th>Stock</th><th>UOM</th><th>Qty</th><th>Employee</th><th>Department</th><th>Note</th></tr></thead>
  <tbody>${detailRows || '<tr><td colspan="8">No movements found.</td></tr>'}</tbody>
</table>

<div class="signatories">
  <div class="sig-block">
    <div class="sig-label">Prepared by</div>
    <div class="sig-line"></div>
    <div class="sig-name">${signatories.preparedBy.name}</div>
    <div class="sig-title">${signatories.preparedBy.title}</div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Checked by</div>
    <div class="sig-line"></div>
    <div class="sig-name">${signatories.checkedBy.name}</div>
    <div class="sig-title">${signatories.checkedBy.title}</div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Approved by</div>
    <div class="sig-line"></div>
    <div class="sig-name">${signatories.approvedBy.name}</div>
    <div class="sig-title">${signatories.approvedBy.title}</div>
  </div>
</div>
</body>
</html>`;
}

module.exports = {
  buildRangeReport,
  buildMonthReport,
  buildDepartmentReport,
  buildEmployeeReport,
  buildReportHTML,
};
