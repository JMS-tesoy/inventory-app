/**
 * FILE: src/util/date.js
 * PURPOSE: Date formatting and parsing helpers.
 *          All dates are stored as ISO yyyy-mm-dd strings in Excel.
 * CONNECTED TO: domain/inventory.js, domain/reports.js, renderer views
 */

'use strict';

/**
 * toISO(date) — converts a Date object or date string to 'yyyy-mm-dd'.
 * @param {Date|string} date
 * @returns {string}
 */
function toISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * todayISO() — returns today's date as 'yyyy-mm-dd'.
 * @returns {string}
 */
function todayISO() {
  return toISO(new Date());
}

/**
 * parseISO(str) — parses an ISO date string into a Date (midnight local).
 * @param {string} str  'yyyy-mm-dd'
 * @returns {Date}
 */
function parseISO(str) {
  if (!str) return new Date(NaN);
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * formatDisplay(str) — pretty-prints an ISO date for the UI.
 * e.g., '2024-05-15' → 'May 15, 2024'
 * @param {string} str
 * @returns {string}
 */
function formatDisplay(str) {
  const d = parseISO(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * monthLabel(str) — returns 'Month YYYY' from an ISO date string.
 * @param {string} str
 * @returns {string}
 */
function monthLabel(str) {
  const d = parseISO(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

/**
 * isBetween(dateStr, fromStr, toStr) — inclusive date range check.
 * @param {string} dateStr
 * @param {string} fromStr
 * @param {string} toStr
 * @returns {boolean}
 */
function isBetween(dateStr, fromStr, toStr) {
  return dateStr >= fromStr && dateStr <= toStr;
}

module.exports = { toISO, todayISO, parseISO, formatDisplay, monthLabel, isBetween };
