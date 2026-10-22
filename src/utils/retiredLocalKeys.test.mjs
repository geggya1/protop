import assert from 'node:assert/strict';
import { dropRetiredLocalKeys } from './retiredLocalKeys.js';

const store = new Map([
  ['protop.anbud.v1', 'felles'],
  ['protop.anbud.v1.consult1', 'a'],
  ['protop.anbud.v1.annet', 'b'],
  ['protop.anbud.v2.consult1', 'ny'],
  ['protop.anbud.v10', 'annen nøkkel'],
  ['protop.lang', 'nb'],
]);
const storage = {
  getAllKeys: async () => [...store.keys()],
  multiRemove: async (keys) => keys.forEach((key) => store.delete(key)),
};

assert.equal(await dropRetiredLocalKeys(storage, ['protop.anbud.v1']), 3);
assert.deepEqual([...store.keys()], ['protop.anbud.v2.consult1', 'protop.anbud.v10', 'protop.lang']);
// Samme prefiks ryddes bare én gang per økt.
store.set('protop.anbud.v1', 'igjen');
assert.equal(await dropRetiredLocalKeys(storage, ['protop.anbud.v1']), 0);

console.log('retiredLocalKeys.test.mjs ok');
