import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatHours, parseHours, sumHours } from './hours.js';
import { buildMonthGrid, isoWeek, shortDayLabel, toDateKey } from './calendar.js';
import {
  addAbsence,
  addProjectMember,
  createProject,
  emptyProjectState,
  healOrphanProjectRefs,
  importTimeEntries,
  mergeProjectStates,
  normalizeProjectState,
  projectsForEmployee,
  upsertTimeEntry,
  deleteTimeEntry,
  projectTimeSummary,
} from '../project/engine.js';

function entryKey(projectId, date) {
  return `${projectId}|${date}`;
}

/** Same lookup path as ArbeidScreen grid cells. */
function gridHoursForMonth(state, employeeId, monthPrefix) {
  const fromDate = `${monthPrefix}-01`;
  const toDate = `${monthPrefix}-31`;
  const myProjects = projectsForEmployee(state, employeeId, {
    fromDate,
    toDate,
    includeHourProjects: true,
  });
  const entriesByCell = new Map();
  for (const row of state.timeEntries) {
    if (row.employeeId !== employeeId) continue;
    const key = entryKey(row.projectId, row.date);
    const prev = entriesByCell.get(key);
    if (!prev) entriesByCell.set(key, { ...row });
    else {
      entriesByCell.set(key, {
        ...prev,
        hours: parseHours(prev.hours) + parseHours(row.hours),
      });
    }
  }
  let gridHours = 0;
  const cells = [];
  for (const project of myProjects) {
    for (const [key, cell] of entriesByCell) {
      if (!key.startsWith(`${project.id}|`)) continue;
      const date = key.slice(project.id.length + 1);
      if (!date.startsWith(monthPrefix)) continue;
      const hours = parseHours(cell.hours);
      gridHours += hours;
      cells.push({
        projectId: project.id,
        projectNumber: project.number,
        date,
        hours,
        description: cell.description,
      });
    }
  }
  return { myProjects, gridHours, cells, entriesByCell };
}

assert.equal(parseHours('8:00'), 8);
assert.equal(parseHours('1:30'), 1.5);
assert.equal(parseHours('-2:00'), -2);
assert.equal(formatHours(8), '8:00');
assert.equal(formatHours(1.5), '1:30');
assert.equal(formatHours(8, { signed: true }), '+8:00');
assert.equal(sumHours([{ hours: 2 }, { hours: '1:30' }]), 3.5);

const grid = buildMonthGrid(2026, 9); // oktober
assert.equal(grid.days.length, 31);
assert.equal(grid.days[0].weekday, 'to'); // 1. okt 2026 er torsdag
assert.ok(grid.weeks.some((w) => w.week === 40));
assert.equal(toDateKey(new Date(2026, 9, 8)), '2026-10-08');
assert.equal(isoWeek(new Date(2026, 9, 8)), 41);
assert.equal(shortDayLabel('2026-10-09'), '9 okt');

let state = emptyProjectState();
state = createProject(state, {
  name: 'Foss Eikeland',
  number: '10374',
  client: 'Mg Næring',
  manager: 'Geir',
  pricingModel: 'hourly',
}).state;
const projectId = state.activeProjectId;

state = addProjectMember(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Geir Ove Andersen',
  role: 'Prosjektleder',
}).state;
assert.equal(state.members.length, 1);
assert.equal(projectsForEmployee(state, 'emp1').length, 1);
assert.equal(projectsForEmployee(state, 'emp2').length, 0);

state = upsertTimeEntry(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Geir Ove Andersen',
  date: '2026-10-08',
  hours: 8,
  description: 'Oppfølging på byggeplass',
}).state;
assert.equal(state.timeEntries.length, 1);
assert.ok(state.activities.some((row) => row.name === 'Hovedaktivitet'));
assert.equal(state.projects.find((p) => p.id === projectId).hoursPeriod, 8);
assert.equal(projectTimeSummary(state, projectId).hours, 8);

const entryId = state.timeEntries[0].id;
state = upsertTimeEntry(state, {
  id: entryId,
  projectId,
  employeeId: 'emp1',
  date: '2026-10-08',
  hours: 4,
  description: 'Halv dag',
}).state;
assert.equal(state.timeEntries[0].hours, 4);

state = deleteTimeEntry(state, entryId).state;
assert.equal(state.timeEntries.length, 0);

state = addAbsence(state, {
  employeeId: 'emp1',
  employeeName: 'Geir Ove Andersen',
  date: '2026-10-09',
  hours: 7.5,
  type: 'ferie',
}).state;
assert.equal(state.absences.length, 1);

