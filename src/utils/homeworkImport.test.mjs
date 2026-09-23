import assert from 'node:assert/strict';
import { applyHomeworkFocusToSuggestions, isHomeworkFocus } from './homeworkImport.js';

assert.equal(isHomeworkFocus('homework'), true);
assert.equal(isHomeworkFocus('schedule'), false);

const shaped = applyHomeworkFocusToSuggestions([
  {
    id: 's1',
    kind: 'todo',
    title: 'Norsk: les kapittel 4',
    type: 'weekly',
    category: 'gjøremål',
    daysOfWeek: [1, 2, 3],
    selected: true,
    points: 5,
  },
  {
    id: 's2',
    kind: 'schedule_slot',
    title: 'MATTE',
    day: 'mon',
    time: '08:25',
    endTime: '09:55',
    selected: true,
  },
  {
    id: 's3',
    kind: 'schedule_slot',
    title: 'Engelsk: 10 gloser',
    selected: true,
  },
  {
    id: 's4',
    kind: 'todo',
    title: 'Husk gymtøy',
    prepTask: true,
    prepWhen: 'evening',
    selected: false,
  },
  {
    id: 's5',
    kind: 'note',
    title: 'Klassens nettside',
    selected: true,
  },
]);

assert.equal(shaped.length, 4);
const norsk = shaped.find((s) => s.id === 's1');
assert.equal(norsk.kind, 'homework');
assert.equal(norsk.type, 'once');
assert.equal(norsk.category, 'lekser');
assert.equal(norsk.subject, 'norsk');
assert.deepEqual(norsk.daysOfWeek, []);
assert.equal(norsk.time, null);

const gloser = shaped.find((s) => s.id === 's3');
assert.equal(gloser.kind, 'homework');
assert.equal(gloser.category, 'lekser');
assert.equal(gloser.subject, 'engelsk');

const husk = shaped.find((s) => s.id === 's4');
assert.equal(husk.kind, 'todo');
assert.equal(husk.category, 'gjøremål');
assert.equal(husk.prepTask, true);

const keepSubject = applyHomeworkFocusToSuggestions([
  { id: 'keep', kind: 'homework', title: 'Norsk: les kapittel 4', subject: 'engelsk', selected: true },
]);
assert.equal(keepSubject[0].subject, 'engelsk');

assert.equal(shaped.some((s) => s.id === 's2'), false, 'timeplan-timer skal bort');
assert.equal(shaped.find((s) => s.id === 's5').selected, false);

console.log('homeworkImport.test.mjs ok');
