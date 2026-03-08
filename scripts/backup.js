'use strict';

const path = require('path');
const fs   = require('fs');

/**
 * PORTABLE ARCHITECT RULE: 
 * Resolve the data directory based on execution context.
 */
function resolveDataDir() {
  // Check if we are running from within the 'resources' folder of a built Electron app
  const isBundled = __dirname.includes('app.asar') || __dirname.includes('resources');
  
  if (isBundled) {
    // In production, data is in 'app_data' beside the .exe
    // We go up several levels to reach the root of the portable folder
    return path.join(process.cwd(), 'app_data');
  }
  
  // In development, use the project root /data
  return path.join(__dirname, '..', 'data');
}

const dataDir   = resolveDataDir();
const backupDir = path.join(dataDir, 'backups');
const src       = path.join(dataDir, 'inventory.xlsx');

function parseKeepLast() {
  const keepArg = process.argv.find(a => a.startsWith('--keep='));
  const valueFromArg = keepArg ? Number(keepArg.split('=')[1]) : undefined;
  const keep = Number.isFinite(valueFromArg) ? Math.round(valueFromArg) : 10;
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
    try {
      fs.unlinkSync(path.join(dir, file));
      deleted++;
    } catch (e) {
      console.warn(`[backup] Could not delete ${file}: ${e.message}`);
    }
  }
  return deleted;
}

// EXECUTION logic
try {
  if (!fs.existsSync(src)) {
    console.error(`[backup] ❌ Source not found at: ${src}`);
    process.exit(1);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(backupDir, `inventory-${ts}.xlsx`);
  const keepLast = parseKeepLast();

  fs.copyFileSync(src, dest);
  const deleted = pruneBackups(backupDir, keepLast);

  console.log(`[backup] ✅ Success! Saved to: ${dest}`);
  if (deleted > 0) {
    console.log(`[backup] 🧹 Pruned ${deleted} old backup(s). (Limit: ${keepLast})`);
  }
} catch (err) {
  console.error(`[backup] 💥 Critical Error: ${err.message}`);
  process.exit(1);
}

