import assert from 'node:assert/strict';
import { scheduleFromPercent } from '../arbeid/schedule.js';
import {
  activeEmployees,
  addAllocation,
  allocationCovers,
  allocationInclusiveEnd,
  spanFromDates,
  companyWeekLoad,
  contractPercent,
  employeeCapacityHours,
  actualHoursForWeek,
  firstSlackWeek,
  kindOf,
  loadTone,
  freeCapacityPercent,
  freeCapacityTone,
  makeAllocation,
  intensityOf,
  percentFromPointerDelta,
  shareOfCapacity,
  weeklyAbsenceHours,
  planActivityFrom,
  planningRows,
  spanBetween,
  visibleWeekKeys,
  weeklyActualHours,
  actualWeekRuns,
  mondayKey,
  occupancy,
  packLanes,
  patchAllocation,
  placement,
  projectsForEmployee,
  rescaleWeekHours,
  shiftPreview,
  sizeFromHours,
  sizeFromPercent,
  weekKeys,
  weekMeta,
  weekSeries,
} from './plan.js';

{
  assert.equal(mondayKey('2026-10-16'), '2026-10-12');
  assert.equal(mondayKey('2026-10-12'), '2026-10-12');
  assert.equal(mondayKey('2026-10-18'), '2026-10-12');
  const meta = weekMeta('2026-10-12');
  assert.equal(meta.week, 42);
  assert.equal(meta.month, 'okt');
  assert.deepEqual(weekKeys('2026-10-14', 2), ['2026-10-12', '2026-10-19']);
}

{
  const size = sizeFromPercent(50, 37.5);
  assert.equal(size.hoursPerWeek, 18.8);
  assert.equal(size.percent, 50);
  const hours = sizeFromHours(15, 37.5);
  assert.equal(hours.percent, 40);
  assert.equal(hours.hoursPerWeek, 15);
}

{
  const people = [
    { id: 'a', company: { status: 'active', personnelKind: 'staff', workPercent: '80' } },
    { id: 'b', company: { status: 'active', personnelKind: 'external', workPercent: '' } },
    { id: 'c', company: { status: 'active', personnelKind: 'innleid', workPercent: '50' } },
    { id: 'd', company: { status: 'inactive', personnelKind: 'staff' } },
    { id: 'e', company: { status: 'leave', personnelKind: 'external' } },
  ];
  const active = activeEmployees(people);
  assert.deepEqual(active.map((row) => row.id), ['a', 'b', 'c']);
  assert.equal(kindOf(people[1]), 'external');
  assert.equal(contractPercent(people[0]), 80);
  assert.equal(contractPercent(people[1]), 100);
  assert.equal(contractPercent({ company: { workPercent: '0' } }), 0);
  assert.equal(employeeCapacityHours(people[0], 37.5), 30);
  assert.equal(employeeCapacityHours({ company: { workPercent: '0' } }, 40), 0);
  assert.equal(kindOf({ company: { personnelKind: 'external', accessLevel: 'ansatt' } }), 'staff');
  assert.equal(kindOf({ company: { personnelKind: 'staff', accessLevel: 'regnskap_ekstern' } }), 'external');
  assert.equal(kindOf({ company: { personnelKind: 'staff', accessLevel: 'ansatt_andre_avdelinger' } }), 'external');
  assert.equal(kindOf({ company: { personnelKind: 'innleid', accessLevel: 'innleie_ekstern' } }), 'innleid');
  const scheduled = {
    company: { workPercent: '50' },
    extras: { schedules: [{ from: '2020-01-01', custom: true, days: scheduleFromPercent(100, 8) }] },
  };
  assert.equal(employeeCapacityHours(scheduled, 40, '2026-10-12'), 40);
}

