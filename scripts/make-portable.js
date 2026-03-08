'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const portableDir = path.join(distDir, 'InventoryApp-Portable');
const dataDir = path.join(portableDir, 'app_data');
const assetsDir = path.join(dataDir, 'assets');
const readmePath = path.join(portableDir, 'README.txt');

function resolvePortableExe() {
  const preferred = fs.readdirSync(distDir)
    .filter(name => /^InventoryApp_v.*_Offline\.exe$/i.test(name))
    .sort((a, b) => b.localeCompare(a));

  if (preferred.length > 0) {
    return path.join(distDir, preferred[0]);
  }

  // Backward compatibility with older build naming
  const legacy = path.join(distDir, 'InventoryApp-win-portable.exe');
  if (fs.existsSync(legacy)) return legacy;

  return '';
}

if (!fs.existsSync(distDir)) {
  console.error(`[portable] Dist folder not found: ${distDir}`);
  console.error('[portable] Run "npm run build:win" first.');
  process.exit(1);
}

const portableExe = resolvePortableExe();
if (!portableExe) {
  console.error('[portable] Portable EXE not found in dist/.');
  console.error('[portable] Expected file like InventoryApp_v1.0.0_Offline.exe.');
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

const sourcePublicKey = path.join(projectRoot, 'keys', 'public.pem');
if (fs.existsSync(sourcePublicKey)) {
  fs.copyFileSync(sourcePublicKey, path.join(dataDir, 'license-public.pem'));
}

const readme = [
  'InventoryApp Portable Package',
  '',
  'How to use:',
  '1) Keep this folder structure as-is.',
  `2) Run ${path.basename(exeDest)}.`,
  '3) Your data is saved in .\\app_data\\inventory.xlsx next to the EXE.',
  '',
  '4) Keep private.pem OFF this folder. Only license-public.pem is allowed.',
  '',
  'Move or copy this whole folder to another location/PC to carry your data.',
].join('\n');

fs.writeFileSync(readmePath, readme, 'utf8');

console.log('[portable] Ready:', portableDir);
