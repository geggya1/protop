import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  childDayCopy,
  childTip,
  deskGreetingSub,
  deskGreetingTitle,
  eventSourceHint,
  eventsForPerson,
  eventDayPeriod,
  familyOnTrack,
  familyPulse,
  groupEventsByDayPeriod,
  homeFocusIsTomorrow,
  homeFocusCopy,
  joinFirstNames,
  knowToday,
  memberNextLine,
  mergeDeskDayEvents,
  nextEventLine,
  nextTimedEvent,
  upcomingDayEvents,
  isEventStillRelevant,
  todayProgressPct,
  memberDayStatus,
  taskFocusMeta,
  buildPrepareFocus,
  timelineEventLabel,
} from './deskHome.js';

const morning = new Date('2026-08-28T07:30:00');
assert.equal(deskGreetingTitle(morning, 'Geir'), 'God morgen, Geir');
assert.match(deskGreetingSub(morning), /super dag/);

const evening = new Date('2026-08-28T19:00:00');
assert.equal(deskGreetingTitle(evening, 'Celine'), 'God kveld, Celine');

assert.equal(familyPulse({}).title, 'Du er oppdatert!');
assert.equal(familyPulse({ unread: 2 }).title, '2 varsler venter');
assert.equal(familyPulse({ tasksLeft: 3 }).tone, 'focus');

assert.equal(familyOnTrack([]).ok, true);
assert.equal(
  familyOnTrack([{ name: 'Celine', todayDone: 2, todayTotal: 2 }]).title,
  'Alle er i rute',
);
assert.match(
  familyOnTrack([{ name: 'Adelen', todayDone: 1, todayTotal: 3 }]).title,
  /Adelen/,
);

assert.equal(childDayCopy({ remaining: 0, total: 0 }).title, 'Ingen gjøremål i dag');
assert.match(childDayCopy({ remaining: 0, total: 4, done: 4 }).title, /ferdig/);
assert.equal(childDayCopy({ remaining: 3, total: 5, done: 2 }).title, '3 gjøremål gjenstår');

assert.equal(nextEventLine([]), 'Ingen avtaler i dag');
assert.match(nextEventLine([{ startTime: '15:00', title: 'Henting' }]), /15:00/);
assert.match(nextEventLine([
  { startTime: '08:30', title: 'Skole' },
  { startTime: '17:00', title: 'Fotball' },
]), /2 avtaler/);

assert.equal(todayProgressPct({}).empty, true);
assert.equal(todayProgressPct({ taskDone: 1, taskTotal: 2, choreDone: 2, choreTotal: 2 }).pct, 75);

const know = knowToday({
  overdue: 1,
  unread: 2,
  tomorrowTitles: ['Tannlege'],
  kidsBehind: [{ name: 'Celine', todayDone: 1, todayTotal: 3 }],
});
assert.equal(know[0].id, 'overdue');
assert.equal(knowToday({}).length, 1);
assert.equal(knowToday({})[0].id, 'clear');

assert.match(childTip({ remaining: 0, total: 3 }), /Vanen/);
assert.match(childTip({ remaining: 2, total: 4 }), /Ett og ett/);

assert.equal(memberDayStatus({ isParent: true }), 'Foresatt');
assert.equal(memberDayStatus({ todayDone: 2, todayTotal: 2 }), 'Klar for dagen');
assert.equal(taskFocusMeta({ _overdue: true, deadlineTime: '12:00' }).danger, true);
assert.equal(taskFocusMeta({ category: 'Arbeid' }).label, 'Arbeid');

const day = new Date('2026-08-28T12:00:00');
const merged = mergeDeskDayEvents(
  [{ id: 'f1', dateKey: '2026-08-28', startTime: '09:00', title: 'Familie' }],
  [
    { id: 'e1', dateKey: '2026-08-28', startTime: '08:00', title: 'Standup', sourceLabel: 'Outlook · geir@example.com', private: true, readOnly: true },
    { id: 'e2', dateKey: '2026-08-29', startTime: '10:00', title: 'I morgen' },
  ],
  day,
);
assert.equal(merged.map((e) => e.id).join(','), 'e1,f1');
assert.match(eventSourceHint(merged[0]), /Outlook/);
assert.equal(
  eventsForPerson(merged, { id: 'p1', uid: 'u1' }, { uid: 'u1' }).map((e) => e.id).join(','),
  'e1',
);
assert.equal(eventsForPerson(merged, { id: 'k1' }, { uid: 'u1' }).length, 0);
assert.match(
  memberNextLine(
    [{ id: 'a', memberIds: ['k1'], startTime: '16:00', title: 'Fotball' }],
    { id: 'k1' },
    { now: day },
  ),
  /Fotball/,
);

