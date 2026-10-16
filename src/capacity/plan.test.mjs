import assert from 'node:assert/strict';
import {
  activeEmployees,
  addAllocation,
  allocationCovers,
  companyWeekLoad,
  contractPercent,
  employeeCapacityHours,
  firstSlackWeek,
  kindOf,
  loadTone,
  makeAllocation,
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
  assert.equal(employeeCapacityHours(people[0], 37.5), 30);
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
      employeeId: 'a', project: { id: 'p', name: 'A' }, start: '2026-10-12', weeks: 2, percent: 100,
    }),
    makeAllocation({
      employeeId: 'b', project: { id: 'p', name: 'A' }, start: '2026-10-12', weeks: 1, percent: 50,
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
