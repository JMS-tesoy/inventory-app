// ...existing code...
/**
 * FILE: src/main/main.js
 * PURPOSE: Electron entry point. Creates the BrowserWindow, resolves the data
 *          directory, initialises the Excel database, registers all IPC handlers,
 *          and sets up the application menu.
 *
 * Data directory resolution:
 *   - Development (npm start): <project-root>/data/
 *   - Windows portable:        <exe-dir>/data/
 *   - macOS .app:              <parent-of-.app>/data/  (3 levels up from exe inside bundle)
 *
 * CONNECTED TO: db/excel.js (init + all CRUD)
 *               domain/inventory.js (addStocks, lessStocks, getHistory)
 *               domain/reports.js (build*Report, buildReportHTML)
 *               main/print.js (printReport, exportPDF)
 *               main/menu.js (buildMenu)
 *               preload/preload.js (IPC channel names must match)
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const crypto = require('crypto');

// Domain + DB imports (main process only — never exposed to renderer)
const db        = require('../db/excel');
const { SCHEMA, SHEET_NAMES } = require('../db/schema');
const inventory = require('../domain/inventory');
const reports   = require('../domain/reports');
const printer   = require('./print');
const { buildMenu } = require('./menu');

// ─── Data directory resolution (Portable PC Architect Style) ──────────────────

function resolveDataDir() {
  const exeDir = path.dirname(process.execPath);

  if (!app.isPackaged) {
    // Development: use project root /data
    return path.join(__dirname, '..', '..', 'data');
  }

  if (process.platform === 'darwin') {
    // macOS: <parent-of-.app>/app_data/
    return path.join(exeDir, '..', '..', '..', 'app_data');
  }

  // Windows/Linux: Portable executable sits right next to app_data
  return path.join(exeDir, 'app_data');
}

function configureRuntimePaths() {
  const DATA_DIR = resolveDataDir();
  
  // Rule: Redirect all Electron "junk" to the USB
  // This includes LocalStorage, IndexedDB, and Logs
  app.setPath('userData', DATA_DIR); 
  
  // Rule: Redirect Sessions and Cache
  const sessionDir = path.join(DATA_DIR, 'session');
  const cacheDir = path.join(DATA_DIR, 'cache');

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  app.setPath('sessionData', sessionDir);
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
}

// Execute immediately before app boot
configureRuntimePaths();

// ─── App boot ─────────────────────────────────────────────────────────────────

let mainWindow;
let DATA_DIR;
let autoBackupTimer;

const LICENSE_FILE_NAME = 'license.json';
const FALLBACK_LICENSE_PUBLIC_KEY = '';

const AUTO_BACKUP_CHECK_MS = 10 * 60 * 1000; // every 10 minutes

function _toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function _fromBase64Url(input) {
  let value = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4 !== 0) value += '=';
  return Buffer.from(value, 'base64');
}

function _getMachineFingerprint() {
  const cpuModel = os.cpus()?.[0]?.model || 'unknown-cpu';
  const source = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpuModel,
    String(os.totalmem()),
  ].join('|');

  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 24).toUpperCase();
}

function _licenseFilePath() {
  const dir = DATA_DIR || resolveDataDir();
  return path.join(dir, LICENSE_FILE_NAME);
}

function _readLicenseToken() {
  const file = _licenseFilePath();
  if (!fs.existsSync(file)) return '';

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return String(parsed?.token || '').trim();
  } catch {
    return '';
  }
}

function _resolveLicensePublicKey() {
  const fromEnv = String(process.env.APP_LICENSE_PUBLIC_KEY || '').trim();
  if (fromEnv) return fromEnv;

  const publicKeyPath = path.join(DATA_DIR || resolveDataDir(), 'license-public.pem');
  if (fs.existsSync(publicKeyPath)) {
    try {
      const text = String(fs.readFileSync(publicKeyPath, 'utf8') || '').trim();
      if (text) return text;
    } catch {
      // ignore and fall through
    }
  }

  return String(FALLBACK_LICENSE_PUBLIC_KEY || '').trim();
}

function _verifyLicenseToken(token) {
  const machineId = _getMachineFingerprint();
  const text = String(token || '').trim();
  const publicKey = _resolveLicensePublicKey();

  if (!publicKey) {
    return { valid: false, reason: 'public_key_missing', machineId };
  }

  if (!text) {
    return { valid: false, reason: 'missing', machineId };
  }

  const parts = text.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid_format', machineId };
  }

  const [payloadB64, signatureB64] = parts;
  let payload = null;

  try {
    payload = JSON.parse(_fromBase64Url(payloadB64).toString('utf8'));
  } catch {
    return { valid: false, reason: 'invalid_payload', machineId };
  }

  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(payloadB64);
  verify.end();

  let signatureValid = false;
  try {
    signatureValid = verify.verify(publicKey, _fromBase64Url(signatureB64));
  } catch {
    return { valid: false, reason: 'invalid_signature', machineId };
  }

  if (!signatureValid) {
    return { valid: false, reason: 'invalid_signature', machineId };
  }

  const payloadMachineId = String(payload?.machineId || '').trim().toUpperCase();
  if (!payloadMachineId || payloadMachineId !== machineId) {
    return { valid: false, reason: 'machine_mismatch', machineId, payloadMachineId };
  }

  const expiresAt = String(payload?.expiresAt || '').trim();
  const expiresDate = new Date(expiresAt);
  if (!expiresAt || Number.isNaN(expiresDate.getTime())) {
    return { valid: false, reason: 'invalid_expiry', machineId };
  }

  if (Date.now() > expiresDate.getTime()) {
    return { valid: false, reason: 'expired', machineId, expiresAt };
  }

  return {
    valid: true,
    reason: 'ok',
    machineId,
    expiresAt,
    customer: String(payload?.customer || '').trim(),
    issuedAt: String(payload?.issuedAt || '').trim(),
  };
}

function _getLicenseStatus() {
  const token = _readLicenseToken();
  return _verifyLicenseToken(token);
}

function _saveLicenseToken(token) {
  const file = _licenseFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token: String(token || '').trim() }, null, 2), 'utf8');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function _asBool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function _asInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return Math.min(max, Math.max(min, rounded));
}

function _normalizeAutoBackupSettings(settings = {}) {
  return {
    enabled: _asBool(settings.auto_backup_enabled, true),
    intervalHours: _asInt(settings.auto_backup_interval_hours, 24, 1, 24 * 365),
    keepLast: _asInt(settings.auto_backup_keep_last, 10, 1, 500),
    lastRunISO: typeof settings.auto_backup_last_run === 'string' ? settings.auto_backup_last_run : '',
  };
}

function _backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function _pruneBackups(backupDir, keepLast) {
  if (!fs.existsSync(backupDir)) return 0;

  const files = fs.readdirSync(backupDir)
    .filter(name => /^inventory-.*\.xlsx$/i.test(name))
    .sort((a, b) => b.localeCompare(a));

  if (files.length <= keepLast) return 0;

  const toDelete = files.slice(keepLast);
  let deleted = 0;

  for (const name of toDelete) {
    const fullPath = path.join(backupDir, name);
    try {
      fs.unlinkSync(fullPath);
      deleted++;
    } catch (err) {
      console.warn('[backup] Failed to delete old backup:', fullPath, err.message);
    }
  }

  return deleted;
}

function _createInventoryBackup() {
  const src = path.join(DATA_DIR, 'inventory.xlsx');
  if (!fs.existsSync(src)) {
    throw new Error(`inventory.xlsx not found at: ${src}`);
  }

  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const dest = path.join(backupDir, `inventory-${_backupTimestamp()}.xlsx`);
  fs.copyFileSync(src, dest);

  const current = db.getSettings();
  const auto = _normalizeAutoBackupSettings(current);
  const deleted = _pruneBackups(backupDir, auto.keepLast);

  return { path: dest, deleted };
}

function _isAutoBackupDue(lastRunISO, intervalHours) {
  if (!lastRunISO) return true;
  const last = new Date(lastRunISO);
  if (Number.isNaN(last.getTime())) return true;
  const dueAt = last.getTime() + (intervalHours * 60 * 60 * 1000);
  return Date.now() >= dueAt;
}

function _runAutoBackupIfDue(trigger = 'timer') {
  const current = db.getSettings();
  const auto = _normalizeAutoBackupSettings(current);

  if (!auto.enabled) return { ok: true, skipped: true, reason: 'disabled' };
  if (!_isAutoBackupDue(auto.lastRunISO, auto.intervalHours)) {
    return { ok: true, skipped: true, reason: 'not_due' };
  }

  const backup = _createInventoryBackup();
  db.saveSettings({
    ...current,
    auto_backup_enabled: auto.enabled,
    auto_backup_interval_hours: auto.intervalHours,
    auto_backup_keep_last: auto.keepLast,
    auto_backup_last_run: new Date().toISOString(),
  });

  console.log(`[backup] Auto backup completed (${trigger}): ${backup.path}`);
  return { ok: true, ...backup, skipped: false };
}

function _startAutoBackupScheduler() {
  if (autoBackupTimer) clearInterval(autoBackupTimer);

  autoBackupTimer = setInterval(() => {
    try {
      _runAutoBackupIfDue('interval');
    } catch (err) {
      console.error('[backup] Auto backup failed:', err);
    }
  }, AUTO_BACKUP_CHECK_MS);
}

function _csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function _rowsToCSV(rows, headers) {
  const headerLine = headers.map(_csvEscape).join(',');
  const lines = rows.map(row => headers.map(h => _csvEscape(row[h])).join(','));
  return [headerLine, ...lines].join('\r\n');
}

function _parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }

    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map(h => String(h || '').trim());
  const objects = rows.slice(1)
    .filter(r => r.some(c => String(c || '').trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] !== undefined ? String(r[idx]).trim() : '';
      });
      return obj;
    });

  return { headers, rows: objects };
}

function _toCsvBool(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value ?? '').trim().toLowerCase();
  return !(s === 'false' || s === '0' || s === 'no' || s === 'inactive');
}

const CSV_CONFIG = {
  departments: {
    title: 'Departments',
    filePrefix: 'departments',
    headers: SCHEMA[SHEET_NAMES.DEPARTMENTS],
    getRows: () => db.getDepartments(),
    setRows: (rows) => db.saveDepartments(rows.map(r => ({ ...r, is_active: _toCsvBool(r.is_active) }))),
  },
  employees: {
    title: 'Employees',
    filePrefix: 'employees',
    headers: SCHEMA[SHEET_NAMES.EMPLOYEES],
    getRows: () => db.getEmployees(),
    setRows: (rows) => db.saveEmployees(rows.map(r => ({ ...r, is_active: _toCsvBool(r.is_active) }))),
  },
  stocks: {
    title: 'Stocks',
    filePrefix: 'stocks',
    headers: SCHEMA[SHEET_NAMES.STOCKS],
    requiredHeaders: ['stock_id', 'stock_name', 'barcode', 'uom', 'min_stock_threshold', 'is_active'],
    getRows: () => db.getStocks(),
    setRows: (rows) => db.saveStocks(rows.map(r => ({
      ...r,
      barcode: String(r.barcode || '').trim(),
      category: String(r.category || '').trim(),
      supplier: String(r.supplier || '').trim(),
      min_stock_threshold: Math.max(0, Number(r.min_stock_threshold) || 0),
      is_active: _toCsvBool(r.is_active),
    }))),
  },
  movements: {
    title: 'Movements',
    filePrefix: 'movements',
    headers: SCHEMA[SHEET_NAMES.MOVEMENTS],
    getRows: () => db.getMovements(),
    setRows: (rows) => db.saveMovements(rows.map(r => ({ ...r, qty: Number(r.qty) || 0 }))),
  },
};

function _getCsvConfig(entity) {
  const config = CSV_CONFIG[String(entity || '').trim().toLowerCase()];
  if (!config) throw new Error('Unknown CSV dataset. Use departments, employees, stocks, or movements.');
  return config;
}

app.whenReady().then(() => {
  DATA_DIR = resolveDataDir();

  // Ensure data and assets directories exist
  fs.mkdirSync(path.join(DATA_DIR, 'assets'), { recursive: true });

  // Initialise Excel database (creates inventory.xlsx if missing)
  db.init(DATA_DIR);

  mainWindow = createWindow();
  buildMenu(mainWindow, DATA_DIR);
  _runAutoBackupIfDue('startup');
  _startAutoBackupScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
});

function createWindow() {
  const win = new BrowserWindow({
    width:          1280,
    height:         800,
    minWidth:       900,
    minHeight:      600,
    autoHideMenuBar: false,
    titleBarStyle:  process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0F172A',
    webPreferences: {
      preload:          path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.webContents.on('before-input-event', (event, input) => {
    const isRefresh = (input.control || input.meta) && String(input.key).toLowerCase() === 'r';
    if (isRefresh && input.type === 'keyDown') {
      event.preventDefault();
      win.reload();
    }
  });

  win.setMenuBarVisibility(true);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
// All handlers follow the pattern: ipcMain.handle(channel, async (event, ...args) => result)
// Errors are returned as { ok: false, error: message } so the renderer can show a toast.

/** Helper: wraps a function call in try/catch for uniform error responses */
function safe(fn) {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error('[IPC Error]', err);
      return { ok: false, error: err.message };
    }
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', safe(() => {
  const current = db.getSettings();
  const auto = _normalizeAutoBackupSettings(current);
  return {
    ...current,
    auto_backup_enabled: auto.enabled,
    auto_backup_interval_hours: auto.intervalHours,
    auto_backup_keep_last: auto.keepLast,
    auto_backup_last_run: auto.lastRunISO,
  };
}));

