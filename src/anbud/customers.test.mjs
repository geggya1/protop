import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  customerDraftFromBrreg,
  customerImportReviewRows,
  customerInvoiceGaps,
  customerReadyForInvoice,
  enrichCustomerFromBrreg,
  enrichCustomerImportPlan,
  fillCustomerFromBrreg,
  filterCustomers,
  formatOrgnr,
  importCustomers,
  maskPersonnummer,
  planCustomerImport,
  withCustomerNumbers,
  matchCustomer,
  namesLikelyMatch,
  normalizeCustomer,
  normalizeCustomerNumber,
  customerPhoneLines,
  ownerLabel,
  projectBelongsToCustomer,
  projectCountsByCustomer,
  relatedContractsForCustomer,
  relatedProjectsForCustomer,
  setCustomerOwner,
  upsertCustomer,
} from './customers.js';
import { emptyAnbudState } from './model.js';

const created = upsertCustomer(emptyAnbudState(), {
  name: 'Igang Totalentreprenør As',
  orgnr: '922 98 7106',
  contactName: 'Øyvind Lerbrekk',
  email: 'oyvind@igang.no',
  phone: '92082276',
});
assert.equal(created.ok, true, created.error);
assert.equal(created.customer.orgnr, '922987106');
assert.equal(formatOrgnr(created.customer.orgnr), '922 987 106');

const again = upsertCustomer(created.state, { name: 'Igang', orgnr: '922987106' });
assert.equal(again.ok, false);

const match = matchCustomer(created.state.customers, { buyer: 'Annen', orgnr: '922987106' });
assert.equal(match.status, 'match');
assert.equal(match.customer.id, created.customer.id);

const fresh = matchCustomer(created.state.customers, {
  buyer: 'Sola kommune',
  orgnr: '964967668',
});
assert.equal(fresh.status, 'new');
assert.equal(fresh.draft.name, 'Sola kommune');
assert.equal(fresh.draft.orgnr, '964967668');

const person = matchCustomer([], { name: 'Kari Nordmann', personnummer: '01017012345' });
assert.equal(person.status, 'new');
assert.equal(person.draft.kind, 'person');
assert.equal(maskPersonnummer(person.draft.personnummer), '******12345');

const listed = filterCustomers(created.state.customers, 'igang');
assert.equal(listed.length, 1);

assert.equal(normalizeCustomer({ id: 'x', name: '' }), null);
assert.equal(upsertCustomer(emptyAnbudState(), { name: '' }).ok, false);

const personSaved = upsertCustomer(emptyAnbudState(), {
  name: 'Kari Nordmann',
  kind: 'person',
  personnummer: '01017012345',
  orgnr: '922987106',
});
assert.equal(personSaved.ok, true, personSaved.error);
assert.equal(personSaved.customer.orgnr, '');
assert.equal(personSaved.customer.personnummer, '01017012345');

const orgSaved = upsertCustomer(emptyAnbudState(), {
  name: 'Firma AS',
  kind: 'org',
  orgnr: '922987106',
  personnummer: '01017012345',
});
assert.equal(orgSaved.customer.personnummer, '');
assert.equal(orgSaved.customer.orgnr, '922987106');

const fromBrreg = customerDraftFromBrreg({
  navn: 'BOLIGMAPPA AS',
  organisasjonsnummer: '998131650',
  street: 'Dronning Mauds gate 10',
  postnummer: '0250',
  poststed: 'OSLO',
  epostadresse: 'post@boligmappa.no',
  telefon: '21 00 00 00',
  organisasjonsform: 'Aksjeselskap',
});
assert.equal(fromBrreg.kind, 'org');
assert.equal(fromBrreg.orgnr, '998131650');
assert.equal(fromBrreg.personnummer, '');
assert.equal(fromBrreg.address, 'Dronning Mauds gate 10');
assert.equal(fromBrreg.place, 'OSLO');
assert.equal(fromBrreg.postalCode, '0250');

