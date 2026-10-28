import assert from 'node:assert/strict';
import { pruneUsage } from './usageLog.js';

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

console.log('usageLog.test.mjs: ok');
