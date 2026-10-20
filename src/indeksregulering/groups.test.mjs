import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dueByContractId } from './watch.js';
import {
  hasCalculationBasis,
  indexProjectGroups,
  invoiceIndexWarning,
  isDeactivatedProject,
  lettersForCustomer,
  lettersForProject,
  monthsBefore,
  projectBand,
} from './groups.js';
import { appendIndexHistory, indexTableRows, usedIndexIds } from './indexLedger.js';
import { indexLetterMessage } from './mail.js';
import { effectiveRegulation } from './settings.js';
import { fetchAllIndices } from './ssb.js';

const series = {
  'ppi-byggeteknisk': {
    name: 'Byggeteknisk konsulentvirksomhet',
    table: '14335',
    latest: { period: '2026K2', value: 118 },
  },
};

const ramme = {
  id: 'ramme',
  kind: 'rammeavtale',
  title: 'Ramme rådgivning',
  buyer: 'Oslo kommune',
  value: 500000,
  start: '2024-01-01',
  fields: { indexId: 'ppi-byggeteknisk', contractDate: '2024-01-01', regulationScope: 'ramme', regulationFrequency: 'year' },
};
const avrop = {
  id: 'avrop',
  kind: 'avrop',
  parentId: 'ramme',
  title: 'Avrop 1',
  projectId: 'p-aktiv',
  value: 1000,
  start: '2025-01-01',
  fields: { indexId: 'ppi-byggeteknisk', contractDate: '2025-01-01' },
};
const lone = {
  id: 'lone',
  kind: 'oppdrag',
  title: 'Eget oppdrag',
  projectId: 'p-inaktiv',
  value: 2000,
  start: '2024-06-01',
  fields: { indexId: 'ppi-byggeteknisk', offerDate: '2024-05-01', regulationFrequency: 'year', firstRegulationDate: '2025-06-01' },
};

test('tre måneder tilbake holder siste dag i måneden', () => {
  assert.equal(monthsBefore('2026-10-18', 3), '2026-07-18');
  assert.equal(monthsBefore('2026-03-31', 1), '2026-02-28');
});

test('prosjekter deles på avtale, timer og deaktivering', () => {
  const projects = [
    { id: 'p-aktiv', name: 'Aktivt', status: 'aktiv', number: '100' },
    { id: 'p-inaktiv', name: 'Stille', status: 'aktiv' },
    { id: 'p-ferdig', name: 'Ferdig', status: 'aktiv', projectStatus: 'Avsluttet' },
    { id: 'p-uten', name: 'Uten avtale', status: 'aktiv' },
  ];
  const entries = [
    { projectId: 'p-aktiv', date: '2026-09-01', hours: 7.5 },
    { projectId: 'p-ferdig', date: '2026-09-02', hours: 4 },
    { projectId: 'p-uten', date: '2026-08-01', hours: 1 },
  ];
  assert.equal(projectBand(projects[0], entries, '2026-10-18'), 'aktiv');
  assert.equal(projectBand(projects[1], entries, '2026-10-18'), 'inaktiv');
  assert.equal(isDeactivatedProject(projects[2]), true);
  assert.equal(projectBand(projects[2], entries, '2026-10-18'), 'deaktivert');
  const dueById = dueByContractId([ramme, avrop, lone], [], series, '2026-10-18');
  assert.equal(dueById.avrop.due, false);
  assert.match(dueById.avrop.reason, /rammeavtalen/);
  assert.equal(dueById.ramme.due, true);
  assert.equal(effectiveRegulation(avrop, [ramme, avrop]).scope, 'ramme');
  assert.equal(effectiveRegulation(avrop, [ramme, avrop]).frequency, 'year');
  const groups = indexProjectGroups({
    projects,
    contracts: [ramme, avrop, lone],
    timeEntries: entries,
    dueById,
    today: '2026-10-18',
  });
  assert.deepEqual(groups.withAgreement.aktiv.map((row) => row.project.id), ['p-aktiv']);
  assert.equal(groups.withAgreement.aktiv[0].attention?.table, '14335');
  assert.deepEqual(groups.withAgreement.inaktiv.map((row) => row.project.id), ['p-inaktiv']);
  assert.equal(groups.withAgreement.inaktiv[0].attention, null);
  assert.deepEqual(groups.withAgreement.deaktivert.map((row) => row.project.id), []);
  assert.deepEqual(groups.withoutAgreement.deaktivert.map((row) => row.project.id), ['p-ferdig']);
  assert.deepEqual(groups.withoutAgreement.aktiv.map((row) => row.project.id), ['p-uten']);
  assert.equal(groups.unassigned.map((row) => row.id).join(), 'ramme');
  const warning = invoiceIndexWarning({
    projectId: 'p-aktiv',
    projects,
    contracts: [ramme, avrop],
    timeEntries: entries,
    dueById,
    today: '2026-10-18',
  });
  assert.equal(warning.projectName, 'Aktivt');
  assert.equal(invoiceIndexWarning({
    projectId: 'p-inaktiv',
    projects,
    contracts: [ramme, avrop, lone],
    timeEntries: entries,
    dueById,
    today: '2026-10-18',
  }), null);
});

