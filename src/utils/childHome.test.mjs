import assert from 'node:assert/strict';
import {
  parseHm,
  formatHm,
  eventKind,
  eventPhase,
  eventLeaveTime,
  eventReminder,
  relativeEventLabel,
  eventSubline,
  buildChildDayTimeline,
  childGreetingKicker,
  childShellTitle,
  childHomePeriod,
  childHeroArtName,
  pickChildHeroTheme,
  isSchoolYearMonth,
  isPreschoolAge,
  childGenderTone,
  taskArtName,
  shortcutArtName,
  childAppArtName,
  childHomeProgressArtName,
  childHomeWeekMoneyArtName,
  childDayProgressCopy,
  taskFirstStep,
  taskSteps,
  taskDurationHint,
  taskDoneCaption,
  isLekserTask,
  sortChildDayTasks,
  partitionChildDayTasks,
  pickFeaturedTask,
  childHomeShortcutIds,
  childShortcutLabel,
  childShortcutAccent,
  DEFAULT_CHILD_SHORTCUT_IDS,
  featuredTaskTone,
  buildChildTomorrowOverview,
  childTimelineFocus,
} from './childHome.js';

assert.equal(parseHm('17:00'), 17 * 60);
assert.equal(parseHm('8:05'), 8 * 60 + 5);
assert.equal(parseHm('nope'), null);
assert.equal(formatHm(16 * 60 + 40), '16:40');

assert.equal(eventKind({ title: 'Fotballtrening' }), 'sport');
assert.equal(eventKind({ title: 'Skole' }), 'school');
assert.equal(eventKind({ title: 'Svømming' }), 'swim');
assert.equal(eventKind({ title: 'Pianoøving' }), 'music');
assert.equal(eventKind({ title: 'Tannlege' }), 'health');
assert.equal(eventKind({ title: 'Handle' }), 'default');

const noon = new Date('2026-09-01T12:00:00');
assert.equal(eventPhase({ startTime: '08:15', endTime: '13:30' }, noon), 'now');
assert.equal(eventPhase({ startTime: '08:15', endTime: '11:00' }, noon), 'past');
assert.equal(eventPhase({ startTime: '17:00', endTime: '18:00' }, noon), 'upcoming');
assert.equal(eventPhase({ startTime: '11:30' }, noon), 'now');
assert.deepEqual(
  featuredTaskTone({ title: 'Gjøre lekser' }, false).backgroundColor,
  '#fff7ed',
);

assert.equal(eventLeaveTime({ title: 'Fotballtrening', startTime: '17:00' }, noon), '16:40');
assert.equal(eventLeaveTime({ title: 'Skole', startTime: '08:15' }, noon), null);
assert.equal(
  eventReminder({ title: 'Fotballtrening' }),
  'Husk drikkeflaske og treningssko',
);
assert.equal(
  eventReminder({ title: 'Fotball', description: 'Ta med rød drakt.' }),
  'Ta med rød drakt',
);

assert.equal(relativeEventLabel({ startTime: '08:00', endTime: '09:00' }, noon), 'Ferdig');
assert.equal(relativeEventLabel({ startTime: '17:00' }, noon), 'Om 5 timer');
assert.match(eventSubline({ title: 'Fotball', place: 'Idrettsplassen', startTime: '17:00' }, noon), /Idrettsplassen/);
assert.match(eventSubline({ title: 'Fotball', place: 'Idrettsplassen', startTime: '17:00' }, noon), /16:40/);

const timeline = buildChildDayTimeline([
  { id: 'a', title: 'Skole', startTime: '08:15', endTime: '13:30' },
  { id: 'b', title: 'Fotballtrening', startTime: '17:00', endTime: '18:00', place: 'Idrettsplassen' },
], noon);
assert.equal(timeline.length, 2);
assert.equal(timeline[0].phase, 'now');
assert.equal(timeline[0].focus, true);
assert.equal(timeline[0].reminder, null);
assert.equal(timeline[1].kind, 'sport');
assert.equal(timeline[1].reminder, 'Husk drikkeflaske og treningssko');

