import assert from 'node:assert/strict';
import {
  filterCustomers,
  formatOrgnr,
  maskPersonnummer,
  matchCustomer,
  normalizeCustomer,
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

console.log('customers.test.mjs: ok');
