import assert from 'node:assert/strict';
import {
  dateKey, getISOWeek, isoWeekKeys, chunkWeeks, monthGrid, appliesOnDate, parseDateKey,
  mondayKeyOf, isoWeekDiff,
} from './dates.js';

function possibleKr(todos, keys) {
  let possible = 0;
  for (const t of todos) {
    for (const k of keys) {
      if (appliesOnDate(t, parseDateKey(k))) possible += Number(t.moneyValue || 0);
    }
  }
  return possible;
}

// 24. august 2026 er mandag i ISO-uke 35 (24–30. aug)
const mon = new Date(2026, 7, 24, 12, 0, 0);
const sun = new Date(2026, 7, 30, 12, 0, 0);
assert.equal(getISOWeek(mon).week, 35);
assert.equal(getISOWeek(sun).week, 35);
assert.deepEqual(isoWeekKeys(mon), [
  '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27',
  '2026-08-28', '2026-08-29', '2026-08-30',
]);
assert.deepEqual(isoWeekKeys(sun), isoWeekKeys(mon));

const grid = monthGrid(mon);
assert.equal(grid.length, 42);
const weeks = chunkWeeks(grid);
assert.equal(weeks.length, 6);
assert.equal(dateKey(weeks[4][0]), '2026-08-24');
assert.equal(getISOWeek(weeks[4][0]).week, 35);

const mondayOnly = [{ type: 'weekly', daysOfWeek: [1], moneyValue: 1 }];
assert.equal(possibleKr(mondayOnly, isoWeekKeys(mon)), 1);

const satWeek = [
  '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25',
  '2026-08-26', '2026-08-27', '2026-08-28',
];
const sun23AndMon = [
  { type: 'once', dueDate: '2026-08-23', moneyValue: 12 },
  { type: 'weekly', daysOfWeek: [1], moneyValue: 1 },
];
// Lønningsuke lør–fre tar med søndag 23. (uke 34). ISO-uke 35 er 24–30. og skal bare ha mandagens 1 kr.
assert.equal(possibleKr(sun23AndMon, satWeek), 13);
assert.equal(possibleKr(sun23AndMon, isoWeekKeys(mon)), 1);

// Uke 36 2026: man 31. aug – søn 6. sep. Startdato torsdag ⇒ snap til mandag.
assert.equal(mondayKeyOf('2026-09-03'), '2026-08-31');
assert.equal(isoWeekDiff(parseDateKey('2026-08-31'), parseDateKey('2026-09-07')), 1);
assert.equal(isoWeekDiff(parseDateKey('2026-08-31'), parseDateKey('2026-09-14')), 2);

const dishwasher = {
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 2,
  recurrenceByDays: [1, 4, 0], // Man, Tor, Søn
  startKey: '2026-08-31',
  moneyValue: 3,
};
const week36 = isoWeekKeys(new Date(2026, 7, 31, 12, 0, 0));
const week37 = isoWeekKeys(new Date(2026, 8, 7, 12, 0, 0));
const week38 = isoWeekKeys(new Date(2026, 8, 14, 12, 0, 0));
assert.equal(possibleKr([dishwasher], week36), 9); // man+tor+søn
assert.equal(possibleKr([dishwasher], week37), 0); // annenhver: av
assert.equal(possibleKr([dishwasher], week38), 9); // på igjen

// Uten snap i data: start torsdag skal likevel ta Man i samme ISO-uke
const thursdayStart = { ...dishwasher, startKey: '2026-09-03' };
assert.equal(possibleKr([thursdayStart], week36), 9);
assert.ok(appliesOnDate(thursdayStart, parseDateKey('2026-08-31')));
assert.ok(appliesOnDate(thursdayStart, parseDateKey('2026-09-03')));
assert.ok(appliesOnDate(thursdayStart, parseDateKey('2026-09-06')));
assert.equal(appliesOnDate(thursdayStart, parseDateKey('2026-09-07')), false);

console.log('dates.isoWeek.test.mjs ok');