assert.equal(childHomePeriod(new Date('2026-09-01T12:00:00')), 'school');
assert.equal(childHomePeriod(new Date('2026-09-01T16:30:00')), 'afterSchool');
assert.equal(childHomePeriod(new Date('2026-09-05T12:00:00')), 'weekend');
assert.equal(childHomePeriod(new Date('2026-09-01T06:00:00')), 'morning');
assert.equal(childGreetingKicker(new Date('2026-09-01T08:00:00')), 'Skoledagen er i gang');
assert.equal(childGreetingKicker(new Date('2026-09-01T16:00:00')), 'Tid for lek');
assert.equal(childShellTitle(new Date('2026-09-01T16:00:00')), 'Lek og fritid');
assert.equal(childHeroArtName(new Date('2026-09-01T08:00:00')), 'heroSchoolNavy');

assert.equal(isSchoolYearMonth(new Date('2026-09-01')), true);
assert.equal(isSchoolYearMonth(new Date('2026-07-15')), false);
assert.equal(isPreschoolAge({ birthday: '2022-01-01' }, new Date('2026-09-01')), true);
assert.equal(isPreschoolAge({ birthday: '2018-01-01' }, new Date('2026-09-01')), false);
assert.equal(childGenderTone({ gender: 'female' }), 'girl');
assert.equal(childGenderTone({ gender: 'male' }), 'boy');

const schoolNoon = new Date('2026-09-01T12:00:00');
assert.equal(
  pickChildHeroTheme({ date: schoolNoon, child: { gender: 'female', birthday: '2016-03-01' } }).banner,
  'heroSchoolLavender',
);
assert.equal(
  pickChildHeroTheme({ date: schoolNoon, child: { gender: 'male', birthday: '2016-03-01' } }).banner,
  'heroSchoolNavy',
);
assert.equal(
  pickChildHeroTheme({ date: schoolNoon, child: { birthday: '2022-04-01' } }).slot,
  'kindergarten',
);
assert.equal(
  pickChildHeroTheme({ date: schoolNoon, child: { birthday: '2022-04-01' } }).banner,
  'heroKindergarten',
);
assert.equal(pickChildHeroTheme({ date: new Date('2026-09-05T10:00:00') }).slot, 'play');
assert.equal(pickChildHeroTheme({ date: new Date('2026-09-05T10:00:00') }).title, 'Helg');
assert.equal(
  pickChildHeroTheme({
    date: new Date('2026-09-01T16:00:00'),
    events: [{ title: 'Fotballtrening', startTime: '17:00', endTime: '18:00' }],
  }).slot,
  'sport',
);
assert.equal(
  pickChildHeroTheme({
    date: new Date('2026-09-01T18:30:00'),
    child: { gender: 'female', birthday: '2015-01-01' },
  }).slot,
  'hobbies',
);
assert.equal(pickChildHeroTheme({ date: new Date('2026-09-01T21:00:00') }).slot, 'bedtime');
assert.equal(
  pickChildHeroTheme({ date: new Date('2026-07-08T10:00:00'), child: { birthday: '2016-01-01' } }).slot,
  'play',
);
assert.equal(
  pickChildHeroTheme({
    date: new Date('2026-09-06T11:00:00'),
    tasks: [{ title: 'Pianoøving' }],
  }).slot,
  'hobbies',
);
assert.equal(taskArtName({ title: 'Gjøre lekser', category: 'lekser' }), 'homework');
assert.equal(shortcutArtName('skole', 'afterSchool'), 'schoolAfter');
assert.equal(shortcutArtName('wishes'), 'wishes');
assert.equal(childAppArtName('stars'), 'appTasks');
assert.equal(childAppArtName('chores'), 'appChores');
assert.equal(childAppArtName('plan'), 'appPlan');
assert.equal(childAppArtName('chat'), 'appChat');
assert.equal(childAppArtName('documents'), 'appDocuments');
assert.equal(childAppArtName('games'), 'appGames');
assert.equal(childAppArtName('lekser'), 'appLekser');
assert.equal(childAppArtName('leksehjelp'), 'appLeksehjelp');
assert.equal(childAppArtName('week-plan'), 'appWeekPlan');
assert.equal(childAppArtName('scratchMap'), 'appTravel');
assert.equal(childAppArtName('rememberDates'), 'appRememberDates');
assert.equal(childAppArtName('skole', 'afterSchool'), 'schoolAfter');
assert.equal(childAppArtName('unknown'), null);
assert.equal(childHomeProgressArtName(), 'appProgress');
assert.equal(childHomeWeekMoneyArtName(), 'appPiggyBank');

