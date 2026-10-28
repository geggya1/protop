/**
 * Fase 1 i datasynk-planen: felles oppslag (resolvePerson, resolveCustomer, resolveProject,
 * resolveHourlyRate, hydrateRefs) og lageret bak CompanyDataProvider.
 * Scenarioet til slutt: et nytt navn på en ansatt og en kunde slår gjennom i listene
 * uten omlasting, og kopien på raden brukes bare for en slettet person.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCompanyDirectory,
  freshRows,
  hydrateRefs,
  hydrateRows,
  indexCustomers,
  indexProjects,
  personName,
  resolveCustomer,
  resolvePerson,
  resolveProject,
} from './companyData.js';
import { createCompanyDataStore } from './companyDataStore.js';
import { resolveHourlyRate } from '../economy/hourlyRate.js';
import { hourlyRateFor } from '../economy/billingReady.js';
import { hydrateHourEntry } from '../economy/hoursList.js';

const kari = {
  id: 'emp_kari',
  personUid: 'uid_kari',
  person: { firstName: 'Kari', lastName: 'Nordmann', photoUrl: 'kari.jpg' },
  company: { status: 'active', accessLevels: ['ansatt'] },
};
const ola = {
  id: 'emp_ola',
  personUid: '',
  person: { firstName: 'Ola', lastName: 'Hansen' },
  company: { status: 'inactive' },
};
const members = [
  { id: 'uid_kari', uid: 'uid_kari', name: 'Kari N.', photoURL: 'kari-member.jpg', active: true },
  { id: 'uid_per', uid: 'uid_per', name: 'Per Medlem', active: true, admin: true },
  { id: 'uid_gammel', uid: 'uid_gammel', name: 'Gammel', active: false, leftAt: '2026-01-01' },
];

test('resolvePerson: én rad per person, både uid og ansatt-id treffer', () => {
  const directory = buildCompanyDirectory({ employees: [kari, ola], members });
  assert.equal(directory.rows.length, 4);
  const byEmployee = resolvePerson('emp_kari', directory);
  const byUid = resolvePerson('uid_kari', directory);
  assert.equal(byEmployee, byUid);
  assert.equal(byEmployee.name, 'Kari Nordmann', 'ansattkortet gir navnet');
  assert.equal(byEmployee.photo, 'kari.jpg');
  assert.equal(byEmployee.active, true);
  assert.deepEqual(byEmployee.levelIds, ['ansatt']);
  // Medlem uten ansattkort.
  const per = resolvePerson('uid_per', directory);
  assert.equal(per.employeeId, '');
  assert.equal(per.name, 'Per Medlem');
  assert.equal(per.admin, true);
  // Deaktivert ansatt og avsluttet medlemskap: med, men ikke aktive.
  assert.equal(resolvePerson('emp_ola', directory).active, false);
  assert.equal(resolvePerson('emp_ola', directory).state, 'inactive');
  assert.equal(resolvePerson('uid_gammel', directory).active, false);
  assert.equal(resolvePerson('ukjent', directory), null);
  assert.equal(personName('ukjent', directory, 'Kopi'), 'Kopi');
});

test('resolvePerson: ansattkort uten navn bruker navnet fra medlemskapet', () => {
  const blank = { id: 'emp_x', personUid: 'uid_per', person: {}, company: { status: 'active' } };
  const directory = buildCompanyDirectory({ employees: [blank], members });
  assert.equal(resolvePerson('emp_x', directory).name, 'Per Medlem');
  assert.equal(resolvePerson('uid_per', directory).employeeId, 'emp_x');
});

test('resolveCustomer: id, kundenummer, org.nr. og navn', () => {
  const customers = indexCustomers([
    { id: 'k1', name: 'Bygg AS', customerNumber: '10', orgnr: '912 345 678' },
    { id: 'k2', name: 'Sola kommune', customerNumber: '11', orgnr: '' },
  ]);
  assert.equal(resolveCustomer('k1', customers).id, 'k1');
  assert.equal(resolveCustomer('11', customers).id, 'k2');
  assert.equal(resolveCustomer({ customerId: 'k2' }, customers).id, 'k2');
  assert.equal(resolveCustomer({ customerId: 'borte', customerNumber: '10' }, customers).id, 'k1');
  assert.equal(resolveCustomer({ orgnr: '912345678' }, customers).id, 'k1');
  assert.equal(resolveCustomer({ client: 'SOLA KOMMUNE' }, customers).id, 'k2');
  assert.equal(resolveCustomer({ client: 'Ukjent' }, customers), null);
  // Liste eller Map virker også.
  assert.equal(resolveCustomer('k1', [{ id: 'k1', name: 'Bygg AS' }]).name, 'Bygg AS');
});

test('resolveProject: id eller prosjektnummer', () => {
  const projects = indexProjects([
    { id: 'p1', number: '100', name: 'Skole' },
    { id: 'p2', number: '0200', name: 'Hall (100)' },
  ]);
  assert.equal(resolveProject('p1', projects).id, 'p1');
  assert.equal(resolveProject('200', projects).id, 'p2');
  assert.equal(resolveProject('100', projects).id, 'p1', 'eget nummer går foran nummer i navnet');
  assert.equal(resolveProject({ projectId: 'borte', projectNumber: '200' }, projects).id, 'p2');
  assert.equal(resolveProject({ projectId: 'borte' }, projects), null);
});

test('resolveHourlyRate: avtalen, prosjektet, den ansatte, selskapets standard', () => {
  const project = { id: 'p1', pricingSettings: { hourlyRate: 1100 } };
  const contracts = [{ projectId: 'p1', priceVersions: [{ validFrom: '2026-01-01', rateExVat: 1250 }] }];
  const employee = { id: 'emp_kari', extras: { timeSettings: { hourlyRate: '980' } } };
  const earnings = { variables: { defaultBillableRate: 900 }, employees: { emp_ola: { billableRate: 950 } } };
  assert.deepEqual(resolveHourlyRate({ project, contracts, date: '2026-03-01', employee, earnings }), { rate: 1250, source: 'contract' });
  assert.deepEqual(resolveHourlyRate({ project, contracts, date: '2025-12-31', employee, earnings }), { rate: 1100, source: 'project' });
  assert.deepEqual(resolveHourlyRate({ project: { id: 'p9' }, employee, earnings }), { rate: 980, source: 'employee' });
  assert.deepEqual(resolveHourlyRate({ project: { id: 'p9' }, employee: { id: 'emp_ola' }, earnings }), { rate: 950, source: 'employee' });
  assert.deepEqual(resolveHourlyRate({ project: { id: 'p9' }, employee: { id: 'emp_ny' }, earnings }), { rate: 900, source: 'company' });
  assert.deepEqual(resolveHourlyRate({}), { rate: null, source: '' });
  // Til fakturering bruker de to første trinnene, som før.
  assert.equal(hourlyRateFor(project, '2026-03-01', contracts), 1250);
  assert.equal(hourlyRateFor({ id: 'p9' }, '2026-03-01', contracts), null);
});

test('hydrateRefs: navn fra registrene, kunde via prosjektet, kopien som reserve', () => {
  const refs = {
    directory: buildCompanyDirectory({ employees: [kari], members }),
    customers: indexCustomers([{ id: 'k1', name: 'Bygg AS', customerNumber: '10' }]),
    projects: indexProjects([{ id: 'p1', number: '100', name: 'Skole', customerId: 'k1', client: 'Bygg (gammelt)' }]),
  };
  const row = {
    id: 't1', employeeId: 'uid_kari', employeeName: 'K. Gammel',
    projectId: 'p1', projectNumber: '99', projectName: 'Gammelt navn', customerName: 'Bygg (gammelt)',
  };
  const out = hydrateRefs(row, refs);
  assert.equal(out.employeeName, 'Kari Nordmann', 'uid som employeeId treffer også');
  assert.equal(out.projectNumber, '100');
  assert.equal(out.projectName, 'Skole');
  assert.equal(out.customerName, 'Bygg AS');
  assert.equal(out.customerNumber, '10');
  assert.equal(row.employeeName, 'K. Gammel', 'raden endres ikke');
  // Slettet person og prosjekt: kopien står.
  const gone = { id: 't2', employeeId: 'emp_slettet', employeeName: 'Sluttet Person', projectId: 'p_borte', projectName: 'Arkiv' };
  assert.equal(hydrateRefs(gone, refs), gone);
  // Andre feltnavn (ISO-eier).
  const owned = hydrateRefs({ ownerUid: 'uid_kari', ownerName: 'Kari' }, refs, { personId: 'ownerUid', personName: 'ownerName' });
  assert.equal(owned.ownerName, 'Kari Nordmann');
  const list = [gone];
  assert.equal(hydrateRows(list, refs), list, 'uendret liste gis tilbake som den er');
});

test('hydrateHourEntry bruker hydrateRefs med Map-er som før', () => {
  const employeesById = new Map([['e1', { id: 'e1', person: { firstName: 'Geir', lastName: 'Andersen' } }]]);
  const projectsById = new Map([['p1', { id: 'p1', number: '10640', name: 'Barnehage', client: 'Sola Kommune' }]]);
  const out = hydrateHourEntry({ id: 't1', employeeId: 'e1', employeeName: 'Tom', projectId: 'p1' }, {
    employeesById, projectsById, customersById: new Map(),
  });
  assert.equal(out.employeeName, 'Geir Andersen');
  assert.equal(out.projectName, 'Barnehage');
  assert.equal(out.customerName, 'Sola Kommune');
});

test('freshRows: lytterens versjon vinner når den er minst like ny', () => {
  const loaded = [
    { id: 'p1', name: 'Gammelt', updatedAt: '2026-01-01' },
    { id: 'p2', name: 'Lokal endring', updatedAt: '2026-05-01' },
    { id: 'p3', name: 'Bare her' },
  ];
  const live = indexProjects([
    { id: 'p1', name: 'Nytt', updatedAt: '2026-02-01' },
    { id: 'p2', name: 'Eldre i skyen', updatedAt: '2026-04-01' },
  ]);
  const out = freshRows(loaded, live);
  assert.deepEqual(out.map((row) => row.name), ['Nytt', 'Lokal endring', 'Bare her']);
  assert.equal(freshRows(loaded, null), loaded);
});

function fakeSources() {
  const calls = { started: [], stopped: [] };
  const emitters = {};
  const make = (key) => (companyId, onData) => {
    calls.started.push(key);
    emitters[key] = onData;
    return () => calls.stopped.push(key);
  };
  return {
    calls,
    emitters,
    sources: {
      employees: make('employees'),
      customers: make('customers'),
      projects: make('projects'),
      earnings: make('earnings'),
    },
  };
}

test('lageret: én lytter per kilde, delt av flere skjermer, og stoppes etter siste', async () => {
  const fake = fakeSources();
  const store = createCompanyDataStore('co1', fake.sources, { graceMs: 5 });
  const releaseA = store.retain('employees');
  const releaseB = store.retain('directory');
  assert.deepEqual(fake.calls.started, ['employees'], 'to skjermer, én lytter');
  releaseA();
  releaseB();
  assert.deepEqual(fake.calls.stopped, [], 'lytteren står litt etter at siste slapp');
  const again = store.retain('employees');
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(fake.calls.stopped, [], 'ny skjerm før fristen: samme lytter');
  again();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(fake.calls.stopped, ['employees']);
  store.retain('settings');
  assert.deepEqual(fake.calls.started.slice(1).sort(), ['earnings', 'projects']);
  store.dispose();
});

test('scenario: nytt navn på ansatt og kunde slår gjennom i listene uten omlasting', () => {
  const fake = fakeSources();
  const store = createCompanyDataStore('co1', fake.sources);
  const seen = { directory: 0, customers: 0 };
  store.subscribe('directory', () => { seen.directory += 1; });
  store.subscribe('customers', () => { seen.customers += 1; });
  store.retain('directory');
  store.retain('customers');
  store.retain('projects');
  store.setMembers(members, { uid: 'uid_kari' });

  // Rader slik de er lagret: navnene er kopier fra da de ble ført.
  const hours = [
    { id: 't1', employeeId: 'emp_kari', employeeName: 'Kari Nordmann', projectId: 'p1', customerId: 'k1', customerName: 'Bygg AS' },
    { id: 't2', employeeId: 'emp_slettet', employeeName: 'Sluttet Person', projectId: 'p1' },
  ];
  const sales = [{ id: 's1', employeeId: 'uid_kari', employeeName: 'Kari Nordmann', customerId: 'k1', customerName: 'Bygg AS' }];
  const view = () => {
    const refs = { directory: store.get('directory'), customers: store.get('customers'), projects: store.get('projects') };
    const rows = hydrateRows(hours, refs);
    // Sortering og filtrering skjer etter oppslaget.
    return {
      hours: rows.slice().sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'nb')),
      sales: hydrateRows(sales, refs).filter((row) => row.customerName.includes('Bygg')),
    };
  };

  fake.emitters.employees([kari], { source: 'remote' });
  fake.emitters.customers([{ id: 'k1', name: 'Bygg AS', customerNumber: '10' }], { source: 'remote' });
  fake.emitters.projects({ projects: [{ id: 'p1', number: '100', name: 'Skole', customerId: 'k1' }] }, { source: 'remote' });
  let shown = view();
  assert.deepEqual(shown.hours.map((row) => row.employeeName), ['Kari Nordmann', 'Sluttet Person']);
  assert.equal(shown.sales.length, 1);

  // HR retter navnet på ansattkortet, og kunden får nytt navn i Kunder (andre brukere).
  const before = { ...seen };
  fake.emitters.employees([{ ...kari, person: { ...kari.person, lastName: 'Berg' } }], { source: 'remote' });
  fake.emitters.customers([{ id: 'k1', name: 'Berg Bygg AS', customerNumber: '10' }], { source: 'remote' });
  assert.equal(seen.directory, before.directory + 1, 'åpne skjermer får beskjed');
  assert.equal(seen.customers, before.customers + 1);
  shown = view();
  assert.deepEqual(shown.hours.map((row) => row.employeeName), ['Kari Berg', 'Sluttet Person'], 'sorteres på det nye navnet');
  assert.equal(shown.hours[0].customerName, 'Berg Bygg AS');
  assert.equal(shown.sales[0].employeeName, 'Kari Berg', 'salg ført på uid treffer samme person');
  assert.equal(shown.sales.length, 1, 'filteret ser det nye kundenavnet');
  assert.equal(hours[0].employeeName, 'Kari Nordmann', 'lagrede rader er urørt');
  store.dispose();
});