const imported = importCustomers(emptyAnbudState(), [
  { name: 'Sola kommune', orgnr: '964967668', address: 'Rådhuset' },
  { name: 'Sola kommune', orgnr: '964967668' },
  { name: 'Kari', kind: 'person', personnummer: '01017012345' },
]);
assert.equal(imported.created.length, 2);
assert.equal(imported.skipped.length, 1);

assert.match(
  readFileSync(new URL('../utils/authProviders.js', import.meta.url), 'utf8'),
  /import \{ isCalendarOauthReturn \} from '\.\/calendarOAuthCapture'/,
);

assert.equal(namesLikelyMatch('Igang Totalentreprenør As', 'IGANG TOTALENTREPRENØR AS'), true);
assert.equal(namesLikelyMatch('Igang Totalentreprenør As', 'Consult1 AS'), false);

assert.equal(normalizeCustomerNumber('10115.0'), '10115');
assert.equal(normalizeCustomerNumber('10115,00'), '10115');
assert.equal(normalizeCustomerNumber('10 115'), '10115');
assert.equal(normalizeCustomerNumber('0010115'), '10115');

const owned = setCustomerOwner(created.state, created.customer.id, { uid: 'p1', name: 'Kari Konsulent' });
assert.equal(owned.ok, true);
assert.equal(owned.customer.ownerUid, 'p1');
assert.equal(ownerLabel(owned.customer, [{ uid: 'p1', name: 'Kari Konsulent' }]), 'Kari Konsulent');

const planned = planCustomerImport(created.state, [
  { name: 'Ny kunde AS', orgnr: '923456785', address: 'Storgata 1', postalCode: '4073', place: 'Randaberg', email: 'post@ny.no', phone: '92082276' },
  { name: 'Igang Totalentreprenør As', orgnr: '922987106', address: 'Gate 1', postalCode: '4073', place: 'Randaberg', email: 'a@b.no', phone: '92082276' },
  { name: 'Halv kunde', orgnr: '923456793', email: 'uten-alfakrøll', phone: '12' },
  { name: 'Ny kunde AS', orgnr: '923456785', address: 'Annen gate', postalCode: '4073', place: 'Oslo', email: 'b@c.no', phone: '92082276' },
  { orgnr: '923456807', address: 'Uten navn gate' },
  { name: 'Feil nummer', orgnr: '123', address: 'Gate', postalCode: '4073', place: 'Oslo', email: 'c@d.no', phone: '92082276' },
]);
const byName = Object.fromEntries(planned.rows.map((row) => [row.name, row]));
const ny = planned.rows.filter((row) => row.name === 'Ny kunde AS');
assert.equal(ny.filter((row) => row.severity === 'ok' && row.action === 'create').length, 1);
assert.equal(ny.filter((row) => row.severity === 'block' && /flere ganger/.test(row.reason)).length, 1);
assert.equal(byName['Igang Totalentreprenør As'].severity, 'existing');
assert.match(byName['Igang Totalentreprenør As'].reason, /organisasjonsnummer/);
assert.equal(byName['Igang Totalentreprenør As'].action, 'skip');
assert.equal(byName['Halv kunde'].severity, 'review');
assert.equal(byName['Halv kunde'].action, 'create');
assert.equal(byName['Halv kunde'].customer.email, '');
assert.equal(byName['Halv kunde'].customer.phone, '');
assert.ok(byName['Halv kunde'].issues.some((issue) => /E-post/.test(issue)));
assert.equal(byName['Halv kunde'].issues.some((issue) => /adresse/.test(issue)), false);
assert.equal(customerInvoiceGaps(byName['Halv kunde'].customer).length, 0);
assert.equal(byName['923456807'].severity, 'block');
assert.match(byName['923456807'].reason, /Mangler navn/);
assert.equal(byName['Feil nummer'].severity, 'review');
assert.equal(byName['Feil nummer'].action, 'create');
assert.equal(byName['Feil nummer'].customer.orgnr, '');
assert.ok(byName['Feil nummer'].issues.some((issue) => /ni siffer/.test(issue)));
assert.equal(planned.rows[0].severity, 'block');

