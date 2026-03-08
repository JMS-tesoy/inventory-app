/**
 * FILE: scripts/backup.js
 * PURPOSE: Standalone Node.js script to back up inventory.xlsx with a timestamp
 *          and keep only the newest N backup files.
 *          Run from project root: node scripts/backup.js [--keep=10]
 * CONNECTED TO: data/inventory.xlsx (source)
 *               data/backups/ (destination folder)
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const dataDir   = path.join(__dirname, '..', 'data');
const backupDir = path.join(dataDir, 'backups');
const src       = path.join(dataDir, 'inventory.xlsx');

function parseKeepLast() {
  const keepArg = process.argv.find(a => a.startsWith('--keep='));
  const valueFromArg = keepArg ? Number(keepArg.split('=')[1]) : undefined;
  const valueFromEnv = Number(process.env.BACKUP_KEEP_LAST);
  const raw = Number.isFinite(valueFromArg) ? valueFromArg : valueFromEnv;
  const keep = Number.isFinite(raw) ? Math.round(raw) : 10;
  return Math.min(500, Math.max(1, keep));
}

function pruneBackups(dir, keepLast) {
  if (!fs.existsSync(dir)) return 0;

  const files = fs.readdirSync(dir)
    .filter(name => /^inventory-.*\.xlsx$/i.test(name))
    .sort((a, b) => b.localeCompare(a));

  if (files.length <= keepLast) return 0;

  const toDelete = files.slice(keepLast);
  let deleted = 0;
  for (const file of toDelete) {
    fs.unlinkSync(path.join(dir, file));
    deleted++;
  }
  return deleted;
}

if (!fs.existsSync(src)) {
  console.error(`[backup] inventory.xlsx not found at: ${src}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(backupDir, `inventory-${ts}.xlsx`);
const keepLast = parseKeepLast();

fs.copyFileSync(src, dest);
const deleted = pruneBackups(backupDir, keepLast);
console.log(`[backup] ✓ Backup saved to: ${dest}`);
if (deleted > 0) {
  console.log(`[backup] ✓ Removed ${deleted} old backup(s). Keep last: ${keepLast}`);
}
