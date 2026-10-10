import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatHours, parseHours, sumHours } from './hours.js';
import { buildMonthGrid, isoWeek, shortDayLabel, toDateKey } from './calendar.js';
import {
  addAbsence,
  addProjectMember,
  createProject,
  emptyProjectState,
  mergeProjectStates,
  projectsForEmployee,
  upsertTimeEntry,
  deleteTimeEntry,
  projectTimeSummary,
} from '../project/engine.js';

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
  const economySrc = readFileSync(new URL('../../screens/economy/EconomyHours.jsx', import.meta.url), 'utf8');
  assert.match(economySrc, /TimesheetDayView/);
  assert.match(economySrc, /Økonomi \/ Timeliste/);
  const dayViewSrc = readFileSync(new URL('../../components/arbeid/TimesheetDayView.jsx', import.meta.url), 'utf8');
  assert.match(dayViewSrc, /Lønnsgrunnlag/);
  assert.match(dayViewSrc, /TimesheetProjectRow/);
}

console.log('hours.test.mjs: ok');