// Self-join prosjekt
state = createProject(state, {
  name: 'Åpent',
  number: '200',
  workSettings: { allowSelfJoin: true, showInAllTimesheets: false },
}).state;
assert.equal(projectsForEmployee(state, 'emp1', { includeJoinable: true }).length, 2);
state.projects = state.projects.map((project) => (
  project.number === '10374'
    ? { ...project, workSettings: { ...(project.workSettings || {}), showInAllTimesheets: true } }
    : project
));
assert.equal(projectsForEmployee(state, 'emp2').length, 1);
assert.equal(projectsForEmployee(state, 'emp2', { assignedOnly: true }).length, 0);
assert.equal(projectsForEmployee(state, 'emp1', { assignedOnly: true }).length, 1);

const left = emptyProjectState();
const right = {
  ...state,
  syncedAt: '2026-10-08T12:00:00.000Z',
};
const merged = mergeProjectStates(left, right);
assert.ok(merged.projects.length >= 2);
assert.ok(merged.members.length >= 1);

{
  const arbeidSrc = readFileSync(new URL('../../screens/arbeid/ArbeidScreen.jsx', import.meta.url), 'utf8');
  assert.match(arbeidSrc, /TimesheetDayView/);
  assert.match(arbeidSrc, /Lønnsgrunnlag|arbeid-phone-timeliste/);
  assert.match(arbeidSrc, /includeHourProjects:\s*true/);
  assert.match(arbeidSrc, /fromDate:\s*monthFromDate/);
  assert.match(arbeidSrc, /hoursRangeCovered/);
  assert.match(arbeidSrc, /timesheetHourWindows/);
  assert.doesNotMatch(arbeidSrc, /visible=\{!ready \|\| hoursLoading\}/);
  const economySrc = readFileSync(new URL('../../screens/economy/EconomyHours.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(economySrc, /visible=\{busy \|\| loadingHours\}/);
  assert.match(economySrc, /visible=\{busy\}/);
  assert.match(economySrc, /TimesheetDayView/);
  assert.match(economySrc, /Arbeid \/ Timerapport/);
  assert.match(economySrc, /economy-employee-name/);
  assert.match(economySrc, /economy-employee-picker-search/);
  assert.doesNotMatch(economySrc, /statusChips/);
  assert.match(economySrc, /HoursOrganizePanel/);
  assert.match(economySrc, /TimeEntryModal/);
  assert.match(economySrc, /openEntry/);
  assert.match(economySrc, /nativeID=\{row\?\.id \? `hour-row-\$\{row\.id\}` : undefined\}/);
  assert.match(economySrc, /HoursImportReview/);
  assert.match(economySrc, /importReadyCount/);
  const hourImportUi = readFileSync(new URL('../../components/arbeid/HoursImportReview.jsx', import.meta.url), 'utf8');
  assert.match(hourImportUi, /hour-import-ok-table/);
  assert.match(hourImportUi, /hour-import-actions/);
  const dayViewSrc = readFileSync(new URL('../../components/arbeid/TimesheetDayView.jsx', import.meta.url), 'utf8');
  assert.match(dayViewSrc, /Lønnsgrunnlag/);
  assert.match(dayViewSrc, /TimesheetProjectRow/);
}

// Orphan projectId after dedupe: heal via projectNumber so grid cells resolve.
{
  const raw = {
    ...emptyProjectState(),
    projects: [
      {
        id: 'proj-keeper',
        number: '10374',
        name: 'Foss Eikeland',
        client: 'Mg',
        status: 'aktiv',
        updatedAt: '2026-08-01T00:00:00.000Z',
        workSettings: {},
      },
      {
        id: 'proj-stale',
        number: '10374',
        name: 'Foss Eikeland (old)',
        client: 'Mg',
        status: 'aktiv',
        updatedAt: '2026-01-01T00:00:00.000Z',
        workSettings: {},
      },
    ],
    members: [{
      id: 'mem-stale',
      projectId: 'proj-stale',
      employeeId: 'emp1',
      employeeName: 'Geir',
      role: 'Prosjektleder',
      active: true,
    }],
    timeEntries: [{
      id: 'tid-orphan',
      projectId: 'proj-stale',
      projectNumber: '10374',
      projectName: 'Foss Eikeland',
      employeeId: 'emp1',
      employeeName: 'Geir',
      date: '2026-07-15',
      hours: 188,
      billableHours: 188,
      description: 'Importert juli',
      status: 'registrert',
    }],
  };
  const normalized = normalizeProjectState(raw);
  assert.equal(normalized.projects.length, 1);
  assert.equal(normalized.projects[0].id, 'proj-keeper');
  assert.equal(normalized.timeEntries[0].projectId, 'proj-keeper');
  assert.equal(normalized.members[0].projectId, 'proj-keeper');
  const grid = gridHoursForMonth(normalized, 'emp1', '2026-07');
  assert.equal(grid.gridHours, 188);
  assert.equal(grid.cells.length, 1);
  assert.equal(grid.cells[0].description, 'Importert juli');
  assert.ok(grid.myProjects.some((p) => p.id === 'proj-keeper'));
}

// Hours without membership still surface in grid lookup for visible month.
{
  const raw = normalizeProjectState({
    ...emptyProjectState(),
    projects: [{
      id: 'proj-live',
      number: '20001',
      name: 'Uten medlemskap',
      client: 'X',
      status: 'aktiv',
      workSettings: { showInAllTimesheets: false, allowSelfJoin: false },
    }],
    members: [],
    timeEntries: [{
      id: 'tid-nomember',
      projectId: 'proj-live',
      projectNumber: '20001',
      employeeId: 'emp1',
      date: '2026-07-02',
      hours: 8,
      description: 'Import uten membership',
      status: 'registrert',
    }],
  });
  assert.equal(projectsForEmployee(raw, 'emp1', { includeHourProjects: false }).length, 0);
  const visible = projectsForEmployee(raw, 'emp1', {
    fromDate: '2026-07-01',
    toDate: '2026-07-31',
    includeHourProjects: true,
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'proj-live');
  const grid = gridHoursForMonth(raw, 'emp1', '2026-07');
  assert.equal(grid.gridHours, 8);
  assert.equal(grid.cells[0].description, 'Import uten membership');
}

// Direct heal helper + import membership path still works.
{
  let state = normalizeProjectState({
    ...emptyProjectState(),
    projects: [{
      id: 'proj-import',
      number: '30001',
      name: 'Import-mål',
      client: 'Y',
      status: 'aktiv',
      workSettings: { showInAllTimesheets: false },
    }],
  });
  const orphaned = {
    ...state,
    timeEntries: [{
      id: 'tid-x',
      projectId: 'missing-id',
      projectNumber: '30001',
      employeeId: 'emp1',
      date: '2026-07-04',
      hours: 3,
      description: 'Stale id',
      status: 'registrert',
    }],
  };
  const healed = healOrphanProjectRefs(orphaned);
  assert.equal(healed.timeEntries[0].projectId, 'proj-import');

  // projectId satt til prosjektnummer (uten projectNumber-felt) skal også heales.
  const byNumberId = healOrphanProjectRefs({
    ...state,
    timeEntries: [{
      id: 'tid-num',
      projectId: '30001',
      employeeId: 'emp1',
      date: '2026-07-05',
      hours: 4,
      description: 'Nummer som id',
      status: 'registrert',
    }],
  });
  assert.equal(byNumberId.timeEntries[0].projectId, 'proj-import');

  // Nummer i navnet (1882) skal treffe prosjektnummer 10001 når 1882 ikke er eget prosjekt.
  const myklebust = healOrphanProjectRefs({
    ...emptyProjectState(),
    projects: [{
      id: 'proj-myklebust',
      number: '10001',
      name: 'Myklebust CB6-12-13 (1882)',
      status: 'aktiv',
    }],
    timeEntries: [{
      id: 'tid-1882',
      projectId: '1882',
      projectNumber: '1882',
      projectName: 'Myklebust CB6-12-13 (1882)',
      employeeId: 'emp1',
      date: '2026-03-02',
      hours: 7.5,
      description: 'Produksjon',
      status: 'registrert',
    }, {
      id: 'tid-10001',
      projectId: '10001',
      projectNumber: '10001',
      employeeId: 'emp1',
      date: '2026-03-03',
      hours: 8,
      description: 'Produksjon',
      status: 'registrert',
    }],
  });
  assert.equal(myklebust.timeEntries[0].projectId, 'proj-myklebust');
  assert.equal(myklebust.timeEntries[0].projectNumber, '10001');
  assert.equal(myklebust.timeEntries[1].projectId, 'proj-myklebust');
  assert.equal(
    myklebust.timeEntries.reduce((sum, row) => sum + row.hours, 0),
    15.5,
  );

  // Et eget prosjekt med nummer 1882 skal beholde timene sine.
  const separate = healOrphanProjectRefs({
    ...emptyProjectState(),
    projects: [
      { id: 'proj-myklebust', number: '10001', name: 'Myklebust CB6-12-13 (1882)', status: 'aktiv' },
      { id: 'proj-1882', number: '1882', name: 'Annen sak', status: 'aktiv' },
    ],
    timeEntries: [{
      id: 'tid-own',
      projectId: '1882',
      projectNumber: '1882',
      employeeId: 'emp1',
      date: '2026-03-04',
      hours: 4,
      status: 'registrert',
    }],
  });
  assert.equal(separate.timeEntries[0].projectId, 'proj-1882');

  const imported = importTimeEntries(state, [{
    projectId: 'proj-import',
    projectNumber: '30001',
    employeeId: 'emp1',
    employeeName: 'Geir',
    date: '2026-07-03',
    hours: 7.5,
    description: 'Ny import',
  }]);
  assert.equal(imported.ok, true);
  assert.equal(imported.state.members.length, 1);
  const grid = gridHoursForMonth(imported.state, 'emp1', '2026-07');
  assert.equal(grid.gridHours, 7.5);
  assert.equal(grid.cells[0].description, 'Ny import');
}

console.log('hours.test.mjs: ok');
