/**
 * Revisjonsprogram og uavhengighet (ISO-21, 9.2.2): dekning av prosessene over tre år, advarsel når
 * revisor eier en prosess i omfanget, og konklusjon før rapport.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { addAuditFinding, auditCoverage, auditIndependenceConflicts, createRecord, setRecordState } from './registers.js';
import { certificationReadiness } from './readiness.js';
import { isoCapabilities } from './access.js';

const ANNE = { uid: 'u1', name: 'Anne Kvalitet' };
const now = new Date('2026-10-28T10:00:00Z');
const APPROVER = isoCapabilities({ grants: { iso: 'read' }, uid: 'u1', approverUids: ['u1'] });
const processes = [
  { id: 'p1', code: 'P01', title: 'Prosjektgjennomføring', publishedVersion: 1, ownerUid: 'u5', ownerName: 'Ola Prosjekt' },
  { id: 'p2', code: 'P02', title: 'Avviksbehandling', publishedVersion: 2, ownerUid: 'u1', ownerName: 'Anne Kvalitet' },
  { id: 'p3', code: 'P03', title: 'Innkjøp', publishedVersion: 1, ownerName: 'Per Innkjøp' },
  { id: 'p4', code: 'P04', title: 'Utkast', publishedVersion: 0 },
];

test('ISO-21: dekning per prosess og år; prosesser som ikke er revidert på tre år', () => {
  const audits = [
    { id: 'a1', number: 'REV-2025-001', state: 'lukket', plannedDate: '2025-03-01', scopeProcessIds: ['p1'] },
    { id: 'a2', number: 'REV-2026-001', state: 'planlagt', plannedDate: '2026-11-15', scopeProcessIds: ['p1', 'p2'] },
    { id: 'a3', number: 'REV-2026-002', state: 'avlyst', plannedDate: '2026-05-01', scopeProcessIds: ['p3'] },
    { id: 'a4', number: 'REV-2022-001', state: 'lukket', plannedDate: '2022-05-01', scopeProcessIds: ['p3'] },
  ];
  const cov = auditCoverage(audits, processes, { now });
  assert.deepEqual(cov.years, [2024, 2025, 2026]);
  assert.equal(cov.rows.length, 3, 'bare publiserte prosesser');
  assert.deepEqual(cov.rows[0].byYear[2025].map((a) => a.number), ['REV-2025-001']);
  assert.deepEqual(cov.uncovered.map((p) => p.id), ['p3'], 'avlyst og for gammel teller ikke');
});

test('ISO-21: revisor som eier en prosess i omfanget, reviderer eget arbeid', () => {
  assert.deepEqual(auditIndependenceConflicts({ auditorUid: 'u1', auditorName: 'Anne Kvalitet', scopeProcessIds: ['p1', 'p2'] }, processes).map((p) => p.id), ['p2']);
  assert.deepEqual(auditIndependenceConflicts({ auditorName: 'per innkjøp', scopeProcessIds: ['p3'] }, processes).map((p) => p.id), ['p3'], 'på navn når uid mangler');
  assert.deepEqual(auditIndependenceConflicts({ auditorUid: 'u9', scopeProcessIds: ['p1', 'p2'] }, processes), []);
});

test('ISO-21: konklusjon kreves før rapport og godkjenning', () => {
  const base = { title: 'Avvik', scope: 'P02', criteria: 'ISO 9001 10.2', auditorName: 'Revisor', independence: true, plannedDate: '2026-10-01', scopeProcessIds: ['p2'] };
  const audit = createRecord('revisjon', base, { actor: ANNE, now }).record;
  assert.deepEqual(audit.scopeProcessIds, ['p2']);
  assert.equal(setRecordState(audit, 'rapport', { actor: ANNE, caps: APPROVER, now }).ok, false);
  assert.equal(setRecordState(audit, 'godkjent', { actor: ANNE, caps: APPROVER, now }).ok, false);
  let done = createRecord('revisjon', { ...base, conclusion: 'Avviksprosessen fungerer, men effektkontroll mangler i to saker.' }, { actor: ANNE, now }).record;
  done = addAuditFinding(done, { classification: 'samsvar', description: 'Avvikene behandles etter P02.' }, { actor: ANNE, now }).record;
  assert.equal(setRecordState(done, 'rapport', { actor: ANNE, caps: APPROVER, now }).ok, true);
});

test('ISO-21: sertifiseringsklar viser dekningen i revisjonsprogrammet', () => {
  const state = {
    system: { standards: ['ISO9001'], setupAt: '2026-01-01', roleMap: {} }, processes, documents: [], findings: [], submissions: [], requirements: [], assessments: [], evidenceLinks: [],
    records: { revisjon: [{ id: 'a1', state: 'lukket', plannedDate: '2025-03-01', scopeProcessIds: ['p1', 'p2'] }] },
  };
  const item = certificationReadiness(state, { now }).standards[0].chapters.find((c) => c.id === '9').items.find((i) => i.key === 'auditProgram');
  assert.equal(item.status, 'delvis');
  assert.match(item.detail, /2 av 3 prosesser/);
});
