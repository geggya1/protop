/**
 * Sertifiseringsklar per standard og kapittel 4–10 (ISO-06): statusen kommer fra data i ProTop,
 * hvert hull har en lenke, og 14001/45001 får sine egne klausuler.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAPTERS, certificationReadiness } from './readiness.js';

const now = new Date('2026-10-28T10:00:00Z');

function base(over = {}) {
  return {
    system: { standards: ['ISO9001', 'ISO14001', 'ISO45001'], scopeText: 'Bygg og anlegg', setupAt: '2026-01-01', roleMap: {}, ...over.system },
    processes: [], documents: [], findings: [], submissions: [], requirements: [], assessments: [], evidence: [], evidenceLinks: [],
    records: { kontekst: [], interessent: [], ledelse: [], revisjon: [], ...over.records },
    ...over.top,
  };
}

const item = (res, code, key) => res.standards.find((s) => s.code === code).chapters.flatMap((c) => c.items).find((i) => i.key === key);

test('ISO-06: tomt system gir Mangler med lenke per punkt, kapittel 4–10 for hver standard', () => {
  const res = certificationReadiness(base(), { now });
  assert.equal(res.standards.length, 3);
  for (const std of res.standards) {
    assert.deepEqual(std.chapters.map((c) => c.id), CHAPTERS.map((c) => c.id));
    for (const i of std.chapters.flatMap((c) => c.items)) assert.ok(i.page || i.tab, `${i.key} har lenke`);
  }
  assert.equal(item(res, 'ISO9001', 'context').status, 'mangler');
  assert.equal(item(res, 'ISO9001', 'scope').status, 'dekket', 'omfanget er satt');
  assert.equal(item(res, 'ISO9001', 'equipment').tab, 'utstyr', '7.1.5 fikses i Utstyr');
});

test('ISO-06: klausuler per standard: 14001 har miljøaspekter, 45001 har farer og medvirkning, 9001 har ingen av dem', () => {
  const res = certificationReadiness(base(), { now });
  assert.equal(item(res, 'ISO9001', 'aspects'), undefined);
  assert.equal(item(res, 'ISO14001', 'aspects').clause, '6.1.2');
  assert.equal(item(res, 'ISO45001', 'hazards').clause, '6.1.2');
  assert.equal(item(res, 'ISO45001', 'participation').clause, '5.4');
  assert.equal(item(res, 'ISO9001', 'satisfaction').clause, '9.1.2');
  assert.equal(item(res, 'ISO14001', 'evaluation').clause, '9.1.2');
});

test('ISO-06: Delvis når noe finnes, Dekket når alt finnes', () => {
  const partial = certificationReadiness(base({ records: { kontekst: [{ id: 'k1', scope: 'Internt', state: 'aktiv' }] } }), { now });
  assert.equal(item(partial, 'ISO9001', 'context').status, 'delvis');
  const full = certificationReadiness(base({ records: { kontekst: [{ id: 'k1', scope: 'Internt', state: 'aktiv' }, { id: 'k2', scope: 'Eksternt', state: 'aktiv' }] } }), { now });
  assert.equal(item(full, 'ISO9001', 'context').status, 'dekket');
});

test('ISO-06: internrevisjon per standard etter revisjonsdato; gammel revisjon teller ikke', () => {
  const res = certificationReadiness(base({ records: { revisjon: [
    { id: 'r1', register: 'revisjon', state: 'godkjent', plannedDate: '2026-05-01', standards: ['ISO 9001'] },
    { id: 'r2', register: 'revisjon', state: 'godkjent', plannedDate: '2024-05-01', standards: ['ISO 14001'] },
  ] } }), { now });
  assert.equal(item(res, 'ISO9001', 'audit').status, 'dekket');
  assert.equal(item(res, 'ISO14001', 'audit').status, 'mangler');
  assert.equal(item(res, 'ISO45001', 'audit').status, 'mangler');
});

test('ISO-06: ledelsens gjennomgang uten konklusjon er bare Delvis', () => {
  const review = (over) => ({ id: 'l1', register: 'ledelse', state: 'godkjent', meetingDate: '2026-09-01', snapshot: { takenAt: '2026-09-01' }, ...over });
  const without = certificationReadiness(base({ records: { ledelse: [review({ assessment: '' })] } }), { now });
  assert.equal(item(without, 'ISO9001', 'review').status, 'delvis');
  const withIt = certificationReadiness(base({ records: { ledelse: [review({ assessment: 'Systemet er egnet og tilstrekkelig, men avvik lukkes for sent.' })] } }), { now });
  assert.equal(item(withIt, 'ISO9001', 'review').status, 'dekket');
});

test('ISO-06: 7.1.5 regnes fra kontrollene på utstyret; forfalt kontroll gir Delvis', () => {
  const ok = certificationReadiness(base(), { now, equipment: [{ id: 'g1', name: 'Laser', status: 'available', controls: [{ kind: 'kalibrering', last: '2026-03-01', next: '2027-03-01' }] }] });
  assert.equal(item(ok, 'ISO9001', 'equipment').status, 'dekket');
  const late = certificationReadiness(base(), { now, equipment: [{ id: 'g1', name: 'Laser', status: 'available', controls: [{ kind: 'kalibrering', last: '2025-03-01', next: '2026-03-01' }] }] });
  assert.equal(item(late, 'ISO9001', 'equipment').status, 'delvis');
  assert.match(item(late, 'ISO9001', 'equipment').detail, /forfalt/);
});

test('ISO-06: kapittelstatus rulles opp fra punktene', () => {
  const res = certificationReadiness(base(), { now });
  const ch4 = res.standards[0].chapters.find((c) => c.id === '4');
  assert.equal(ch4.status, 'delvis', 'omfang er dekket, resten mangler');
  const counts = res.standards[0].counts;
  assert.equal(counts.dekket + counts.delvis + counts.mangler, res.standards[0].chapters.flatMap((c) => c.items).length);
});
