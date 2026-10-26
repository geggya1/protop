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
