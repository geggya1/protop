import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProject, emptyProjectState, updateProject } from './engine.js';
import {
  applyAgreementToProjects,
  invoicesForProject,
  parseHonorarAmount,
  projectAgreementGap,
  projectCrossView,
  projectFillFromAgreement,
  resolveProjectAgreement,
} from './projectCrossView.js';

assert.equal(parseHonorarAmount('450 000'), 450000);
assert.equal(parseHonorarAmount('450.000'), 450000);
assert.equal(parseHonorarAmount('kr 450 000 eks. mva'), 450000);
assert.equal(parseHonorarAmount('1.250.000'), 1250000);
assert.equal(parseHonorarAmount('Etter medgått tid'), null);
assert.equal(parseHonorarAmount(''), null);

const created = createProject(emptyProjectState(), {
  name: 'Brygge',
  number: '2001',
  phase: 'planlegging',
});
assert.equal(created.ok, true);
const projectId = created.state.activeProjectId;
const contract = {
  id: 'c1',
  title: 'Oppdrag brygge',
  buyer: 'BREITORGET AS',
  customerId: 'k1',
  projectId,
  kind: 'oppdrag',
  value: 450000,
  start: '2026-01-01',
  end: '2026-06-01',
  ownerName: 'Geir Ove Andersen',
  oppdragId: '260001',
  fields: {
    honorar: '450 000',
    honorarForm: 'Fastpris',
    address: 'Kai 1',
    postalCode: '4006',
    place: 'Stavanger',
    leaderName: 'Geir Ove Andersen',
    gnrBnr: '12/34',
    description: 'Kaiarbeid',
    paymentTerms: '14 dager',
    invoiceMethod: 'EHF',
    assignees: [{ name: 'Kari Nordmann', source: 'intern' }],
  },
  documents: [{ id: 'd1', name: 'Signert avtale.pdf', url: 'https://example.test/avtale.pdf' }],
  milestones: [{ id: 'm1', title: 'Oppstart', due: '2026-01-15' }],
};
const customer = {
  id: 'k1',
  name: 'BREITORGET AS',
  customerNumber: '1042',
  orgnr: '999999999',
  email: 'post@breitorget.no',
  phone: '51000000',
};

const once = applyAgreementToProjects(created.state, [contract], [customer]);
assert.equal(once.changed, 1);
const filled = once.state.projects.find((row) => row.id === projectId);
assert.equal(filled.contractId, 'c1');
assert.equal(filled.customerId, 'k1');
assert.equal(filled.client, 'BREITORGET AS');
assert.equal(filled.customerNumber, '1042');
assert.equal(filled.orgnr, '999999999');
assert.equal(filled.manager, 'Geir Ove Andersen');
assert.equal(filled.street, 'Kai 1');
assert.equal(filled.postalCode, '4006');
assert.equal(filled.placeName, 'Stavanger');
assert.equal(filled.cadastralId, '12/34');
assert.equal(filled.start, '2026-01-01');
assert.equal(filled.description, 'Kaiarbeid');
assert.equal(filled.pricingModel, 'fixed');
assert.equal(filled.feeEstimate, 450000);
assert.equal(filled.name, 'Brygge');
assert.equal(projectAgreementGap(filled, [contract]), false);

const twice = applyAgreementToProjects(once.state, [contract], [customer]);
assert.equal(twice.changed, 0);

const keptSeed = createProject(emptyProjectState(), {
  name: 'Brygge',
  number: '2002',
  manager: 'Anna',
  street: 'Egen gate',
  client: 'Annen kunde',
  customerId: 'k9',
});
const keptId = keptSeed.state.activeProjectId;
const kept = applyAgreementToProjects(keptSeed.state, [{ ...contract, projectId: keptId }], [customer]);
const keptProject = kept.state.projects.find((row) => row.id === keptId);
assert.equal(keptProject.manager, 'Anna');
assert.equal(keptProject.street, 'Egen gate');
assert.equal(keptProject.client, 'Annen kunde');
assert.equal(keptProject.customerId, 'k9');
assert.equal(keptProject.contractId, 'c1');
assert.equal(keptProject.postalCode, '');

const timed = projectFillFromAgreement(
  { id: 'p', name: 'Time', number: '1' },
  { id: 'c', kind: 'oppdrag', fields: { honorar: 'Etter medgått tid', honorarForm: 'Medgått tid' }, value: 1000 },
  null,
);
assert.equal(timed.pricingModel, undefined);
assert.equal(timed.contractId, 'c');

const reverse = { id: projectId, name: 'Brygge', number: '2001', contractId: '' };
const resolved = resolveProjectAgreement(reverse, [contract]);
assert.equal(resolved.contract.id, 'c1');
assert.equal(projectAgreementGap(reverse, [contract]), false);

const invoices = invoicesForProject([
  { id: 'a', projectId: 'annen', projectNumber: '999', invoiceNumber: '1', amountExVat: 10, invoiceDate: '2026-01-01' },
  { id: 'b', projectId, projectNumber: '', invoiceNumber: '2', amountExVat: 100, invoiceDate: '2026-02-01', status: 'sent' },
  { id: 'c', projectId: '', projectNumber: '02001', invoiceNumber: '3', amountExVat: 50, invoiceDate: '2026-03-01', status: 'paid' },
], filled);
assert.deepEqual(invoices.map((row) => row.id), ['c', 'b']);

const view = projectCrossView({
  project: filled,
  contracts: [contract],
  customer,
  invoices,
  time: { hours: 6, billable: 5, count: 1 },
});
assert.equal(view.contract.id, 'c1');
assert.equal(view.honorarAmount, 450000);
assert.equal(view.contractValue, 450000);
assert.equal(view.totals.amountExVat, 150);
assert.equal(view.invoices.length, 2);
assert.equal(view.documents[0].name, 'Signert avtale.pdf');
assert.equal(view.milestones[0].title, 'Oppstart');
assert.ok(view.facts.some((row) => row.label === 'Fakturamottak' && row.value === 'EHF'));
assert.ok(view.facts.some((row) => row.label === 'Oppfølging' && row.value === 'Kari Nordmann'));
assert.ok(view.facts.some((row) => row.label === 'E-post' && row.value === 'post@breitorget.no'));
assert.ok(view.facts.some((row) => row.label === 'Timer jobbet'));

const own = updateProject(once.state, projectId, { manager: 'Anna' });
assert.equal(own.ok, true);
assert.equal(applyAgreementToProjects(own.state, [contract], [customer]).changed, 0);
assert.equal(own.state.projects.find((row) => row.id === projectId).manager, 'Anna');

const detail = readFileSync(new URL('../../components/project/ProjectDetail.jsx', import.meta.url), 'utf8');
const overview = readFileSync(new URL('../../components/project/ProjectOverviewTab.jsx', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
// Avtalen, honoraret og fakturert beløp ligger i oversikten (avtale-spalten og nøkkeltallene).
assert.match(overview, /project-overview-agreement/);
assert.match(overview, /onOpenAgreement\?\.\(cross\.contract\.id\)/);
assert.match(overview, /label="Fakturert"/);
assert.match(detail, /onOpenAgreement=\{onOpenAgreement\}/);
assert.match(detail, /project-invoice-list/);
assert.match(screen, /applyAgreementToProjects/);
assert.match(screen, /openContract/);
assert.match(screen, /watchInvoices/);
assert.match(screen, /openInvoice/);

console.log('projectCrossView.test.mjs: ok');
