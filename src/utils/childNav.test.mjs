import assert from 'node:assert/strict';
import {
  serialChild,
  childFromRouteParams,
  aiImportNavParams,
  childScheduleNavParams,
  lekserNavParams,
  klassenNavParams,
  paramBool,
} from './childNav.js';

assert.equal(serialChild(null), null);
assert.equal(serialChild('[object Object]'), null);
assert.deepEqual(serialChild({ id: 'c1', name: 'Celine' }), {
  id: 'c1',
  childId: 'c1',
  name: 'Celine',
});

assert.deepEqual(
  childFromRouteParams({ child: '[object Object]', childId: 'c1', childName: 'Celine' }),
  { id: 'c1', childId: 'c1', name: 'Celine' },
);

const nav = aiImportNavParams({
  familyId: 'f1',
  child: { id: 'c1', name: 'Celine', allowedApps: { chat: true } },
  autoStart: 'gallery',
  returnToSchedule: true,
});
assert.equal(nav.familyId, 'f1');
assert.equal(nav.childId, 'c1');
assert.equal(nav.childName, 'Celine');
assert.equal(nav.child, undefined);
assert.equal(nav.autoStart, 'gallery');
assert.equal(nav.returnToSchedule, true);

const homeworkNav = aiImportNavParams({
  familyId: 'f1',
  child: { id: 'c1', name: 'Celine' },
  autoStart: 'gallery',
  focusMode: 'homework',
  returnToHomework: true,
});
assert.equal(homeworkNav.focusMode, 'homework');
assert.equal(homeworkNav.returnToHomework, true);
assert.equal(homeworkNav.autoStart, 'gallery');

const lekser = lekserNavParams({ familyId: 'f1', child: { id: 'c1', name: 'Celine' }, canEdit: true });
assert.equal(lekser.canEdit, true);
assert.equal(lekser.childId, 'c1');

const sched = childScheduleNavParams({ familyId: 'f1', child: { childId: 'c1', name: 'Celine' }, canEdit: true });
assert.equal(sched.canEdit, true);
assert.equal(sched.childId, 'c1');

const klassen = klassenNavParams({ familyId: 'f1', child: { id: 'c1', name: 'Celine' } });
assert.equal(klassen.familyId, 'f1');
assert.equal(klassen.childId, 'c1');
assert.equal(klassen.childName, 'Celine');

assert.equal(paramBool('true', false), true);
assert.equal(paramBool(undefined, true), true);

console.log('childNav.test.mjs ok');
