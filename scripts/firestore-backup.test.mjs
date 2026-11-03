/**
 * scripts/firestore-backup.sh mot en falsk gcloud: hva den leser, hva den slår på,
 * og at en manglende backup gir rød kjøring (exit 1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'firestore-backup.sh');

const DB_OFF = {
  name: 'projects/protop-c189c/databases/(default)',
  locationId: 'eur3',
  pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED',
  deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
};
const DB_ON = {
  ...DB_OFF,
  pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
  deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
  versionRetentionPeriod: '604800s',
  earliestVersionTime: '2026-10-26T12:00:00Z',
};
const SCHEDULES = [
  { name: 'projects/p/databases/(default)/backupSchedules/d1', retention: '1209600s', dailyRecurrence: {} },
  { name: 'projects/p/databases/(default)/backupSchedules/w1', retention: '8467200s', weeklyRecurrence: { day: 'SUNDAY' } },
];
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

/**
 * Falsk gcloud: svarene ligger i en JSON-fil (kommando-prefiks → { out, code }),
 * og hvert kall logges, så testen kan se hva skriptet gjorde.
 */
function run(mode, answers) {
  const dir = mkdtempSync(join(tmpdir(), 'fsbackup-'));
  const log = join(dir, 'calls.log');
  const answersFile = join(dir, 'answers.json');
  writeFileSync(answersFile, JSON.stringify(answers));
  const fake = join(dir, 'gcloud');
  writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(${JSON.stringify(log)}, args + '\\n');
const answers = JSON.parse(fs.readFileSync(${JSON.stringify(answersFile)}, 'utf8'));
const key = Object.keys(answers).sort((a, b) => b.length - a.length).find((k) => args.startsWith(k));
let hit = key ? answers[key] : { out: 'ERROR: (gcloud) ukjent kall i testen: ' + args, code: 1 };
// En liste gir ett svar per kall (det siste gjentas): «midt i gjenoppretting», så ok.
if (Array.isArray(hit)) {
  const countFile = ${JSON.stringify(log)} + '.' + Buffer.from(key).toString('hex');
  const n = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0;
  fs.writeFileSync(countFile, String(n + 1));
  hit = hit[Math.min(n, hit.length - 1)];
}
const out = typeof hit.out === 'string' ? hit.out : JSON.stringify(hit.out);
(hit.code ? process.stderr : process.stdout).write(out);
process.exit(hit.code || 0);
`);
  chmodSync(fake, 0o755);
  const res = spawnSync('bash', [script, mode], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WAIT_SECONDS: '0', WAIT_TRIES: '5' },
  });
  let calls = [];
  try { calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean); } catch { /* ingen kall */ }
  return { code: res.status, out: res.stdout + res.stderr, calls };
}

const healthy = () => ({
  'firestore databases describe': { out: DB_ON },
  'firestore backups schedules list': { out: SCHEDULES },
  'firestore backups list': { out: [
    { name: 'projects/p/locations/eur3/backups/b2', database: 'projects/p/databases/(default)', state: 'READY', snapshotTime: hoursAgo(5) },
    { name: 'projects/p/locations/eur3/backups/b1', database: 'projects/p/databases/(default)', state: 'READY', snapshotTime: hoursAgo(29) },
  ] },
  'storage ls': { out: 'gs://protop-c189c-firestore-arkiv/2026-10-01/\ngs://protop-c189c-firestore-arkiv/2026-11-01/\n' },
});

test('status: alt på plass gir grønn kjøring og endrer ingenting', () => {
  const res = run('status', healthy());
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /PITR\) er på/);
  assert.match(res.out, /Slettebeskyttelse er på/);
  assert.match(res.out, /Daglig backup, beholdes i 14 dager/);
  assert.match(res.out, /Ukentlig backup \(SUNDAY\), beholdes i 14 uker/);
  assert.match(res.out, /2 backuper klare/);
  assert.match(res.out, /Siste eksport: `gs:\/\/protop-c189c-firestore-arkiv\/2026-11-01`/);
  assert.match(res.out, /Alt i orden/);
  assert.ok(!res.calls.some((c) => / (update|create|delete|restore|export) /.test(` ${c} `)), res.calls.join('\n'));
});

test('status: PITR av og ingen planer gir rød kjøring', () => {
  const res = run('status', {
    ...healthy(),
    'firestore databases describe': { out: DB_OFF },
    'firestore backups schedules list': { out: [] },
    'firestore backups list': { out: [] },
  });
  assert.equal(res.code, 1);
  assert.match(res.out, /PITR\) er av/);
  assert.match(res.out, /Slettebeskyttelse er av/);
  assert.match(res.out, /Ingen daglig backup/);
  assert.match(res.out, /Ingen ukentlig backup/);
});

test('status: siste backup eldre enn to døgn gir rød kjøring', () => {
  const answers = healthy();
  answers['firestore backups list'] = { out: [
    { name: 'b', database: 'projects/p/databases/(default)', state: 'READY', snapshotTime: hoursAgo(80) },
  ] };
  const res = run('status', answers);
  assert.equal(res.code, 1);
  assert.match(res.out, /Siste backup er 80 timer gammel/);
});

test('status: manglende tilgang vises som feil, ikke som at alt er bra', () => {
  const res = run('status', {
    ...healthy(),
    'firestore databases describe': { out: 'ERROR: (gcloud.firestore.databases.describe) PERMISSION_DENIED: denied', code: 1 },
  });
  assert.equal(res.code, 1);
  assert.match(res.out, /Kunne ikke lese databasen: ERROR: .*PERMISSION_DENIED/);
});

test('oppsett: slår på PITR og slettebeskyttelse og lager begge planene', () => {
  const res = run('oppsett', {
    ...healthy(),
    'firestore databases describe': { out: DB_OFF },
    'firestore backups schedules list': { out: [] },
    'firestore databases update': { out: '' },
    'firestore backups schedules create': { out: '' },
  });
  const has = (re) => res.calls.some((c) => re.test(c));
  assert.ok(has(/^firestore databases update .*--enable-pitr/), res.calls.join('\n'));
  assert.ok(has(/^firestore databases update .*--delete-protection/));
  assert.ok(has(/^firestore backups schedules create .*--recurrence=daily --retention=14d/));
  assert.ok(has(/^firestore backups schedules create .*--recurrence=weekly --retention=14w --day-of-week=SUN/));
  assert.match(res.out, /Slo på gjenoppretting til tidspunkt/);
  assert.match(res.out, /Daglig backup laget/);
});

test('oppsett: rører ikke det som allerede er riktig, retter feil lagringstid', () => {
  const answers = healthy();
  answers['firestore backups schedules list'] = { out: [
    { name: 'projects/p/databases/(default)/backupSchedules/d1', retention: '604800s', dailyRecurrence: {} },
    SCHEDULES[1],
  ] };
  answers['firestore backups schedules update'] = { out: '' };
  const res = run('oppsett', answers);
  assert.ok(!res.calls.some((c) => c.startsWith('firestore databases update')), res.calls.join('\n'));
  assert.ok(!res.calls.some((c) => c.startsWith('firestore backups schedules create')));
  assert.ok(res.calls.some((c) => /^firestore backups schedules update .*--backup-schedule=d1 --retention=14d/.test(c)), res.calls.join('\n'));
});

test('arkiv: lager bøtta i EU med låst oppbevaring og starter eksport', () => {
  const answers = healthy();
  answers['storage buckets describe'] = { out: 'ERROR: not found', code: 1 };
  answers['storage buckets create'] = { out: '' };
  answers['storage buckets update'] = { out: '' };
  answers['firestore export'] = { out: 'projects/p/databases/(default)/operations/op123' };
  const res = run('arkiv', answers);
  assert.equal(res.code, 0, res.out);
  const create = res.calls.find((c) => c.startsWith('storage buckets create'));
  assert.match(create, /--location=EU/);
  assert.match(create, /--retention-period=365d/);
  assert.match(create, /--public-access-prevention/);
  assert.ok(res.calls.some((c) => /^firestore export gs:\/\/protop-c189c-firestore-arkiv\/\d{4}-\d{2}-\d{2} /.test(c)));
  assert.match(res.out, /Eksport startet .*op123/);
});

test('arkiv: en database i én region får bøtta i samme region', () => {
  const answers = healthy();
  answers['firestore databases describe'] = { out: { ...DB_ON, locationId: 'europe-west1' } };
  answers['storage buckets describe'] = { out: 'ERROR: not found', code: 1 };
  answers['storage buckets create'] = { out: '' };
  answers['storage buckets update'] = { out: '' };
  answers['firestore export'] = { out: 'op' };
  const res = run('arkiv', answers);
  assert.match(res.calls.find((c) => c.startsWith('storage buckets create')), /--location=europe-west1/);
});

test('ukjent handling avvises', () => {
  const res = run('slett-alt', healthy());
  assert.equal(res.code, 2);
});

/** Som run, men med falsk curl (tellingen) og uten ventetid. */
function runRestore(answers, { prod = '120', restored = '118', testDb } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fsbackup-curl-'));
  const curl = join(dir, 'curl');
  writeFileSync(curl, `#!/usr/bin/env bash
case "$*" in
  *gjenoppretting-test*) echo '[{"result":{"aggregateFields":{"n":{"integerValue":"${restored}"}}}}]' ;;
  *) echo '[{"result":{"aggregateFields":{"n":{"integerValue":"${prod}"}}}}]' ;;
