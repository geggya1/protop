import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cacheKeysToFree, setItemWithRoom } from './storageRoom.js';

function fakeStorage(limit) {
  const data = new Map();
  const size = () => [...data.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    data,
    async setItem(k, v) {
      const before = data.get(k);
      data.set(k, v);
      if (size() > limit) {
        if (before == null) data.delete(k); else data.set(k, before);
        throw new Error('QuotaExceededError');
      }
    },
    async getItem(k) { return data.has(k) ? data.get(k) : null; },
    async getAllKeys() { return [...data.keys()]; },
    async multiRemove(keys) { keys.forEach((k) => data.delete(k)); },
  };
}

test('e-posttekster ryddes først, så resten av e-postcachen; valg står', () => {
  const keys = [
    'protop.homeLayout.v1.parent.u1',
    'protop.mailCache.v1.u1|c|inbox|0',
    'protop.mailCache.v1.body.u1|c|m1',
    'protop.profileCache.u1',
  ];
  assert.deepEqual(cacheKeysToFree(keys), [
    'protop.mailCache.v1.body.u1|c|m1',
    'protop.mailCache.v1.u1|c|inbox|0',
  ]);
  assert.deepEqual(cacheKeysToFree(null), []);
});

test('full lagring: e-postcachen ryddes og valget lagres', async () => {
  const s = fakeStorage(1000);
  await s.setItem('protop.mailCache.v1.body.u1|c|m1', 'x'.repeat(900));
  assert.equal(await setItemWithRoom(s, 'protop.homeLayout.v1.parent.u1', 'y'.repeat(300)), true);
  assert.equal(await s.getItem('protop.homeLayout.v1.parent.u1'), 'y'.repeat(300));
  assert.equal(await s.getItem('protop.mailCache.v1.body.u1|c|m1'), null);
});

test('full lagring uten cache å rydde: false, ingenting slettes', async () => {
  const s = fakeStorage(1000);
  await s.setItem('protop.profileCache.u1', 'x'.repeat(900));
  assert.equal(await setItemWithRoom(s, 'k', 'y'.repeat(300)), false);
  assert.equal((await s.getItem('protop.profileCache.u1')).length, 900);
});

test('Hjem husker siste valg i økten og lagrer med plass', () => {
  const store = readFileSync(new URL('./homeLayoutStore.js', import.meta.url), 'utf8');
  assert.match(store, /sessionLayouts\.set\(key, next\);/);
  assert.match(store, /const remembered = sessionLayouts\.get\(primaryKey\);/);
  assert.match(store, /await setItemWithRoom\(AsyncStorage, key, JSON\.stringify\(next\)\);/);
});
