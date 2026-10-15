import assert from 'node:assert/strict';
import { employeeViewToTab, EMPLOYEE_DETAIL_TABS, PERSON_VIEWS } from './personTabs.js';

assert.equal(employeeViewToTab('detail'), 'home');
assert.equal(employeeViewToTab('overview'), 'overview');
assert.equal(employeeViewToTab('hours'), 'hours');
assert.equal(employeeViewToTab('cv'), 'cv');

const ids = EMPLOYEE_DETAIL_TABS.map((tab) => tab.id);
assert.deepEqual(ids, [
  'home', 'overview', 'hours', 'report', 'files', 'absence', 'saldo', 'expenses', 'settings', 'cv',
]);

for (const id of ids) {
  if (id === 'home') assert.ok(PERSON_VIEWS.has('detail'));
  else assert.ok(PERSON_VIEWS.has(id));
}

console.log('personTabs.test.mjs: ok');