esac
`);
  chmodSync(curl, 0o755);
  const prevPath = process.env.PATH;
  const prevDb = process.env.TEST_DB;
  process.env.PATH = `${dir}:${prevPath}`;
  if (testDb !== undefined) process.env.TEST_DB = testDb;
  try {
    return run('test', {
      'firestore operations list': { out: [] },
      'firestore databases list': { out: '' },
      ...answers,
      'auth print-access-token': { out: 'tok' },
    });
  } finally {
    process.env.PATH = prevPath;
    if (prevDb === undefined) delete process.env.TEST_DB; else process.env.TEST_DB = prevDb;
  }
}

test('test: gjenoppretter siste backup til testdatabasen, teller og sletter den igjen', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore databases delete'] = { out: '' };
  const res = runRestore(answers);
  assert.equal(res.code, 0, res.out);
  const restore = res.calls.find((c) => c.startsWith('firestore databases restore'));
  assert.match(restore, /--source-backup=projects\/p\/locations\/eur3\/backups\/b2/);
  assert.match(restore, /--destination-database=gjenoppretting-test-\d{12}/);
  const deletes = res.calls.filter((c) => c.startsWith('firestore databases delete'));
  assert.ok(deletes.length >= 1);
  for (const call of deletes) assert.match(call, /--database=gjenoppretting-test-\d{12} /);
  assert.match(res.out, /118 timeføringer \(produksjon nå: 120\)/);
});

test('test: tom gjenoppretting når produksjon har data gir rød kjøring', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore databases delete'] = { out: '' };
  const res = runRestore(answers, { restored: '0' });
  assert.equal(res.code, 1);
  assert.match(res.out, /har 0 timeføringer/);
});

test('test: nekter å bruke produksjonsdatabasen som testdatabase', () => {
  const answers = healthy();
  answers['firestore databases delete'] = { out: '' };
  const res = runRestore(answers, { testDb: '(default)' });
  assert.equal(res.code, 1);
  assert.ok(!res.calls.some((c) => c.startsWith('firestore databases delete')), res.calls.join('\n'));
  assert.ok(!res.calls.some((c) => c.startsWith('firestore databases restore')));
});

test('test: venter til gjenopprettingen er ferdig, og prøver slettingen igjen mens den pågår', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore operations list'] = [
    { out: [{ name: 'op1', done: false }] },
    { out: [{ name: 'op1', done: true }] },
  ];
  const midRestore = { out: "ERROR: (gcloud.firestore.databases.delete) FAILED_PRECONDITION: Cannot serve because the database 'gjenoppretting-test' is in the middle of restore", code: 1 };
  answers['firestore databases delete'] = [midRestore, midRestore, { out: '' }];
  const res = runRestore(answers);
  assert.equal(res.code, 0, res.out);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore operations list')).length, 2);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore databases delete')).length, 3);
  assert.match(res.out, /er slettet igjen/);
});

test('test: gamle testdatabaser ryddes før ny gjenoppretting, aldri andre databaser', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore databases delete'] = { out: '' };
  answers['firestore databases list'] = { out: [
    'projects/protop-c189c/databases/(default)',
    'projects/protop-c189c/databases/gjenoppretting-test',
    'projects/protop-c189c/databases/gjenoppretting-test-202611031930',
    'projects/protop-c189c/databases/gjenoppretting-2026-11-02',
  ].join('\n') };
  const res = runRestore(answers);
  assert.equal(res.code, 0, res.out);
  const deletes = res.calls.filter((c) => c.startsWith('firestore databases delete'));
  const restoreAt = res.calls.findIndex((c) => c.startsWith('firestore databases restore'));
  assert.match(deletes[0], /--database=gjenoppretting-test /);
  assert.match(deletes[1], /--database=gjenoppretting-test-202611031930 /);
  assert.ok(res.calls.indexOf(deletes[1]) < restoreAt);
  assert.equal(deletes.length, 3, 'to gamle og den nye');
  assert.ok(!deletes.some((c) => c.includes('(default)') || c.includes('gjenoppretting-2026-11-02')), deletes.join('\n'));
  assert.equal((res.out.match(/Slettet en gammel testdatabase/g) || []).length, 2);
});

test('test: sletting som feiler av en annen grunn, stopper med en gang', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore databases delete'] = { out: 'ERROR: PERMISSION_DENIED', code: 1 };
  const res = runRestore(answers);
  assert.equal(res.code, 1);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore databases delete')).length, 1);
});

test('test: testdatabasen arver slettebeskyttelsen, som slås av bare på testdatabasen', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  const protectedErr = { out: 'ERROR: (gcloud.firestore.databases.delete) FAILED_PRECONDITION: Cannot delete the database because delete protection state is set to DELETE_PROTECTION_ENABLED.', code: 1 };
  answers['firestore databases list'] = { out: 'projects/p/databases/gjenoppretting-test' };
  // Gammel testdatabase (beskyttet) ryddes først, så den nye (også beskyttet) etter testen.
  answers['firestore databases delete'] = [protectedErr, { out: '' }, protectedErr, { out: '' }];
  answers['firestore databases update'] = { out: '' };
  const res = runRestore(answers);
  assert.equal(res.code, 0, res.out);
  const updates = res.calls.filter((c) => c.startsWith('firestore databases update'));
  assert.equal(updates.length, 2, res.calls.join('\n'));
  for (const call of updates) {
    assert.match(call, /--database=gjenoppretting-test(-\d{12})? /);
    assert.match(call, /--no-delete-protection/);
  }
  assert.ok(!res.calls.some((c) => c.startsWith('firestore databases update') && c.includes('(default)')));
  assert.match(res.out, /er slettet igjen/);
});

test('test: slettebeskyttelsen som ikke lar seg slå av, gir feil uten å vente', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  answers['firestore databases delete'] = { out: 'ERROR: delete protection state is set to DELETE_PROTECTION_ENABLED', code: 1 };
  answers['firestore databases update'] = { out: 'ERROR: PERMISSION_DENIED', code: 1 };
  const res = runRestore(answers);
  assert.equal(res.code, 1);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore databases delete')).length, 1);
});

test('test: slettebeskyttelse som slår inn sent, gir nye forsøk til databasen er slettet', () => {
  const answers = healthy();
  answers['firestore databases restore'] = { out: '' };
  const protectedErr = { out: 'ERROR: FAILED_PRECONDITION: Cannot delete the database because delete protection state is set to DELETE_PROTECTION_ENABLED.', code: 1 };
  answers['firestore databases delete'] = [protectedErr, protectedErr, protectedErr, { out: '' }];
  answers['firestore databases update'] = { out: '' };
  const res = runRestore(answers);
  assert.equal(res.code, 0, res.out);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore databases delete')).length, 4);
  assert.equal(res.calls.filter((c) => c.startsWith('firestore databases update')).length, 3);
});