// ── License / Validity ──────────────────────────────────────────────────────
ipcMain.handle('license:status', safe(() => {
  return _getLicenseStatus();
}));

ipcMain.handle('license:activate', safe(({ token }) => {
  const check = _verifyLicenseToken(token);
  if (!check.valid) {
    return { ok: false, ...check };
  }

  _saveLicenseToken(token);
  return { ok: true, ...check };
}));

ipcMain.handle('app:quit', safe(() => {
  app.quit();
  return { ok: true };
}));

ipcMain.handle('settings:save', safe((data) => {
  const current = db.getSettings();
  const merged = { ...current, ...data };
  const auto = _normalizeAutoBackupSettings(merged);

  db.saveSettings({
    ...merged,
    auto_backup_enabled: auto.enabled,
    auto_backup_interval_hours: auto.intervalHours,
    auto_backup_keep_last: auto.keepLast,
    auto_backup_last_run: typeof merged.auto_backup_last_run === 'string' ? merged.auto_backup_last_run : '',
  });

  _startAutoBackupScheduler();
  return { ok: true };
}));

// Logo upload: user picks a file; we copy it to ./app_data/assets/logo.png
ipcMain.handle('settings:uploadLogo', safe(async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Company Logo',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }],
    properties: ['openFile'],
  });
  if (!filePaths || filePaths.length === 0) return { ok: false, error: 'Cancelled' };

  const src = filePaths[0];
  const assetsDir = path.join(app.getPath('userData'), 'assets');
  const dest = path.join(assetsDir, 'logo.png');

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.copyFileSync(src, dest);

  // Update settings with a RELATIVE path reference
  const settings = db.getSettings();
  settings.logo_path = './assets/logo.png'; // No drive letter, just relative to DATA_DIR
  db.saveSettings(settings);

  return { ok: true, logoPath: dest };
}));