const occupied = planCustomerImport(created.state, [
  { name: 'Samme nummer', customerNumber: created.customer.customerNumber, address: 'Gate 9', postalCode: '4073', place: 'Randaberg', email: 'x@y.no', phone: '92082276' },
  { name: created.customer.name, address: 'Annen gate', postalCode: '4073', place: 'Oslo', email: 'z@y.no', phone: '92082276' },
  { name: 'Privat uten org', kind: 'person', address: 'Veien 1', postalCode: '0001', place: 'Oslo', email: 'ola@x.no', phone: '90000000' },
]);
assert.equal(occupied.rows.find((row) => row.name === 'Samme nummer').severity, 'existing');
assert.match(occupied.rows.find((row) => row.name === 'Samme nummer').reason, /Kundenummeret/);
assert.equal(occupied.rows.find((row) => row.name === created.customer.name).severity, 'review');
assert.equal(occupied.rows.find((row) => row.name === created.customer.name).action, 'create');
const privatRow = occupied.rows.find((row) => row.name === 'Privat uten org');
assert.equal(privatRow.action, 'create');
assert.equal(privatRow.severity, 'ok');
assert.equal(privatRow.issues.some((issue) => /organisasjonsnummer/i.test(issue)), false);

const grouped = customerImportReviewRows(planned.rows);
const existingHit = grouped.find((row) => row.severity === 'existing' && /organisasjonsnummer/.test(row.issues[0]));
assert.ok(existingHit);
assert.ok(existingHit.matchId);
assert.match(existingHit.title, /^Nr /);
assert.match(existingHit.title, /Igang/i);
assert.match(existingHit.meta, /922 987 106/);
const numberSyncPlan = planCustomerImport(created.state, [
  { name: 'Consult1 AS', orgnr: '922987106', customerNumber: '10001' },
]);
const numberSync = numberSyncPlan.rows.find((row) => row.orgnr === '922987106');
assert.equal(numberSync.action, 'update');
assert.equal(numberSync.severity, 'ok');
assert.equal(numberSync.customer.id, created.customer.id);
assert.equal(numberSync.customer.customerNumber, '10001');
assert.equal(numberSync.matchCustomerNumber, created.customer.customerNumber);
assert.ok(numberSync.issues.some((issue) => /oppdateres fra Nr/.test(issue)));
const numberSyncView = customerImportReviewRows(numberSyncPlan.rows).find((row) => row.matchId === created.customer.id);
assert.match(numberSyncView.title, /^10001 ·/);
assert.match(numberSyncView.meta, /Var Nr/);
assert.equal(numberSyncView.included, true);
const synced = importCustomers(created.state, [numberSync.customer]);
assert.equal(synced.created[0].customerNumber, '10001');
assert.equal(synced.state.customers.find((row) => row.id === created.customer.id).customerNumber, '10001');

const numberTaken = planCustomerImport(
  upsertCustomer(created.state, {
    name: 'Annen AS',
    orgnr: '923456785',
    customerNumber: '10001',
    address: 'Gate 9',
    postalCode: '4073',
    place: 'Oslo',
    email: 'a@a.no',
    phone: '92082276',
  }).state,
  [{ name: 'Consult1 AS', orgnr: '922987106', customerNumber: '10001' }],
).rows[0];
assert.equal(numberTaken.action, 'skip');
assert.equal(numberTaken.severity, 'existing');
assert.match(numberTaken.reason, /opptatt/);
assert.equal(customerReadyForInvoice(created.customer), true);
assert.equal(customerInvoiceGaps({ name: 'A', kind: 'org', orgnr: '922987106' }).length, 0);
assert.ok(customerInvoiceGaps({ name: 'A', kind: 'org' }).includes('Mangler organisasjonsnummer.'));
assert.equal(customerInvoiceGaps({ name: 'A', kind: 'person' }).includes('Mangler organisasjonsnummer.'), false);
assert.ok(customerInvoiceGaps({ name: 'A', kind: 'person' }).includes('Mangler adresse.'));

