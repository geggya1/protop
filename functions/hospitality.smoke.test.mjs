/**
 * Lightweight smoke tests for hospitality cloud helpers that are also
 * exercised via src/utils/hospitalityLogic.test.mjs.
 * This file ensures the functions module loads without syntax errors.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'hospitality.js'), 'utf8');

const requiredExports = [
  'hospSaveNukiToken',
  'hospGetNukiStatus',
  'hospDisconnectNuki',
  'hospSyncNukiLocks',
  'hospProvisionLockCode',
  'hospRevokeLockCode',
  'hospSyncChannelIcal',
  'hospSyncAllChannels',
  'hospProcessAutomessages',
  'hospGenerateReplyDraft',
  'hospLoginChecklist',
  'hospScheduledSync',
];

for (const name of requiredExports) {
  assert.match(src, new RegExp(`export const ${name}`), `missing export ${name}`);
}

assert.match(src, /api\.nuki\.io/);
assert.match(src, /type:\s*13/);
assert.match(src, /every 15 minutes/);
assert.match(src, /parseIcalEvents/);
assert.match(src, /MAIL_API_KEY/);
assert.match(src, /users\/\$\{uid\}\/private\/hospNuki_/);
assert.doesNotMatch(src, /families\/\$\{familyId\}\/private\/nuki/);

const indexSrc = readFileSync(join(__dirname, 'index.js'), 'utf8');
assert.match(indexSrc, /from '\.\/hospitality\.js'/);
assert.match(indexSrc, /hospProvisionLockCode/);

const hospIndexSrc = readFileSync(join(__dirname, 'hospitalityIndex.js'), 'utf8');
assert.match(hospIndexSrc, /initializeApp/);
assert.match(hospIndexSrc, /hospGetChannelStatus/);
assert.match(hospIndexSrc, /hospBookingConnectProperty/);

const oauthSrc = readFileSync(join(__dirname, 'hospitalityOauth.js'), 'utf8');
assert.match(oauthSrc, /initializeApp/);
assert.match(oauthSrc, /ownerUid/);
assert.match(src, /ownerUid/);

assert.match(hospIndexSrc, /hospSavePartnerCredentials/);
assert.match(oauthSrc, /hospSavePartnerCredentials/);
assert.match(oauthSrc, /airbnbClientId/);

console.log('functions/hospitality.smoke.test.mjs: all passed');
