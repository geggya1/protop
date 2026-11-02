import assert from 'node:assert/strict';
import {
  dayRibbon, durationLabel, daySentence, weekBars, focusState, clockLabel, nextHoliday, countdowns,
  parseAmount, vatSplit, moneyLabel, awayToday, celebrations, tenderPeek, approvalSummary, myReportsSummary,
} from './proHomeMore.js';

// Onsdag 4. november 2026 kl. 10:15.
const wed = new Date(2026, 10, 4, 10, 15);

// Dagsbåndet: 07–17, avtaler som blokker, «nå» som strek.
const rib = dayRibbon([
  { id: 'a', time: '08:00', end: '09:00', title: 'Byggemøte' },
  { id: 'b', time: 'Heldag', title: 'Messe' },
  { id: 'c', time: '13:00', title: 'Befaring' },
], { now: wed });
assert.equal(rib.blocks.length, 2);
assert.equal(rib.allDay, 1);
assert.equal(rib.from, 7 * 60);
assert.equal(rib.to, 17 * 60);
assert.equal(rib.blocks[0].from, 0.1);
assert.equal(rib.blocks[1].to, 0.7); // uten slutt: én time
assert.ok(rib.nowRatio > 0.32 && rib.nowRatio < 0.33);
assert.equal(rib.busyMin, 120);
assert.equal(rib.freeMin, 480);
// Kveldsmøte utvider båndet.
assert.equal(dayRibbon([{ time: '18:30', end: '20:00' }], { now: wed }).to, 20 * 60);
assert.equal(dayRibbon([], { now: new Date(2026, 10, 4, 22) }).nowRatio, null);

assert.equal(durationLabel(45), '45 min');
assert.equal(durationLabel(120), '2 t');
assert.equal(durationLabel(210), '3 t 30 min');
assert.equal(daySentence({ events: 2, freeMin: 300, openTasks: 3 }), '2 avtaler i dag, 5 t ledig. 3 oppgaver åpne.');
assert.equal(daySentence({ events: 0, overdue: 1, focusTomorrow: true }), 'Ingen avtaler i morgen. Én oppgave har forfalt.');
assert.equal(daySentence({}), 'Ingen avtaler i dag.');

// Uka: ingen datotall, helgen bare når den har avtaler.
const wk = weekBars({ '2026-11-02': 1, '2026-11-05': 3, '2026-11-06': 0 }, wed);
assert.equal(wk.days.length, 5);
assert.ok(wk.days.every((d) => !('date' in d)));
assert.equal(wk.headline, 'Travlest torsdag');
assert.equal(wk.left, 3);
assert.equal(wk.hint, '2 ledige dager igjen'); // onsdag (i dag) og fredag
assert.equal(weekBars({ '2026-11-04': 1, '2026-11-05': 2 }, wed).hint, 'Fredag er ledig');
assert.equal(weekBars({ '2026-11-07': 1 }, wed).days.length, 7);
assert.equal(weekBars({}, wed).headline, 'Ingen avtaler denne uka');

// Fokusøkt.
const t0 = Date.UTC(2026, 10, 4, 9, 0);
assert.equal(focusState(null).running, false);
const run = focusState({ startedAt: t0, minutes: 25 }, t0 + 5 * 60000);
assert.equal(run.running, true);
assert.equal(run.label, '20:00');
assert.ok(Math.abs(run.ratio - 0.2) < 1e-9);
assert.equal(focusState({ startedAt: t0, minutes: 25 }, t0 + 26 * 60000).done, true);
assert.equal(focusState({ startedAt: t0, minutes: 25, pausedLeftMs: 60000 }).paused, true);
assert.equal(clockLabel(65000), '1:05');
assert.equal(clockLabel(3723000), '1:02:03');

// Nedtelling.
const hol = nextHoliday(wed);
assert.equal(hol.name, '1. juledag');
assert.equal(hol.date, '2026-12-25');
assert.equal(hol.weekday, 'fredag');
assert.equal(nextHoliday(new Date(2026, 11, 27)).name, '1. Nyttårsdag');
const cd = countdowns(wed);
assert.equal(cd.workday.label, '5 t');
assert.equal(countdowns(new Date(2026, 10, 4, 14, 20)).workday.label, '1 t 40 min');
assert.equal(cd.weekend.now, false);
assert.equal(cd.weekend.label, '2 dager');
assert.equal(countdowns(new Date(2026, 10, 7, 12)).weekend.now, true);
assert.equal(countdowns(new Date(2026, 10, 6, 17)).weekend.now, true);
assert.equal(countdowns(new Date(2026, 10, 4, 20)).workday, null);

// Mva.
assert.equal(parseAmount('12 500,50'), 12500.5);
assert.equal(parseAmount('1.250'), 1250);
assert.equal(parseAmount('kr 99'), 99);
assert.deepEqual(vatSplit(1000, 25, 'eks'), { net: 1000, vat: 250, gross: 1250 });
assert.deepEqual(vatSplit(1250, 25, 'inkl'), { net: 1000, vat: 250, gross: 1250 });
assert.deepEqual(vatSplit(100, 0, 'eks'), { net: 100, vat: 0, gross: 100 });
assert.equal(moneyLabel(12500.5), '12 500,50 kr');
assert.equal(moneyLabel(250), '250 kr');