// ── Departments ───────────────────────────────────────────────────────────────
ipcMain.handle('departments:get', safe(() => db.getDepartments()));
ipcMain.handle('departments:save', safe((rows) => {
  db.saveDepartments(rows);
  return { ok: true };
}));

// ── Tasks ─────────────────────────────────────────────────────────────────────
ipcMain.handle('tasks:get', safe(() => db.getTasks()));
ipcMain.handle('tasks:save', safe((rows) => {
  db.saveTasks(rows);
  return { ok: true };
}));

// ── Employees ─────────────────────────────────────────────────────────────────
ipcMain.handle('employees:get', safe(() => db.getEmployees()));
ipcMain.handle('employees:save', safe((rows) => {
  db.saveEmployees(rows);
  return { ok: true };
}));
ipcMain.handle('employees:resolveDept', safe((employeeId) =>
  inventory.resolveDepartmentForEmployee(employeeId)
));

// ── Stocks ────────────────────────────────────────────────────────────────────
ipcMain.handle('stocks:get', safe(() => db.getStocks()));
ipcMain.handle('stocks:save', safe((rows) => {
  db.saveStocks(rows);
  return { ok: true };
}));
ipcMain.handle('stocks:status', safe(() => {
  const stocks = db.getStocks();
  const balances = db.getBalances();

  const totalByStock = new Map();
  for (const row of balances) {
    const current = totalByStock.get(row.stock_id) || 0;
    totalByStock.set(row.stock_id, current + (Number(row.balance_qty) || 0));
  }

  return stocks.map(s => {
    const current_qty = totalByStock.get(s.stock_id) || 0;
    const min_stock_threshold = Math.max(0, Number(s.min_stock_threshold) || 0);
    return {
      ...s,
      current_qty,
      min_stock_threshold,
      is_low_stock: current_qty <= min_stock_threshold,
    };
  });
}));

