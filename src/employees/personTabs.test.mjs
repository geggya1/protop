import assert from 'node:assert/strict';
import { employeeViewToTab, EMPLOYEE_DETAIL_TABS, PERSON_VIEWS, PERSON_FILL_VIEWS } from './personTabs.js';

assert.equal(employeeViewToTab('detail'), 'home');
assert.equal(employeeViewToTab('overview'), 'overview');
assert.equal(employeeViewToTab('hours'), 'hours');
assert.equal(employeeViewToTab('cv'), 'cv');

const ids = EMPLOYEE_DETAIL_TABS.map((tab) => tab.id);
assert.deepEqual(ids, [
  'home', 'overview', 'hours', 'report', 'files', 'absence', 'saldo', 'expenses', 'earnings', 'settings', 'cv',
]);

for (const id of ids) {
  if (id === 'home') assert.ok(PERSON_VIEWS.has('detail'));
  else assert.ok(PERSON_VIEWS.has(id));
}

for (const id of PERSON_FILL_VIEWS) assert.ok(PERSON_VIEWS.has(id));
assert.equal(PERSON_FILL_VIEWS.has('detail'), false);
assert.equal(PERSON_FILL_VIEWS.has('overview'), false);

console.log('personTabs.test.mjs: ok');
