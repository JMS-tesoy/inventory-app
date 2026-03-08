/**
 * FILE: src/main/print.js
 * PURPOSE: Opens a hidden BrowserWindow to render report HTML,
 *          then triggers native print dialog or saves to PDF.
 * CONNECTED TO: main/main.js (calls printReport / exportPDF)
 *               domain/reports.js (provides HTML string)
 */

'use strict';

const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

/**
 * printReport(htmlContent) — opens a hidden window and triggers the native print dialog.
 * @param {string} htmlContent  Full HTML string from reports.buildReportHTML()
 */
async function printReport(htmlContent) {
  const win = _createReportWindow(htmlContent);
  win.webContents.on('did-finish-load', () => {
    win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      win.close();
      if (!success && failureReason !== 'Print job canceled') {
        console.error('[print.js] Print failed:', failureReason);
      }
    });
  });
}

/**
 * exportPDF(htmlContent, savePath) — exports the report to a PDF file.
 * If savePath is not provided, opens a Save dialog.
 * @param {string} htmlContent
 * @param {string} [savePath]
 * @returns {Promise<string>} path where PDF was saved
 */
async function exportPDF(htmlContent, savePath) {
  if (!savePath) {
    const { filePath } = await dialog.showSaveDialog({
      title:       'Save Report as PDF',
      defaultPath: 'report.pdf',
      filters:     [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!filePath) return null; // user cancelled
    savePath = filePath;
  }

  return new Promise((resolve, reject) => {
    const win = _createReportWindow(htmlContent);
    win.webContents.on('did-finish-load', async () => {
      try {
        const pdfData = await win.webContents.printToPDF({
          printBackground:    true,
          pageSize:           'Letter',
          landscape:          false,
          marginsType:        1, // default margins
        });
        fs.writeFileSync(savePath, pdfData);
        win.close();
        resolve(savePath);
      } catch (err) {
        win.close();
        reject(err);
      }
    });
  });
}

/**
 * _createReportWindow(htmlContent) — creates a hidden BrowserWindow
 * and loads the report HTML as a data URL.
 * @param {string} htmlContent
 * @returns {BrowserWindow}
 */
function _createReportWindow(htmlContent) {
  const win = new BrowserWindow({
    width:  1100,
    height: 800,
    show:   false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  // Encode HTML as a data URL — works without writing a temp file
  const encoded = Buffer.from(htmlContent, 'utf8').toString('base64');
  win.loadURL(`data:text/html;base64,${encoded}`);

  return win;
}

module.exports = { printReport, exportPDF };
