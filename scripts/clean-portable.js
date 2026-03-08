'use strict';

const fs = require('fs');
const path = require('path');

const portableDir = path.join(__dirname, '..', 'dist', 'InventoryApp-Portable');

fs.rmSync(portableDir, { recursive: true, force: true });
console.log('[portable] Cleaned:', portableDir);