// ── Pullouts (RCM Monitoring) ───────────────────────────────────────────────
ipcMain.handle('pullouts:get', safe(() => db.getPullouts()));
ipcMain.handle('pullouts:save', safe((rows) => {
  db.savePullouts(rows);
  return { ok: true };
}));

// ── Movements & Balances ──────────────────────────────────────────────────────
ipcMain.handle('movements:add', safe((tx) => inventory.addStocks(tx)));
ipcMain.handle('movements:less', safe((tx) => inventory.lessStocks(tx)));
ipcMain.handle('movements:history', safe((filters) => inventory.getHistory(filters)));
ipcMain.handle('balances:get', safe(() => db.getBalances()));
ipcMain.handle('balances:employee', safe(({ employeeId, stockId }) =>
  db.getEmployeeStockBalance(employeeId, stockId)
));

// ── Reports & Print ───────────────────────────────────────────────────────────
ipcMain.handle('report:print', safe(async ({ reportType, params }) => {
  const html = _buildReportHTML(reportType, params);
  await printer.printReport(html);
  return { ok: true };
}));

ipcMain.handle('report:exportPDF', safe(async ({ reportType, params }) => {
  const html = _buildReportHTML(reportType, params);
  const savedPath = await printer.exportPDF(html);
  if (!savedPath) return { ok: false, error: 'PDF export cancelled.' };
  return { ok: true, path: savedPath };
}));

