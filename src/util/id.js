/**
 * FILE: src/util/id.js
 * PURPOSE: UUID generation for new records.
 * CONNECTED TO: domain/inventory.js (generates movement_id, dept/emp/stock IDs)
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * newId() — returns a new UUID v4 string.
 * @returns {string}
 */
function newId() {
  return uuidv4();
}

/**
 * shortId(prefix) — returns a short prefixed ID for human-readable IDs.
 * e.g., shortId('EMP') → 'EMP-3f2a'
 * @param {string} prefix
 * @returns {string}
 */
function shortId(prefix = '') {
  const part = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prefix ? `${prefix}-${part}` : part;
}

module.exports = { newId, shortId };
