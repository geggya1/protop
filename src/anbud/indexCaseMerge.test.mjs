import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAnbudStates } from './model.js';

test('to brukere mister ikke hverandres reguleringssaker', () => {
  const left = {
    contracts: [{
      id: 'c1',
      title: 'Breitorget',
      indexCases: [{ id: 'a', number: 'IR-001', status: 'sendt', revision: 2, letterPlain: 'sendt brev', newPrice: 1388.41 }],
      regulations: [{ id: 'a', letterPlain: 'sendt brev', sentAt: '2026-10-20', sentTo: 'victor@breitorget.no' }],
      priceVersions: [{ id: 'pv', validFrom: '2026-04-01', rateExVat: 1388.41 }],
    }],
  };
  const right = {
    contracts: [{
      id: 'c1',
      title: 'Breitorget',
      indexCases: [{ id: 'b', number: 'IR-002', status: 'utkast', revision: 0, letterPlain: 'utkast' }],
      regulations: [],
      priceVersions: [],
    }],
  };
  const merged = mergeAnbudStates(left, right);
  const contract = merged.contracts.find((row) => row.id === 'c1');
  const ids = contract.indexCases.map((row) => row.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
  assert.equal(contract.indexCases.find((row) => row.id === 'a').status, 'sendt');
  assert.equal(contract.regulations.find((row) => row.id === 'a').sentTo, 'victor@breitorget.no');
  assert.equal(contract.priceVersions[0].rateExVat, 1388.41);
});

test('slettet utkast kommer ikke tilbake, sendt brev blir igjen', () => {
  const left = {
    contracts: [{
      id: 'c1',
      title: 'Breitorget',
      indexCases: [
        { id: 'a', status: 'sendt', revision: 2, letterPlain: 'sendt brev' },
        { id: 'b', status: 'utkast', revision: 1, letterPlain: 'utkast' },
      ],
    }],
  };
  const right = {
    contracts: [{
      id: 'c1',
      title: 'Breitorget',
      indexCases: [
        { id: 'a', status: 'sendt', revision: 2, letterPlain: 'sendt brev' },
      ],
      deletedIndexCaseIds: ['b', 'a'],
    }],
  };
  const contract = mergeAnbudStates(left, right).contracts.find((row) => row.id === 'c1');
  assert.deepEqual(contract.indexCases.map((row) => row.id), ['a']);
  assert.deepEqual(contract.deletedIndexCaseIds, ['b']);
});

test('slettet godkjent brev fjerner også ny pris og logg, også ved sammenslåing', () => {
  const full = {
    id: 'c1',
    title: 'Breitorget',
    indexCases: [{ id: 'b', status: 'godkjent', revision: 1, letterPlain: 'brev' }],
    regulations: [{ id: 'b', letterPlain: 'brev', after: 1388.41 }],
    priceVersions: [
      { id: 'pv0', validFrom: '2025-01-01', validTo: '2026-10-17', rateExVat: 1350 },
      { id: 'pv_b', caseId: 'b', validFrom: '2026-10-18', rateExVat: 1388.41 },
    ],
  };
  const left = { contracts: [full] };
  const right = { contracts: [{ id: 'c1', title: 'Breitorget', deletedIndexCaseIds: ['b'] }] };
  const contract = mergeAnbudStates(left, right).contracts.find((row) => row.id === 'c1');
  assert.deepEqual(contract.indexCases, []);
  assert.deepEqual(contract.regulations, []);
  assert.deepEqual(contract.priceVersions.map((row) => [row.id, row.validTo]), [['pv0', '']]);
  assert.deepEqual(contract.deletedIndexCaseIds, ['b']);
});

test('gammelt, usendt varsel kan slettes, sendt varsel blir stående', () => {
  const left = {
    contracts: [{
      id: 'c1',
      title: 'Breitorget',
      regulations: [
        { id: 'old', letterPlain: 'generert' },
        { id: 'sent', letterPlain: 'sendt', sentAt: '2026-10-01' },
      ],
    }],
  };
  const right = { contracts: [{ id: 'c1', title: 'Breitorget', deletedIndexCaseIds: ['old', 'sent'] }] };
  const contract = mergeAnbudStates(left, right).contracts.find((row) => row.id === 'c1');
  assert.deepEqual(contract.regulations.map((row) => row.id), ['sent']);
  assert.deepEqual(contract.deletedIndexCaseIds, ['old']);
});
