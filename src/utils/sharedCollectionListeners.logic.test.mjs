/**
 * Lightweight shared-listener hub test (mock map, no Firebase).
 * Run: node --experimental-vm-modules src/utils/sharedCollectionListeners.logic.test.mjs
 *
 * Verifies reference-count semantics used by subscribeFamilyCollection.
 */
import assert from 'node:assert/strict';

function createHub() {
  const hubs = new Map();
  function subscribe(key, onChange) {
    let hub = hubs.get(key);
    if (!hub) {
      hub = { refCount: 0, listeners: new Set(), open: true };
      hubs.set(key, hub);
    }
    hub.refCount += 1;
    hub.listeners.add(onChange);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      hub.listeners.delete(onChange);
      hub.refCount -= 1;
      if (hub.refCount <= 0) {
        hub.open = false;
        hubs.delete(key);
      }
    };
  }
  return { hubs, subscribe };
}

const { hubs, subscribe } = createHub();
const a = subscribe('fam1::events', () => {});
const b = subscribe('fam1::events', () => {});
assert.equal(hubs.get('fam1::events').refCount, 2);
a();
assert.equal(hubs.get('fam1::events').refCount, 1);
assert.equal(hubs.get('fam1::events').open, true);
b();
assert.equal(hubs.has('fam1::events'), false);
console.log('sharedCollectionListeners.logic.test.mjs: ok');
