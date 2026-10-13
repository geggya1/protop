import assert from 'node:assert/strict';
import { customersFromProjectLinks } from './customers.js';
import { resolveCustomerLoad } from './customerRegistry.js';
import { emptyAnbudState, fitAnbudState, mergeAnbudStates } from './model.js';

const lyse = {
  id: 'kunde_lyse',
  name: 'Lyse Neo AS',
  kind: 'org',
  orgnr: '980001482',
  customerNumber: '10115',
  address: 'Breiflåtveien 18',
  place: 'Stavanger',
  postalCode: '4017',
  email: 'post@lyse.no',
  phone: '51908000',
};

const local = {
  ...emptyAnbudState(),
  customers: [lyse],
};

const failed = resolveCustomerLoad({
  local: emptyAnbudState(),
  remote: emptyAnbudState(),
  registryCustomers: [],
  remoteOk: false,
  registryOk: false,
});
assert.equal(failed.status, 'error');
assert.equal(failed.state.customers.length, 0);

const fromBrowser = resolveCustomerLoad({
  local,
  remote: emptyAnbudState(),
  registryCustomers: [],
  remoteOk: false,
  registryOk: false,
});
assert.equal(fromBrowser.status, 'local');
assert.equal(fromBrowser.state.customers[0].name, 'Lyse Neo AS');
assert.equal(fromBrowser.state.customers[0].email, 'post@lyse.no');

const fromRegistry = resolveCustomerLoad({
  local: emptyAnbudState(),
  remote: emptyAnbudState(),
  registryCustomers: [lyse],
  remoteOk: false,
  registryOk: true,
});
assert.equal(fromRegistry.status, 'ok');
assert.equal(fromRegistry.state.customers[0].customerNumber, '10115');

const emptyCloud = resolveCustomerLoad({
  local: emptyAnbudState(),
  remote: emptyAnbudState(),
  registryCustomers: [],
  remoteOk: true,
  registryOk: true,
});
assert.equal(emptyCloud.status, 'ok');
assert.equal(emptyCloud.state.customers.length, 0);

const kept = mergeAnbudStates(local, emptyAnbudState());
assert.equal(kept.customers.length, 1);
assert.equal(kept.customers[0].address, 'Breiflåtveien 18');

const restored = customersFromProjectLinks([
  { id: 'p1', status: 'aktiv', customerId: 'kunde_lyse', client: 'Lyse Neo AS', orgnr: '980001482', customerNumber: '10115' },
  { id: 'p2', status: 'aktiv', customerId: 'kunde_lyse', client: 'Lyse Neo AS', orgnr: '980001482', customerNumber: '10115' },
  { id: 'p3', status: 'aktiv', client: 'Sandnes kommune', orgnr: '964965137', customerNumber: '10020' },
  { id: 'p4', status: 'aktiv', client: '' },
]);
assert.equal(restored.length, 2);
assert.equal(restored[0].id, 'kunde_lyse');
assert.equal(restored[0].customerNumber, '10115');
assert.equal(restored[1].id, 'kunde_org_964965137');
assert.equal(restored[1].name, 'Sandnes kommune');

const fat = {
  ...local,
  notices: Array.from({ length: 400 }, (_, index) => ({
    id: `n-${index}`,
    title: 'Sykehus',
    decision: 'ubestemt',
    description: 'x'.repeat(4000),
  })),
};
const fitted = fitAnbudState(fat, 80_000);
assert.equal(fitted.customers.length, 1);
assert.equal(fitted.customers[0].name, 'Lyse Neo AS');
assert.equal(fitted.customers[0].email, 'post@lyse.no');
assert.ok(fitted.notices.length < fat.notices.length);

console.log('customerRegistry.test.mjs ok');
