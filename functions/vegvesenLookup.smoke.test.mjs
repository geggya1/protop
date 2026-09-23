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
assert.match(indexSrc, /if\s*\(!getApps\(\)\.length\)\s*initializeApp\(\)/);

console.log('functions/vegvesenLookup.smoke.test.mjs: all passed');
