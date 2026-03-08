/**
 * FILE: src/main/menu.js
 * PURPOSE: Defines the native OS application menu.
 *          Edit menu provides copy/paste; View menu provides DevTools (dev only).
 * CONNECTED TO: main/main.js (calls buildMenu)
 */

'use strict';

const { Menu, shell, BrowserWindow, app } = require('electron');

/**
 * buildMenu(mainWindow, dataDir) — creates and sets the application menu.
 * @param {BrowserWindow} mainWindow
 * @param {string} dataDir  Absolute path to the data folder (for "Open Data Folder")
 */
function buildMenu(mainWindow, dataDir) {
  const isDev = process.argv.includes('--dev');

  const template = [
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+F5',
          click: (_menuItem, browserWindow) => {
            const targetWindow = browserWindow || BrowserWindow.getFocusedWindow() || mainWindow;
            if (!targetWindow || targetWindow.isDestroyed()) return;
            targetWindow.webContents.reloadIgnoringCache();
          },
        },
        { type: 'separator' },
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Ctrl+Esc',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' },
          { role: 'toggleDevTools' },
        ] : []),
      ],
    },
    {
      label: 'Data',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(dataDir),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Inventory App',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type:    'info',
              title:   'Inventory App',
              message: 'Inventory App v1.0.0',
              detail:  'Portable offline stock inventory management.\nAll data stored in ./data/inventory.xlsx.\nPowerd by JMS-Dev@2026',
            });
          },
        },
      ],
    },
  ];

  // macOS: add App menu at position 0
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'InventoryApp',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildMenu };
