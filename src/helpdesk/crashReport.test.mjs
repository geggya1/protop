import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRASH_FIELDS, buildCrashReport, crashSignature, createCrashThrottle, groupCrashReports, isNoise,
} from './crashReport.js';

test('rapporten har bare tillatte felt og vasker hemmeligheter', () => {
  const err = new TypeError('Cannot read properties of undefined (reading x) apiKey=AIzaSyA1234567890abcdefghijklmnop');
  const r = buildCrashReport(err, {
    kind: 'render', fatal: true, componentStack: '\n    at ProjectWorkScreen', route: 'Home · /hjem/prosjekter',
    url: 'https://protop.no/hjem/prosjekter?token=hemmelig#x', platform: 'web', buildId: 'abc', nowMs: 1000,
  });
  assert.deepEqual(Object.keys(r).filter((k) => !CRASH_FIELDS.includes(k)), []);
  assert.equal(r.kind, 'render');
  assert.equal(r.fatal, true);
  assert.equal(r.url, 'https://protop.no/hjem/prosjekter');
  assert.doesNotMatch(r.message, /AIzaSy/);
  assert.match(r.message, /^TypeError: Cannot read/);
  assert.equal(r.createdAtMs, 1000);
  assert.equal(r.expireAt.getTime(), 1000 + 30 * 24 * 3600 * 1000);
});

test('lange felt kuttes til grensene i reglene', () => {
  const r = buildCrashReport({ message: 'x'.repeat(5000), stack: 'y'.repeat(9000) }, { nowMs: 1 });
  assert.ok(r.message.length <= 1000);
  assert.ok(r.stack.length <= 6000);
  assert.ok(r.signature.length <= 200);
});

test('samme feil med andre tall og id-er gir samme signatur', () => {
  const a = crashSignature('error', 'Fant ikke prosjekt 12345 (abcdef0123456789)', 'Error\n    at loadProject (index-1.js:1:2)');
  const b = crashSignature('error', 'Fant ikke prosjekt 999 (fedcba9876543210)', 'Error\n    at loadProject (index-2.js:9:9)');
  assert.equal(a, b);
  assert.notEqual(a, crashSignature('render', 'Fant ikke prosjekt 1', 'at loadProject'));
});

test('støy fra nettleseren rapporteres ikke', () => {
  assert.equal(isNoise('ResizeObserver loop completed with undelivered notifications.'), true);
  assert.equal(isNoise('Script error.'), true);
  assert.equal(buildCrashReport('ResizeObserver loop limit exceeded'), null);
  assert.equal(isNoise('TypeError: x is undefined'), false);
});

test('høyst 20 rapporter per økt, og samme feil høyst hvert 5. minutt', () => {
  const t = createCrashThrottle();
  assert.equal(t.allow('a', 0), true);
  assert.equal(t.allow('a', 1000), false);
  assert.equal(t.allow('a', 5 * 60 * 1000 + 1), true);
  for (let i = 0; i < 30; i += 1) t.allow(`s${i}`, 0);
  assert.equal(t.sent, 20);
});

test('helpdesken får feilene gruppert, nyeste først', () => {
  const rows = [
    { signature: 's1', kind: 'error', message: 'A', uid: 'u1', companyId: 'c1', platform: 'web', createdAtMs: 10, fatal: false },
    { signature: 's1', kind: 'error', message: 'A', uid: 'u2', companyId: 'c1', platform: 'ios', createdAtMs: 30, fatal: true, stack: 'nyest' },
    { signature: 's2', kind: 'render', message: 'B', uid: 'u1', createdAtMs: 20 },
  ];
  const g = groupCrashReports(rows);
  assert.deepEqual(g.map((x) => x.signature), ['s1', 's2']);
  assert.equal(g[0].count, 2);
  assert.equal(g[0].users, 2);
  assert.equal(g[0].companies, 1);
  assert.equal(g[0].fatal, 1);
  assert.deepEqual(g[0].platforms.sort(), ['ios', 'web']);
  assert.equal(g[0].sample.stack, 'nyest');
  assert.equal(g[0].firstAtMs, 10);
  assert.equal(g[0].lastAtMs, 30);
});