// Fravær i dag: én rad per dag, sykdom skjules for andre.
const emps = [
  { id: 'e1', person: { firstName: 'Kari', lastName: 'Nordmann' } },
  { id: 'e2', person: { firstName: 'Ola', lastName: 'Hansen' } },
  { id: 'e3', person: { firstName: 'Per', lastName: 'Berg' } },
];
const away = awayToday([
  { employeeId: 'e1', date: '2026-11-04', type: 'ferie' },
  { employeeId: 'e1', date: '2026-11-05', type: 'ferie' },
  { employeeId: 'e1', date: '2026-11-06', type: 'ferie' },
  { employeeId: 'e2', date: '2026-11-04', type: 'egenmelding' },
  { employeeId: 'e3', date: '2026-11-04', type: 'sykemelding' },
  { employeeId: 'e3', date: '2026-11-03', type: 'sykemelding' },
], emps, { todayKey: '2026-11-04', meId: 'e3' });
assert.equal(away.count, 3);
assert.equal(away.people[0].name, 'Per Berg'); // meg først
assert.equal(away.people[0].kind, 'Sykmeldt');
assert.equal(away.people.find((p) => p.id === 'e2').kind, 'Borte');
assert.equal(away.people.find((p) => p.id === 'e2').back, 'Tilbake i morgen');
assert.equal(away.people.find((p) => p.id === 'e1').back, 'Tilbake mandag');
assert.equal(away.people.find((p) => p.id === 'e1').initials, 'KN');

// Jubileer og nye.
const cel = celebrations([
  { id: 'a', person: { firstName: 'Anne' }, company: { periodFrom: '2021-11-20' } },
  { id: 'b', person: { firstName: 'Bjørn' }, company: { periodFrom: '2026-10-20' } },
  { id: 'c', person: { firstName: 'Cato' }, company: { periodFrom: '2019-03-01' } },
  { id: 'd', person: { firstName: 'Dina' }, company: { periodFrom: '2016-11-04' } },
  { id: 'e', person: { firstName: 'Eli' }, company: { periodFrom: '2010-11-10', periodTo: '2025-01-01' } },
], { today: wed });
assert.deepEqual(cel.items.map((i) => i.name), ['Bjørn', 'Dina', 'Anne']);
assert.equal(cel.items[1].label, '10 år i bedriften i dag');
assert.equal(cel.items[1].round, true);
assert.equal(cel.items[2].label, '5 år i bedriften om 16 dager');
assert.equal(cel.items[0].kind, 'new');

// Anbud: fulgte frister og nye treff, nærmeste frist først.
const tp = tenderPeek({
  notices: [
    { id: 'n1', title: 'Rehabilitering skole', decision: 'aktuell', deadline: '2026-11-06' },
    { id: 'n2', title: 'Ny barnehage', decision: 'ubestemt', publishedAt: '2026-11-02', deadline: '2026-11-30' },
    { id: 'n3', title: 'Gammel', decision: 'ubestemt', publishedAt: '2026-10-01', deadline: '2026-11-20' },
    { id: 'n4', title: 'Forkastet', decision: 'forkastet', publishedAt: '2026-11-03' },
    { id: 'n5', title: 'Utløpt', decision: 'tilbud', deadline: '2026-11-01' },
  ],
}, { today: wed });
assert.equal(tp.fresh, 1);
assert.equal(tp.following, 1);
assert.deepEqual(tp.rows.map((r) => r.id), ['n1', 'n2']);
assert.equal(tp.rows[0].leftLabel, '2 dager');
assert.equal(tp.rows[0].urgent, true);
assert.equal(tp.rows[0].status, 'Aktuell');
assert.equal(tenderPeek(null).rows.length, 0);

// Godkjenning.
const ap = approvalSummary([
  { employeeId: 'e1', hours: 7.5 },
  { employeeId: 'e1', hours: '7,5' },
  { employeeId: 'e2', hours: 4 },
  { employeeId: 'e2', hours: 8, status: 'godkjent' },
  { employeeId: 'e3', hours: 8, status: 'låst' },
], emps);
assert.equal(ap.count, 2);
assert.equal(ap.hours, 19);
assert.equal(ap.people[0].name, 'Kari Nordmann');
assert.equal(ap.people[0].hours, 15);

// Mine RUH.
const rep = myReportsSummary([
  { id: 'r1', title: 'Løs rekkverk', state: 'lukket', reportedAt: '2026-10-01T10:00:00Z' },
  { id: 'r2', title: 'Glatt trapp\nmer tekst', state: 'tiltak', reportedAt: '2026-10-20T10:00:00Z' },
  { id: 'r3', title: 'Mangler verneutstyr', state: 'registrert', reportedAt: '2026-11-02T10:00:00Z' },
]);
assert.equal(rep.open, 2);
assert.deepEqual(rep.items.map((r) => r.id), ['r3', 'r2', 'r1']);
assert.equal(rep.items[1].title, 'Glatt trapp');
assert.equal(rep.items[1].statusLabel, 'Tiltak');

console.log('proHomeMore ok');
