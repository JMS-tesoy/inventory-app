/**
 * FILE: src/domain/inventory.js
 * PURPOSE: Business rules and validation for stock transactions.
 *          Sits between the UI (IPC handlers) and the data layer (excel.js).
 *          All public functions return { ok: true, data } or { ok: false, errors[] }.
 * CONNECTED TO: main/main.js (IPC handlers call these)
 *               db/excel.js (reads/writes data)
 *               util/id.js, util/date.js
 */

'use strict';

const db   = require('../db/excel');
const { newId } = require('../util/id');
const { toISO, todayISO } = require('../util/date');

// ─── Lookups ──────────────────────────────────────────────────────────────────

/**
 * resolveEmployee(employeeId) — finds an employee record by ID.
 * @param {string} employeeId
 * @returns {object|null}
 */
function resolveEmployee(employeeId) {
  if (!employeeId) return null;
  return db.getEmployees().find(e => e.employee_id === employeeId) || null;
}

/**
 * resolveDepartmentForEmployee(employeeId) — returns the department_id for an employee.
 * Used to auto-fill department when employee is selected.
 * @param {string} employeeId
 * @returns {string}
 */
function resolveDepartmentForEmployee(employeeId) {
  const emp = resolveEmployee(employeeId);
  return emp ? emp.department_id : '';
}

// ─── Add Stocks ───────────────────────────────────────────────────────────────

/**
 * addStocks(tx) — validates and records an ADD transaction.
 *
 * @param {object} tx
 *   @param {string}   tx.date          ISO date (defaults to today)
 *   @param {string}   [tx.employee_id] Optional: if set, department is auto-resolved
 *   @param {string}   [tx.department_id] Manual department if no employee
 *   @param {Array}    tx.items         [ { stock_id, qty, note } ]
 *
 * @returns {{ ok: boolean, errors: string[], movements: object[] }}
 */
function addStocks(tx) {
  const errors = [];
  const date = tx.date ? toISO(tx.date) : todayISO();

  // Resolve department from employee if provided
  let department_id = tx.department_id || '';
  if (tx.employee_id) {
    department_id = resolveDepartmentForEmployee(tx.employee_id) || department_id;
  }

  if (!tx.items || tx.items.length === 0) {
    errors.push('At least one stock item is required.');
  }

  const itemErrors = [];
  for (let i = 0; i < (tx.items || []).length; i++) {
    const item = tx.items[i];
    if (!item.stock_id) itemErrors.push(`Row ${i + 1}: Stock is required.`);
    const qty = Number(item.qty);
    if (!qty || qty <= 0) itemErrors.push(`Row ${i + 1}: Quantity must be a positive number.`);
  }
  errors.push(...itemErrors);

  if (errors.length > 0) return { ok: false, errors, movements: [] };

  // Build and append movement rows
  const movements = tx.items.map(item => ({
    movement_id:   newId(),
    date,
    type:          'ADD',
    employee_id:   tx.employee_id || '',
    department_id,
    stock_id:      item.stock_id,
    qty:           Number(item.qty),
    note:          item.note || '',
  }));

  db.appendMovements(movements);
  db.recomputeBalances();

  return { ok: true, errors: [], movements };
}

// ─── Less Stocks ──────────────────────────────────────────────────────────────

/**
 * lessStocks(tx) — validates and records a LESS (request/issue) transaction.
 * Enforces no-negative-balance rule per stock per employee.
 *
 * @param {object} tx
 *   @param {string}  tx.date        ISO date
 *   @param {string}  tx.employee_id Required for LESS
 *   @param {Array}   tx.items       [ { stock_id, qty, note } ]
 *
 * @returns {{ ok: boolean, errors: string[], lineErrors: object[], movements: object[] }}
 */
function lessStocks(tx) {
  const errors    = [];
  const lineErrors = {}; // { rowIndex: 'error message' }
  const date = tx.date ? toISO(tx.date) : todayISO();

  if (!tx.employee_id) {
    errors.push('Employee is required for stock requests.');
  }

  const department_id = resolveDepartmentForEmployee(tx.employee_id);

  if (!tx.items || tx.items.length === 0) {
    errors.push('At least one stock item is required.');
  }

  // Per-line balance validation
  for (let i = 0; i < (tx.items || []).length; i++) {
    const item = tx.items[i];
    if (!item.stock_id) {
      lineErrors[i] = 'Stock is required.';
      continue;
    }
    const qty = Number(item.qty);
    if (!qty || qty <= 0) {
      lineErrors[i] = 'Quantity must be a positive number.';
      continue;
    }
    if (tx.employee_id) {
      const balance = db.getEmployeeStockBalance(tx.employee_id, item.stock_id);
      if (qty > balance) {
        lineErrors[i] = `Insufficient balance. Available: ${balance}, Requested: ${qty}.`;
      }
    }
  }

  if (errors.length > 0 || Object.keys(lineErrors).length > 0) {
    return { ok: false, errors, lineErrors, movements: [] };
  }

  // Build and append movement rows
  const movements = tx.items.map(item => ({
    movement_id:   newId(),
    date,
    type:          'LESS',
    employee_id:   tx.employee_id,
    department_id,
    stock_id:      item.stock_id,
    qty:           Number(item.qty),
    note:          item.note || '',
  }));

  db.appendMovements(movements);
  db.recomputeBalances();

  return { ok: true, errors: [], lineErrors: {}, movements };
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * getHistory(filters) — returns movements matching filter criteria.
 * @param {object} filters  { type, employee_id, department_id, stock_id, dateFrom, dateTo }
 * @returns {object[]} enriched movement rows with human-readable names
 */
function getHistory(filters = {}) {
  const movements   = db.getMovements();
  const employees   = db.getEmployees();
  const departments = db.getDepartments();
  const stocks      = db.getStocks();

  const empMap  = Object.fromEntries(employees.map(e => [e.employee_id, e]));
  const deptMap = Object.fromEntries(departments.map(d => [d.department_id, d]));
  const stockMap = Object.fromEntries(stocks.map(s => [s.stock_id, s]));

  return movements
    .filter(m => {
      if (filters.type          && m.type !== filters.type)                  return false;
      if (filters.employee_id   && m.employee_id !== filters.employee_id)    return false;
      if (filters.department_id && m.department_id !== filters.department_id) return false;
      if (filters.stock_id      && m.stock_id !== filters.stock_id)          return false;
      if (filters.dateFrom      && m.date < filters.dateFrom)                return false;
      if (filters.dateTo        && m.date > filters.dateTo)                  return false;
      return true;
    })
    .map(m => ({
      ...m,
      employee_name:   empMap[m.employee_id]?.employee_name  || m.employee_id || '—',
      department_name: deptMap[m.department_id]?.department_name || m.department_id || '—',
      stock_name:      stockMap[m.stock_id]?.stock_name      || m.stock_id,
      uom:             stockMap[m.stock_id]?.uom              || '',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  addStocks,
  lessStocks,
  getHistory,
  resolveEmployee,
  resolveDepartmentForEmployee,
};
