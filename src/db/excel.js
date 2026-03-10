/**
 * FILE: src/db/excel.js
 * PURPOSE: Low-level Excel I/O using SheetJS (xlsx library).
 *          Provides CRUD helpers for each sheet and guarantees
 *          the workbook + all sheets exist before any operation.
 * INPUTS:  dataDir (string) — absolute path to ./data/
 * OUTPUTS: JS objects/arrays representing sheet rows
 * CONNECTED TO: domain/inventory.js (calls all exports)
 *               main/main.js (calls loadWorkbook, getDataDir)
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const XLSX  = require('xlsx');
const { SHEET_NAMES, SCHEMA, DEFAULT_SETTINGS } = require('./schema');

// ─── Module-level workbook cache ────────────────────────────────────────────
/** @type {string}  absolute path to inventory.xlsx */
let _xlsxPath = '';

/** @type {object}  in-memory SheetJS workbook (wb) */
let _wb = null;

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * init(dataDir) — must be called once from main.js after resolving dataDir.
 * Sets the xlsx path and calls ensureWorkbook().
 * @param {string} dataDir  Absolute path to the ./data/ folder
 */
function init(dataDir) {
  _xlsxPath = path.join(dataDir, 'inventory.xlsx');
  ensureWorkbook();
}

/**
 * ensureWorkbook() — creates inventory.xlsx with all sheets if missing,
 * or opens the existing file and adds any missing sheets/columns.
 * Safe to call on every launch.
 */
function ensureWorkbook() {
  if (fs.existsSync(_xlsxPath)) {
    _wb = XLSX.readFile(_xlsxPath);
  } else {
    _wb = XLSX.utils.book_new();
  }

  // Guarantee every sheet exists with correct headers
  for (const [sheetName, headers] of Object.entries(SCHEMA)) {
    if (!_wb.SheetNames.includes(sheetName)) {
      // Create empty sheet with just the header row
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      XLSX.utils.book_append_sheet(_wb, ws, sheetName);
    } else {
      // Sheet exists — ensure all required columns are present
      _ensureHeaders(_wb.Sheets[sheetName], headers);
    }
  }

  // Seed a default Settings row if the sheet is empty
  const settingsRows = sheetToObjects(SHEET_NAMES.SETTINGS);
  if (settingsRows.length === 0) {
    appendRow(SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
  }

  saveWorkbook();
}

/**
 * _ensureHeaders(ws, headers) — adds missing columns to an existing sheet.
 * Existing data is unaffected; new columns are appended to the right.
 * @param {object} ws       SheetJS worksheet
 * @param {string[]} headers Expected header list
 */
function _ensureHeaders(ws, headers) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const existingHeaders = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) existingHeaders.push(cell.v);
  }
  let col = range.e.c + 1;
  for (const h of headers) {
    if (!existingHeaders.includes(h)) {
      ws[XLSX.utils.encode_cell({ r: 0, c: col })] = { v: h, t: 's' };
      col++;
    }
  }
  // Re-compute range
  const allHeaders = [...existingHeaders, ...headers.filter(h => !existingHeaders.includes(h))];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: allHeaders.length - 1 } });
}

// ─── Core helpers ────────────────────────────────────────────────────────────
/**
 * getDeliveries() — returns all delivery rows.
 */
function getDeliveries() {
  return sheetToObjects('Deliveries');
}

/**
 * saveDeliveries(rows) — replaces the Deliveries sheet with given rows.
 */
function saveDeliveries(rows) {
  objectsToSheet('Deliveries', rows);
  saveWorkbook();
}

/**
 * appendDelivery(row) — appends a single delivery row.
 */
function appendDelivery(row) {
  const existing = getDeliveries();
  existing.push(row);
  saveDeliveries(existing);
}

/**
 * saveWorkbook() — flushes the in-memory workbook to disk.
 * Call after any write operation.
 */
function saveWorkbook() {
  XLSX.writeFile(_wb, _xlsxPath);
}

/**
 * sheetToObjects(sheetName) — converts a sheet to an array of row objects.
 * Row 1 is treated as headers; each subsequent row becomes { header: value }.
 * @param {string} sheetName
 * @returns {object[]}
 */