{
  const weeks = weekKeys('2026-10-12', 8);
  const alpha = makeAllocation({
    employeeId: 'a',
    project: { id: 'p1', name: 'Alpha', number: '100' },
    start: '2026-10-12',
    weeks: 4,
    percent: 60,
    weekHours: 37.5,
  });
  const dummy = makeAllocation({
    employeeId: 'a',
    source: 'dummy',
    name: 'Dummy',
    start: '2026-11-02',
    weeks: 3,
    percent: 40,
    weekHours: 37.5,
  });
  assert.equal(alpha.name, '100 Alpha');
  assert.equal(dummy.source, 'dummy');
  assert.equal(allocationCovers(alpha, '2026-10-26'), true);
  assert.equal(allocationCovers(alpha, '2026-11-09'), false);
  assert.equal(allocationCovers(dummy, '2026-11-09'), true);

  const employee = { id: 'a', company: { status: 'active', workPercent: '100' } };
  const mid = occupancy(employee, [alpha, dummy], '2026-11-02', 37.5);
  assert.equal(mid.percent, 100);
  assert.equal(mid.hours, 37.5);
  assert.equal(allocationCovers(alpha, '2026-11-02'), true);
  assert.equal(allocationCovers(alpha, '2026-11-09'), false);

  const early = occupancy(employee, [alpha], '2026-10-12', 37.5);
  assert.equal(early.ofContract, 60);
  assert.equal(loadTone(early.ofContract), 'ok');
  assert.equal(loadTone(110), 'over');
  assert.equal(freeCapacityPercent(20, 40), 50);
  assert.equal(freeCapacityPercent(-12, 40), 0);
  assert.equal(freeCapacityPercent(80, 40), 100);
  assert.equal(freeCapacityPercent(10, 0), 0);
  assert.equal(freeCapacityTone(80), 'over');
  assert.equal(freeCapacityTone(0), 'open');

  const full = { ...alpha, percent: 100, hoursPerWeek: 37.5 };
  const slack = firstSlackWeek(employee, [full], weeks, 37.5);
  assert.equal(slack.key, '2026-11-09');
  const alreadyOpen = firstSlackWeek(employee, [alpha], weeks, 37.5);
  assert.equal(alreadyOpen.key, '2026-10-12');

  const packed = packLanes([alpha, dummy], weeks);
  assert.equal(packed.laneCount, 2);
  const second = { ...dummy, id: 'other', start: '2026-10-12', weeks: 2 };
  const stacked = packLanes([alpha, second], weeks);
  assert.equal(stacked.laneCount, 2);
  assert.ok(placement(alpha, weeks));
}

{
  const people = [
    { id: 'a', company: { status: 'active', workPercent: '100' } },
    { id: 'b', company: { status: 'active', workPercent: '50' } },
  ];
  const rows = [
    makeAllocation({
      employeeId: 'a', project: { id: 'p', name: 'A' }, start: '2026-10-12', weeks: 2, percent: 100, weekHours: 37.5,
    }),
    makeAllocation({
      employeeId: 'b', project: { id: 'p', name: 'A' }, start: '2026-10-12', weeks: 1, percent: 50, weekHours: 37.5,
    }),
  ];
  const week = companyWeekLoad(people, rows, '2026-10-12', 37.5);
  assert.equal(week.capacity, 56.3);
  assert.equal(week.hours, 56.3);
  assert.equal(week.ofContract, 100);
  const series = weekSeries(people, rows, weekKeys('2026-10-12', 2), 37.5);
  assert.equal(series[1].hours, 37.5);
  assert.equal(series[1].ofContract, 66.6);
}

{
  const plan = addAllocation({ weekHours: 37.5, allocations: [] }, {
    employeeId: 'a',
    source: 'project',
    projectId: 'p1',
    name: 'Alpha',
    start: '2026-10-16',
    weeks: 4,
    mode: 'percent',
    percent: 25,
  });
  assert.equal(plan.allocations[0].start, '2026-10-12');
  assert.equal(plan.allocations[0].hoursPerWeek, 9.4);
  const moved = patchAllocation(plan, plan.allocations[0].id, { start: '2026-10-19', weeks: 6 });
  assert.equal(moved.allocations[0].start, '2026-10-19');
  assert.equal(moved.allocations[0].weeks, 6);
  assert.equal(allocationInclusiveEnd(plan.allocations[0]), '2026-11-08');
  assert.deepEqual(spanFromDates('2026-10-16', '2026-11-01'), { start: '2026-10-12', weeks: 3 });
  assert.deepEqual(spanFromDates('2026-10-20', '2026-10-21'), { start: '2026-10-19', weeks: 1 });
  assert.deepEqual(spanFromDates('2026-11-02', '2026-10-12'), { start: '2026-11-02', weeks: 1 });
  assert.equal(spanFromDates('ikke-en-dato', '2026-10-12'), null);
  const dated = patchAllocation(plan, plan.allocations[0].id, spanFromDates('2026-10-14', '2026-11-01'));
  assert.equal(dated.allocations[0].start, '2026-10-12');
  assert.equal(dated.allocations[0].weeks, 3);
  assert.equal(allocationInclusiveEnd(dated.allocations[0]), '2026-11-01');
  const hoursMode = patchAllocation(moved, moved.allocations[0].id, { hoursPerWeek: 7.5 });
  assert.equal(hoursMode.allocations[0].mode, 'hours');
  assert.equal(hoursMode.allocations[0].percent, 20);
  const resized = shiftPreview(hoursMode.allocations[0], 2, 'resize');
  assert.equal(resized.weeks, 8);
  const shifted = shiftPreview(hoursMode.allocations[0], -1, 'move');
  assert.equal(shifted.start, '2026-10-12');
  const scaled = rescaleWeekHours(hoursMode, 40);
  assert.equal(scaled.weekHours, 40);
  assert.equal(scaled.allocations[0].hoursPerWeek, 7.5);
  assert.equal(scaled.allocations[0].percent, 18.8);
}

