import assert from 'node:assert/strict';
import {
  buildPrepTaskSuggestions,
  mergePrepTaskSuggestions,
  partitionImportSuggestions,
  groupScheduleSlotsByDay,
} from './schedulePrepTasks.js';

const suggestions = [
  {
    id: 's1',
    kind: 'schedule_slot',
    title: 'Kroppsøving',
    subject: 'Kroppsøving',
    day: 'wed',
    time: '10:00',
    endTime: '10:45',
    selected: true,
  },
  {
    id: 's2',
    kind: 'schedule_slot',
    title: 'Svømming',
    day: 'fri',
    time: '12:00',
    endTime: '13:00',
    selected: true,
  },
  {
    id: 's3',
    kind: 'schedule_slot',
    title: 'Norsk',
    day: 'mon',
    time: '08:30',
    selected: true,
  },
];

const prep = buildPrepTaskSuggestions(suggestions);
assert.equal(prep.length, 4, 'gym + svømming × kveld/morgen');
assert.ok(prep.every((p) => p.prepTask === true && p.selected === false));
assert.ok(prep.every((p) => p.kind === 'todo' && p.category === 'gjøremål'));

const gymEve = prep.find((p) => p.id === 'prep-gym-eve-wed');
assert.ok(gymEve);
assert.equal(gymEve.title, 'Husk gymtøy');
assert.deepEqual(gymEve.daysOfWeek, [2]); // tirsdag kveld før onsdag
assert.equal(gymEve.prepWhen, 'evening');

const gymMorn = prep.find((p) => p.id === 'prep-gym-morn-wed');
assert.equal(gymMorn.daysOfWeek[0], 3); // onsdag morgen
assert.match(gymMorn.dateHint, /^\d{4}-\d{2}-\d{2}$/);

const swimEve = prep.find((p) => p.id === 'prep-swim-eve-fri');
assert.deepEqual(swimEve.daysOfWeek, [4]); // torsdag

const merged = mergePrepTaskSuggestions(suggestions);
assert.equal(merged.length, suggestions.length + 4);

const again = buildPrepTaskSuggestions(merged);
assert.equal(again.length, 0, 'ikke dupliser når AI/merge allerede har huskeoppgaver');

const withGenericAiGymPrep = [
  {
    id: 'g1',
    kind: 'schedule_slot',
    title: 'GYM/SVØM (HE/ET)',
    subject: 'GYM/SVØM (HE/ET)',
    day: 'tue',
    time: '12:15',
    endTime: '13:45',
    selected: true,
  },
  {
    id: 'g2',
    kind: 'schedule_slot',
    title: 'GYM/SVØM (HE/ET)',
    subject: 'GYM/SVØM (HE/ET)',
    day: 'thu',
    time: '12:15',
    endTime: '13:45',
    selected: true,
  },
  {
    id: 'ai-prep',
    kind: 'todo',
    title: 'Husk gymtøy',
    prepTask: true,
    prepWhen: 'evening',
    selected: false,
  },
];
const multiPrep = buildPrepTaskSuggestions(withGenericAiGymPrep);
assert.ok(multiPrep.some((p) => p.id === 'prep-gym-eve-tue'), 'tirsdag gym → mandag kveld selv om AI har generisk gym-prep');
assert.ok(multiPrep.some((p) => p.id === 'prep-swim-eve-thu'), 'torsdag svømming → onsdag kveld');
assert.equal(
  multiPrep.filter((p) => p.title === 'Husk gymtøy' && p.daysOfWeek.includes(1)).length,
  1,
  'kun én mandag-kveld gym for tirsdags gym',
);

const parts = partitionImportSuggestions(merged);
assert.equal(parts.prep.length, 4);
assert.equal(parts.slots.length, 3);
assert.equal(parts.rest.length, 0);

const timetableSlots = [
  { id: 'a', kind: 'schedule_slot', title: 'Matte', day: 'mon', time: '10:10', endTime: '11:00' },
  { id: 'b', kind: 'schedule_slot', title: 'Norsk', day: 'mon', time: '08:25', endTime: '09:55' },
  { id: 'c', kind: 'schedule_slot', title: 'Engelsk', day: 'tue', time: '08:25', endTime: '09:55' },
  { id: 'd', kind: 'schedule_slot', title: 'Gym', day: 'mon', time: '12:15', endTime: '13:45' },
];
const grouped = groupScheduleSlotsByDay(timetableSlots);
assert.equal(grouped.length, 2);
assert.equal(grouped[0].label, 'Mandag');
assert.equal(grouped[0].items.map((s) => s.id).join(','), 'b,a,d');
assert.equal(grouped[1].label, 'Tirsdag');
assert.equal(grouped[1].items[0].id, 'c');

console.log('schedulePrepTasks.test.mjs ok');