function sheetToObjects(sheetName) {
  const ws = _wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

/**
 * objectsToSheet(sheetName, rows) — replaces the sheet with the given rows.
 * Preserves header order from SCHEMA.
 * @param {string}   sheetName
 * @param {object[]} rows
 */
function objectsToSheet(sheetName, rows) {
  const headers = SCHEMA[sheetName];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  _wb.Sheets[sheetName] = ws;
  // If sheet was missing from SheetNames, add it
  if (!_wb.SheetNames.includes(sheetName)) {
    _wb.SheetNames.push(sheetName);
  }
}

/**
 * appendRow(sheetName, row) — appends a single row object to a sheet.
 * Does NOT replace existing rows — used for immutable Movements.
 * @param {string} sheetName
 * @param {object} row
 */
function appendRow(sheetName, row) {
  const existing = sheetToObjects(sheetName);
  existing.push(row);
  objectsToSheet(sheetName, existing);
  saveWorkbook();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/** @returns {object} the single Settings row */
function getSettings() {
  const rows = sheetToObjects(SHEET_NAMES.SETTINGS);
  return rows[0] || { ...DEFAULT_SETTINGS };
}

/**
 * saveSettings(data) — overwrites the Settings sheet with a single row.
 * @param {object} data
 */
function saveSettings(data) {
  objectsToSheet(SHEET_NAMES.SETTINGS, [data]);
  saveWorkbook();
}

// ─── Departments ──────────────────────────────────────────────────────────────

function getDepartments() {
  return sheetToObjects(SHEET_NAMES.DEPARTMENTS)
    .map(r => ({ ...r, is_active: String(r.is_active).toLowerCase() !== 'false' }));
}

function saveDepartments(rows) {
  objectsToSheet(SHEET_NAMES.DEPARTMENTS, rows);
  saveWorkbook();
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function getTasks() {
  return sheetToObjects(SHEET_NAMES.TASKS)
    .map(r => ({
      task_name: String(r.task_name || '').trim(),
      is_active: String(r.is_active).toLowerCase() !== 'false',
    }))
    .filter(r => r.task_name);
}

function saveTasks(rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map(r => ({
      task_name: String(r.task_name || '').trim(),
      is_active: String(r.is_active).toLowerCase() !== 'false',
    }))
    .filter(r => r.task_name);

  objectsToSheet(SHEET_NAMES.TASKS, normalized);
  saveWorkbook();
}

// ─── Employees ────────────────────────────────────────────────────────────────

function getEmployees() {
  return sheetToObjects(SHEET_NAMES.EMPLOYEES)
    .map(r => ({ ...r, is_active: String(r.is_active).toLowerCase() !== 'false' }));
}

function saveEmployees(rows) {
  objectsToSheet(SHEET_NAMES.EMPLOYEES, rows);
  saveWorkbook();
}

// ─── Stocks ───────────────────────────────────────────────────────────────────

function getStocks() {
  return sheetToObjects(SHEET_NAMES.STOCKS)
    .map(r => ({
      ...r,
      barcode: String(r.barcode || '').trim(),
      category: String(r.category || '').trim(),
      supplier: String(r.supplier || '').trim(),
      min_stock_threshold: Number(r.min_stock_threshold) || 0,
      is_active: String(r.is_active).toLowerCase() !== 'false',
    }));
}

function saveStocks(rows) {
  const normalized = rows.map(r => ({
    ...r,
    barcode: String(r.barcode || '').trim(),
    category: String(r.category || '').trim(),
    supplier: String(r.supplier || '').trim(),
    min_stock_threshold: Math.max(0, Number(r.min_stock_threshold) || 0),
  }));
  objectsToSheet(SHEET_NAMES.STOCKS, normalized);
  saveWorkbook();
}

// ─── Pullouts (RCM Monitoring) ───────────────────────────────────────────────

function getPullouts() {
  return sheetToObjects(SHEET_NAMES.PULLOUTS)
    .map(r => ({
      ...r,
      qty: Number(r.qty) || 0,
      status: String(r.status || 'in_progress').toLowerCase() === 'done' ? 'done' : 'in_progress',
    }));
}

function savePullouts(rows) {
  const normalized = rows.map(r => ({
    pullout_id: String(r.pullout_id || '').trim(),
    lot_no: String(r.lot_no || '').trim(),
    request_date: String(r.request_date || '').trim(),
    outlet: String(r.outlet || '').trim(),
    stock_id: String(r.stock_id || '').trim(),
    qty: Number(r.qty) || 0,
    schedule_date: String(r.schedule_date || '').trim(),
    pickup_by: String(r.pickup_by || '').trim(),
    status: String(r.status || 'in_progress').toLowerCase() === 'done' ? 'done' : 'in_progress',
    note: String(r.note || '').trim(),
  }));
  objectsToSheet(SHEET_NAMES.PULLOUTS, normalized);
  saveWorkbook();
}

// ─── Movements (append-only) ──────────────────────────────────────────────────

/** @returns {object[]} all movement rows, newest-date first */
function getMovements() {
  return sheetToObjects(SHEET_NAMES.MOVEMENTS)
    .map(r => ({ ...r, qty: Number(r.qty) || 0 }));
}

/**
 * appendMovements(movementRows) — appends one or more Movement rows.
 * Movements are NEVER edited; this is the only write path.
 * @param {object[]} movementRows
 */
function appendMovements(movementRows) {
  const existing = sheetToObjects(SHEET_NAMES.MOVEMENTS);
  const combined = [...existing, ...movementRows];
  objectsToSheet(SHEET_NAMES.MOVEMENTS, combined);
  saveWorkbook();
}

function saveMovements(rows) {
  const normalized = rows.map(r => ({
    ...r,
    qty: Number(r.qty) || 0,
  }));
  objectsToSheet(SHEET_NAMES.MOVEMENTS, normalized);
  saveWorkbook();
  recomputeBalances();
}

// ─── Balances ─────────────────────────────────────────────────────────────────

function getBalances() {
  return sheetToObjects(SHEET_NAMES.BALANCES)
    .map(r => ({ ...r, balance_qty: Number(r.balance_qty) || 0 }));
}

/**
 * recomputeBalances() — rebuilds the Balances sheet from all Movements.
 * Called after every ADD or LESS transaction to keep balances accurate.
 * Strategy:
 *   - ADD with employee_id  → adds to that employee's balance
 *   - ADD without employee_id → adds to virtual employee '__STOCK__'
 *   - LESS → subtracts from the requesting employee's balance
 */
function recomputeBalances() {
  const movements = getMovements();
  /** @type {Map<string, number>} key = "employee_id|stock_id" */
  const map = new Map();

  const key = (empId, stockId) => `${empId || '__STOCK__'}|${stockId}`;

  for (const m of movements) {
    const k = key(m.employee_id, m.stock_id);
    const prev = map.get(k) || 0;
    if (m.type === 'ADD') {
      map.set(k, prev + Number(m.qty));
    } else if (m.type === 'LESS') {
      map.set(k, prev - Number(m.qty));
    }
  }

  const rows = [];
  for (const [k, qty] of map.entries()) {
    const [empId, stockId] = k.split('|');
    rows.push({ employee_id: empId, stock_id: stockId, balance_qty: qty });
  }

  objectsToSheet(SHEET_NAMES.BALANCES, rows);
  saveWorkbook();
  return rows;
}

/**
 * getEmployeeStockBalance(employeeId, stockId) — returns current balance.
 * Reads from the live Balances sheet (already computed).
 * @param {string} employeeId
 * @param {string} stockId
 * @returns {number}
 */
function getEmployeeStockBalance(employeeId, stockId) {
  const balances = getBalances();
  const row = balances.find(r => r.employee_id === employeeId && r.stock_id === stockId);
  return row ? row.balance_qty : 0;
}

/**
 * getTotalStockBalance(stockId) — sum of all balances for a stock across all employees.
 * @param {string} stockId
 * @returns {number}
 */
function getTotalStockBalance(stockId) {
  const balances = getBalances();
  return balances
    .filter(r => r.stock_id === stockId)
    .reduce((sum, r) => sum + r.balance_qty, 0);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  init,
  ensureWorkbook,
  saveWorkbook,
  sheetToObjects,

  getSettings, saveSettings,
  getDepartments, saveDepartments,
  getTasks, saveTasks,
  getEmployees, saveEmployees,
  getStocks, saveStocks,
  getPullouts, savePullouts,
  getMovements, appendMovements, saveMovements,
  getBalances, recomputeBalances,
  getEmployeeStockBalance, getTotalStockBalance,
  getDeliveries, saveDeliveries, appendDelivery,
};