test('grunnlag krever indeks, beløp og dato', () => {
  assert.equal(hasCalculationBasis({ fields: { indexId: 'kpi' }, value: 10 }), false);
  assert.equal(hasCalculationBasis({ fields: { indexId: 'kpi', contractDate: '2024-01-01' }, value: 10 }), true);
});

test('brev samles på prosjekt og kunde', () => {
  const letter = { id: '2024K1-2026K2-1', savedAt: '2026-10-01', increase: 80, letterPlain: 'Varsel', fromPeriod: '2024K1', toPeriod: '2026K2' };
  const contracts = [{ ...ramme, customerId: 'c1', regulations: [letter] }, avrop];
  assert.equal(lettersForProject({ id: 'p-aktiv', contractId: '' }, contracts).length, 1);
  assert.equal(lettersForCustomer({ id: 'c1', name: 'Oslo kommune' }, contracts)[0].contractTitle, 'Ramme rådgivning');
});

test('indekstabell viser én rad per benyttet serie', () => {
  assert.deepEqual(usedIndexIds([ramme, avrop]), ['ppi-byggeteknisk']);
  const history = appendIndexHistory([], [{
    id: 'ppi-byggeteknisk',
    name: 'Byggeteknisk',
    table: '14335',
    period: '2026K2',
    value: 118,
    previousPeriod: '2026K1',
    previousValue: 116,
  }], '2026-10-18T07:00:00.000Z');
  assert.equal(appendIndexHistory(history, history, '2026-10-19').length, 1);
  const rows = indexTableRows({ contracts: [ramme, avrop], series, history });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].table, '14335');
  assert.equal(rows[0].changed, true);
  assert.equal(rows[0].agreements, 1);
});

test('e-postvarslet inneholder brevet', () => {
  const message = indexLetterMessage({
    to: 'kunde@example.com',
    name: 'Ola',
    companyName: 'Consult1 AS',
    letterPlain: 'Indeksregulering etter avtalen. Tillegg 80 kr.',
    period: '2026K2',
  });
  assert.match(message.subject, /2026K2/);
  assert.match(message.text, /Hei Ola/);
  assert.match(message.text, /Tillegg 80 kr/);
  assert.match(message.text, /Consult1 AS/);
});

test('siden viser avtaleliste og forhåndsvisning', () => {
  const desk = readFileSync(new URL('../../screens/economy/EconomyDesk.jsx', import.meta.url), 'utf8');
  assert.match(desk, /index-contract-list/);
  assert.match(desk, /index-preview/);
  assert.match(desk, /index-status-/);
  assert.match(desk, /Start indeksregulering/);
  const screen = readFileSync(new URL('../../screens/economy/EconomyScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /timeEntries=\{state\.timeEntries/);
  assert.match(screen, /page === 'indekser'/);
  const billing = readFileSync(new URL('../../screens/economy/EconomyBilling.jsx', import.meta.url), 'utf8');
  assert.match(billing, /IndexWarning/);
  assert.match(billing, /force: true/);
  const invoices = readFileSync(new URL('../../screens/economy/EconomyInvoices.jsx', import.meta.url), 'utf8');
  assert.match(invoices, /før fakturaen sendes/);
  const agreement = readFileSync(new URL('../../screens/anbud/AgreementDetail.jsx', import.meta.url), 'utf8');
  assert.match(agreement, /regulationScope/);
  assert.match(agreement, /Første dato regulering kan virke/);
  const project = readFileSync(new URL('../../components/project/ProjectDetail.jsx', import.meta.url), 'utf8');
  assert.match(project, /IndexLetterTable/);
  const customer = readFileSync(new URL('../../screens/customers/CustomersScreen.jsx', import.meta.url), 'utf8');
  assert.match(customer, /customer-index-letters/);
});

test('SSB-kall kan begrenses til én tabell', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return { ok: true, text: async () => 'Tid\n' };
  };
  const bundle = await fetchAllIndices({ fetchImpl, ids: ['ppi-byggeteknisk'] });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/14335\//);
  assert.equal(bundle.series['bki-boligblokk'], undefined);
});