function _buildReportHTML(reportType, params) {
  switch (reportType) {
    case 'range':      return reports.buildReportHTML(reports.buildRangeReport(params));
    case 'month':      return reports.buildReportHTML(reports.buildMonthReport(params));
    case 'department': return reports.buildReportHTML(reports.buildDepartmentReport(params));
    case 'employee':   return reports.buildReportHTML(reports.buildEmployeeReport(params));
    default: throw new Error(`Unknown report type: ${reportType}`);
  }
}

// ── Data Tools ────────────────────────────────────────────────────────────────
// ── Deliveries ──────────────────────────────────────────────────────────────────
ipcMain.handle('deliveries:get', safe(() => db.getDeliveries()));
ipcMain.handle('deliveries:save', safe((rows) => { db.saveDeliveries(rows); return { ok: true }; }));
ipcMain.handle('deliveries:append', safe((row) => { db.appendDelivery(row); return { ok: true }; }));
ipcMain.handle('data:openFolder', safe(() => {
  shell.openPath(DATA_DIR);
  return { ok: true };
}));

ipcMain.handle('data:backup', safe(async () => {
  const result = _createInventoryBackup();
  return { ok: true, ...result };
}));

ipcMain.handle('data:restore', safe(async () => {
  const backupDir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title:      'Restore Inventory Backup',
    defaultPath: backupDir,
    filters:    [{ name: 'Excel', extensions: ['xlsx'] }],
    properties: ['openFile'],
  });
  if (!filePaths || filePaths.length === 0) return { ok: false, error: 'Cancelled' };

  const dest = path.join(DATA_DIR, 'inventory.xlsx');
  fs.copyFileSync(filePaths[0], dest);
  db.init(DATA_DIR); // reload workbook
  return { ok: true };
}));

ipcMain.handle('data:exportCSV', safe(async ({ entity }) => {
  const config = _getCsvConfig(entity);
  const exportDir = path.join(DATA_DIR, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: `Export ${config.title} CSV`,
    defaultPath: path.join(exportDir, `${config.filePrefix}-${_backupTimestamp()}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });

  if (!filePath) return { ok: false, error: 'Cancelled' };

  const rows = config.getRows();
  const csv = `\uFEFF${_rowsToCSV(rows, config.headers)}`;
  fs.writeFileSync(filePath, csv, 'utf8');

  return { ok: true, path: filePath, count: rows.length, entity: config.title };
}));

ipcMain.handle('data:importCSV', safe(async ({ entity }) => {
  const config = _getCsvConfig(entity);

  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: `Import ${config.title} CSV`,
    defaultPath: DATA_DIR,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  });

  if (!filePaths || filePaths.length === 0) return { ok: false, error: 'Cancelled' };

  const raw = fs.readFileSync(filePaths[0], 'utf8').replace(/^\uFEFF/, '');
  const parsed = _parseCSV(raw);
  if (parsed.headers.length === 0) {
    throw new Error('CSV is empty or invalid.');
  }

  const requiredHeaders = Array.isArray(config.requiredHeaders) && config.requiredHeaders.length > 0
    ? config.requiredHeaders
    : config.headers;

  const missingHeaders = requiredHeaders.filter(h => !parsed.headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required column(s): ${missingHeaders.join(', ')}`);
  }

  const importedRows = parsed.rows.map(row => {
    const normalized = {};
    config.headers.forEach(h => {
      normalized[h] = row[h] ?? '';
    });
    return normalized;
  });

  const backup = _createInventoryBackup();
  config.setRows(importedRows);

  return {
    ok: true,
    entity: config.title,
    imported: importedRows.length,
    backupPath: backup.path,
    deletedBackups: backup.deleted,
  };
}));
