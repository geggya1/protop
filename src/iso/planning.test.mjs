import assert from 'node:assert/strict';
import test from 'node:test';
import { annualTaskEffects, annualWheel, authorityMatrix, communicationGroups, isoRoleFor, orgTree, roleLinks } from './planning.js';
import { emptyIsoState } from './state.js';
import { autoTaskEffects } from './integrations.js';

const role = (id, title, reportsTo = '', category = 'Ledelse') => ({ id, register: 'rolle', number: id, title, reportsTo, category, state: 'aktiv' });

test('orgTree: bygger kartet fra «Rapporterer til» og bryter sykluser', () => {
  const roles = [
    role('r1', 'Daglig leder', 'Styret'),
    role('r2', 'Kvalitetsleder', 'Daglig leder', 'Administrasjon'),
    role('r3', 'Prosjektleder', 'daglig leder', 'Prosjekt'),
    role('r4', 'Rådgiver', 'Prosjektleder', 'Prosjekt'),
    role('r5', 'A', 'B', 'Annet'),
    role('r6', 'B', 'A', 'Annet'),
    { ...role('r7', 'Gammel rolle', 'Daglig leder'), state: 'arkivert' },
  ];
  const tree = orgTree(roles);
  const top = tree.find((n) => n.role.id === 'r1');
  assert.equal(top.reportsToText, 'Styret');
  assert.deepEqual(top.children.map((c) => c.role.id), ['r2', 'r3']);
  assert.deepEqual(top.children[1].children.map((c) => c.role.id), ['r4']);
  // Syklusen A ↔ B gir én rot, ikke uendelig rekursjon.
  const flat = (nodes) => nodes.flatMap((n) => [n.role.id, ...flat(n.children)]);
  assert.deepEqual(flat(tree).sort(), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
});

test('authorityMatrix og roleLinks', () => {
  const roles = [role('r1', 'Daglig leder'), role('r2', 'Prosjektleder', 'Daglig leder', 'Prosjekt'), role('r3', 'Rådgiver', 'Prosjektleder', 'Prosjekt')];
  const rows = [
    { id: 'm1', number: 'MYN-1', title: 'Signere kontrakter', category: 'Økonomi', roles: ['r1'], state: 'aktiv' },
    { id: 'm2', number: 'MYN-2', title: 'Godkjenne timer', category: 'Prosjekt', roles: ['r1', 'r2'], state: 'aktiv' },
    { id: 'm3', number: 'MYN-3', title: 'Attestere faktura', category: 'Økonomi', roles: ['r2'], state: 'aktiv' },
  ];
  const m = authorityMatrix(roles, rows);
  assert.deepEqual(m.columns.map((c) => c.id), ['r1', 'r2']);
  assert.deepEqual(m.groups.map((g) => g.category), ['Økonomi', 'Prosjekt']);
  assert.deepEqual(m.groups[0].rows.map((r) => r.cells), [[true, false], [false, true]]);
  const state = emptyIsoState();
  state.records.rolle = roles;
  state.records.myndighet = rows;
  state.records.kompetansekrav = [{ id: 'k1', title: 'Byggesaksforskriften', role: 'Prosjektleder', state: 'aktiv' }, { id: 'k2', title: 'Førstehjelp', role: 'Alle', state: 'aktiv' }];
  const links = roleLinks(state, roles[1]);
  assert.deepEqual(links.authority.map((x) => x.id), ['m2', 'm3']);
  assert.deepEqual(links.reports.map((x) => x.id), ['r3']);
  assert.deepEqual(links.competence.map((x) => x.id), ['k1', 'k2']);
});

test('communicationGroups grupperer intern og ekstern', () => {
  const g = communicationGroups([
    { id: 'c1', number: 'KPL-2', title: 'Nyheter', direction: 'Intern', state: 'aktiv' },
    { id: 'c2', number: 'KPL-1', title: 'Miljørapport', direction: 'Ekstern', state: 'aktiv' },
    { id: 'c3', number: 'KPL-3', title: 'Allmøte', direction: 'Intern', state: 'aktiv' },
  ]);
  assert.deepEqual(g.map((x) => x.direction), ['Intern', 'Ekstern']);
  assert.deepEqual(g[0].rows.map((r) => r.id), ['c1', 'c3']);
});

test('annualWheel samler planlagte aktiviteter og datoer fra registrene', () => {
  const state = emptyIsoState();
  state.records.aarshjul = [
    { id: 'a1', title: 'Ledelsens gjennomgang', months: ['Januar'], state: 'aktiv' },
    { id: 'a2', title: 'Driftsmøte', months: ['Januar', 'Februar'], state: 'aktiv' },
  ];
  state.records.revisjon = [{ id: 'v1', title: 'Prosjektgjennomføring', plannedDate: '2027-03-10', state: 'planlagt' }];
  state.records.risiko = [
    { id: 'x1', nextReview: '2027-02-01', state: 'aktiv' },
    { id: 'x2', nextReview: '2027-02-01', state: 'aktiv' },
    { id: 'x3', nextReview: '2028-02-01', state: 'aktiv' },
  ];
  const wheel = annualWheel(state, { year: 2027 });
  assert.equal(wheel.length, 12);
  assert.deepEqual(wheel[0].planned.map((r) => r.id), ['a2', 'a1']);
  assert.equal(wheel[1].dated[0].count, 2);
  assert.equal(wheel[1].dated[0].page, 'risiko');
  assert.equal(wheel[2].dated[0].open, 'v1');
});

test('annualTaskEffects: oppgaver for inneværende måned, idempotent nøkkel og rolle', () => {
  const state = emptyIsoState();
  state.system.roleMap = { quality_manager: { uid: 'q1', name: 'Kari' }, top_management: { uid: 'd1', name: 'Per' } };
  state.records.aarshjul = [
    { id: 'a1', title: 'Ledelsens gjennomgang', months: ['Januar'], responsibleRole: 'Daglig leder', page: 'ledelse', createTasks: true, state: 'aktiv' },
    { id: 'a2', title: 'Driftsmøte', months: ['Januar'], createTasks: false, state: 'aktiv' },
    { id: 'a3', title: 'Miljørapport', months: ['Mars'], createTasks: true, state: 'aktiv' },
  ];
  const now = new Date('2027-01-05T09:00:00');
  const auto = annualTaskEffects(state, { now });
  assert.equal(auto.length, 1);
  assert.equal(auto[0].key, 'isoauto_ahj_a1_2027_01');
  assert.equal(auto[0].assigneeUid, 'd1');
  assert.equal(auto[0].deadline, '2027-01-31');
  assert.match(auto[0].description, /Ledelsens gjennomgang/);
  assert.equal(annualTaskEffects(state, { now, all: true }).length, 2);
  assert.equal(isoRoleFor(state.system.roleMap, 'Kvalitetsleder').uid, 'q1');
  // Med i den daglige automatikken.
  assert.ok(autoTaskEffects(state, { now }).some((e) => e.key === 'isoauto_ahj_a1_2027_01'));
});

test('kompetansematrise: krav til en rolle gjelder rolleinnehaverne, og CV-en teller', async () => {
  const { competenceMatrix, competenceGaps } = await import('./registers.js');
  const roles = [{ id: 'r1', title: 'Prosjektleder', state: 'aktiv', holders: [{ name: 'Ola', uid: 'u1' }] }];
  const reqs = [
    { id: 'k1', title: 'Byggesaksforskriften', role: 'Prosjektleder', state: 'aktiv' },
    { id: 'k2', title: 'Førstehjelp', role: 'Alle', validityMonths: 24, state: 'aktiv' },
    { id: 'k3', title: 'Master', role: 'Rådgiver', state: 'aktiv' },
  ];
  const people = [
    { id: 'e1', name: 'Ola', uid: 'u1', cv: { courses: [{ title: 'Førstehjelp grunnkurs' }], certifications: [{ title: 'Byggesaksforskriften (SAK10)' }] } },
    { id: 'e2', name: 'Kari', uid: 'u2', cv: null },
  ];
  const m = competenceMatrix(people, reqs, [], new Date('2026-10-26'), { roles });
  assert.deepEqual(m[0].cells.map((c) => c.status), ['gyldig', 'cv', 'na']);
  assert.equal(m[0].cells[0].cv.kind, 'Sertifisering');
  assert.deepEqual(m[1].cells.map((c) => c.status), ['na', 'mangler', 'na']);
  assert.equal(m[1].cells[2].unassigned, true, 'rollen finnes ikke: kravet er uten innehaver, ikke et gap for alle');
  assert.equal(competenceGaps(m), 2);
});

test('kompetansekrav: rolle uten innehavere teller ikke som gap, valgte ansatte gjør', async () => {
  const { competenceMatrix, competenceGaps, unassignedRequirements, createRecord } = await import('./registers.js');
  const roles = [{ id: 'r1', title: 'Prosjektleder', state: 'aktiv', holders: [] }, { id: 'r2', title: 'Byggeleder', state: 'aktiv', holders: [{ name: 'Ola', uid: 'u1' }] }];
  const reqs = [
    { id: 'k1', title: 'NS 8405', role: 'Prosjektleder', state: 'aktiv' },
    { id: 'k2', title: 'Arbeidsvarsling', role: 'Byggeleder (vegprosjekter)', persons: [{ name: 'Kari', uid: 'u2' }], state: 'aktiv' },
    { id: 'k3', title: 'Våtromsnormen', role: 'Byggeleder', persons: [{ name: 'Kari', uid: 'u2' }], state: 'aktiv' },
  ];
  const people = [{ id: 'e1', name: 'Ola', uid: 'u1' }, { id: 'e2', name: 'Kari', uid: 'u2' }, { id: 'e3', name: 'Per', uid: 'u3' }];
  const m = competenceMatrix(people, reqs, [], new Date('2026-10-26'), { roles });
  assert.deepEqual(m.map((r) => r.cells.map((c) => c.status)), [['na', 'na', 'mangler'], ['na', 'mangler', 'mangler'], ['na', 'na', 'na']]);
  assert.equal(competenceGaps(m), 3);
  assert.deepEqual(unassignedRequirements(reqs, roles).map((x) => x.requirement.id), ['k1']);
  const rec = createRecord('kompetansekrav', { title: 'X', role: 'Prosjektleder', persons: [{ name: 'Kari', uid: 'u2', employeeId: 'e2' }] }, { actor: { uid: 'a', name: 'A' } });
  assert.ok(rec.ok, rec.error);
  assert.deepEqual(rec.record.persons.map((x) => x.uid), ['u2']);
});

test('leverandørevaluering og endringsvurdering erstatter egne skjema', async () => {
  const { createRecord, addSupplierEvaluation } = await import('./registers.js');
  const { assessChange } = await import('./findings.js');
  const { NATIVE_FORMS, recommendedFormKeys } = await import('./forms.js');
  const actor = { uid: 'u1', name: 'Kari' };
  const sup = createRecord('leverandor', { title: 'Rørlegger AS', criticality: 'Høy', approval: 'Ikke vurdert', supplierClass: 'Kritisk' }, { actor }).record;
  assert.equal(addSupplierEvaluation(sup, { quality: 4, hse: 4, environment: 3, delivery: 5 }, { actor }).ok, false, 'beslutning kreves');
  const ev = addSupplierEvaluation(sup, { quality: 4, hse: 4, environment: 3, delivery: 5, decision: 'Godkjent', date: '2026-11-01' }, { actor });
  assert.equal(ev.ok, true);
  assert.equal(ev.record.approval, 'Godkjent');
  assert.equal(ev.record.score, 4);
  assert.equal(ev.record.nextReview.slice(0, 7), '2027-11');
  const f = { id: 'f1', type: 'endringsforslag', state: 'registrert', history: [] };
  assert.equal(assessChange(f, { purpose: 'Ny rutine' }, { actor }).ok, false, 'risiko må vurderes');
  const c = assessChange(f, { purpose: 'Ny rutine', risk: 'Lav', decision: 'Godkjent' }, { actor });
  assert.equal(c.finding.change.decision, 'Godkjent');
  assert.equal(c.finding.change.decidedBy, 'Kari');
  for (const k of ['SF09_ENDRING', 'SF14_MEDVIRKNING', 'SF15_BEREDSKAP', 'SF20_KVALITETSPLAN', 'SF22_LEVERANDOR', 'SF25_REVISJON', 'SF29_DOKENDRING']) {
    assert.ok(NATIVE_FORMS[k], `${k} dekkes av et register`);
    assert.ok(!recommendedFormKeys(['ISO9001', 'ISO14001', 'ISO45001']).includes(k));
  }
});

test('dokumentstyring: godkjente KS-maler blir styrte skjema i ISO, uten egen ISO-godkjenning', async () => {
  const { externalFormControls, externalDocumentRows, mergeForms, isDocControlledTemplate } = await import('./docControlLink.js');
  const controls = [
    { id: 'tpl_ks_sja', kind: 'template', refId: 'ks_sja', title: 'SJA', publishedRevision: 2, revisions: [{ revision: 2, state: 'publisert', approvedBy: 'Kari', snapshot: { fields: [{ id: 'f1', kind: 'text', label: 'Arbeid' }] } }, { revision: 3, state: 'til_gjennomgang' }] },
    { id: 'tpl_ks_el', kind: 'template', refId: 'ks_el', title: 'El', publishedRevision: 0, revisions: [{ revision: 1, state: 'utkast' }] },
    { id: 'handbook', kind: 'handbook', title: 'Personalhåndbok', publishedRevision: 1, revisions: [{ revision: 1, state: 'publisert' }] },
  ];
  const ext = externalFormControls(controls, []);
  assert.equal(ext.length, 1);
  assert.equal(ext[0].templateId, 'ks_sja');
  assert.equal(ext[0].publishedVersion, 2);
  assert.equal(ext[0].versions[0].fields[0].label, 'Arbeid');
  assert.equal(mergeForms([{ id: 'f', templateId: 'ks_sja', publishedVersion: 1 }], ext).length, 1, 'ISO-kontroll for samme mal vinner');
  const rows = externalDocumentRows(controls);
  assert.equal(rows.find((r) => r.id === 'handbook').where, 'HR → Personalhåndbok');
  assert.ok(rows.find((r) => r.id === 'tpl_ks_sja').waiting);
  assert.ok(isDocControlledTemplate('ks_sja') && !isDocControlledTemplate('iso_sf12_sja'));
});

test('årshjul: «Bare i år» viser aktiviteten bare det året, og oppgaven lages bare da', async () => {
  const { annualWheel, annualTaskEffects } = await import('./planning.js');
  const state = { records: { aarshjul: [
    { id: 'a1', title: 'Innføring 2027: første internrevisjon', months: ['Mars'], year: 2027, createTasks: true, state: 'aktiv' },
    { id: 'a2', title: 'Ledelsens gjennomgang', months: ['Mars'], createTasks: true, state: 'aktiv' },
  ] } };
  assert.deepEqual(annualWheel(state, { year: 2026 })[2].planned.map((r) => r.id), ['a2']);
  assert.deepEqual(annualWheel(state, { year: 2027 })[2].planned.map((r) => r.id).sort(), ['a1', 'a2']);
  assert.equal(annualTaskEffects(state, { now: new Date('2026-03-05T10:00:00Z') }).length, 1);
  assert.equal(annualTaskEffects(state, { now: new Date('2027-03-05T10:00:00Z') }).length, 2);
});
