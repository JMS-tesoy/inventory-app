'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const portableExe = path.join(distDir, 'InventoryApp-win-portable.exe');
const portableDir = path.join(distDir, 'InventoryApp-Portable');
const dataDir = path.join(portableDir, 'data');
const assetsDir = path.join(dataDir, 'assets');
const readmePath = path.join(portableDir, 'README.txt');

if (!fs.existsSync(portableExe)) {
  console.error(`[portable] Portable EXE not found: ${portableExe}`);
  console.error('[portable] Run "npm run build:win" first.');
  process.exit(1);
}

fs.mkdirSync(portableDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

const exeDest = path.join(portableDir, path.basename(portableExe));
fs.copyFileSync(portableExe, exeDest);

const sourceDataDir = path.join(projectRoot, 'data');
const sourceWorkbook = path.join(sourceDataDir, 'inventory.xlsx');
if (fs.existsSync(sourceWorkbook)) {
  fs.copyFileSync(sourceWorkbook, path.join(dataDir, 'inventory.xlsx'));
}

const sourceLogo = path.join(sourceDataDir, 'assets', 'logo.png');
if (fs.existsSync(sourceLogo)) {
  fs.copyFileSync(sourceLogo, path.join(assetsDir, 'logo.png'));
}

const readme = [
  'InventoryApp Portable Package',
  '',
  'How to use:',
  '1) Keep this folder structure as-is.',
  '2) Run InventoryApp-win-portable.exe.',
  '3) Your data is saved in .\\data\\inventory.xlsx next to the EXE.',
  '',
  'Move or copy this whole folder to another location/PC to carry your data.',
].join('\n');

fs.writeFileSync(readmePath, readme, 'utf8');

console.log('[portable] Ready:', portableDir);
