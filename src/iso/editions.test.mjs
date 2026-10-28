/**
 * Valg av utgave per standard (ISO-09): krav-id-ene har ikke utgaven i seg, eldre id-er gjøres om ved
 * lasting, og vurderinger og bevis følger kravet når utgaven byttes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STANDARD_EDITIONS, canonicalRequirementId, cleanEditions, isoRequirementLibrary, standardLabel,
} from './catalog.js';
import { allRequirements, assessmentFor, effectiveStatus, markForReassessment } from './requirements.js';
import { normalizeSystem, stateFromCollections } from './state.js';
import { editionChanges, settingsKey } from './settingsSave.js';

test('ISO-09: utgave kan velges per standard; 2015 + Amd 1:2024 eller 2026', () => {
  assert.deepEqual(STANDARD_EDITIONS.ISO9001.map((e) => e.id), ['2015+A1:2024', '2026']);
  assert.equal(standardLabel('ISO9001', { ISO9001: '2015+A1:2024' }), 'ISO 9001:2015 + Amd 1:2024');
  assert.equal(standardLabel('ISO9001', {}), 'ISO 9001:2026', 'uten valg: utgaven i biblioteket');
  assert.equal(standardLabel('ISO45001'), 'ISO 45001:2018 + Amd 1:2024');
  assert.deepEqual(cleanEditions({ ISO9001: '2015+A1:2024', ISO14001: '1996', X: 'y' }), { ISO9001: '2015+A1:2024' });
  assert.deepEqual(normalizeSystem({ standards: ['ISO9001'], editions: { ISO9001: '2015+A1:2024' } }).editions, { ISO9001: '2015+A1:2024' });
});

test('ISO-09: krav-id-en er den samme i begge utgaver; utgaven står på kravet', () => {
  const a = isoRequirementLibrary(['ISO9001'], { ISO9001: '2015+A1:2024' });
  const b = isoRequirementLibrary(['ISO9001'], { ISO9001: '2026' });
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
  assert.ok(a.some((r) => r.id === 'req_9001_context'));
  assert.equal(a[0].edition, '2015+A1:2024');
  assert.match(a[0].source, /2015 \+ Amd 1:2024/);
  assert.equal(b[0].edition, '2026');
});

test('ISO-09: eldre id-er med utgave migreres ved lasting, så vurderinger og bevis ikke blir foreldreløse', () => {
  assert.equal(canonicalRequirementId('req_9001_2026_context'), 'req_9001_context');
  assert.equal(canonicalRequirementId('req_45001_2018A12024_hazards'), 'req_45001_hazards');
  assert.equal(canonicalRequirementId('req_9001_context'), 'req_9001_context');
  assert.equal(canonicalRequirementId('krav_abc123'), 'krav_abc123', 'egne krav er uendret');
  const state = stateFromCollections({
    system: { standards: ['ISO9001'], setupAt: '2026-01-01', editions: { ISO9001: '2015+A1:2024' } },
    assessments: [{ id: 'v1', requirementId: 'req_9001_2026_context', status: 'internt_verifisert', nextReview: '2099-01-01' }],
    evidenceLinks: [{ id: 'l1', evidenceId: 'b1', requirementId: 'req_9001_2026_context', reviewState: 'godkjent' }],
    findings: [{ id: 'f1', links: { requirementIds: ['req_9001_2026_nonconformity', 'req_9001_nonconformity'] } }],
    records: [{ id: 'r1', register: 'revisjon', findings: [{ id: 'x', requirementIds: ['req_9001_2026_design'] }] }],
  });
  assert.equal(state.idMigration, 4);
  assert.equal(assessmentFor(state, 'req_9001_context').id, 'v1');
  assert.equal(effectiveStatus(state, 'req_9001_context'), 'internt_verifisert');
  assert.equal(state.evidenceLinks[0].requirementId, 'req_9001_context');
  assert.deepEqual(state.findings[0].links.requirementIds, ['req_9001_nonconformity'], 'duplikater slås sammen');
  assert.deepEqual(state.records.revisjon[0].findings[0].requirementIds, ['req_9001_design']);
  assert.ok(allRequirements(state).some((r) => r.id === 'req_9001_context' && r.edition === '2015+A1:2024'));
});

test('ISO-09: bytte av utgave oppdages og kravene i standarden merkes for ny vurdering', () => {
  const prev = { standards: ['ISO9001', 'ISO45001'], editions: { ISO9001: '2015+A1:2024' } };
  const cur = { standards: ['ISO9001', 'ISO45001'], editions: { ISO9001: '2026' } };
  const changes = editionChanges(prev, cur, { name: 'Anne' }, new Date('2026-10-28T10:00:00Z'));
  assert.deepEqual(changes.map(({ code, from, to, by }) => ({ code, from, to, by })), [{ code: 'ISO9001', from: '2015+A1:2024', to: '2026', by: 'Anne' }]);
  assert.notEqual(settingsKey(prev), settingsKey(cur), 'autolagringen ser endringen');
  assert.deepEqual(editionChanges({ standards: [] }, cur), [], 'ny standard er ikke et bytte');
  const state = { system: { standards: ['ISO9001'], editions: cur.editions }, requirements: [], assessments: [{ id: 'v1', requirementId: 'req_9001_context', status: 'internt_verifisert' }], evidenceLinks: [] };
  const ids = allRequirements(state).filter((r) => r.standard === 'ISO9001').map((r) => r.id);
  const flagged = markForReassessment(state, ids, 'Ny utgave: ISO 9001:2026', { actor: { name: 'Anne' } });
  assert.equal(flagged.assessments[0].status, 'ma_revurderes');
});
