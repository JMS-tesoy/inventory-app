/**
 * FILE: src/preload/preload.js
 * PURPOSE: Secure bridge between Electron main process and renderer.
 *          Uses contextBridge to expose ONLY whitelisted IPC channels.
 *          The renderer accesses these via window.api.* — no direct Node access.
 * CONNECTED TO: main/main.js (IPC channel names must match exactly)
 *               renderer/app.js (consumes window.api)
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * invoke(channel, ...args) — wraps ipcRenderer.invoke for safe two-way IPC.
 * Only channels listed in ALLOWED_CHANNELS are permitted.
 */
const ALLOWED_CHANNELS = [
  'settings:get', 'settings:save', 'settings:uploadLogo',
  'departments:get', 'departments:save',
  'tasks:get', 'tasks:save',
  'employees:get', 'employees:save', 'employees:resolveDept',
  'stocks:get', 'stocks:save', 'stocks:status',
  'pullouts:get', 'pullouts:save',
  'movements:add', 'movements:less', 'movements:history',
  'balances:get', 'balances:employee',
  'report:print', 'report:exportPDF',
  'data:openFolder', 'data:backup', 'data:restore', 'data:exportCSV', 'data:importCSV',
  'license:status', 'license:activate', 'app:quit',
  'deliveries:get', 'deliveries:save', 'deliveries:append',
];

contextBridge.exposeInMainWorld('api', {
  /**
   * invoke(channel, payload?) — sends a request to the main process and awaits the result.
   * @param {string} channel   Must be one of ALLOWED_CHANNELS
   * @param {any}    [payload] Data to send
   * @returns {Promise<any>}
   */
  invoke: (channel, payload) => {
    if (!ALLOWED_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Channel "${channel}" is not allowed.`));
    }
    return ipcRenderer.invoke(channel, payload);
  },
});
