import assert from 'node:assert/strict';
import {
  START_STEPS,
  hasOtherEmployees,
  showStartChecklist,
  startChecklist,
  startChecklistHiddenKey,
} from './startChecklist.js';

assert.deepEqual(
  START_STEPS.map((row) => row.label),
  ['Inviter ansatte', 'Legg inn kunder', 'Opprett første prosjekt', 'Før første time', 'Koble regnskap (PowerOffice)'],
);
for (const step of START_STEPS) {
  assert.equal(step.action?.type, 'tab', `${step.id} åpner en side`);
}

// Eieren alene teller ikke som «ansatte invitert».
const owner = { id: 'emp-eier', personUid: 'u1', company: { status: 'active' } };
assert.equal(hasOtherEmployees([owner], 'u1'), false);
assert.equal(hasOtherEmployees([owner, { id: 'emp-2', company: { status: 'active' } }], 'u1'), true);
assert.equal(hasOtherEmployees([owner, { id: 'emp-3', company: { status: 'ended' } }], 'u1'), false, 'sluttet teller ikke');

// Fersk bedrift: 0 av 5, og lista vises.
const fresh = startChecklist({
  employees: [owner], customers: [], projects: [], hasHours: false, accountingConnected: false, uid: 'u1',
});
assert.equal(fresh.done, 0);
assert.equal(fresh.progressLabel, '0 av 5');
assert.equal(fresh.ready, true);
assert.equal(showStartChecklist({ canSetup: true, checklist: fresh }), true);
assert.equal(showStartChecklist({ canSetup: false, checklist: fresh }), false, 'bare den som kan sette opp bedriften');
assert.equal(showStartChecklist({ canSetup: true, hidden: true, checklist: fresh }), false, 'kan skjules');

// Krysses av automatisk ut fra data.
const half = startChecklist({
  employees: [owner, { id: 'emp-2' }], customers: [{ id: 'c1' }], projects: [], hasHours: false, accountingConnected: false, uid: 'u1',
});
assert.equal(half.progressLabel, '2 av 5');
assert.deepEqual(half.items.map((row) => row.done), [true, true, false, false, false]);

// Alt gjort: forsvinner.
const all = startChecklist({
  employees: [owner, { id: 'emp-2' }], customers: [{ id: 'c1' }], projects: [{ id: 'p1' }], hasHours: true, accountingConnected: true, uid: 'u1',
});
assert.equal(all.complete, true);
assert.equal(showStartChecklist({ canSetup: true, checklist: all }), false);

// Mens noe lastes, vises ingenting (ingen blinking).
const loading = startChecklist({ employees: [owner], uid: 'u1' });
assert.equal(loading.ready, false);
assert.equal(showStartChecklist({ canSetup: true, checklist: loading }), false);

assert.equal(startChecklistHiddenKey('co1', 'u1'), 'protop.startChecklist.hidden.v1.co1.u1');

console.log('startChecklist.test.mjs ok');
