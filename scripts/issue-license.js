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
    '  node scripts/issue-license.js --machine <MACHINE_ID> --expires <YYYY-MM-DD> [--customer "Name"]',
    '',
    'Options:',
    '  --machine   : Hardware fingerprint (24-char hex, get from app UI)',
    '  --expires   : Expiry date in YYYY-MM-DD format',
    '  --customer  : Optional customer name or branch identifier',
    '  --private-key: Optional path to private key (default: keys/private.pem)',
    '',
    'Example:',
    '  node scripts/issue-license.js --machine A1B2C3D4E5F6G7H8I9J0 --expires 2027-12-31 --customer "Branch Office"',
    '',
  ].join('\n'));
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

// ─── Main Execution ──────────────────────────────────────────────────────────
ensureKeysExist();

const privateKeyPath = getArg('--private-key') || defaultPrivateKeyPath;
const machineId = getArg('--machine').toUpperCase();
const expiresDate = getArg('--expires');
const customer = getArg('--customer');

if (!machineId || !expiresDate) {
  usage();
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error(`❌ Private key not found: ${privateKeyPath}`);
  process.exit(1);
}

const expiresAt = new Date(`${expiresDate}T23:59:59.999Z`);
if (Number.isNaN(expiresAt.getTime())) {
  console.error('❌ Invalid --expires date. Use format YYYY-MM-DD (e.g., 2027-12-31)');
  process.exit(1);
}

const payload = {
  machineId,
  expiresAt: expiresAt.toISOString(),
  issuedAt: new Date().toISOString(),
  customer: customer || '',
};

const payloadB64 = toBase64Url(JSON.stringify(payload));
const signer = crypto.createSign('RSA-SHA256');
signer.update(payloadB64);
signer.end();

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
const signature = signer.sign(privateKeyPem);
const signatureB64 = toBase64Url(signature);

const token = `${payloadB64}.${signatureB64}`;

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║                    LICENSE TOKEN GENERATED                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log('Customer   :', customer || '(none)');
console.log('Machine ID :', machineId);
console.log('Issued At  :', payload.issuedAt);
console.log('Expires At :', payload.expiresAt);
console.log('\n' + '─'.repeat(64));
console.log('TOKEN (copy and send to customer):');
console.log('─'.repeat(64) + '\n');
console.log(token);
console.log('\n' + '─'.repeat(64) + '\n');
