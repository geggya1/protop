import assert from 'node:assert/strict';
import { fitAnbudState } from './model.js';
import { storeAnbudPayload } from './localStore.js';

function quotaStorage({ quota }) {
  const map = new Map();
  let used = 0;
  return {
    map,
    async getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async setItem(key, value) {
      const next = used - (map.get(key)?.length || 0) + String(value).length;
      if (next > quota) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      used = next;
      map.set(key, String(value));
    },
    async removeItem(key) {
      used -= map.get(key)?.length || 0;
      map.delete(key);
    },
    force(key, value) {
      used -= map.get(key)?.length || 0;
      const text = String(value);
      used += text.length;
      map.set(key, text);
    },
  };
}

const fat = {
  watch: {
    companyName: 'CONSULT1 AS',
    savedAt: '2026-10-12T07:47:00.000Z',
    keywords: ['sykehus', 'rådgivning'],
    profile: { summary: 'Consult1 er en foretrukken leverandør.' },
  },
  notices: [{
    id: '2026-7',
    title: 'Sykehus',
    decision: 'aktuell',
    description: 'Kort beskrivelse',
    dossier: { portalFiles: [{ name: 'Krav.pdf', dataUrl: `data:application/pdf;base64,${'A'.repeat(40_000)}` }] },
  }],
  agreementCases: [{ id: 'sak_1', title: 'Rammeavtale' }],
};

const fitted = JSON.stringify(fitAnbudState(fat));
const storage = quotaStorage({ quota: fitted.length + 1000 });
const legacy = 'x'.repeat(fitted.length);
const scoped = 'y'.repeat(fitted.length);
storage.force('protop.anbud.v1', legacy);
storage.force('protop.anbud.v1.co1', scoped);

const stored = await storeAnbudPayload(storage, 'co1', fat);
const parsed = JSON.parse(stored);
assert.equal(parsed.notices.find((row) => row.id === '2026-7').decision, 'aktuell');
assert.equal(parsed.watch.companyName, 'CONSULT1 AS');
assert.equal(stored.includes('data:application'), false);
assert.equal(storage.map.has('protop.anbud.v1'), false);
assert.equal(storage.map.get('protop.anbud.v1.co1'), stored);

const blocked = {
  async setItem() {
    const err = new Error('denied');
    err.name = 'SecurityError';
    throw err;
  },
  async removeItem() {},
};
await assert.rejects(() => storeAnbudPayload(blocked, 'co1', fat));

const original = 'z'.repeat(80);
const crowded = quotaStorage({ quota: 100 });
crowded.force('protop.anbud.v1.co1', original);
crowded.force('protop.anbud.v1', 'q'.repeat(80));
await assert.rejects(() => storeAnbudPayload(crowded, 'co1', fat));
assert.equal(crowded.map.get('protop.anbud.v1.co1'), original);

console.log('storage.test.mjs ok');