const fromRegister = fillCustomerFromBrreg(
  { name: 'Halv kunde', kind: 'org', orgnr: '923456793' },
  {
    navn: 'HALV KUNDE AS',
    organisasjonsnummer: '923456793',
    street: 'Storgata 1',
    postnummer: '0155',
    poststed: 'OSLO',
    epostadresse: 'post@halv.no',
    telefon: '22000000',
  },
);
assert.equal(fromRegister.address, 'Storgata 1');
assert.equal(fromRegister.postalCode, '0155');
assert.equal(fromRegister.place, 'OSLO');
assert.equal(fromRegister.email, 'post@halv.no');
assert.equal(fromRegister.phone, '22000000');
assert.equal(fromRegister.name, 'Halv kunde');

const enrichedPlan = await enrichCustomerImportPlan(planCustomerImport(emptyAnbudState(), [
  { name: 'Tom AS', orgnr: '998131650' },
]), {
  lookup: async () => ({
    navn: 'BOLIGMAPPA AS',
    organisasjonsnummer: '998131650',
    street: 'Dronning Mauds gate 10',
    postnummer: '0250',
    poststed: 'OSLO',
    epostadresse: 'post@boligmappa.no',
    telefon: '21000000',
  }),
});
assert.equal(enrichedPlan.rows[0].severity, 'ok');
assert.equal(enrichedPlan.rows[0].customer.address, 'Dronning Mauds gate 10');
assert.equal(enrichedPlan.rows[0].customer.email, 'post@boligmappa.no');
const enrichOne = await enrichCustomerFromBrreg(
  { name: 'Tom AS', kind: 'org', orgnr: '998131650' },
  { lookup: async () => ({ navn: 'BOLIGMAPPA AS', organisasjonsnummer: '998131650', street: 'Gate 9', postnummer: '0250', poststed: 'OSLO' }) },
);
assert.equal(enrichOne.changed, true);
assert.equal(enrichOne.customer.address, 'Gate 9');

const takenNumber = upsertCustomer(created.state, { name: 'Duplikat nr', customerNumber: created.customer.customerNumber });
assert.equal(takenNumber.ok, false);
assert.match(takenNumber.error, /Kundenummeret/);

let packed = emptyAnbudState();
packed = upsertCustomer(packed, { name: 'Eksisterende AS', orgnr: '923456785', customerNumber: '10006', address: 'Gate 1', postalCode: '4073', place: 'Oslo', email: 'a@a.no', phone: '92082276' }).state;
packed = upsertCustomer(packed, { name: 'Uten org i register', customerNumber: '10008', address: 'Gate 2', postalCode: '4073', place: 'Oslo', email: 'b@b.no', phone: '92082276' }).state;
const mix = planCustomerImport(packed, [
  { name: 'Eksisterende AS', orgnr: '923456785', email: '', phone: '' },
  { name: 'Uten org i register', customerNumber: '10008' },
  { name: 'Ny privatperson', kind: 'person', address: 'Veien 2' },
  { name: 'Ny bedrift', address: 'Storgata 1' },
]);
assert.deepEqual(mix.rows.filter((row) => row.severity === 'existing').map((row) => row.name).sort(), ['Eksisterende AS', 'Uten org i register']);
assert.equal(mix.rows.filter((row) => row.action === 'create').length, 2);
assert.ok(mix.rows.find((row) => row.name === 'Ny privatperson').issues.includes('Mangler e-post og telefon.'));
assert.ok(mix.rows.find((row) => row.name === 'Ny bedrift').issues.includes('Mangler organisasjonsnummer.'));
const mixView = customerImportReviewRows(mix.rows);
assert.equal(mixView.filter((row) => row.severity === 'existing').reduce((sum, row) => sum + row.count, 0), 2);
assert.equal(mixView.filter((row) => row.severity === 'review' && row.included).length, 2);

