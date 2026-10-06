import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  customerDraftFromBrreg,
  filterCustomers,
  formatOrgnr,
  importCustomers,
  maskPersonnummer,
  planCustomerImport,
  withCustomerNumbers,
  matchCustomer,
  namesLikelyMatch,
  normalizeCustomer,
  ownerLabel,
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
assert.equal(byName['Igang Totalentreprenør As'].severity, 'block');
assert.match(byName['Igang Totalentreprenør As'].reason, /finnes allerede/);
assert.equal(byName['Halv kunde'].severity, 'review');
assert.equal(byName['Halv kunde'].customer.email, '');
assert.equal(byName['Halv kunde'].customer.phone, '');
assert.ok(byName['Halv kunde'].issues.some((issue) => /E-post/.test(issue)));
assert.ok(byName['Halv kunde'].issues.some((issue) => /adresse/.test(issue)));
assert.equal(byName['923456807'].severity, 'block');
assert.match(byName['923456807'].reason, /Mangler navn/);
assert.equal(byName['Feil nummer'].severity, 'block');
assert.equal(planned.rows[0].severity, 'block');

const screen = readFileSync(new URL('../../screens/customers/CustomersScreen.jsx', import.meta.url), 'utf8');
const importFile = screen.slice(screen.indexOf('async function importFile'), screen.indexOf('function toggleCustomer'));
assert.equal(importFile.includes('saveAnbudState'), false);
assert.match(importFile, /planCustomerImport/);
assert.match(screen, /confirmCustomerImport/);
assert.match(screen, /Ingenting er lagret ennå/);
assert.match(screen, /neste ledige er/);

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
const byNumber = filterCustomers([
  { id: 'b', name: 'Senere', kind: 'org', customerNumber: '12' },
  { id: 'a', name: 'Først', kind: 'org', customerNumber: '2' },
], '');
assert.deepEqual(byNumber.map((row) => row.customerNumber), ['2', '12']);

console.log('customers.test.mjs: ok');
