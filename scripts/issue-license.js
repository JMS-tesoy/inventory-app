#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function usage() {
  console.log([
    'Usage:',
    '  node scripts/issue-license.js --private-key <path> --machine <MACHINE_ID> --expires <YYYY-MM-DD> [--customer "Name"]',
    '',
    'Example:',
    '  node scripts/issue-license.js --private-key ./private.pem --machine A1B2C3D4E5F6 --expires 2026-12-31 --customer "Branch 1"',
  ].join('\n'));
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return '';
  return String(process.argv[idx + 1] || '').trim();
}

const privateKeyPath = getArg('--private-key');
const machineId = getArg('--machine').toUpperCase();
const expiresDate = getArg('--expires');
const customer = getArg('--customer');

if (!privateKeyPath || !machineId || !expiresDate) {
  usage();
  process.exit(1);
}

if (!fs.existsSync(privateKeyPath)) {
  console.error('Private key file not found:', privateKeyPath);
  process.exit(1);
}

const expiresAt = new Date(`${expiresDate}T23:59:59.999Z`);
if (Number.isNaN(expiresAt.getTime())) {
  console.error('Invalid --expires date. Use format YYYY-MM-DD.');
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
console.log(token);
