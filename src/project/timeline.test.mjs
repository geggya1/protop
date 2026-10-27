import assert from 'node:assert/strict';
import {
  activitySegments,
  formatDay,
  hoursRangeFor,
  isoDay,
  monthWindow,
  plannedSpan,
  projectWeekHours,
  quarterBands,
  shiftAnchor,
  spanPlacement,
  spanSourceLabel,
  timelineRows,
  timelineStats,
  windowRange,
  xForDay,
} from './timeline.js';

// Datoer fra skjema og import.
assert.equal(isoDay('2026-03-01'), '2026-03-01');
assert.equal(isoDay('2026-03-01T10:00:00Z'), '2026-03-01');
assert.equal(isoDay('1.3.2026'), '2026-03-01');
assert.equal(isoDay('31.02.2026'), '');
assert.equal(isoDay('snart'), '');
assert.equal(isoDay(''), '');
assert.equal(formatDay('2026-03-01'), '01.03.2026');

// Prosjektets egne datoer vinner, avtalen fyller resten.
const contracts = [
  {
    id: 'k1',
    title: 'Rammeavtale byggeledelse',
    projectId: 'p1',
    start: '2025-01-01',
    end: '2026-12-31',
    renewal: { type: 'opsjon', until: '2028-12-31' },
  },
  {
    id: 'k2',
    title: 'Oppdrag',
    fields: { startDate: '01.06.2026', endDate: '30.09.2026' },
  },
];
const fromContract = plannedSpan({ id: 'p1' }, contracts);
assert.equal(fromContract.start, '2025-01-01');
assert.equal(fromContract.end, '2026-12-31');
assert.equal(fromContract.optionEnd, '2028-12-31');
assert.equal(fromContract.contractTitle, 'Rammeavtale byggeledelse');
assert.equal(spanSourceLabel(fromContract), 'Avtale');

const mixed = plannedSpan({ id: 'p1', start: '15.02.2025' }, contracts);
assert.equal(mixed.start, '2025-02-15');
assert.equal(mixed.end, '2026-12-31');
assert.equal(spanSourceLabel(mixed), 'Prosjekt og avtale');

const viaContractId = plannedSpan({ id: 'p2', contractId: 'k2' }, contracts);
assert.equal(viaContractId.start, '2026-06-01');
assert.equal(viaContractId.end, '2026-09-30');
assert.equal(viaContractId.optionEnd, '');

const own = plannedSpan({ id: 'p3', start: '2026-01-01', end: '2026-02-01' }, contracts);
assert.equal(spanSourceLabel(own), 'Prosjekt');
assert.equal(plannedSpan({ id: 'p4', start: '2026-05-01', end: '2026-01-01' }).end, '', 'slutt før start ignoreres');
assert.equal(spanSourceLabel(plannedSpan({ id: 'p5' })), '');

const noRenewal = plannedSpan({ id: 'p6', contractId: 'k3' }, [
  { id: 'k3', start: '2026-01-01', end: '2026-06-30', renewal: { type: 'ingen', until: '2027-01-01' } },
]);
assert.equal(noRenewal.optionEnd, '', 'ingen fornyelse gir ingen opsjon');

// Månedsvindu og plassering.
const months = monthWindow('2026-10-27', 12);
assert.equal(months.length, 12);
assert.equal(months[0].key, '2026-04');
assert.equal(months[11].key, '2027-03');
assert.deepEqual(windowRange(months), { from: '2026-04-01', to: '2027-03-31' });
assert.equal(monthWindow('2026-01-15', 3, 1)[0].key, '2025-12');
assert.equal(shiftAnchor('2026-11-20', 3), '2027-02-01');
assert.equal(shiftAnchor('2026-01-20', -1), '2025-12-01');
assert.deepEqual(
  quarterBands(months).map((row) => [row.label, row.span]),
  [['Q2 2026', 3], ['Q3 2026', 3], ['Q4 2026', 3], ['Q1 2027', 3]],
);
assert.equal(xForDay('2026-04-01', months, 30), 0);
assert.equal(xForDay('2026-05-01', months, 30), 30);
assert.equal(xForDay('2026-04-16', months, 30), 15);

