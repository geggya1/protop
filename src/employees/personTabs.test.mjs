import assert from 'node:assert/strict';
import {
  employeeTabViews, employeeViewToTab, EMPLOYEE_DETAIL_TABS, EMPLOYEE_SETTINGS_SUBS, EMPLOYEE_SUB_TABS, PERSON_VIEWS, PERSON_FILL_VIEWS,
} from './personTabs.js';

assert.equal(employeeViewToTab('detail'), 'home');
assert.equal(employeeViewToTab('hours'), 'hours');
assert.equal(employeeViewToTab('report'), 'hours');
assert.equal(employeeViewToTab('saldo'), 'hours');
assert.equal(employeeViewToTab('absence'), 'absence');
// Oversikt (fraværsrapport) ligger under Fravær.
assert.equal(employeeViewToTab('overview'), 'absence');
assert.equal(employeeViewToTab('cv'), 'cv');

const ids = EMPLOYEE_DETAIL_TABS.map((tab) => tab.id);
assert.deepEqual(ids, ['home', 'hours', 'absence', 'files', 'expenses', 'earnings', 'settings', 'cv']);
assert.deepEqual(EMPLOYEE_SUB_TABS.hours.map((tab) => tab.label), ['Timeliste', 'Timerapport', 'Timesaldo']);
assert.deepEqual(EMPLOYEE_SUB_TABS.absence.map((tab) => tab.label), ['Oversikt', 'Rapport']);
assert.deepEqual(employeeTabViews('hours'), ['hours', 'report', 'saldo']);
assert.deepEqual(employeeTabViews('home'), ['detail']);
assert.deepEqual(employeeTabViews('cv'), ['cv']);
// Innstillinger: brukerinnstillingene er undersider i menyen øverst, etter Ansettelsesdata.
assert.deepEqual(EMPLOYEE_SUB_TABS.settings.map((tab) => tab.label), [
  'Ansettelsesdata', 'Generelt', 'Timepriser', 'Arbeidsforhold', 'Endre passord', 'Varslinger',
]);
assert.equal(employeeTabViews('settings')[0], 'settings');
for (const view of employeeTabViews('settings')) assert.equal(employeeViewToTab(view), 'settings');
assert.deepEqual(Object.keys(EMPLOYEE_SETTINGS_SUBS), employeeTabViews('settings').slice(1));

// Alle views er dekket av en fane.
const covered = new Set(ids.flatMap((id) => employeeTabViews(id)));
for (const view of PERSON_VIEWS) assert.ok(covered.has(view), view);

for (const id of PERSON_FILL_VIEWS) assert.ok(PERSON_VIEWS.has(id));
assert.equal(PERSON_FILL_VIEWS.has('detail'), false);
assert.equal(PERSON_FILL_VIEWS.has('overview'), false);

console.log('personTabs.test.mjs: ok');
