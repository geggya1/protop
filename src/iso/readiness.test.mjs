/**
 * Sertifisering: internrevisjon og ledelsens gjennomgang regnes ut fra møte-/revisjonsdato (ISO-06),
 * og bevispakken viser lesbar status der utløpt «internt verifisert» vises som utløpt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { performedDate, readinessChecklist } from './integrations.js';
import { statusText } from './requirements.js';

const now = new Date('2026-10-27T10:00:00Z');

function state(records) {
  return { system: { standards: ['ISO9001'], roleMap: {} }, processes: [], documents: [], findings: [], records };
}

test('ISO-06: gammel gjennomgang og revisjon som er redigert nylig, regnes ikke som gjort siste 12 mnd', () => {
  const old = state({
    ledelse: [{ register: 'ledelse', state: 'godkjent', meetingDate: '2023-01-10', updatedAt: '2026-10-01T00:00:00Z' }],
    revisjon: [{ register: 'revisjon', state: 'godkjent', plannedDate: '2022-01-01', updatedAt: '2026-10-01T00:00:00Z' }],
  });
  const ready = readinessChecklist(old, { now });
  assert.equal(ready.items.find((i) => i.key === 'review').done, false, 'ga «ferdig» før rettingen');
  assert.equal(ready.items.find((i) => i.key === 'audit').done, false);
  const recent = state({
    ledelse: [{ register: 'ledelse', state: 'godkjent', meetingDate: '2026-03-10', updatedAt: '2026-03-12T00:00:00Z' }],
    revisjon: [{ register: 'revisjon', state: 'oppfolging', plannedDate: '2026-05-01', updatedAt: '2026-05-10T00:00:00Z' }],
  });
  const ok = readinessChecklist(recent, { now });
  assert.equal(ok.items.find((i) => i.key === 'review').done, true);
  assert.equal(ok.items.find((i) => i.key === 'audit').done, true);
});

test('ISO-06: revisjon gjennomført før planlagt dato regnes fra godkjenningen', () => {
  const audit = { register: 'revisjon', state: 'godkjent', plannedDate: '2026-12-01', history: [{ at: '2026-10-20T10:00:00Z', action: 'Status: godkjent' }] };
  assert.equal(performedDate(audit, now), '2026-10-20');
  assert.equal(performedDate({ register: 'ledelse', meetingDate: '2026-09-01' }, now), '2026-09-01');
});

test('ISO-06: bevispakken viser lesbar status, og utløpt verifisering som utløpt', () => {
  const s = {
    assessments: [
      { requirementId: 'r1', status: 'internt_verifisert', nextReview: '2026-01-01' },
      { requirementId: 'r2', status: 'internt_verifisert', nextReview: '2027-06-01' },
      { requirementId: 'r3', status: 'dokumentert' },
    ],
  };
  assert.equal(statusText(s, 'r1', now), 'Må revurderes (verifisering utløpt 01.01.2026)', 'viste «internt_verifisert» før rettingen');
  assert.equal(statusText(s, 'r2', now), 'Internt verifisert');
  assert.equal(statusText(s, 'r3', now), 'Bevis tilgjengelig');
  assert.equal(statusText(s, 'r9', now), 'Ikke vurdert');
});
