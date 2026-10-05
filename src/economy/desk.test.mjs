import assert from 'node:assert/strict';
import { economyTableRows, matchCustomer, relatedContracts } from './desk.js';

const customers = [
  { id: 'c1', name: 'Igang Totalentreprenør As', kind: 'org', orgnr: '922987106' },
  { id: 'c2', name: 'Privat Hansen', kind: 'person' },
];
const contracts = [
  { id: 'a1', title: 'Madlalia anleggsleder', buyer: 'Igang Totalentreprenør As', customerId: 'c1', kind: 'oppdrag', value: 1080, start: '2025-11-17', end: '2028-12-31' },
  { id: 'a2', title: 'Husleie', buyer: 'Privat Hansen', kind: 'husleie', status: 'avsluttet' },
];

assert.equal(matchCustomer(customers, contracts[0])?.id, 'c1');
assert.equal(matchCustomer(customers, contracts[1])?.id, 'c2');
assert.equal(relatedContracts(contracts, customers[0]).map((row) => row.id).join(), 'a1');

const rows = economyTableRows(customers, contracts);
assert.equal(rows.filter((row) => row.kind === 'kunde').length, 2);
assert.equal(rows.filter((row) => row.kind === 'avtale').length, 2);
assert.ok(rows.some((row) => row.key === 'avtale:a1' && row.party.includes('Igang')));
assert.equal(economyTableRows(customers, contracts, 'madlalia').map((row) => row.key).join(), 'avtale:a1');
assert.equal(economyTableRows(customers, contracts, 'privatkunde').length, 1);

console.log('economy desk ok');