assert.equal(childDayProgressCopy({ done: 1, total: 3 }).headline, '1 av 3 ferdig');
assert.match(childDayProgressCopy({ done: 1, total: 3 }).cheer, /godt i gang/);
assert.match(childDayProgressCopy({ done: 0, total: 2 }).cheer, /Du klarer/);
assert.match(childDayProgressCopy({ done: 3, total: 3 }).cheer, /ferdig/);
assert.match(childDayProgressCopy({ done: 0, total: 0 }).cheer, /Kos deg/);

assert.equal(taskFirstStep({ title: 'Gjøre lekser' }), 'Finn frem bøkene og velg én oppgave.');
assert.equal(taskFirstStep({ title: 'Annet', description: 'Åpne boka\nSkriv svar' }), 'Åpne boka.');
assert.deepEqual(
  taskSteps({ description: '1. Åpne boka\n2. Velg en oppgave' }),
  ['Åpne boka', 'Velg en oppgave'],
);
assert.deepEqual(taskSteps({ description: 'Bare én linje' }), []);
assert.equal(taskDurationHint({ title: 'Lese bok' }), '15 minutter');
assert.equal(taskDurationHint({ description: 'Les 20 minutter' }), '20 minutter');
assert.match(taskDoneCaption({ title: 'Pakke sekken' }), /klar for i morgen/);
assert.equal(isLekserTask({ category: 'lekser' }), true);
assert.equal(isLekserTask({ title: 'Matte-lekser' }), true);

const sorted = sortChildDayTasks([
  { id: 'done', title: 'Pakke sekken', completedDates: ['2026-09-01'] },
  { id: 'read', title: 'Lese bok', completedDates: [] },
  { id: 'hw', title: 'Gjøre lekser', category: 'lekser', completedDates: [] },
], '2026-09-01');
assert.equal(sorted[0].id, 'hw');
assert.equal(sorted[1].id, 'read');
assert.equal(sorted[2].id, 'done');
assert.equal(pickFeaturedTask(sorted, '2026-09-01').id, 'hw');
assert.equal(pickFeaturedTask([{ id: 'x', title: 'Ferdig', completedDates: ['2026-09-01'] }], '2026-09-01'), null);

assert.deepEqual(
  childHomeShortcutIds([{ id: 'skole' }, { id: 'books' }, { id: 'wishes' }, { id: 'games' }]),
  DEFAULT_CHILD_SHORTCUT_IDS,
);
assert.deepEqual(
  childHomeShortcutIds([{ id: 'chores' }, { id: 'plan' }, { id: 'chat' }]),
  ['chores', 'plan'],
);
assert.equal(childShortcutLabel({ id: 'books', label: 'Bøker' }), 'Bokhylla');
assert.equal(childShortcutLabel({ id: 'custom', label: 'Annet' }), 'Annet');
assert.equal(childShortcutAccent('stars').accent, '#2563eb');
assert.equal(childShortcutAccent('chat').ion, 'chatbubbles');
assert.notEqual(childShortcutAccent('notes').accent, '#111827');
assert.equal(childShortcutAccent('unknown').accent, '#4f46e5');

const emptyTomorrow = buildChildTomorrowOverview({});
assert.equal(emptyTomorrow.title, 'Hva skjer i morgen?');
assert.equal(emptyTomorrow.empty, true);
assert.match(emptyTomorrow.summary, /Ingenting planlagt/);

const packedTomorrow = buildChildTomorrowOverview({
  dateLabel: 'Torsdag 17. september',
  events: [
    { id: 'e1', title: 'Fotballtrening', startTime: '17:00', place: 'Idrettsplassen' },
    { id: 'e2', title: 'Skole', startTime: '08:15' },
  ],
  tasks: [
    { id: 't1', title: 'Pakke sekken' },
    { id: 't2', title: 'Lese bok' },
  ],
});
assert.equal(packedTomorrow.empty, false);
assert.equal(packedTomorrow.dateLabel, 'Torsdag 17. september');
assert.equal(packedTomorrow.eventCount, 2);
assert.equal(packedTomorrow.taskCount, 2);
assert.equal(packedTomorrow.events[0].title, 'Skole');
assert.equal(packedTomorrow.events[0].time, '08:15');
assert.equal(packedTomorrow.events[1].title, 'Fotballtrening');
assert.match(packedTomorrow.events[1].reminder, /drikkeflaske/);
assert.equal(packedTomorrow.tasks[0].title, 'Pakke sekken');
assert.match(packedTomorrow.summary, /2 avtaler/);
assert.match(packedTomorrow.summary, /2 gjøremål/);
assert.ok(packedTomorrow.prepHints.length >= 1);

