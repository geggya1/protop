/**
 * Rød tråd (ISO-17): saken kobles til utstyr, leverandør, kunde, prosjekt og ansatt; «Avvik» i
 * KS-sjekklister og vernerunder blir sak med ett trykk; leverandørens avvik telles fra sakene.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFinding, findingsLinkedTo, updateFindingLinks } from './findings.js';
import { ksDeviationCandidates } from './forms.js';
import { requirementIdsForFinding } from './integrations.js';
import { REGISTERS } from './registers.js';
import { ksDeviationRows, libraryForm } from '../forms/ksLibrary.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const now = new Date('2026-10-28T10:00:00Z');

function filled(key, cells, responses = []) {
  const form = libraryForm(key);
  const fields = form.fields.map((f) => (f.kind === 'table' && f.label === 'Sjekkpunkter' ? { ...f, value: { cells, added: [] } } : f));
  return { ...form, id: `ks_${key}`, fields, updatedAt: '2026-10-20T10:00:00Z', responses };
}

test('ISO-17: saken kan kobles til utstyr, leverandør, kunde, prosjekt og ansatte', () => {
  const res = createFinding({
    type: 'leverandor', title: 'Feil armering levert', description: 'Feil dimensjon', supplierId: 'lev1', supplierName: 'Stål AS',
    customerId: 'k1', customerName: 'Byggherre AS', equipmentId: 'g1', equipmentName: 'Kran', employeeIds: ['e1'], employeeNames: ['Per'],
  }, { actor: ANNE, now });
  assert.equal(res.ok, true, res.error);
  const f = res.finding;
  assert.equal(f.links.supplierId, 'lev1');
  assert.equal(f.links.customerName, 'Byggherre AS');
  assert.deepEqual(f.links.employeeIds, ['e1']);
  const moved = updateFindingLinks(f, { projectId: 'p1', projectName: '1042 Kontorbygg', supplierId: '', equipmentId: 'g2', equipmentName: 'Lift' }, { actor: ANNE, now }).finding;
  assert.equal(moved.projectId, 'p1', 'prosjektet står på saken');
  assert.equal(moved.links.supplierId, '');
  assert.equal(moved.links.supplierName, '', 'navnet fjernes med koblingen');
  assert.equal(moved.links.equipmentName, 'Lift');
  assert.equal(moved.links.customerId, 'k1', 'uendret når den ikke er med');
  assert.deepEqual(findingsLinkedTo([f, moved], 'supplier', 'lev1').map((x) => x.links.supplierName), ['Stål AS']);
  assert.equal(findingsLinkedTo([moved], 'project', 'p1').length, 1);
  assert.equal(findingsLinkedTo([f], 'employee', 'e1').length, 1);
  assert.equal(findingsLinkedTo([moved], 'equipment', 'g2').length, 1);
});

test('ISO-17: leverandøravvik er egen sakstype koblet til krav om eksterne leverandører', () => {
  const state = { system: { standards: ['ISO9001'] }, requirements: [] };
  assert.ok(requirementIdsForFinding(state, 'leverandor').some((id) => id.includes('suppliers')));
  assert.equal(REGISTERS.leverandor.fields.some((f) => f.key === 'deviations'), false, 'Ja/Nei-feltet er erstattet av sakene');
});

test('ISO-17: «Avvik» i vernerunden blir forslag til sak med kommentar, frist og fast kilde', () => {
  const t = filled('vernerunde', { r2: { c2: 'Avvik', c3: 'Mangler opplæringsplan for nye', c4: '2026-11-15', c5: 'Kari' }, r3: { c2: 'OK' } });
  const rows = ksDeviationRows(t);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].point, 'Opplæring');
  assert.equal(rows[0].deadline, '2026-11-15');
  const [c] = ksDeviationCandidates([t], []);
  assert.equal(c.type, 'nestenulykke');
  assert.equal(c.title, 'Opplæring');
  assert.equal(c.dueAt, '2026-11-15');
  assert.match(c.description, /Mangler opplæringsplan/);
  const table = t.fields.find((f) => f.kind === 'table' && f.label === 'Sjekkpunkter');
  assert.equal(c.sourceRef.id, `ks_vernerunde:mal:${table.id}:r2`);
  const res = createFinding({ type: c.type, title: c.title, description: c.description, sourceRef: c.sourceRef, dueAt: c.dueAt }, { actor: ANNE, now });
  assert.equal(res.finding.sourceRef.id, c.sourceRef.id);
  assert.equal(ksDeviationCandidates([t], [res.finding]).length, 0, 'en rad blir bare én sak');
});

test('ISO-17: svar fra flere utfyllinger, og N/Nei i el-kontroll og SJA', () => {
  const el = filled('el-kontroll', { r3: { c5: 'N', c4: 'Sikring varm' } }, [{ id: 'svar1', at: '2026-10-25T08:00:00Z', answers: {} }]);
  assert.equal(ksDeviationRows(el).length, 1);
  assert.equal(ksDeviationRows(el)[0].comment, 'Sikring varm');
  const form = libraryForm('sja');
  const table = form.fields.find((f) => f.kind === 'table' && f.label === 'Sjekkpunkter');
  const sja = { ...form, id: 'ks_sja', responses: [{ id: 'svar9', at: '2026-10-26T08:00:00Z', answers: { [table.id]: { cells: { r1: { c3: 'Nei', c4: 'Skriv instruks' } }, added: [] } } }] };
  const rows = ksDeviationRows(sja);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key.split(':')[1], 'svar9');
  assert.equal(ksDeviationRows({ ...libraryForm('brev'), id: 'x' }).length, 0, 'brev har ingen avvik');
});
