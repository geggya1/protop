import assert from 'node:assert/strict';
import test from 'node:test';
import { CHIP_LIMIT, filterOptions, normalizeOptions, optionSummary, pickerMode } from './optionPicker.js';

test('velger: knapper under 5 valg, ellers liste', () => {
  assert.equal(CHIP_LIMIT, 4);
  assert.equal(pickerMode(2), 'chips');
  assert.equal(pickerMode(4), 'chips');
  assert.equal(pickerMode(5), 'list');
  assert.equal(pickerMode(30), 'list');
  assert.equal(pickerMode(3, { custom: true }), 'list', 'egendefinert verdi trenger søkefeltet');
  assert.equal(pickerMode(0), 'list');
});

test('velger: valg, sammendrag og søk', () => {
  const list = normalizeOptions(['Lav', { id: 'm', label: 'Middels', hint: 'score 5–9' }, { value: 'h', label: 'Høy' }]);
  assert.deepEqual(list.map((o) => o.id), ['Lav', 'm', 'h']);
  assert.deepEqual(optionSummary(list, 'm', false, 'Velg'), { text: 'Middels', empty: false });
  assert.deepEqual(optionSummary(list, '', false, 'Velg'), { text: 'Velg', empty: true });
  assert.equal(optionSummary(list, ['Lav', 'm'], true, 'Velg').text, 'Lav, Middels');
  assert.equal(optionSummary(list, ['Lav', 'm', 'h'], true, 'Velg').text, 'Lav + 2 til');
  assert.deepEqual(filterOptions(list, 'score').map((o) => o.id), ['m'], 'søk i hjelpetekst');
  assert.deepEqual(filterOptions(list, 'HØ').map((o) => o.id), ['h']);
  assert.equal(filterOptions(list, '').length, 3);
});
