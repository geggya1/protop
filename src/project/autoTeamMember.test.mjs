import assert from 'node:assert/strict';
import { emptyProjectState, upsertTimeEntry } from './engine.js';

// Den som fører timer på et prosjekt, blir automatisk deltaker i teamet.
const base = { ...emptyProjectState(), projects: [{ id: 'p1', number: '10374', name: 'Foss Eikeland', status: 'aktiv' }] };
const first = upsertTimeEntry(base, {
  projectId: 'p1', employeeId: 'dw', employeeName: 'Daniel Wold', date: '2026-10-20', hours: 2, description: 'Befaring',
});
assert.equal(first.ok, true, first.error);
const members = first.state.members.filter((row) => row.projectId === 'p1');
assert.equal(members.length, 1);
assert.equal(members[0].employeeId, 'dw');
assert.equal(members[0].role, 'Prosjektmedlem');

// Ny føring gir ikke dobbel deltaker.
const second = upsertTimeEntry(first.state, {
  projectId: 'p1', employeeId: 'dw', employeeName: 'Daniel Wold', date: '2026-10-21', hours: 1, description: 'Møte',
});
assert.equal(second.state.members.filter((row) => row.projectId === 'p1').length, 1);

console.log('autoTeamMember.test.mjs: ok');
