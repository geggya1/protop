/**
 * Klima på systemnivå (ISO-18, Amd 1:2024): avgjørelse med begrunnelse og dato, brukt i sertifiseringsklar
 * og ledelsens gjennomgang, og forslag til klimarisikoer når klima er relevant.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { climateDecided, climateRiskSuggestions, setClimateDecision } from './climate.js';
import { certificationReadiness } from './readiness.js';
import { normalizeSystem } from './state.js';
import { isoCapabilities } from './access.js';
import { REGISTERS } from './registers.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const ADMIN = isoCapabilities({ bypass: true, uid: 'u1' });
const MANAGER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u2' });
const now = new Date('2026-10-28T10:00:00Z');
const system = { standards: ['ISO9001'], setupAt: '2026-01-01', scopeText: 'Bygg', rev: 3, roleMap: {} };

test('ISO-18: avgjørelsen krever valg og begrunnelse, og bare administrator endrer oppsettet', () => {
  assert.equal(setClimateDecision(system, { relevant: true, rationale: 'kort' }, { actor: ANNE, caps: ADMIN, now }).ok, false);
  assert.equal(setClimateDecision(system, { rationale: 'Ekstremvær stopper arbeid ute' }, { actor: ANNE, caps: ADMIN, now }).ok, false);
  assert.equal(setClimateDecision(system, { relevant: true, rationale: 'Ekstremvær stopper arbeid ute' }, { actor: ANNE, caps: MANAGER, now }).ok, false);
  const res = setClimateDecision(system, { relevant: true, rationale: 'Ekstremvær stopper arbeid ute' }, { actor: ANNE, caps: ADMIN, now });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual({ ...res.system.climate, history: undefined }, { relevant: true, rationale: 'Ekstremvær stopper arbeid ute', assessedAt: '2026-10-28', by: 'Anne Kvalitet', byUid: 'u1', history: undefined });
  assert.equal(res.system.rev, 4);
  assert.equal(climateDecided(normalizeSystem(res.system)), true, 'beholdes ved lasting');
  const again = setClimateDecision(res.system, { relevant: false, rationale: 'Kontorvirksomhet uten arbeid ute' }, { actor: ANNE, caps: ADMIN, now });
  assert.equal(again.system.climate.history.length, 1, 'forrige vurdering beholdes');
});

test('ISO-18: sertifiseringsklar regner klima som dekket først når det er avgjort for systemet', () => {
  const state = { system, records: {}, findings: [], processes: [], documents: [], submissions: [], requirements: [], assessments: [], evidenceLinks: [] };
  const item = (s) => certificationReadiness(s, { now }).standards[0].chapters[0].items.find((i) => i.key === 'climate');
  assert.equal(item(state).status, 'mangler');
  const decided = { ...state, system: setClimateDecision(system, { relevant: false, rationale: 'Kontorvirksomhet uten arbeid ute' }, { actor: ANNE, now }).system };
  assert.equal(item(decided).status, 'dekket');
});

test('ISO-18: klimarisikoer foreslås bare når klima er relevant, og ikke på nytt', () => {
  const off = { system: { climate: { relevant: false } }, records: { risiko: [] } };
  assert.deepEqual(climateRiskSuggestions(off), []);
  const on = { system: { climate: { relevant: true } }, records: { risiko: [{ title: 'Hete og kulde i arbeidsmiljøet ute' }] } };
  const rows = climateRiskSuggestions(on);
  assert.ok(rows.length >= 3);
  assert.ok(!rows.some((r) => r.title === 'Hete og kulde i arbeidsmiljøet ute'));
  assert.ok(rows.every((r) => r.kind && r.category && r.title));
  assert.ok(REGISTERS.interessent.fields.some((f) => f.key === 'climate'), 'interessenter kan ha klimakrav');
});
