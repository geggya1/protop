import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STORAGE_NOTICE_KEY, STORAGE_NOTICE_TEXT, markStorageNoticeSeen, storageNoticeSeen,
} from './storageNotice.js';

function memory() {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
}

// Første besøk: vis. Etter «OK»: ikke igjen.
const store = memory();
assert.equal(storageNoticeSeen(store), false);
markStorageNoticeSeen(store);
assert.equal(storageNoticeSeen(store), true);
assert.equal(store.getItem(STORAGE_NOTICE_KEY), '1');

// Uten lagring (privat modus eller blokkert) skal den ikke mase ved hver sidevisning.
assert.equal(storageNoticeSeen(null), true);
assert.equal(storageNoticeSeen({ getItem: () => { throw new Error('blokkert'); } }), true);
markStorageNoticeSeen({ setItem: () => { throw new Error('blokkert'); } });

assert.match(STORAGE_NOTICE_TEXT, /ingen sporings/);
assert.match(STORAGE_NOTICE_TEXT, /Google Fonts/);

// Ingen samtykkebanner for statistikk trengs: appen laster ikke analyse- eller sporingsskript.
const root = new URL('../../', import.meta.url);
for (const file of ['app.web.css', 'firebase.js', 'App.jsx']) {
  const text = readFileSync(new URL(file, root), 'utf8');
  assert.doesNotMatch(text, /googletagmanager|google-analytics|firebase\/analytics|hotjar|clarity\.ms|connect\.facebook/i, file);
}

console.log('storageNotice.test.mjs: ok');
