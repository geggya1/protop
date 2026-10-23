import assert from 'node:assert/strict';
import { employeeNameKeys, myProjectIds } from './myProjects.js';

const daniel = { id: 'dw', person: { firstName: 'Daniel', middleName: 'Edvard', lastName: 'Wold' } };
const state = {
  projects: [
    { id: 'p1', manager: 'Geir Ove Andersen' },
    { id: 'p2', manager: 'Daniel Wold' },
    { id: 'p3', manager: '' },
    { id: 'p4', manager: 'Daniel Edvard Wold' },
    { id: 'p5' },
  ],
  members: [
    { projectId: 'p3', employeeId: 'dw' },
    { projectId: 'p1', employeeId: 'ar' },
    { projectId: 'p5', employeeId: 'dw', active: false },
  ],
  timeEntries: [{ projectId: 'p5', employeeId: 'dw', hours: 2 }],
};

assert.deepEqual([...employeeNameKeys(daniel)].sort(), ['daniel edvard wold', 'daniel wold']);
// Deltaker, prosjektleder (med og uten mellomnavn) og timer teller; andres prosjekter gjør ikke.
assert.deepEqual([...myProjectIds(state, daniel)].sort(), ['p2', 'p3', 'p4', 'p5']);
assert.equal(myProjectIds(state, null).size, 0);

console.log('myProjects.test.mjs: ok');
