import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPANY_BOTTOM_NAV,
  COMPANY_HOME_SHORTCUTS,
  companyGreetingHello,
  companyHomeName,
  companyHomeTaskRows,
  companyTaskBadge,
} from './model.js';

const afternoon = new Date(2026, 9, 14, 14, 5, 0);
const morning = new Date(2026, 9, 14, 9, 41, 0);
const evening = new Date(2026, 9, 14, 19, 0, 0);

assert.equal(companyGreetingHello(afternoon), 'God ettermiddag');
assert.equal(companyGreetingHello(morning), 'God morgen');
assert.equal(companyGreetingHello(evening), 'God kveld');
assert.equal(companyHomeName({ name: 'Geir Ove' }), 'Geir Ove');
assert.equal(companyHomeName({ displayName: 'Geir' }), 'Geir');

assert.equal(companyTaskBadge({ title: 'Godkjenne timeslister (3)' }), 3);
assert.equal(companyTaskBadge({ title: 'Utarbeide tilbud', badge: 2 }), 2);
assert.equal(companyTaskBadge({ title: 'Svar på e-post' }), 0);

const rows = companyHomeTaskRows([
  { id: 'a', title: 'Godkjenne timeslister (3)' },
  { id: 'b', title: 'Ferdig sak', done: true },
  { id: 'c', title: 'Utarbeide tilbud – Klepp TU' },
], afternoon, { uid: 'u1' }, {
  visibleToUser: () => true,
  visibleOnDate: (task) => task.id !== 'hidden',
  isOpen: (task) => task.done !== true,
});
assert.deepEqual(rows.map((row) => row.title), [
  'Godkjenne timeslister (3)',
  'Utarbeide tilbud – Klepp TU',
]);
assert.equal(rows[0].badge, 3);
assert.equal(rows[1].badge, 0);

assert.deepEqual(COMPANY_HOME_SHORTCUTS.map((row) => row.label), [
  'Timeføring', 'Fravær/Ferie', 'Gjøremål', 'Utlegg',
]);
const absenceShortcut = COMPANY_HOME_SHORTCUTS.find((row) => row.id === 'absence');
assert.equal(absenceShortcut.tab, 'ansatte');
assert.equal(absenceShortcut.subView, null);
assert.deepEqual(absenceShortcut.intent, { type: 'openMyAbsence' });
assert.deepEqual(COMPANY_BOTTOM_NAV.map((row) => row.label), [
  'Hjem', 'Prosjekter', 'Time', 'Oppgaver', 'Mer',
]);

const phoneHome = readFileSync(new URL('../../screens/project/CompanyHomePhone.jsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../../screens/project/CompanyLanding.jsx', import.meta.url), 'utf8');
const desktopLanding = readFileSync(new URL('../../screens/project/CompanyDesktopLanding.jsx', import.meta.url), 'utf8');
const bold = phoneHome.match(/fontWeight:\s*'700'/g) || [];
assert.equal(bold.length, 1);
assert.match(phoneHome, /Mine gjøremål/);
assert.match(phoneHome, /DashboardThemeSettings/);
assert.match(phoneHome, /item\.intent/);
assert.match(phoneHome, /company-home-sheet/);
assert.match(phoneHome, /minHeight: Math\.max\(160, frameHeight - topHeight\)/);
assert.match(phoneHome, /paddingBottom: contentPaddingBottom/);
assert.equal(phoneHome.includes('paddingBottom: contentPaddingBottom }]'), false);
assert.equal(phoneHome.includes('WidgetBoard'), false);
assert.equal(phoneHome.includes('onToggleEdit'), false);
assert.equal(landing.includes('CompanyHomePhone'), false);
assert.match(landing, /CompanyDesktopLanding/);
assert.match(landing, /innstillinger/);
assert.match(desktopLanding, /CompanyPublicProfile/);
assert.match(desktopLanding, /publicPage/);
const profilePage = readFileSync(new URL('../../components/project/CompanyPublicProfile.jsx', import.meta.url), 'utf8');
assert.match(profilePage, /company-landing-konsern/);
assert.match(profilePage, /Om bedriften/);
assert.match(profilePage, /Underenheter/);
assert.match(profilePage, /CompanyNewsWall/);
assert.match(profilePage, /Rediger side/);
assert.match(profilePage, /Nøkkelinformasjon/);
assert.equal(desktopLanding.includes('COMPANY_HOME_SHORTCUTS'), false);
assert.equal(desktopLanding.includes('Mine gjøremål'), false);

const employees = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(employees, /openMyAbsence/);
assert.match(employees, /openWork\(person, 'absence'\)/);
assert.match(employees, /requestShellTab\?\.\('arbeid', 'fravaer'\)/);

const parentHome = readFileSync(new URL('../../components/parentHome/ParentHomeThemeHost.jsx', import.meta.url), 'utf8');
assert.match(parentHome, /WidgetBoard/);
assert.match(parentHome, /canEdit/);
assert.match(parentHome, /onOpenBannerSettings/);

console.log('companyHome/model.test.mjs: ok');
