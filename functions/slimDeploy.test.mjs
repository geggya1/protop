/**
 * Funksjoner appen kaller på protop.no må ligge i slim-deployen.
 * Ellers svarer Cloud Functions 404 selv om web-bygget er live.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'scripts/deploy-slim-functions.sh'), 'utf8');
const auth = readFileSync(join(root, 'functions/authCallables.js'), 'utf8');
const aiIndex = readFileSync(join(root, 'functions/aiIndex.js'), 'utf8');
const hosp = readFileSync(join(root, 'functions/hospitalityIndex.js'), 'utf8');

const required = [
  'doffinIndex.js',
  'functions:searchDoffin',
  'functions:lookupCompany',
  'functions:sendAnbudRequest',
  'aiIndex.js',
  'functions:aiChat',
  'functions:aiReceiptOcr',
  'functions:scanTimesheetReview',
  'functions:uploadDocumentFile',
  'vegvesenIndex.js',
  'functions:lookupVehicleByReg',
  'membershipIndex.js',
  'functions:listMyFamilies',
  'functions:deleteMyAccount',
  'authIndex.js',
  'functions:sendPasswordResetV2',
  'functions:sendInviteV2',
  'functions:sendEmailVerificationV2',
  'functions:setMemberPassword',
  'functions:lookupAdultProfile',
  'functions:sendFriendChatAdmin',
  'functions:sendFriendInviteV2',
  'hospitalityIndex.js',
  'functions:hospGetNukiStatus',
  'stravaIndex.js',
  'functions:stravaSyncActivities',
  'pushIndex.js',
  'functions:onChatMessageCreated',
];

for (const needle of required) {
  assert.match(script, new RegExp(needle.replace(/[.]/g, '\\.')));
}

assert.doesNotMatch(auth, /defineSecret\(/);
assert.match(auth, /resolveMailApiKey/);
assert.match(aiIndex, /scanTimesheetReview/);
assert.doesNotMatch(aiIndex, /aiCleanupScheduled/);
assert.doesNotMatch(hosp, /hospScheduledSync/);
assert.match(script, /timeout --signal=TERM --kill-after=20s 480/);

console.log('functions/slimDeploy.test.mjs: ok');
