import assert from 'node:assert/strict';
import { pruneUsage, refreshCallerAcl } from './usageLog.js';

// Bruksloggen: hendelser eldre enn 90 dager slettes, nyere blir liggende.
function fakeLog(rows) {
  const store = new Map(rows.map((row) => [row.id, row]));
  return {
    store,
    where(field, op, value) {
      assert.equal(field, 'at');
      assert.equal(op, '<');
      return {
        limit(n) {
          return {
            async get() {
              const docs = [...store.values()]
                .filter((row) => row.at < value)
                .slice(0, n)
                .map((row) => ({ ref: { delete: async () => { store.delete(row.id); } } }));
              return { docs, size: docs.length };
            },
          };
        },
      };
    },
  };
}

const log = fakeLog([
  { id: 'a', at: '2026-10-20T08:00:00.000Z' },
  { id: 'b', at: '2026-06-01T08:00:00.000Z' },
  { id: 'c', at: '2025-12-24T08:00:00.000Z' },
]);
const removed = await pruneUsage(log, new Date('2026-10-27T12:00:00.000Z'));
assert.equal(removed, 2);
assert.deepEqual([...log.store.keys()], ['a']);

// REV-13: eldre apper fornyer ikke tilgangsspeilet selv. recordUsage skriver det for den som logger,
// når det mangler eller går ut innen tre timer.
{
  const docs = new Map();
  const database = {
    doc(path) {
      return {
        async get() { return { exists: docs.has(path), data: () => docs.get(path) }; },
        async set(value) { docs.set(path, value); },
      };
    },
  };
  const now = new Date('2026-10-28T08:00:00.000Z');
  const ctx = {
    data: { type: 'company', ownerUid: 'own', members: ['own', 'hr'], company: { accessPolicy: null } },
    employees: [{ id: 'emp_hr', personUid: 'hr', company: { accessLevels: ['hr_ansvarlig'], status: 'active' } }],
  };
  const path = 'families/A/accessAcl/hr';
  assert.equal(await refreshCallerAcl(database, 'A', 'hr', ctx, now), true, 'mangler: skrives');
  const written = docs.get(path);
  assert.equal(written.uid, 'hr');
  assert.equal(written.employeeId, 'emp_hr');
  assert.equal(written.source, 'function');
  assert.ok(written.expiresAt.getTime() > now.getTime() + 11 * 3600 * 1000);
  assert.equal(await refreshCallerAcl(database, 'A', 'hr', ctx, now), false, 'ferskt: ikke på nytt');
  docs.set(path, { ...written, expiresAt: new Date(now.getTime() + 3600 * 1000) });
  assert.equal(await refreshCallerAcl(database, 'A', 'hr', ctx, now), true, 'går ut om en time: fornyes');
  assert.equal(await refreshCallerAcl(database, 'A', 'ext', ctx, now), false, 'ikke medlem');
  assert.equal(await refreshCallerAcl(database, 'F', 'hr', { ...ctx, data: { ...ctx.data, type: 'family' } }, now), false, 'ikke bedrift');
}

console.log('usageLog.test.mjs: ok');
