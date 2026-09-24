import assert from 'node:assert/strict';
import {
  eventTimeLabel,
  summarizeEvents,
  summarizeTasks,
  summarizeMeals,
  summarizeNotes,
  summarizeShopping,
  buildHomeDigest,
} from './homeWidgets.js';

assert.equal(eventTimeLabel({ startTime: '17:00', endTime: '18:30' }), '17:00–18:30');
assert.equal(eventTimeLabel({ startTime: '09:00' }), '09:00');
assert.equal(eventTimeLabel({}), 'Hele dagen');

const today = [
  { id: 'a', title: 'Fotball', startTime: '17:00', place: 'Banen' },
  { id: 'b', title: 'Henting', startTime: '15:00' },
];
const tomorrow = [{ id: 'c', title: 'Tannlege', startTime: '09:30' }];
const events = summarizeEvents([], { today, tomorrow });
assert.equal(events.todayCount, 2);
assert.equal(events.tomorrowCount, 1);
assert.match(events.headline, /I dag: 2 hendelser/);
assert.equal(events.items[0].title, 'Henting');
assert.equal(events.items[0].when, 'I dag');
assert.equal(events.items[2].when, 'I morgen');

const emptyEvents = summarizeEvents([], { today: [], tomorrow: [] });
assert.match(emptyEvents.headline, /Ingen hendelser/);

const tasks = summarizeTasks([
  { id: '1', title: 'Handle melk', deadline: '2026-08-25', _overdue: true },
  { id: '2', title: 'Ring skolen', deadlineTime: '14:00' },
]);
assert.equal(tasks.count, 2);
assert.equal(tasks.overdue, 1);
assert.equal(tasks.items[0].meta, 'Forfalt');
assert.match(tasks.headline, /2 åpne/);

const meals = summarizeMeals([
  { id: 'm1', title: 'Taco', tag: 'Middag', dateKey: '2026-08-25' },
  { id: 'm2', title: 'Havregrøt', tag: 'Frokost', dateKey: '2026-08-25' },
  { id: 'm3', title: 'Pizza', tag: 'Middag', dateKey: '2026-08-26', deleted: false },
], '2026-08-25');
assert.equal(meals.count, 2);
assert.equal(meals.items[0].title, 'Taco');

const notes = summarizeNotes([
  { id: 'n1', title: 'Handle', body: 'Melk og brød', updatedAt: { seconds: 10 } },
  { id: 'n2', title: 'Idé', summary: 'Tur i helgen', updatedAt: { seconds: 50 } },
]);
assert.equal(notes.items[0].title, 'Idé');
assert.equal(notes.count, 2);

const shop = summarizeShopping(
  [{ id: 's1', name: 'Helg' }, { id: 's2', name: 'Daglig' }],
  { s1: 3, s2: 0 },
);
assert.equal(shop.count, 3);
assert.equal(shop.items[0].title, 'Helg');
assert.match(shop.headline, /3 varer/);

const digest = buildHomeDigest({ events, tasks, meals, shopping: shop });
assert.match(digest, /I dag: 2 hendelser/);
assert.match(digest, /åpne/);

const calm = buildHomeDigest({});
assert.match(calm, /Alt rolig/);

console.log('homeWidgets.test.mjs: ok');
