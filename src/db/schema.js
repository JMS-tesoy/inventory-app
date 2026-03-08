/**
 * FILE: src/db/schema.js
 * PURPOSE: Defines the structure of every sheet in inventory.xlsx.
 *          Used by excel.js to ensure sheets/headers exist on first run,
 *          and by the domain layer to know column names.
 * CONNECTED TO: db/excel.js (reads schema to create/validate sheets)
 *               domain/inventory.js (references column keys)
 */

'use strict';

/**
 * SHEET_NAMES — canonical sheet name constants.
 * Use these everywhere instead of raw strings to avoid typos.
 */
const SHEET_NAMES = {
  SETTINGS:              'Settings',
  DEPARTMENTS:           'Departments',
  TASKS:                 'Tasks',
  EMPLOYEES:             'Employees',
  STOCKS:                'Stocks',
  MOVEMENTS:             'Movements',
  BALANCES:              'Balances_Employee_Stock',
  PULLOUTS:              'Pullouts',
};

/**
 * SCHEMA — maps each sheet name to its ordered column headers (Row 1).
 * The order here dictates the column order in the Excel file.
 */
const SCHEMA = {
  [SHEET_NAMES.SETTINGS]: [
    'company_name',
    'company_address',
    'company_phone',
    'logo_path',
    'prepared_by_name',
    'prepared_by_title',
    'checked_by_name',
    'checked_by_title',
    'approved_by_name',
    'approved_by_title',
    'auto_backup_enabled',
    'auto_backup_interval_hours',
    'auto_backup_keep_last',
    'auto_backup_last_run',
    'app_lock_enabled',
    'app_lock_pin',
    'ui_theme',
    'ui_font_size',
  ],

  [SHEET_NAMES.DEPARTMENTS]: [
    'department_id',
    'department_name',
    'is_active',
  ],

  [SHEET_NAMES.TASKS]: [
    'task_name',
    'is_active',
  ],

  [SHEET_NAMES.EMPLOYEES]: [
    'employee_id',
    'employee_name',
    'department_id',
    'task',
    'is_active',
  ],

  [SHEET_NAMES.STOCKS]: [
    'stock_id',
    'stock_name',
    'barcode',
    'category',
    'supplier',
    'uom',
    'min_stock_threshold',
    'is_active',
  ],

  [SHEET_NAMES.MOVEMENTS]: [
    'movement_id',
    'date',
    'type',          // 'ADD' | 'LESS'
    'employee_id',
    'department_id',
    'stock_id',
    'qty',
    'note',
  ],

  [SHEET_NAMES.BALANCES]: [
    'employee_id',
    'stock_id',
    'balance_qty',
  ],

  [SHEET_NAMES.PULLOUTS]: [
    'pullout_id',
    'lot_no',
    'request_date',
    'outlet',
    'stock_id',
    'qty',
    'schedule_date',
    'pickup_by',
    'status',
    'note',
  ],
};

/**
 * DEFAULT_SETTINGS — the single Settings row used on first run.
 * All values can be edited later via the Settings UI.
 */
const DEFAULT_SETTINGS = {
  company_name:       'My Company',
  company_address:    '123 Main Street, City',
  company_phone:      '+1 (555) 000-0000',
  logo_path:          './data/assets/logo.png',
  prepared_by_name:   '',
  prepared_by_title:  '',
  checked_by_name:    '',
  checked_by_title:   '',
  approved_by_name:   '',
  approved_by_title:  '',
  auto_backup_enabled: true,
  auto_backup_interval_hours: 24,
  auto_backup_keep_last: 10,
  auto_backup_last_run: '',
  app_lock_enabled: false,
  app_lock_pin: '',
  ui_theme: 'dark',
  ui_font_size: 'normal',
};

module.exports = { SHEET_NAMES, SCHEMA, DEFAULT_SETTINGS };