const screen = readFileSync(new URL('../../screens/customers/CustomersScreen.jsx', import.meta.url), 'utf8');
const importFile = screen.slice(screen.indexOf('async function importFile'), screen.indexOf('function toggleCustomer'));
assert.equal(importFile.includes('saveAnbudState'), false);
assert.match(importFile, /planCustomerImport/);
assert.match(importFile, /enrichCustomerImportPlan/);
assert.match(screen, /confirmCustomerImport/);
assert.match(screen, /customerImportReviewRows/);
assert.match(screen, /enrichCustomerFromBrreg/);
assert.match(screen, /Ingenting er lagret ennå/);
assert.match(screen, /neste ledige er/);
assert.match(screen, /Må rettes før fakturering/);
assert.match(screen, /customer-filter-gap-invoice/);
assert.match(screen, /Brønnøysund/);
assert.match(screen, /onOpenExisting/);
assert.match(screen, /action !== 'create' && row\.action !== 'update'/);
const reviewUi = readFileSync(new URL('../../components/ImportReview.jsx', import.meta.url), 'utf8');
assert.match(reviewUi, /onOpenExisting/);
assert.match(reviewUi, /i kunderegisteret/);
assert.match(
  readFileSync(new URL('./customers.js', import.meta.url), 'utf8'),
  /action update/,
);

const first = upsertCustomer(emptyAnbudState(), { name: 'A AS', orgnr: '923456785', address: 'Gate 1', postalCode: '4073', place: 'Oslo', email: 'a@a.no', phone: '92082276' });
const second = upsertCustomer(first.state, { name: 'B AS', orgnr: '923456793', customerNumber: '10180', address: 'Gate 2', postalCode: '4073', place: 'Oslo', email: 'b@b.no', phone: '92082276' });
const third = upsertCustomer(second.state, { name: 'C AS', orgnr: '923456807', address: 'Gate 3', postalCode: '4073', place: 'Oslo', email: 'c@c.no', phone: '92082276' });
assert.equal(first.customer.customerNumber, '1');
assert.equal(second.customer.customerNumber, '10180');
assert.equal(third.customer.customerNumber, '10181');

const migrated = withCustomerNumbers([
  { id: 'a', name: 'A', notes: 'Kundenr 10180 · nettside', createdAt: '2024-01-02' },
  { id: 'b', name: 'B', createdAt: '2024-01-01' },
]);
assert.equal(migrated.find((row) => row.id === 'a').customerNumber, '10180');
assert.equal(migrated.find((row) => row.id === 'a').notes, 'nettside');
assert.equal(migrated.find((row) => row.id === 'b').customerNumber, '10181');
const migratedAgain = withCustomerNumbers(migrated);
assert.equal(migratedAgain.find((row) => row.id === 'b').customerNumber, '10181');
assert.equal(migratedAgain.find((row) => row.id === 'a').notes, 'nettside');

const ordered = filterCustomers([
  { id: 'b', name: 'Senere', kind: 'org', customerNumber: '2', email: 's@s.no', phone: '92082276', address: 'Gate' },
  { id: 'a', name: 'Først', kind: 'person', customerNumber: '10', email: '', phone: '', address: '' },
], '10', { kind: 'person', gap: 'contact' });
assert.equal(ordered.length, 1);
assert.equal(ordered[0].name, 'Først');
const incomplete = filterCustomers([
  { id: 'b', name: 'Senere', kind: 'org', customerNumber: '2', orgnr: '923456785', email: 's@s.no', phone: '92082276', address: 'Gate', postalCode: '0001', place: 'Oslo' },
  { id: 'a', name: 'Først', kind: 'person', customerNumber: '10', email: '', phone: '', address: '' },
], '', { gap: 'invoice' });
assert.equal(incomplete.length, 1);
assert.equal(incomplete[0].name, 'Først');
assert.equal(customerReadyForInvoice({
  name: 'Komplett AS',
  kind: 'org',
  orgnr: '922987106',
  address: 'Gate 1',
  postalCode: '4073',
  place: 'Randaberg',
  email: 'post@komplett.no',
}), true);
const byNumber = filterCustomers([
  { id: 'b', name: 'Senere', kind: 'org', customerNumber: '12' },
  { id: 'a', name: 'Først', kind: 'org', customerNumber: '2' },
], '');
assert.deepEqual(byNumber.map((row) => row.customerNumber), ['2', '12']);
const byPerson = filterCustomers([
  { id: 'p', name: 'Thor', kind: 'person', customerNumber: '4', personnummer: '01017012345', email: 't@t.no', phone: '90000000', address: 'Vei 1' },
  { id: 'o', name: 'Org', kind: 'org', customerNumber: '5', orgnr: '916538804' },
], '010170');
assert.equal(byPerson.length, 1);
assert.equal(byPerson[0].name, 'Thor');

