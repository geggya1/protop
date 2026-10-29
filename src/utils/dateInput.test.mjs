import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDateFormat, displayDate, outputDate, toIsoDate } from './dateInput.js';

test('leser iso, norsk format og Date', () => {
  assert.equal(toIsoDate('2026-10-07'), '2026-10-07');
  assert.equal(toIsoDate('2026-10-07T12:00:00Z'), '2026-10-07');
  assert.equal(toIsoDate('07.10.2026'), '2026-10-07');
  assert.equal(toIsoDate('7.10.26'), '2026-10-07');
  assert.equal(toIsoDate('7/10/2026'), '2026-10-07');
  assert.equal(toIsoDate(new Date(2026, 9, 7)), '2026-10-07');
  assert.equal(toIsoDate('31.02.2026'), '');
  assert.equal(toIsoDate('nåværende'), '');
  assert.equal(toIsoDate(''), '');
});

test('viser dd.mm.åååå og skriver tilbake i feltets format', () => {
  assert.equal(displayDate('2026-10-07'), '07.10.2026');
  assert.equal(outputDate('2026-10-07', 'nb'), '07.10.2026');
  assert.equal(outputDate('2026-10-07'), '2026-10-07');
  assert.equal(outputDate('', 'nb'), '');
  assert.equal(detectDateFormat('07.10.2026'), 'nb');
  assert.equal(detectDateFormat('2026-10-07'), 'iso');
  assert.equal(detectDateFormat('', 'nb'), 'nb');
});
