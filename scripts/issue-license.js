#!/usr/bin/env node
'use strict';

/**
 * FILE: scripts/issue-license.js
 * PURPOSE: Generate hardware-locked license tokens for portable app
 *          Tokens are signed with RSA private key and verified by main.js
 * USAGE: node scripts/issue-license.js --machine <ID> --expires <DATE> [--customer "Name"]
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ─── Portable PC Architect: Auto-discover keys ───────────────────────────────
const keysDir = path.join(__dirname, '..', 'keys');
const defaultPrivateKeyPath = path.join(keysDir, 'private.pem');
const defaultPublicKeyPath = path.join(keysDir, 'public.pem');

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function ensureKeysExist() {
  if (fs.existsSync(defaultPrivateKeyPath)) return;

  console.log('[license] 🔑 No RSA keys found. Generating 2048-bit keypair...');
  fs.mkdirSync(keysDir, { recursive: true });

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(defaultPrivateKeyPath, privateKey);
  fs.writeFileSync(defaultPublicKeyPath, publicKey);
  console.log('[license] ✅ Keys generated!');
  console.log(`[license]    Private: ${defaultPrivateKeyPath}`);
  console.log(`[license]    Public:  ${defaultPublicKeyPath}`);
  console.log('[license] ⚠️  Keep private.pem SECRET! Deploy public.pem with your app.\n');
}

function usage() {
  console.log([
    'Usage:',
    '  node scripts/issue-license.js --machine <MACHINE_ID> [--duration 1m] [--customer "Name"]',
    '  node scripts/issue-license.js --machine <MACHINE_ID> --expires <YYYY-MM-DD> [--customer "Name"]',
    '',
    'Options:',
    '  --machine   : Hardware fingerprint (24-char hex, get from app UI)',
    '  --duration  : License duration (1w | 1m | 1y). Default: 1m',
    '  --expires   : Explicit expiry date (YYYY-MM-DD). Overrides --duration',
    '  --customer  : Optional customer name or branch identifier',
    '  --private-key: Optional path to private key (default: keys/private.pem)',
    '',
    'Example:',
    '  node scripts/issue-license.js --machine A1B2C3D4E5F6G7H8I9J0 --duration 1y --customer "Branch Office"',
    '',
  ].join('\n'));
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function resolveExpiryDate(durationType = '1m') {
  const expiryDate = new Date();
  const normalized = String(durationType || '1m').trim().toLowerCase();

  if (normalized === '1w') {
    expiryDate.setDate(expiryDate.getDate() + 7);
  } else if (normalized === '1m') {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  } else if (normalized === '1y') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  } else {
    // Default to 1 month if input is invalid.
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  }

  return expiryDate;
}

function issueLicense(customerName, machineId, privateKeyPem, durationType = '1m', explicitExpiresAt = null) {
  const expiresAtDate = explicitExpiresAt || resolveExpiryDate(durationType);

  const payload = {
    machineId: String(machineId || '').toUpperCase(),
    expiresAt: expiresAtDate.toISOString(),
    issuedAt: new Date().toISOString(),
    customer: String(customerName || ''),
  };

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadB64);
  signer.end();

  const signature = signer.sign(privateKeyPem);
  const signatureB64 = toBase64Url(signature);
  const token = `${payloadB64}.${signatureB64}`;

  return { token, payload };
}

// ─── Main Execution ──────────────────────────────────────────────────────────
ensureKeysExist();

const privateKeyPath = getArg('--private-key') || defaultPrivateKeyPath;
const machineId = getArg('--machine').toUpperCase();
const duration = getArg('--duration') || '1m';
const expiresDate = getArg('--expires');
const customer = getArg('--customer');

if (!machineId) {
  usage();
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error(`❌ Private key not found: ${privateKeyPath}`);
  process.exit(1);
}

let explicitExpiresAt = null;
if (expiresDate) {
  explicitExpiresAt = new Date(`${expiresDate}T23:59:59.999Z`);
  if (Number.isNaN(explicitExpiresAt.getTime())) {
    console.error('❌ Invalid --expires date. Use format YYYY-MM-DD (e.g., 2027-12-31)');
    process.exit(1);
  }
}

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const { token, payload } = issueLicense(
  customer,
  machineId,
  privateKeyPem,
  duration,
  explicitExpiresAt
);

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                    LICENSE TOKEN GENERATED                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log('Customer   :', customer || '(none)');
console.log('Machine ID :', machineId);
console.log('Duration   :', expiresDate ? '(custom date via --expires)' : duration);
console.log('Issued At  :', payload.issuedAt);
console.log('Expires At :', payload.expiresAt);
console.log('\n' + '─'.repeat(64));
console.log('TOKEN (copy and send to customer):');
console.log('─'.repeat(64) + '\n');
console.log(token);
console.log('\n' + '─'.repeat(64) + '\n');
