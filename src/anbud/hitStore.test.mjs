import assert from 'node:assert/strict';
import { fitAnbudState, mergeAnbudStates } from './model.js';
import {
  HIT_STORAGE_BYTES, hitRow, hitsSignature, mergeHitPacks, packHits, withHits,
} from './hitStore.js';
import { anbudHitsKey, storeHitsPayload } from './localStore.js';

const NOW = new Date('2026-10-27T09:00:00Z');
const TEXT = 'Konsulenttjenester rådgivning prosjektering byggeledelse rammeavtale kommune sykehus vei bro tunnel '.repeat(20);

function notice(i, extra = {}) {
  return {
    id: `2026-${100000 + i}`,
    title: `Rådgivning og prosjektering ${i}`,
    buyer: 'Haugesund kommune',
    description: TEXT.slice(0, 1400),
    places: ['Rogaland'],
    publishedAt: `2026-10-${String(1 + (i % 27)).padStart(2, '0')}`,
    deadline: '2026-11-27',
    source: i % 2 ? 'ted' : 'doffin',
    url: `https://www.doffin.no/notices/2026-${100000 + i}`,
    cpvCodes: ['71310000'],
    status: 'ACTIVE',
    noticeType: 'Kunngjøring av konkurranse',
    decision: 'ubestemt',
    reviewedAt: null,
    aiFit: { score: 7, reason: 'Passer rådgivning.', at: '2026-10-20T10:00:00Z' },
    geo: { lat: 59.4, lng: 5.3, label: 'Haugesund', precision: 'city', source: 'nominatim' },
    ...extra,
  };
}

// Lett rad: grunnlag, vedlegg og notater ligger i hoveddokumentet, ikke i trefflisten.
const heavy = notice(1, {
  decision: 'aktuell',
  reviewedAt: '2026-10-21T08:00:00Z',
  dossier: { portalFiles: [{ name: 'Krav.pdf', dataUrl: 'data:application/pdf;base64,AAAA' }] },
  reviewNotes: [{ id: 'n1', text: 'Sjekk referanser' }],
  brief: { summary: 'Sammendrag' },
  description: 'x'.repeat(5000),
});
const light = hitRow(heavy);
assert.equal(light.id, heavy.id);
assert.equal(light.decision, 'aktuell');
assert.equal(light.reviewedAt, '2026-10-21T08:00:00Z');
assert.equal(light.description.length, 1500);
assert.equal('dossier' in light, false);
assert.equal('reviewNotes' in light, false);
assert.equal('brief' in light, false);
assert.equal(light.aiFit.score, 7);
assert.equal(light.geo.label, 'Haugesund');
assert.equal(hitRow({ id: 'a', amount: null }).amount, null);

// Selve feilen: et selskap med stort kunderegister. Hoveddokumentet slipper alle ubehandlede treff,
// mens trefflisten for seg beholder dem, og vurderingene står.
const notices = Array.from({ length: 332 }, (_, i) => notice(i, i % 5 === 0
  ? { decision: 'forkastet', reviewedAt: '2026-10-20T10:00:00Z' }
  : {}));
const undecided = notices.filter((row) => row.decision === 'ubestemt').length;
const crowded = {
  watch: { companyName: 'CONSULT1 AS', savedAt: '2026-10-12T07:47:00Z', keywords: ['rådgivning'] },
  notices,
  customers: Array.from({ length: 3000 }, (_, i) => ({
    id: `c${i}`,
    name: `Kunde nummer ${i} AS`,
    orgnr: '912345678',
    email: `post${i}@kunde.no`,
    phone: '+47 900 00 000',
    address: 'Storgata 1, 0155 Oslo',
    contact: 'Ola Nordmann',
    notes: 'Viktig kunde med rammeavtale.',
  })),
  syncedAt: '2026-10-27T07:58:00Z',
  queryKey: 'q1',
};
const mainDoc = fitAnbudState(crowded);
const keptInMain = mainDoc.notices.filter((row) => row.decision === 'ubestemt').length;
assert.ok(keptInMain < undecided, 'hoveddokumentet har ikke plass til alle ubehandlede treff');

const pack = packHits(crowded, HIT_STORAGE_BYTES, NOW);
assert.equal(pack.notices.length, 332);
assert.ok(JSON.stringify(pack).length <= HIT_STORAGE_BYTES);
assert.equal(pack.syncedAt, '2026-10-27T07:58:00Z');
assert.equal(pack.queryKey, 'q1');

const restored = withHits(mainDoc, pack);
assert.equal(restored.notices.length, 332);
assert.equal(restored.notices.filter((row) => row.decision === 'ubestemt').length, undecided);
assert.equal(restored.notices.filter((row) => row.decision === 'forkastet').length, 332 - undecided);
assert.equal(restored.syncedAt, '2026-10-27T07:58:00Z');
assert.equal(restored.queryKey, 'q1');