{
  const projects = [
    { id: 'p1', name: 'Alpha', status: 'aktiv', phase: 'produksjon' },
    { id: 'p2', name: 'Ferdig', status: 'aktiv', phase: 'avsluttet' },
    { id: 'p3', name: 'Arkiv', status: 'arkivert', phase: 'produksjon' },
  ];
  const members = [
    { employeeId: 'a', projectId: 'p1', active: true },
    { employeeId: 'a', projectId: 'p2', active: true },
    { employeeId: 'b', projectId: 'p1', active: true },
  ];
  const mine = projectsForEmployee(projects, members, 'a');
  assert.deepEqual(mine.map((row) => row.id), ['p1']);
}

{
  assert.equal(planActivityFrom(new Date(2026, 9, 16)), '2026-07-16');
  assert.deepEqual(visibleWeekKeys('2026-10-12', 2, 2), [
    '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
  ]);
  const entries = [
    { employeeId: 'a', projectId: 'p1', date: '2026-10-14', hours: 7.5 },
    { employeeId: 'a', projectId: 'p1', date: '2026-10-15', hours: '1:30' },
    { employeeId: 'a', projectId: 'old', date: '2026-05-02', hours: 8 },
    { employeeId: 'b', projectId: 'p1', date: '2026-10-14', hours: 4 },
  ];
  const weeks = visibleWeekKeys('2026-10-12', 1, 1);
  const actual = weeklyActualHours(entries, 'a', weeks);
  assert.equal(actual.get('p1').get('2026-10-12'), 9);
  assert.equal(actual.has('old'), false);
  assert.equal(actualHoursForWeek(entries, 'a', '2026-10-14'), 9);
  const rows = planningRows({
    projects: [
      { id: 'p1', name: 'Alpha', number: '100' },
      { id: 'member', name: 'Bare medlem', number: '200' },
    ],
    allocations: [
      makeAllocation({
        employeeId: 'a',
        project: { id: 'plan', name: 'Planlagt', number: '300' },
        start: '2026-10-12',
        weeks: 2,
        percent: 40,
        weekHours: 40,
      }),
    ],
    timeEntries: [
      ...entries,
      { employeeId: 'a', projectId: 'p1', date: '2026-09-02', hours: 6.5, projectNumber: '100', projectName: 'Alpha' },
      { employeeId: 'a', projectId: 'ghost', date: '2026-09-10', hours: 3, projectNumber: '400', projectName: 'Uten kort' },
    ],
    employeeId: 'a',
    activityFrom: '2026-07-16',
  });
  assert.deepEqual(rows.map((row) => row.projectId), ['p1', 'plan', 'ghost']);
  assert.equal(rows.find((row) => row.projectId === 'p1').recentHours, 15.5);
  assert.equal(rows.find((row) => row.projectId === 'ghost').name, '400 Uten kort');
  const span = spanBetween(['2026-10-12', '2026-10-19', '2026-10-26'], 2, 0);
  assert.equal(span.start, '2026-10-12');
  assert.equal(span.weeks, 3);
  assert.equal(percentFromPointerDelta(50, -28), 60);
  assert.equal(percentFromPointerDelta(50, 28), 40);
  assert.equal(percentFromPointerDelta(50, 0), 50);
  assert.equal(shareOfCapacity(20, 40), 50);
  assert.equal(shareOfCapacity(16, 32), 50);
  assert.equal(intensityOf(20).id, 's1');
  assert.equal(intensityOf(21).id, 's2');
  assert.equal(intensityOf(100).id, 's5');
  assert.equal(intensityOf(130).id, 's6');
  assert.notEqual(intensityOf(15).color, intensityOf(90).color);
  const away = weeklyAbsenceHours([
    { employeeId: 'a', date: '2026-10-20', hours: 8, type: 'ferie' },
    { employeeId: 'a', date: '2026-10-21', hours: 8, type: 'ferie' },
    { employeeId: 'a', date: '2026-09-02', hours: 8, type: 'ferie' },
  ], 'a', weekKeys('2026-10-12', 3), '2026-10-16');
  assert.equal(away.get('2026-10-19').hours, 16);
  assert.equal(away.get('2026-10-19').type, 'ferie');
  assert.equal(away.has('2026-08-31'), false);
  const pastToo = weeklyAbsenceHours([
    { employeeId: 'a', date: '2026-10-20', hours: 8, type: 'ferie' },
    { employeeId: 'a', date: '2026-08-03', hours: 8, type: 'ferie' },
  ], 'a', ['2026-08-03', '2026-10-19']);
  assert.equal(pastToo.get('2026-08-03').type, 'ferie');
  assert.equal(pastToo.get('2026-10-19').hours, 8);
  const produced = new Map([
    ['2026-08-31', 4],
    ['2026-09-07', 12],
    ['2026-09-21', 8],
    ['2026-09-28', 8],
  ]);
  const runs = actualWeekRuns(
    ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'],
    produced,
    '2026-09-21',
  );
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].weeks.map((week) => week.key), ['2026-08-31', '2026-09-07']);
  assert.equal(runs[0].startIndex, 0);
  assert.deepEqual(runs[1].weeks.map((week) => week.key), ['2026-09-21']);
  assert.equal(runs[1].startIndex, 3);
}
