import assert from 'node:assert/strict';
import {
  economyContractRows,
  economyCustomerRows,
  economyTableRows,
  matchCustomer,
  relatedContracts,
} from './desk.js';

const customers = [
  { id: 'c1', name: 'Igang Totalentreprenør As', kind: 'org', orgnr: '922987106', ownerUid: 'p1', ownerName: 'Geir Ove Andersen' },
  { id: 'c2', name: 'Privat Hansen', kind: 'person' },
];
const contracts = [
  { id: 'a1', title: 'Madlalia anleggsleder', buyer: 'Igang Totalentreprenør As', customerId: 'c1', kind: 'oppdrag', value: 1080, start: '2025-11-17', end: '2028-12-31', systemId: '1', oppdragId: '1', createdAt: '2025-10-01', projectId: 'p1' },
  { id: 'a2', title: 'Husleie', buyer: 'Privat Hansen', kind: 'husleie', status: 'avsluttet', systemId: '2', oppdragId: '1', createdAt: '2025-11-01' },
];
const people = [{ uid: 'p1', name: 'Geir Ove Andersen', role: 'parent' }];
const projects = [
  { id: 'p1', name: 'Madlalia', status: 'aktiv' },
];

assert.equal(matchCustomer(customers, contracts[0])?.id, 'c1');
assert.equal(matchCustomer(customers, contracts[1])?.id, 'c2');
assert.equal(relatedContracts(contracts, customers[0]).map((row) => row.id).join(), 'a1');

const rows = economyTableRows(customers, contracts, '', {
  projects,
  dueById: { a1: { due: true, reason: 'Avtalen er ikke indeksregulert ennå.' } },
});
assert.equal(rows.filter((row) => row.kind === 'kunde').length, 2);
assert.equal(rows.filter((row) => row.kind === 'avtale').length, 2);
assert.equal(rows.filter((row) => row.kind === 'prosjekt').length, 1);
assert.ok(rows.some((row) => row.key === 'avtale:a1' && row.party.includes('Igang') && row.due));
assert.ok(rows.some((row) => row.key === 'kunde:c1' && row.due));
assert.ok(rows.some((row) => row.key === 'prosjekt:p1' && row.due));
assert.equal(economyTableRows(customers, contracts, 'madlalia', { projects }).map((row) => row.key).sort().join(), 'avtale:a1,prosjekt:p1');
assert.equal(economyTableRows(customers, contracts, 'privatkunde').length, 1);
assert.equal(rows.findIndex((row) => row.key === 'avtale:a1') < rows.findIndex((row) => row.key === 'avtale:a2'), true);

const customerRows = economyCustomerRows(customers, contracts, people);
assert.equal(customerRows.find((row) => row.customerId === 'c1').agreements, 1);
assert.equal(customerRows.find((row) => row.customerId === 'c1').value, 1080);
assert.equal(customerRows.find((row) => row.customerId === 'c1').owner, 'Geir Ove Andersen');

const contractRows = economyContractRows(customers, contracts, people);
assert.equal(contractRows[0].systemId, '0001');
assert.equal(contractRows[0].oppdragId, '0001');
assert.equal(contractRows.find((row) => row.contractId === 'a1').owner, 'Geir Ove Andersen');
assert.equal(economyContractRows(customers, contracts, people, 'madlalia').length, 1);
assert.equal(economyContractRows(customers, contracts, people, '0002').map((row) => row.contractId).join(), 'a2');

console.log('economy desk ok');