// Nyere vurdering i hoveddokumentet vinner over en eldre kopi i trefflisten.
const older = packHits({ notices: [notice(7)], syncedAt: '2026-10-26T07:00:00Z' }, HIT_STORAGE_BYTES, NOW);
const main = { notices: [notice(7, { decision: 'aktuell', reviewedAt: '2026-10-27T08:00:00Z', dossier: { id: 'd7' } })] };
const merged = withHits(main, older);
assert.equal(merged.notices.length, 1);
assert.equal(merged.notices[0].decision, 'aktuell');
assert.equal(merged.notices[0].dossier.id, 'd7');

// En kortet kopi skal ikke erstatte hele teksten, og en slank rad får tilbake AI-vurdering og kartpunkt.
const full = notice(8, { description: 'y'.repeat(4000) });
const shortCopy = packHits({ notices: [full] }, 40_000, NOW);
const slim = { notices: [{ id: full.id, title: full.title, decision: 'ubestemt', publishedAt: full.publishedAt }] };
const rich = withHits({ notices: [full] }, shortCopy);
assert.equal(rich.notices[0].description.length, 4000);
const filled = withHits(slim, packHits({ notices: [full] }, HIT_STORAGE_BYTES, NOW));
assert.equal(filled.notices[0].aiFit.score, 7);
assert.equal(filled.notices[0].geo.label, 'Haugesund');
// Samme regel gjelder når to lagrede tilstander slås sammen.
const both = mergeAnbudStates({ notices: [full] }, slim);
assert.equal(both.notices[0].description.length, 4000);
assert.equal(both.notices[0].aiFit.score, 7);

// Tom treffliste endrer ingenting.
const untouched = { notices: [notice(9)], syncedAt: null };
assert.equal(withHits(untouched, null), untouched);

// Trangt budsjett: utløpte ubehandlede slippes først, så de eldste ubehandlede. Vurderte står.
const tight = [
  notice(20, { publishedAt: '2026-08-01', deadline: '2026-09-01' }),
  notice(21, { publishedAt: '2026-08-02', deadline: '2026-12-01' }),
  notice(22, { publishedAt: '2026-10-25', deadline: '2026-12-01' }),
  notice(23, { publishedAt: '2026-07-01', decision: 'aktuell', reviewedAt: '2026-07-02T08:00:00Z' }),
];
// Budsjettet rommer akkurat to rader med kortest tekst, så to rader må ut.
const roomForTwo = JSON.stringify({
  syncedAt: null, queryKey: '', notices: [hitRow(tight[2], 200), hitRow(tight[3], 200)],
}).length + 40;
const twoLeft = packHits({ notices: tight }, roomForTwo, NOW);
assert.deepEqual(twoLeft.notices.map((row) => row.id).sort(), [tight[2].id, tight[3].id].sort());

// To lagrede lister slås sammen: ingen treff forsvinner og nyeste vurdering vinner.
const left = { notices: [hitRow(notice(30)), hitRow(notice(31))], syncedAt: '2026-10-26T07:00:00Z', queryKey: 'gammel' };
const right = {
  notices: [hitRow(notice(31, { decision: 'forkastet', reviewedAt: '2026-10-27T08:00:00Z' })), hitRow(notice(32))],
  syncedAt: '2026-10-27T08:00:00Z',
  queryKey: 'ny',
};
const union = mergeHitPacks(left, right);
assert.deepEqual(union.notices.map((row) => row.id).sort(), [notice(30).id, notice(31).id, notice(32).id].sort());
assert.equal(union.notices.find((row) => row.id === notice(31).id).decision, 'forkastet');
assert.equal(union.syncedAt, '2026-10-27T08:00:00Z');
assert.equal(union.queryKey, 'ny');
assert.equal(mergeHitPacks(right, left).queryKey, 'ny');

// Signaturen endres når en vurdering endres, og er lik for samme liste.
const sigA = hitsSignature(packHits({ notices: [notice(40)] }));
assert.equal(hitsSignature(packHits({ notices: [notice(40)] })), sigA);
assert.notEqual(hitsSignature(packHits({ notices: [notice(40, { decision: 'aktuell', reviewedAt: '2026-10-27T08:00:00Z' })] })), sigA);

// Lokal kopi: får ikke den fulle listen plass, lagres en kortere.
function quotaStorage(quota) {
  const map = new Map();
  return {
    map,
    async getItem(key) { return map.get(key) ?? null; },
    async setItem(key, value) {
      if (String(value).length > quota) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(key, String(value));
    },
    async removeItem(key) { map.delete(key); },
  };
}
const small = quotaStorage(300_000);
const stored = await storeHitsPayload(small, 'co1', pack);
assert.ok(stored.length <= 300_000);
assert.equal(small.map.get(anbudHitsKey('co1')), stored);
assert.ok(JSON.parse(stored).notices.length > 0);
assert.equal(anbudHitsKey('co1'), 'protop.anbud.hits.v1.co1');

const blocked = {
  async setItem() {
    const err = new Error('denied');
    err.name = 'TypeError';
    throw err;
  },
};
await assert.rejects(() => storeHitsPayload(blocked, 'co1', pack));

console.log('hitStore ok');
