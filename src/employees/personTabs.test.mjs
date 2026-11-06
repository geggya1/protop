import assert from 'node:assert/strict';
import {
  employeeTabViews, employeeViewToTab, normalizePersonView, settingsSection,
  EMPLOYEE_DETAIL_TABS, EMPLOYEE_SETTINGS_SUBS, EMPLOYEE_SUB_TABS, PERSON_VIEWS, PERSON_FILL_VIEWS, PERSON_VIEW_ALIASES,
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
assert.deepEqual(ids, ['home', 'todo', 'hours', 'absence', 'files', 'expenses', 'earnings', 'settings', 'cv']);
assert.deepEqual(EMPLOYEE_SUB_TABS.hours.map((tab) => tab.label), ['Timeliste', 'Timerapport', 'Timesaldo']);
assert.deepEqual(EMPLOYEE_SUB_TABS.absence.map((tab) => tab.label), ['Oversikt', 'Rapport']);
assert.deepEqual(employeeTabViews('hours'), ['hours', 'report', 'saldo']);
assert.deepEqual(employeeTabViews('home'), ['detail']);
assert.deepEqual(employeeTabViews('cv'), ['cv']);
// Innstillinger: Oversikt først, så seksjonene i fast rekkefølge.
assert.deepEqual(EMPLOYEE_SUB_TABS.settings.map((tab) => tab.label), [
  'Oversikt', 'Min profil', 'Personopplysninger', 'Pårørende', 'Ansettelsesforhold', 'Arbeidstid',
  'Timeføring og produktivitet', 'HMS og dokumentasjon', 'Konto og sikkerhet', 'Varslinger',
  'Tilgang og rettigheter', 'Administrasjon',
]);
assert.equal(employeeTabViews('settings')[0], 'settingsOverview');
for (const view of employeeTabViews('settings')) assert.equal(employeeViewToTab(view), 'settings');
for (const sub of EMPLOYEE_SUB_TABS.settings) assert.ok(sub.icon && sub.hint, sub.id);
for (const view of Object.keys(EMPLOYEE_SETTINGS_SUBS)) assert.ok(employeeTabViews('settings').includes(view), view);
// Tilgangsstyring leder tilbake til «settings»: det er Konto og sikkerhet.
assert.equal(settingsSection('settings').label, 'Konto og sikkerhet');
// Gamle undersider åpner seksjonen der innholdet står nå.
assert.equal(normalizePersonView('settingsRate'), 'settingsGeneral');
assert.equal(normalizePersonView('settingsPassword'), 'settings');
assert.equal(normalizePersonView('settingsLog'), 'settingsAdmin');
assert.equal(normalizePersonView('hours'), 'hours');
for (const old of Object.keys(PERSON_VIEW_ALIASES)) {
  assert.equal(employeeViewToTab(old), 'settings');
  assert.equal(PERSON_VIEWS.has(old), false, old);
}
assert.equal(settingsSection('settingsLog').id, 'settingsAdmin');
assert.equal(settingsSection('hours'), null);

// Alle views er dekket av en fane.
const covered = new Set(ids.flatMap((id) => employeeTabViews(id)));
for (const view of PERSON_VIEWS) assert.ok(covered.has(view), view);

for (const id of PERSON_FILL_VIEWS) assert.ok(PERSON_VIEWS.has(id));
assert.equal(PERSON_FILL_VIEWS.has('detail'), false);
assert.equal(PERSON_FILL_VIEWS.has('overview'), false);

console.log('personTabs.test.mjs: ok');
