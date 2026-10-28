import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EMPTY, formatDate, formatDateLong, formatDateTime, formatHours, formatKr, formatNumber, hoursInputText, isoDate, toDate, toHours, toNumber,
} from './nb.js';

// Mellomrom som ikke brytes, gjort synlig i testene.
const s = (text) => text.replace(/ /g, ' ');

test('beløp: tusenskille, desimalkomma og «kr»', () => {
  assert.equal(s(formatKr(1234.5)), '1 234,50 kr');
  assert.equal(s(formatKr(1234.5, { decimals: 0 })), '1 235 kr');
  assert.equal(s(formatKr(0)), '0,00 kr');
  assert.equal(s(formatKr(-99.9)), '−99,90 kr');
  assert.equal(s(formatKr('1 234,50')), '1 234,50 kr');
  assert.equal(s(formatKr('1.234,50')), '1 234,50 kr');
  assert.equal(s(formatKr(1234567.891)), '1 234 567,89 kr');
  assert.equal(s(formatKr(1500, { suffix: false })), '1 500,00');
  assert.equal(formatKr(''), EMPTY);
  assert.equal(formatKr(null), '–');
  assert.equal(formatKr('abc', { empty: '' }), '');
  assert.equal(s(formatNumber(-0.001, { decimals: 2 })), '0,00', 'ingen «−0,00»');
});

test('tall leses fra norsk og engelsk tekst', () => {
  assert.equal(toNumber('kr 99'), 99);
  assert.equal(toNumber('1234.5'), 1234.5);
  assert.equal(toNumber('−12,5'), -12.5);
  assert.equal(toNumber('x'), null);
});

test('dato: dd.mm.åååå og lang form', () => {
  assert.equal(formatDate('2026-03-03'), '03.03.2026');
  assert.equal(formatDate(new Date(2026, 11, 24)), '24.12.2026');
  assert.equal(formatDate('3.3.2026'), '03.03.2026');
  assert.equal(formatDate(''), EMPTY);
  assert.equal(formatDate('31.02.2026'), EMPTY, 'ugyldig dato');
  assert.equal(formatDateLong('2026-03-03'), '3. mars 2026');
  assert.equal(formatDateTime(new Date(2026, 9, 28, 4, 5)), '28.10.2026 kl. 04:05');
  assert.equal(formatDateTime(''), EMPTY);
  assert.equal(formatDateLong({ toDate: () => new Date(2026, 4, 17) }), '17. mai 2026');
  assert.equal(isoDate('24.12.2026'), '2026-12-24');
  assert.equal(toDate('2026-13-40'), null, 'ugyldig ISO-dato');
  assert.equal(formatDate('2026-02-29'), EMPTY, '2026 er ikke skuddår');
});

test('timer: én skrivemåte, «7,5 t»', () => {
  assert.equal(s(formatHours(7.5)), '7,5 t');
  assert.equal(s(formatHours(8)), '8 t');
  assert.equal(s(formatHours('7:30')), '7,5 t');
  assert.equal(s(formatHours('7:45')), '7,75 t');
  assert.equal(s(formatHours('7,5')), '7,5 t');
  assert.equal(s(formatHours(37.5)), '37,5 t');
  assert.equal(s(formatHours(7.5, { unit: false })), '7,5');
  assert.equal(formatHours(''), EMPTY);
  assert.equal(toHours('7,5 t'), 7.5);
  assert.equal(toHours('-1:30'), -1.5);
});

test('timefeltet viser «7,5», og runder ikke av minutter som ikke går opp', () => {
  assert.equal(hoursInputText(7.5), '7,5');
  assert.equal(hoursInputText(8), '8');
  assert.equal(hoursInputText(0), '', 'tomt felt, så plassholderen «7,5» synes');
  assert.equal(hoursInputText('7:30'), '7,5');
  assert.equal(hoursInputText(7 + 20 / 60), '7:20', '7 t 20 min beholdes eksakt');
  assert.equal(hoursInputText(0.25), '0,25');
});

test('timeføring og Ny ansatt bruker riktig felt (UX-14)', () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const time = read('components/arbeid/TimeEntryModal.jsx');
  assert.match(time, /placeholder="7,5"/);
  assert.match(time, /keyboardType="decimal-pad"/);
  assert.equal(time.includes('placeholder="0:00"'), false);
  assert.equal(time.includes('ÅÅÅÅ-MM-DD'), false, 'flytt-datoen er en datovelger');
  assert.match(time, /<DateField/);
  assert.match(time, /const QUICK = \['0,5', '1', '2', '4', '7,5', '8'\];/);
  const register = read('screens/employees/RegisterEmployeeDialog.jsx');
  assert.equal(register.includes('placeholder="dd.mm.åååå"'), false, '«Ansatt siden» er en datovelger');
  assert.match(register, /nativeID="employee-register-since"[\s\S]*?<DateField/);
});

