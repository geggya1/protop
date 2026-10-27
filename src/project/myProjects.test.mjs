import assert from 'node:assert/strict';
import {
  employeeNameKeys, myProjectIds, pickableProjects, sameEmployeeIds, teamWithHourParticipants,
} from './myProjects.js';

const daniel = { id: 'dw', person: { firstName: 'Daniel', middleName: 'Edvard', lastName: 'Wold', email: 'dew@consult1.no' } };
// Samme person i søsterselskap, annen id.
const danielSor = { id: 'dw-sor', person: { firstName: 'Daniel', lastName: 'Wold', email: 'DEW@consult1.no' } };
const anders = { id: 'ar', person: { firstName: 'Anders', lastName: 'Rolandsen', email: 'ar@consult1.no' } };
const employees = [daniel, danielSor, anders];

assert.deepEqual([...employeeNameKeys(daniel)].sort(), ['daniel edvard wold', 'daniel wold']);
assert.deepEqual([...sameEmployeeIds(employees, daniel)].sort(), ['dw', 'dw-sor']);

const state = {
  projects: [
    { id: 'p1', manager: 'Geir Ove Andersen' },
    { id: 'p2', manager: 'Daniel Wold' },
    { id: 'p3', manager: '' },
    { id: 'p4' },
    { id: 'p5' },
    { id: 'p6' },
    { id: 'p7' },
  ],
  members: [
    { projectId: 'p3', employeeId: 'dw' },
    { projectId: 'p1', employeeId: 'ar' },
    { projectId: 'p6', employeeId: 'dw', active: false },
    // Lagt inn med søsterselskapets id.
    { projectId: 'p7', employeeId: 'dw-sor' },
  ],
  timeEntries: [
    { projectId: 'p4', employeeId: 'dw-sor', hours: 2 },
    { projectId: 'p5', employeeId: 'ukjent-id', employeeName: 'Daniel Wold', hours: 1 },
  ],
};

// Deltaker, prosjektleder, timer og søsterselskapets id teller; andres prosjekter gjør ikke.
assert.deepEqual([...myProjectIds(state, daniel, employees)].sort(), ['p2', 'p3', 'p4', 'p5', 'p7']);
assert.equal(myProjectIds(state, null, employees).size, 0);

// Team: registrerte deltakere pluss de som har ført timer.
const team = teamWithHourParticipants(
  [{ id: 'm1', projectId: 'p1', employeeId: 'ar', employeeName: 'Anders Rolandsen' }],
  [
    { projectId: 'p1', employeeId: 'ar', hours: 3 },
    { projectId: 'p1', employeeId: 'dw', employeeName: 'Daniel Wold', hours: 2 },
    { projectId: 'p1', employeeId: 'dw', employeeName: 'Daniel Wold', hours: 1 },
    { projectId: 'p2', employeeId: 'x', hours: 1 },
  ],
  'p1',
);
assert.deepEqual(team.map((row) => row.employeeId), ['ar', 'dw']);
assert.equal(team[1].derived, true);
assert.equal(team[1].role, 'Har ført timer');

// Velgere: Admin på Prosjekt ser alle aktive. Lese ser egne og prosjekter som er åpnet for alle.
{
  const pick = {
    projects: [
      { id: 'egen', name: 'Egen' },
      { id: 'annen', name: 'Annen' },
      { id: 'apen', name: 'Åpen', workSettings: { showInAllTimesheets: true } },
      { id: 'gammel', name: 'Gammel', status: 'arkivert' },
    ],
    members: [{ projectId: 'egen', employeeId: 'ar', active: true }],
    timeEntries: [],
  };
  assert.deepEqual(pickableProjects(pick, anders, employees).map((p) => p.id), ['egen', 'apen']);
  assert.deepEqual(pickableProjects(pick, anders, employees, { all: true }).map((p) => p.id), ['egen', 'annen', 'apen']);
  assert.deepEqual(pickableProjects(pick, anders, employees, { keepId: 'annen' }).map((p) => p.id), ['egen', 'annen', 'apen']);
  // Uten kjent person: bare åpne prosjekter.
  assert.deepEqual(pickableProjects(pick, null, employees).map((p) => p.id), ['apen']);
}

console.log('myProjects.test.mjs: ok');
