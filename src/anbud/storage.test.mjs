import assert from 'node:assert/strict';
import { fitAnbudState } from './model.js';
import { saveWhereItFits, storeAnbudPayload } from './localStore.js';

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

const crowdedCustomers = Array.from({ length: 1200 }, (_, index) => ({
  id: `kunde_${index}`,
  name: `Kunde ${index} AS`,
  kind: 'org',
  orgnr: String(800000000 + index).slice(0, 9),
  email: `post${index}@example.com`,
  notes: 'Notat '.repeat(30),
  customerNumber: String(10000 + index),
}));
const phoneState = {
  watch: {
    companyName: 'CONSULT1 AS',
    savedAt: '2026-10-16T06:32:00.000Z',
    nationwide: true,
    keywords: ['sykehus', 'rådgivning'],
    profile: { summary: 'Consult1 er en foretrukken leverandør.' },
  },
  notices: [
    {
      id: '2026-7',
      title: 'Sykehus',
      decision: 'aktuell',
      description: 'Kort beskrivelse',
      dossier: { description: 'B'.repeat(8000) },
    },
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `ny-${index}`,
      title: `Ny ${index}`,
      decision: 'ubestemt',
      description: 'N'.repeat(4000),
    })),
  ],
  customers: crowdedCustomers,
};
const phoneQuota = quotaStorage({ quota: 150_000 });
phoneQuota.force('protop.anbud.v1.co1', 'x'.repeat(140_000));
const phoneStored = await storeAnbudPayload(phoneQuota, 'co1', phoneState);
const phoneParsed = JSON.parse(phoneStored);
assert.ok(new TextEncoder().encode(phoneStored).length <= 150_000);
assert.equal(phoneParsed.watch.companyName, 'CONSULT1 AS');
assert.equal(phoneParsed.notices.find((row) => row.id === '2026-7').decision, 'aktuell');
assert.ok(phoneParsed.customers.length > 0);
assert.ok(phoneParsed.customers.length < crowdedCustomers.length);

const remoteOnly = await saveWhereItFits({
  companyId: 'co1',
  writeLocal: async () => {
    const err = new Error('The quota has been exceeded.');
    err.name = 'QuotaExceededError';
    throw err;
  },
  writeRemote: async () => {},
});
assert.equal(remoteOnly, 'remote');

await assert.rejects(() => saveWhereItFits({
  companyId: '',
  writeLocal: async () => {
    const err = new Error('The quota has been exceeded.');
    err.name = 'QuotaExceededError';
    throw err;
  },
  writeRemote: async () => {
    throw new Error('skal ikke kalles uten bedrift');
  },
}));

console.log('storage.test.mjs ok');