const sparse = customerPhoneLines({
  name: 'Novaform AS',
  kind: 'org',
  customerNumber: '10002',
  orgnr: '991356959',
});
assert.equal(sparse.name, 'Novaform AS');
assert.equal(sparse.meta, 'Nr 10002 · Org.nr 991 356 959');
assert.equal(sparse.extra, '');
const filled = customerPhoneLines({
  name: 'Høgevollsveien Borettslag',
  kind: 'org',
  customerNumber: '10003',
  orgnr: '946804150',
  address: 'Høgevollsveien 1',
  postalCode: '4311',
  place: 'Hommeråk',
  contactName: 'Kari',
  email: 'kari@example.no',
  phone: '90000000',
  ownerUid: 'p1',
}, [{ uid: 'p1', name: 'Geir' }]);
assert.equal(filled.extra, 'Høgevollsveien 1, 4311 Hommeråk · Kari · kari@example.no · 90000000 · Geir');
const privat = customerPhoneLines({ name: 'Anders', kind: 'person', customerNumber: '4' });
assert.equal(privat.meta, 'Nr 4 · Privatkunde');
const withProjects = customerPhoneLines(
  { name: 'Anders', kind: 'person', customerNumber: '4' },
  [],
  { projectCount: 2 },
);
assert.equal(withProjects.meta, 'Nr 4 · Privatkunde · 2 prosjekter');

const kundeA = created.customer;
const kundeB = upsertCustomer(emptyAnbudState(), {
  name: 'Sola kommune',
  orgnr: '964967668',
  customerNumber: '42',
}).customer;

const avtaler = relatedContractsForCustomer([
  { id: 'c1', customerId: kundeA.id, title: 'Ramme', buyer: 'Annen' },
  { id: 'c2', customerId: '', title: 'Navn', buyer: kundeA.name },
  { id: 'c3', customerId: '', title: 'Feil', buyer: 'Sola kommune' },
  { id: 'c4', customerId: kundeA.id, title: 'Slettet', deletedAt: '2024-01-01' },
], kundeA);
assert.equal(avtaler.length, 2);
assert.deepEqual(avtaler.map((row) => row.id).sort(), ['c1', 'c2']);

const prosjektListe = [
  { id: 'p1', number: '100', name: 'Skole', customerId: kundeA.id, client: 'Annen' },
  { id: 'p2', number: '101', name: 'Vei', customerId: '', client: kundeA.name },
  { id: 'p3', number: '102', name: 'Park', customerId: '', client: 'Sola kommune', orgnr: '964967668' },
  { id: 'p4', number: '103', name: 'Bro', customerId: '', customerNumber: '42', client: 'Annet' },
  { id: 'p5', number: '104', name: 'Arkiv', customerId: kundeA.id, status: 'arkivert' },
  { id: 'p6', number: '105', name: 'Fremmed', customerId: 'annen-kunde', client: kundeA.name },
];

assert.equal(projectBelongsToCustomer(prosjektListe[0], kundeA), true);
assert.equal(projectBelongsToCustomer(prosjektListe[1], kundeA), true);
assert.equal(projectBelongsToCustomer(prosjektListe[2], kundeB), true);
assert.equal(projectBelongsToCustomer(prosjektListe[3], kundeB), true);
assert.equal(projectBelongsToCustomer(prosjektListe[4], kundeA), false);
assert.equal(projectBelongsToCustomer(prosjektListe[5], kundeA), false);

const forA = relatedProjectsForCustomer(prosjektListe, kundeA);
assert.deepEqual(forA.map((row) => row.id), ['p1', 'p2']);
const forB = relatedProjectsForCustomer(prosjektListe, kundeB);
assert.deepEqual(forB.map((row) => row.id), ['p3', 'p4']);

const counts = projectCountsByCustomer(prosjektListe, [kundeA, kundeB]);
assert.equal(counts.get(kundeA.id), 2);
assert.equal(counts.get(kundeB.id), 2);

console.log('customers.test.mjs: ok');