const onlyTasks = buildChildTomorrowOverview({
  tasks: [{ id: 't1', title: 'Pakke sekken' }],
});
assert.equal(onlyTasks.eventCount, 0);
assert.match(onlyTasks.summary, /1 gjøremål i morgen/);

const partitioned = partitionChildDayTasks([
  { id: 'a', title: 'Ferdig', completedDates: ['2026-09-20'] },
  { id: 'b', title: 'Åpen oppgave' },
  { id: 'c', title: 'Også ferdig', completedDates: ['2026-09-20'] },
], '2026-09-20');
assert.deepEqual(partitioned.open.map((t) => t.id), ['b']);
assert.deepEqual(partitioned.done.map((t) => t.id), ['a', 'c']);

const dayFocus = childTimelineFocus({
  eventsToday: [],
  eventsTomorrow: [{ id: 'tm', title: 'Fotball', startTime: '08:30' }],
  now: new Date(2026, 8, 20, 14, 0, 0),
});
assert.equal(dayFocus.focusTomorrow, true);
assert.equal(dayFocus.upcoming[0].title, 'Fotball');
assert.equal(dayFocus.focusCopy.appointmentsTitle, 'Avtaler i morgen');

const dayBusy = childTimelineFocus({
  eventsToday: [{ id: 'td', title: 'Piano', startTime: '16:00' }],
  eventsTomorrow: [{ id: 'tm', title: 'Fotball', startTime: '08:30' }],
  now: new Date(2026, 8, 20, 14, 0, 0),
});
assert.equal(dayBusy.focusTomorrow, false);
assert.equal(dayBusy.upcoming[0].title, 'Piano');
assert.equal(dayBusy.focusCopy.appointmentsTitle, 'I dag');

const eveningFocus = childTimelineFocus({
  eventsToday: [{ id: 'td', title: 'Piano', startTime: '16:00' }],
  eventsTomorrow: [{ id: 'tm', title: 'Fotball', startTime: '08:30' }],
  now: new Date(2026, 8, 20, 18, 0, 0),
});
assert.equal(eveningFocus.focusTomorrow, true);
assert.equal(eveningFocus.upcoming[0].title, 'Fotball');

// Heldag alene skal ikke blokkere morgendagens timed avtale.
const allDayOnly = childTimelineFocus({
  eventsToday: [{ id: 'ad', title: 'Skolefri' }],
  eventsTomorrow: [{ id: 'tm', title: 'Fotball', startTime: '17:00' }],
  now: new Date(2026, 8, 20, 14, 0, 0),
});
assert.equal(allDayOnly.focusTomorrow, true);
assert.equal(allDayOnly.upcoming[0].title, 'Fotball');

// 00:00 / allDay-flagg teller heller ikke som timed i dag.
const midnightAllDay = childTimelineFocus({
  eventsToday: [{ id: 'ad', title: 'Fri', startTime: '00:00', allDay: true }],
  eventsTomorrow: [{ id: 'tm', title: 'Svømming', startTime: '09:00' }],
  now: new Date(2026, 8, 20, 14, 0, 0),
});
assert.equal(midnightAllDay.focusTomorrow, true);
assert.equal(midnightAllDay.upcoming[0].title, 'Svømming');

const heldagLabel = childTimelineFocus({
  eventsToday: [{ id: 'ad', title: 'Tur', startTime: 'Heldag' }],
  eventsTomorrow: [{ id: 'tm', title: 'Piano', startTime: '15:00' }],
  now: new Date(2026, 8, 20, 11, 0, 0),
});
assert.equal(heldagLabel.focusTomorrow, true);
assert.equal(heldagLabel.upcoming[0].title, 'Piano');

// Etter at dagens timed avtaler er over → i morgen.
const afterLast = childTimelineFocus({
  eventsToday: [{ id: 'td', title: 'Piano', startTime: '10:00', endTime: '11:00' }],
  eventsTomorrow: [{ id: 'tm', title: 'Svømming', startTime: '09:00' }],
  now: new Date(2026, 8, 20, 14, 0, 0),
});
assert.equal(afterLast.focusTomorrow, true);
assert.equal(afterLast.upcoming[0].title, 'Svømming');

console.log('childHome.test.mjs: ok');
