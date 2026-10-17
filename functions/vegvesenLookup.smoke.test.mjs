/**
 * Smoke: Vegvesen lookup entry must initialize Firebase Admin.
 * Rate limiting (assertRateLimit → getFirestore) throws INTERNAL without init
 * when the function is deployed via the slim vegvesenIndex.js entry.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const lookupSrc = readFileSync(join(__dirname, 'vegvesenLookup.js'), 'utf8');
const indexSrc = readFileSync(join(__dirname, 'vegvesenIndex.js'), 'utf8');

assert.match(lookupSrc, /export const lookupVehicleByReg/);
assert.match(lookupSrc, /assertRateLimit/);
assert.match(lookupSrc, /getFirestore/);
assert.match(lookupSrc, /initializeApp/);
assert.match(lookupSrc, /if\s*\(!getApps\(\)\.length\)\s*initializeApp\(\)/);

assert.match(indexSrc, /initializeApp/);
assert.match(indexSrc, /from '\.\/vegvesenLookup\.js'/);
assert.match(indexSrc, /lookupVehicleByReg/);
assert.match(indexSrc, /lookupVehicleHttp/);
assert.match(indexSrc, /if\s*\(!getApps\(\)\.length\)\s*initializeApp\(\)/);
assert.match(lookupSrc, /export const lookupVehicleHttp/);
assert.match(lookupSrc, /invoker:\s*'public'/);
assert.match(lookupSrc, /limitLookup/);

const deploySrc = readFileSync(join(__dirname, '../scripts/deploy-slim-functions.sh'), 'utf8');
assert.match(deploySrc, /vegvesenIndex\.js functions:lookupVehicleByReg,functions:lookupVehicleHttp/);
const hosting = JSON.parse(readFileSync(join(__dirname, '../firebase.json'), 'utf8'));
const rewrites = hosting.hosting.rewrites.map((row) => row.source);
const proxyAt = rewrites.indexOf('/api/kjoretoy');
const catchAllAt = rewrites.indexOf('**');
assert.ok(proxyAt >= 0 && catchAllAt > proxyAt, '/api/kjoretoy må ligge foran catch-all');
assert.equal(hosting.hosting.rewrites[proxyAt].function.functionId, 'lookupVehicleHttp');

console.log('functions/vegvesenLookup.smoke.test.mjs: all passed');
