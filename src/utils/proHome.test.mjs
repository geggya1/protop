import assert from 'node:assert/strict';
import {
  weekDays, mondayOf, isoWeekNumber, hoursLabel, weekHoursSummary, homeProjects,
  teamToday, quickActionsFor, mileageSummary, kmLabel, krLabel, countdownLabel, dayBrief, weekLoad, relativeDay, isoDay,
} from './proHome.js';

// Onsdag 4. november 2026.
const wed = new Date(2026, 10, 4, 10, 15);

assert.equal(isoDay(mondayOf(wed)), '2026-11-02');
assert.equal(isoDay(mondayOf(new Date(2026, 10, 8, 9))), '2026-11-02'); // søndag hører til uken før
const days = weekDays(wed);
assert.deepEqual(days.map((d) => d.label), ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']);
assert.equal(days.find((d) => d.isToday).key, '2026-11-04');
assert.equal(days.filter((d) => d.past).length, 2);
assert.equal(isoWeekNumber(wed), 45);
assert.equal(isoWeekNumber(new Date(2027, 0, 1)), 53);

assert.equal(hoursLabel(7.5), '7,5 t');
assert.equal(hoursLabel('8:00'), '8 t');
assert.equal(hoursLabel(0), '0 t');

// Uken i timer: mandag full dag, tirsdag tom (mangler), i dag 3 timer.
const week = weekHoursSummary([
  { date: '2026-11-02', hours: 7.5, projectId: 'p1' },
  { date: '2026-11-04', hours: '2:00', projectId: 'p2' },
  { date: '2026-11-04', hours: 1, projectId: 'p2' },
  { date: '2026-10-30', hours: 8, projectId: 'p9' }, // forrige uke teller ikke
  { date: '2026-11-03', hours: 0 },
], { today: wed, normalDay: 7.5 });
assert.equal(week.total, 10.5);
assert.equal(week.target, 37.5);
assert.equal(week.todayHours, 3);
assert.deepEqual(week.missing, ['Ti']);
assert.equal(week.days[0].full, true);
assert.equal(week.days[2].full, false);
assert.deepEqual(week.topProjectIds, ['p1', 'p2']);
assert.equal(week.week, 45);
assert.ok(week.progress > 0.27 && week.progress < 0.29);
// Tom uke gir null, ikke NaN.
const empty = weekHoursSummary([], { today: wed });
assert.equal(empty.total, 0);
assert.equal(empty.progress, 0);
assert.ok(empty.days.every((d) => d.ratio === 0));

// Prosjekter: timer denne uken først, avsluttede ut.
const projects = homeProjects([
  { id: 'a', number: '1001', name: 'Skole', phase: 'produksjon' },
  { id: 'b', number: '1002', name: 'Bolig', phase: 'avsluttet' },
  { id: 'c', number: '1003', name: 'Hall', phase: 'planlegging', manager: 'Geir Olsen' },
  { id: 'd', number: '1004', name: 'Kai', phase: 'produksjon' },
  { id: 'e', number: '1005', name: 'Slettet', phase: 'produksjon', deleted: true },
], { recentIds: ['d'], myName: 'Geir' });
assert.equal(projects.total, 3);
assert.equal(projects.running, 2);
assert.deepEqual(projects.items.map((p) => p.id), ['d', 'c', 'a']);
assert.equal(projects.items[0].mine, true);
assert.equal(projects.items[2].phaseLabel, 'Pågår');

// Teamet: de som har ført timer først, sluttede ut.
const team = teamToday([
  { id: 'e1', person: { firstName: 'Ola', lastName: 'Hansen' } },
  { id: 'e2', person: { firstName: 'Kari', lastName: 'Nordmann' } },
  { id: 'e3', person: { firstName: 'Per' }, company: { endDate: '2026-01-01' } },
  { id: 'e4', person: { firstName: 'Geir', lastName: 'A' } },
], [
  { employeeId: 'e2', date: '2026-11-04', hours: 4 },
  { employeeId: 'e3', date: '2026-11-04', hours: 4 },
  { employeeId: 'e1', date: '2026-11-03', hours: 4 },
], { meId: 'e4', todayKey: '2026-11-04' });
assert.equal(team.total, 3);
assert.equal(team.loggedCount, 1);
assert.equal(team.people[0].id, 'e2');
assert.equal(team.people[1].id, 'e4'); // meg før de andre uten føring
assert.equal(team.people[0].initials, 'KN');
assert.equal(team.headline, '1 av 3 har ført i dag');
const hidden = teamToday([{ id: 'x', person: { firstName: 'A' } }], null);
assert.equal(hidden.known, false);
assert.equal(hidden.headline, '1 ansatt');

// Hurtigvalg: bedrift med og uten ISO, privat.
assert.deepEqual(quickActionsFor('company', { iso: true }).map((a) => a.id), ['hours', 'ruh', 'task', 'event']);
assert.deepEqual(quickActionsFor('company').map((a) => a.id), ['hours', 'project', 'task', 'event']);
assert.deepEqual(quickActionsFor('company', { iso: true, mileage: true }).map((a) => a.id), ['hours', 'trip', 'ruh', 'task']);
assert.deepEqual(quickActionsFor('company', { mileage: true }).map((a) => a.id), ['hours', 'trip', 'project', 'task']);
assert.deepEqual(quickActionsFor('company', { mileage: true })[1].action, { type: 'tab', tab: 'okonomi', subView: 'kjorebok' });
assert.deepEqual(quickActionsFor('private').map((a) => a.id), ['event', 'task', 'note', 'ai']);

// Nedtelling.
assert.equal(countdownLabel('10:40', null, wed), 'Om 25 min');
assert.equal(countdownLabel('12:15', null, wed), 'Om 2 t');
assert.equal(countdownLabel('12:30', null, wed), 'Om 2 t 15 min');
assert.equal(countdownLabel('10:00', '11:00', wed), 'Pågår nå');
assert.equal(countdownLabel('09:00', null, wed), null);
assert.equal(countdownLabel('Heldag', null, wed), null);

// Dagen din.
const brief = dayBrief({ eventsToday: 1, openTasks: 3, overdueTasks: 1, unread: 0, nextTitle: 'Byggemøte', nextTime: '13:00' });
assert.deepEqual(brief.stats.map((s) => s.label), ['avtale', 'oppgaver', 'varsler']);
assert.equal(brief.stats[1].sub, '1 forfalt');
assert.equal(brief.stats[1].alert, true);
assert.equal(brief.line, '13:00 · Byggemøte');
assert.equal(brief.calm, false);
assert.equal(dayBrief().calm, true);
assert.equal(dayBrief({ focusTomorrow: true }).line, 'Ingenting i kalenderen i morgen');

// Uken.
const load = weekLoad({ '2026-11-02': 1, '2026-11-05': 3 }, wed);
assert.equal(load.total, 4);
assert.equal(load.busiest.label, 'To');
assert.equal(load.days[3].ratio, 1);
assert.equal(load.headline, '4 avtaler denne uken');
assert.equal(weekLoad({}, wed).headline, 'Ingen avtaler denne uken');

assert.equal(relativeDay('2026-11-04', wed), 'I dag');
assert.equal(relativeDay('2026-11-03', wed), 'I går');
assert.equal(relativeDay('2026-11-01', wed), '3 dager siden');
assert.equal(relativeDay('2026-10-01', wed), '1.10.2026');

// Kjørebok: mine turer, denne måneden, yrkeskjøring i år og turer som ikke er sendt.
const trips = [
  { id: 'a', employeeId: 'e1', date: '2026-11-03', km: 24, reimbursement: 84, purpose: 'duty', status: 'draft', from: 'Kontoret, Oslo', to: 'Bjølsen skole, Oslo' },
  { id: 'b', employeeId: 'e1', date: '2026-11-02', km: 12.5, reimbursement: 43.75, purpose: 'duty', status: 'submitted', projectName: 'Kai' },
  { id: 'c', employeeId: 'e1', date: '2026-10-20', km: 100, reimbursement: 350, purpose: 'duty', status: 'approved' },
  { id: 'd', employeeId: 'e1', date: '2026-10-21', km: 40, reimbursement: 0, purpose: 'private', status: 'approved' },
  { id: 'e', employeeId: 'e2', date: '2026-11-03', km: 500, reimbursement: 1750, purpose: 'duty', status: 'draft' },
  { id: 'f', employeeId: 'e1', date: '2025-12-30', km: 300, reimbursement: 1050, purpose: 'duty', status: 'approved' },
  { id: 'g', employeeId: 'e1', date: '2026-11-09', km: 10, purpose: 'duty' }, // fremtidig: teller ikke
];
const mil = mileageSummary(trips, { mine: new Set(['e1']), today: wed });
assert.equal(mil.monthKm, 36.5);
assert.equal(mil.monthAmount, 128);
assert.equal(mil.monthTrips, 2);
assert.equal(mil.yearKm, 136.5);
assert.equal(mil.drafts, 1);
assert.equal(mil.total, 5);
assert.deepEqual(mil.recent.map((t) => t.id), ['a', 'b', 'd']);
assert.equal(mil.recent[0].route, 'Kontoret → Bjølsen skole');
assert.equal(mil.recent[1].route, 'Kai');
assert.equal(mil.recent[0].draft, true);
assert.equal(mil.overLimit, false);
assert.equal(mileageSummary(trips, { today: wed }).monthKm, 536.5); // uten filter: alle
assert.equal(mileageSummary([], { today: wed }).yearRatio, 0);
assert.equal(mileageSummary([{ id: 'x', employeeId: 'e1', date: '2026-05-01', km: 6100, purpose: 'duty' }], { today: wed }).overLimit, true);
assert.equal(kmLabel(1234.56), '1\u00a0234,6 km');
assert.equal(kmLabel(12), '12 km');
assert.equal(krLabel(1092.4), '1\u00a0092 kr');

console.log('proHome.test.mjs: ok');
