/**
 * Appen ber om tilgangsspeilet for alle selskaper: når skallet åpnes, og straks når
 * den som kan endre tilgang ser en endring. Ellers ikke oftere enn hvert tiende minutt.
 */
import assert from 'node:assert/strict';
import {
  ACCESS_SYNC_INTERVAL_MS, accessSignature, accessSyncDue, resetAccessSyncState, scheduleAccessSync,
} from './accessMirror.js';

const now = 1_000_000;
assert.equal(accessSyncDue(null, { now }), true, 'første åpning');
assert.equal(accessSyncDue({ at: now - 1000, key: 'a' }, { now, key: 'a' }), false);
assert.equal(accessSyncDue({ at: now - 1000, key: 'a' }, { now, key: 'b' }), false, 'endring sett av en uten tilgangsstyring');
assert.equal(accessSyncDue({ at: now - 1000, key: 'a' }, { now, key: 'b', force: true }), true, 'nivå endret av tilgangsstyrer');
assert.equal(accessSyncDue({ at: now - 1000, key: 'a' }, { now, key: 'a', force: true }), false);
assert.equal(accessSyncDue({ at: now - ACCESS_SYNC_INTERVAL_MS, key: 'a' }, { now, key: 'a' }), true);

const rows = [
  { id: 'e1', personUid: 'u1', company: { accessLevels: ['ansatt'], status: 'active' }, person: { phone: '1' } },
  { id: 'e2', personUid: 'u2', company: { accessLevel: 'leder' } },
];
const base = accessSignature({ v: 1 }, rows);
assert.equal(accessSignature({ v: 1 }, [...rows].reverse()), base, 'rekkefølgen spiller ingen rolle');
assert.equal(accessSignature({ v: 1 }, [{ ...rows[0], person: { phone: '2' } }, rows[1]]), base, 'telefon påvirker ikke tilgang');
assert.notEqual(accessSignature({ v: 2 }, rows), base);
assert.notEqual(accessSignature({ v: 1 }, [{ ...rows[0], company: { accessLevels: ['administrator'], status: 'active' } }, rows[1]]), base);
assert.notEqual(accessSignature({ v: 1 }, [{ ...rows[0], company: { accessLevels: ['ansatt'], status: 'inactive' } }, rows[1]]), base);

// Flere skjermer ber samtidig: ett kall. En endring mens kallet går, kjøres etterpå.
resetAccessSyncState();
const calls = [];
let release;
const call = (id) => {
  calls.push(id);
  return new Promise((resolve) => { release = resolve; });
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
scheduleAccessSync('A', { key: 'k1', call, delayMs: 1 });
scheduleAccessSync('A', { key: 'k1', call, delayMs: 1 });
await wait(20);
assert.deepEqual(calls, ['A']);
scheduleAccessSync('A', { key: 'k2', force: true, call, delayMs: 1 });
await wait(20);
assert.deepEqual(calls, ['A'], 'venter på kallet som går');
release();
await wait(20);
assert.deepEqual(calls, ['A', 'A']);
release();
const cancel = scheduleAccessSync('B', { call, delayMs: 5 });
cancel();
await wait(20);
assert.deepEqual(calls, ['A', 'A'], 'avbrutt før kallet');
assert.doesNotThrow(() => scheduleAccessSync('', { call })());

console.log('accessMirror.test.mjs: ok');
