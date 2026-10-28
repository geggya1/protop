/**
 * H-verdi og TRIF regnet fra timene i ProTop (ISO-24): skader med fravær og behandlingskrevende skader
 * per million arbeidstimer, siste 12 måneder. Uten timer: ingen verdi, aldri 0.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { injuryRates } from './integrations.js';
import { managementReviewSnapshot } from './analytics.js';
import { emptyIsoState } from './state.js';
import { isoCapabilities } from './access.js';

const now = new Date('2026-10-28T10:00:00Z');

test('ISO-24: H1 og TRIF fra timene og skadeklassen', () => {
  const hours = [
    { date: '2026-03-02', hours: 250000 },
    { date: '2026-06-10', hours: '250000' },
    { date: '2025-01-01', hours: 999999 },
  ];
  const findings = [
    { type: 'hms', injuryClass: 'fravaer', occurredAt: '2026-03-05', state: 'lukket' },
    { type: 'hms', injuryClass: 'medisinsk', occurredAt: '2026-06-11', state: 'triage' },
    { type: 'hms', injuryClass: 'forstehjelp', occurredAt: '2026-06-12', state: 'triage' },
    { type: 'nestenulykke', injuryClass: 'ingen', occurredAt: '2026-06-12', state: 'triage' },
    { type: 'hms', injuryClass: 'fravaer', occurredAt: '2026-07-01', state: 'kansellert' },
  ];
  const r = injuryRates(findings, hours, { now });
  assert.equal(r.hours, 500000, 'bare siste 12 måneder');
  assert.equal(r.lostTime, 1);
  assert.equal(r.recordable, 2);
  assert.equal(r.h1, 2, '1 × 1 000 000 / 500 000');
  assert.equal(r.trif, 4);
  assert.equal(r.rows.find((x) => x.key === '2026-03').lostTime, 1);
});

test('ISO-24: uten timer er H-verdien ukjent, ikke 0', () => {
  const r = injuryRates([{ type: 'hms', injuryClass: 'fravaer', occurredAt: '2026-03-05' }], [], { now });
  assert.equal(r.h1, null);
  assert.equal(r.trif, null);
});

test('ISO-24: H-verdien står i grunnlaget til ledelsens gjennomgang', () => {
  const state = emptyIsoState();
  state.system = { ...state.system, standards: ['ISO45001'], setupAt: '2026-01-01' };
  const caps = isoCapabilities({ bypass: true, uid: 'u1' });
  const safety = injuryRates([{ type: 'hms', injuryClass: 'fravaer', occurredAt: '2026-03-05' }], [{ date: '2026-03-02', hours: 100000 }], { now });
  const snap = managementReviewSnapshot(state, caps, { now, safety, record: { period: '2026' } });
  assert.match(snap.sections.find((x) => x.key === 'monitoring').lines.join(' '), /H-verdi .*: 10 · 100000 timer/);
});