const noon = new Date('2026-08-31T15:57:00');
const dayEvents = [
  { id: '1', startTime: '09:00', title: 'Morgen' },
  { id: '2', startTime: '10:00', endTime: '11:00', title: 'Møte' },
  { id: '3', startTime: '11:30', title: 'Lunsj' },
  { id: '4', startTime: '16:30', title: 'Ettermiddag' },
  { id: '5', title: 'Heldag' },
];
assert.equal(isEventStillRelevant(dayEvents[0], noon), false);
assert.equal(isEventStillRelevant(dayEvents[1], noon), false);
assert.equal(isEventStillRelevant(dayEvents[2], noon), false);
assert.equal(isEventStillRelevant(dayEvents[3], noon), true);
assert.equal(isEventStillRelevant(dayEvents[4], noon), true);
assert.deepEqual(
  upcomingDayEvents(dayEvents, noon, 3).map((e) => e.id),
  ['4', '5'],
);
assert.equal(nextTimedEvent(dayEvents, noon)?.id, '4');

assert.equal(homeFocusIsTomorrow(new Date('2026-09-08T16:59:00')), false);
assert.equal(homeFocusIsTomorrow(new Date('2026-09-08T17:00:00')), true);

const focusToday = homeFocusCopy(false);
assert.equal(focusToday.focusLabel, 'I dag');
assert.equal(focusToday.focusCta, 'Se dagens plan');
assert.equal(focusToday.appointmentsTitle, 'Dagens avtaler');
const focusTomorrowCopy = homeFocusCopy(true);
assert.equal(focusTomorrowCopy.focusLabel, 'I morgen');
assert.equal(focusTomorrowCopy.focusCta, 'Se morgendagens plan');
assert.equal(focusTomorrowCopy.appointmentsTitle, 'Avtaler i morgen');

assert.equal(eventDayPeriod({ startTime: '07:45' }), 'morning');
assert.equal(eventDayPeriod({ startTime: '16:30' }), 'afternoon');
assert.equal(eventDayPeriod({ startTime: '18:00' }), 'evening');
assert.equal(eventDayPeriod({}), 'morning');
const grouped = groupEventsByDayPeriod([
  { id: 'a', startTime: '07:45' },
  { id: 'b', startTime: '16:30' },
  { id: 'c', startTime: '18:00' },
]);
assert.deepEqual(grouped.morning.map((e) => e.id), ['a']);
assert.deepEqual(grouped.afternoon.map((e) => e.id), ['b']);
assert.deepEqual(grouped.evening.map((e) => e.id), ['c']);
assert.equal(joinFirstNames([{ name: 'Adelen' }, { name: 'Celine Andersen' }]), 'Adelen og Celine');
assert.equal(joinFirstNames([{ name: 'A' }, { name: 'B' }, { name: 'C' }]), 'A, B og C');

const prepare = buildPrepareFocus({
  focusTomorrow: true,
  openTasks: [{ id: '1', title: 'Skoleskjema' }],
  shopCount: 12,
  shopLabel: 'Handleliste',
  includeDinner: false,
});
assert.equal(prepare.eyebrow, 'Før i morgen');
assert.equal(prepare.headline, '2 ting gjenstår');
assert.equal(prepare.sub, 'Skoleskjema og Handleliste');
assert.equal(prepare.done, 0);
assert.equal(prepare.total, 2);

const prepareDone = buildPrepareFocus({
  focusTomorrow: false,
  openTasks: [],
  shopCount: 0,
  dinnerMissing: false,
  dinnerTitle: 'Laksepasta',
});
assert.equal(prepareDone.eyebrow, 'Før i dag');
assert.equal(prepareDone.headline, 'Alt er klart');
assert.equal(prepareDone.done, 3);
assert.equal(prepareDone.empty, true);

assert.equal(timelineEventLabel({ title: 'Skolelevering' }), 'Skolelevering');
assert.equal(timelineEventLabel({ title: 'Fotball trening' }), 'Fotball');

const dash = readFileSync(new URL('../../components/DeskHomeDashboard.jsx', import.meta.url), 'utf8');
for (const hidden of ['Familieoversikt', 'Handleliste', 'Middag']) {
  assert.equal(dash.includes(hidden), false, `${hidden} stays off the desk home`);
}
assert.match(dash, /Oppgaver/);
assert.match(dash, /Notat/);
assert.match(dash, /Været/);

console.log('deskHome tests ok');
