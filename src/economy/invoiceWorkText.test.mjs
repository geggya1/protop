/**
 * Fakturalinjen for timer sier hva som er gjort (beskrivelsen på timene), ikke bare hvem.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hourLines, workDescription } from './invoiceDraft.js';

const accounts = { hours: '3000' };

test('timelinjen tar med beskrivelsen av arbeidet', () => {
  const lines = hourLines([
    { id: 't1', employeeId: 'e1', employeeName: 'Anne Ansatt', date: '2026-10-01', _hours: 7.5, _rate: 1000, description: 'Riving bad' },
    { id: 't2', employeeId: 'e1', employeeName: 'Anne Ansatt', date: '2026-10-02', _hours: 7.5, _rate: 1000, description: 'riving bad' },
    { id: 't3', employeeId: 'e1', employeeName: 'Anne Ansatt', date: '2026-10-03', _hours: 4, _rate: 1000, description: 'Flislegging' },
  ], { accounts });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].description, 'Anne Ansatt – Riving bad; Flislegging');
  assert.equal(lines[0].employeeName, 'Anne Ansatt');
  assert.equal(lines[0].workTexts, undefined, 'hjelpefeltet følger ikke med på linjen');
  // Uten beskrivelse: navnet som før.
  const plain = hourLines([{ id: 't4', employeeId: 'e2', employeeName: 'Bjørn Bas', date: '2026-10-01', _hours: 2, _rate: 900 }], { accounts });
  assert.equal(plain[0].description, 'Bjørn Bas');
});

test('lange beskrivelser kortes', () => {
  const long = workDescription(Array.from({ length: 30 }, (_, i) => `Arbeid nummer ${i + 1}`));
  assert.ok(long.length <= 160);
  assert.ok(long.endsWith('…'));
  assert.equal(workDescription(['', '  ', null]), '');
});