const whole = spanPlacement('2026-05-01', '2026-06-30', months, 30);
assert.deepEqual(whole, { left: 30, width: 60, openStart: false, openEnd: false });
const clipped = spanPlacement('2025-01-01', '2030-12-31', months, 30);
assert.deepEqual(clipped, { left: 0, width: 360, openStart: true, openEnd: true });
assert.equal(spanPlacement('2020-01-01', '2020-12-31', months, 30), null);
assert.equal(spanPlacement('2026-05-01', '', months, 30), null);

// Timer per uke. projectId først, prosjektnummer når id mangler.
const projects = [
  { id: 'p1', number: '1001', name: 'Skole', client: 'Sandnes kommune', projectStatus: 'Under arbeid' },
  { id: 'p2', number: '1002', name: 'Bru', contractId: 'k2' },
  { id: 'p3', number: '1003', name: 'Ferdig', phase: 'avsluttet', start: '2025-01-01', end: '2025-06-30' },
  { id: 'p4', number: '1004', name: 'Arkiv', status: 'arkivert' },
];
const entries = [
  { projectId: 'p1', date: '2026-10-19', hours: '7,5' },
  { projectId: 'p1', date: '2026-10-20', hours: 8 },
  { projectId: '', projectNumber: '1001', date: '2026-10-26', hours: 40 },
  { projectId: 'p1', date: '2026-09-01', hours: 4 },
  { projectId: 'p2', date: '2026-10-27', hours: 0 },
  { projectId: 'ukjent', date: '2026-10-27', hours: 5 },
  { projectId: 'p1', date: '2026-11-02', hours: 9 },
];
const hours = projectWeekHours(entries, projects, { to: '2026-10-27' });
assert.equal(hours.get('p1').weeks.get('2026-10-19'), 15.5);
assert.equal(hours.get('p1').weeks.get('2026-10-26'), 40);
assert.equal(hours.get('p1').total, 59.5);
assert.equal(hours.get('p1').first, '2026-09-01');
assert.equal(hours.get('p1').last, '2026-10-26');
assert.equal(hours.has('p2'), false);
assert.equal(hours.has('ukjent'), false);

const segments = activitySegments(hours.get('p1').weeks, months, 30, { fullWeekHours: 40, today: '2026-10-27' });
assert.equal(segments.length, 3, 'ulike fargetrinn gir egne biter');
assert.equal(segments[2].tone.id, 's5', '40 t er en full uke');
assert.ok(segments.every((row) => row.left >= 0 && row.width > 0));
const sameTone = activitySegments(new Map([['2026-10-12', 20], ['2026-10-19', 20]]), months, 30, { fullWeekHours: 40 });
assert.equal(sameTone.length, 1, 'like uker etter hverandre slås sammen');
assert.equal(sameTone[0].weeks, 2);
assert.equal(sameTone[0].hours, 40);
assert.deepEqual(segments.map((row) => [row.joinLeft, row.joinRight]), [[false, false], [false, true], [true, false]], 'uker etter hverandre henger sammen');
assert.deepEqual(activitySegments(new Map(), months, 30), []);

// Rader og nøkkeltall.
const rows = timelineRows({ projects, contracts, timeEntries: entries, today: '2026-10-27' });
assert.deepEqual(rows.active.map((row) => row.id), ['p1', 'p2']);
assert.deepEqual(rows.inactive.map((row) => row.id), ['p3', 'p4']);
assert.equal(rows.active[0].label, '1001 Skole');
assert.equal(rows.active[0].phase, 'Pågående');
assert.equal(rows.active[0].recentHours, 55.5);
assert.equal(rows.inactive[1].phase, 'Arkivert');
assert.deepEqual(
  timelineRows({ projects, contracts, query: 'sandnes' }).active.map((row) => row.id),
  ['p1'],
);

const stats = timelineStats(rows.active, '2026-10-27');
assert.deepEqual(stats, { active: 2, working: 1, endingSoon: 1, missing: 0 });

assert.deepEqual(hoursRangeFor(months, '2026-10-27'), { fromDate: '2026-04-01', toDate: '2026-10-27' });
assert.deepEqual(hoursRangeFor(monthWindow('2027-06-01', 12, 0), '2026-10-27'), { fromDate: '2026-09-28', toDate: '2026-10-27' });

console.log('timeline.test.mjs: ok');
