import assert from 'node:assert/strict';
import {
  assignContractNumbers,
  canonicalNumberId,
  claimContractNumbers,
  formatNumberId,
  nextOppdragId,
  nextSystemId,
  oppdragIdTaken,
  sortContractsChronological,
  systemIdTaken,
} from './numbering.js';
import { filterContracts } from './directContract.js';
import { registerDirectContract } from './lifecycle.js';
import { emptyAnbudState, normalizeAnbudState } from './model.js';
import { setCustomerOwner, upsertCustomer } from './customers.js';
import { readFileSync } from 'node:fs';

assert.equal(canonicalNumberId('0001'), '1');
assert.equal(formatNumberId('12'), '0012');
assert.equal(formatNumberId('K-2024-18'), 'K-2024-18');

const first = claimContractNumbers([], { buyer: 'Igang' });
assert.equal(first.ok, true);
assert.equal(first.systemId, '1');
assert.equal(first.oppdragId, '1');

const second = claimContractNumbers([{ id: 'a', systemId: '1', oppdragId: '1', buyer: 'Igang' }], { buyer: 'Igang' });
assert.equal(second.systemId, '2');
assert.equal(second.oppdragId, '2');

const otherCustomer = claimContractNumbers(
  [{ id: 'a', systemId: '1', oppdragId: '1', customerId: 'k1', buyer: 'Igang' }],
  { customerId: 'k2', buyer: 'Sola kommune' },
);
assert.equal(otherCustomer.systemId, '2');
assert.equal(otherCustomer.oppdragId, '1');

const manual = claimContractNumbers([], { systemId: 'A-17', oppdragId: 'K-2024-18', customerId: 'k1' });
assert.equal(manual.systemId, 'A-17');
assert.equal(manual.oppdragId, 'K-2024-18');

assert.equal(systemIdTaken([{ id: 'a', systemId: '0007' }], '7'), true);
assert.equal(claimContractNumbers([{ id: 'a', systemId: '7' }], { systemId: '0007' }).ok, false);
assert.equal(oppdragIdTaken([{ id: 'a', oppdragId: '3', customerId: 'k1' }], '03', 'k1', ''), true);
assert.equal(claimContractNumbers(
  [{ id: 'a', systemId: '1', oppdragId: '12', customerId: 'k1' }],
  { systemId: '2', oppdragId: '12', customerId: 'k1' },
).ok, false);

const backfill = assignContractNumbers([
  { id: 'ny', title: 'Ny', createdAt: '2026-02-01', buyer: 'Igang' },
  { id: 'gammel', title: 'Gammel', createdAt: '2025-01-01', buyer: 'Igang', systemId: '40', oppdragId: '8' },
]);
assert.equal(backfill[0].id, 'gammel');
assert.equal(backfill[0].systemId, '40');
assert.equal(backfill[1].systemId, '41');
assert.equal(backfill[1].oppdragId, '9');

const sorted = sortContractsChronological([
  { id: 'b', createdAt: '2026-01-02', systemId: '2' },
  { id: 'a', createdAt: '2026-01-01', systemId: '1' },
]);
assert.equal(sorted.map((row) => row.id).join(), 'a,b');

const byNumber = sortContractsChronological([
  { id: 'late-low', createdAt: '2026-06-01', systemId: '1' },
  { id: 'early-high', createdAt: '2025-01-01', systemId: '9' },
]);
assert.equal(byNumber.map((row) => row.id).join(), 'late-low,early-high');

let state = emptyAnbudState();
const kunde = upsertCustomer(state, { name: 'Igang Totalentreprenør As', orgnr: '922987106' });
assert.equal(kunde.ok, true);
state = kunde.state;
const auto = registerDirectContract(state, {
  title: 'Madlalia',
  buyer: 'Igang Totalentreprenør As',
  customerId: kunde.customer.id,
});
assert.equal(auto.ok, true, auto.error);
assert.equal(auto.state.contracts[0].systemId, '1');
assert.equal(auto.state.contracts[0].oppdragId, '1');

const transferred = registerDirectContract(auto.state, {
  title: 'Annen avtale',
  buyer: 'Igang Totalentreprenør As',
  customerId: kunde.customer.id,
  systemId: '88',
  oppdragId: 'K-9',
});
assert.equal(transferred.ok, true, transferred.error);
assert.equal(transferred.state.contracts[0].systemId, '88');
assert.equal(transferred.state.contracts[0].oppdragId, 'K-9');

const clash = registerDirectContract(transferred.state, {
  title: 'Duplikat',
  customerId: kunde.customer.id,
  oppdragId: 'K-9',
});
assert.equal(clash.ok, false);

const restored = normalizeAnbudState({
  contracts: [{ id: 'kon_old', title: 'Gammel', buyer: 'Sola', createdAt: '2024-05-01' }],
});
assert.equal(restored.contracts[0].systemId, '1');
assert.equal(restored.contracts[0].oppdragId, '1');

const listed = filterContracts([
  { id: 'b', title: 'Ny', buyer: 'Igang', createdAt: '2026-02-01', systemId: '2', oppdragId: '2' },
  { id: 'a', title: 'Gammel', buyer: 'Igang', createdAt: '2025-01-01', systemId: '1', oppdragId: '1' },
], { buyer: 'igang' });
assert.equal(listed.map((row) => row.id).join(), 'a,b');
assert.equal(filterContracts(listed, { query: '0001' }).map((row) => row.id).join(), 'a');

const owned = setCustomerOwner(kunde.state, kunde.customer.id, { uid: 'p1', name: 'Kari Konsulent' });
assert.equal(owned.ok, true);
assert.equal(owned.customer.ownerUid, 'p1');
assert.equal(owned.customer.ownerName, 'Kari Konsulent');

const followSrc = readFileSync(new URL('../../screens/anbud/ContractFollowUp.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(followSrc, /Frist passert/);
assert.match(followSrc, /System-ID/);
assert.match(followSrc, /Oppdrags-ID/);
assert.match(followSrc, /Ansvarlig/);

assert.equal(nextSystemId(transferred.state.contracts), '89');
assert.equal(nextOppdragId(transferred.state.contracts, kunde.customer.id, 'Igang'), '2');

console.log('numbering.test.mjs: ok');
