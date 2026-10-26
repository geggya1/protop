/**
 * Funksjoner appen kaller på protop.no må ligge i slim-deployen.
 * Ellers svarer Cloud Functions 404 selv om web-bygget er live.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

// Nye funksjoner finnes først etter deployen. Tilgangen åpnes etterpå, ellers
// blir en ny callable stående lukket for innloggede (skjedde med respondGroupInvite).
const openFor = script.slice(script.indexOf('open_for() {'), script.indexOf('open_queued() {'));
assert.doesNotMatch(openFor, /open_invokers/);
assert.ok(script.indexOf('\ndeploy_queued\nopen_queued\n') > 0, 'open_queued må kjøre rett etter deploy_queued');
for (const name of ['respondGroupInvite', 'syncMyInvites', 'invitePreview', 'findCompanyByOrgnr', 'requestCompanyJoin', 'approveJoinRequest', 'sendIndeksLetter']) {
  assert.match(script, new RegExp(`functions:${name}`));
}

// Alle callables appen kaller må deployes, ellers svarer de 404 på protop.no.
// deleteFamilyCascade finnes ikke på serveren; appen sletter da selv (FamilyDashboardScreen).
// Kalender og Outlook-e-post (calendarIndex.js) trenger Microsoft- og Google-nøkler som
// GitHub-deployen ikke har, og deployes manuelt. Workflowen «Produksjonsstatus» viser om de finnes.
const calendarIndex = readFileSync(join(root, 'functions/calendarIndex.js'), 'utf8');
const MANUAL = new Set([...calendarIndex.matchAll(/^\s+([A-Za-z0-9_]+),?$/gm)].map((m) => m[1]));
assert.ok(MANUAL.has('listMailMessages') && MANUAL.has('exchangeMicrosoftSignIn'));
const NOT_DEPLOYED = new Set(['deleteFamilyCascade', ...MANUAL]);
const called = new Set();
for (const dir of ['src', 'screens', 'components']) {
  for (const rel of readdirSync(join(root, dir), { recursive: true })) {
    if (!/\.(js|jsx)$/.test(rel) || /\.test\./.test(rel)) continue;
    const code = readFileSync(join(root, dir, rel), 'utf8');
    for (const m of code.matchAll(/httpsCallable\(\s*\w+\s*,\s*['"]([A-Za-z0-9_]+)['"]/g)) called.add(m[1]);
    for (const m of code.matchAll(/callFriendFn\(\s*['"]([A-Za-z0-9_]+)['"]/g)) called.add(m[1]);
    // Egne hjelpere som call('navn') i kalenderintegrasjonen.
    for (const m of code.matchAll(/\bcall\(\s*'([a-z][A-Za-z0-9]+)'/g)) called.add(m[1]);
  }
}
assert.ok(called.size > 50, `fant bare ${called.size} callables`);
const missing = [...called].filter((name) => !NOT_DEPLOYED.has(name) && !new RegExp(`functions:${name}\\b`).test(script));
assert.deepEqual(missing, [], `callables som appen kaller, men som ikke deployes: ${missing.join(', ')}`);

console.log('functions/slimDeploy.test.mjs: ok');
