import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rettighetene settes bare i Tilgangsstyring. Ansattsiden viser dem som oppsummering.
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const screen = read('../../screens/employees/EmployeesScreen.jsx');
const detail = read('../../screens/employees/EmployeeDetailView.jsx');
const account = read('../../screens/employees/EmployeeAccountView.jsx');
const platform = read('../../screens/project/ProjectPlatformScreen.jsx');
const accessPage = read('../../components/project/CompanyAccessSettings.jsx');

// Ingen avkrysning av nivåer på ansattsiden.
for (const [name, src] of [['EmployeeDetailView', detail], ['EmployeeAccountView', account]]) {
  assert.equal(/withToggledLevel/.test(src), false, name);
  assert.equal(/accessLevels:/.test(src), false, name);
  assert.equal(/employee-level-/.test(src), false, name);
}
assert.equal(/EmploymentChips/.test(detail), false);
// Ansettelsesdata har ikke konto eller rettigheter.
const employment = detail.slice(detail.indexOf('const employmentCard'), detail.indexOf("if (section === 'employment')"));
assert.equal(/Rettigheter|Deaktivert|Kan logge inn/.test(employment), false);
assert.match(employment, /label="Personell"/);

// Brukerkonto: aktiver/deaktiver, inviter med tidspunkt, rettigheter som oppsummering med lenke.
assert.match(account, /onClassify\?\.\(\{ status: 'active' \}\)/);
assert.match(account, /onClassify\?\.\(\{ status: 'inactive' \}\)/);
// «Kan logge inn» er ikke et eget valg (gjorde ingenting). Innlogging følger kobling og status.
assert.equal(/onClassify\?\.\(\{ canLogin/.test(account), false);
assert.match(account, /label="Kan logge inn"/);
assert.match(account, /nativeID="employee-account-invite-withdraw"/);
assert.match(account, /nativeID="employee-account-invite-send"/);
assert.match(account, /inviteTimeline\(employee\)/);
assert.match(account, /Rettighetene settes bare i Tilgangsstyring\./);
assert.match(screen, /onInvite=\{\(\) => inviteEmployee\(personEmployee\)\}/);
assert.match(screen, /onOpenAccess=\{canOpenAccessPage \? \(\) => openAccessPage\(personEmployee\) : undefined\}/);
// Tilgangsstyring åpnes på personen og leder tilbake til Brukerkonto.
assert.match(screen, /intent: \{ type: 'openEmployee', employeeId: row\.id, view: 'settings' \}/);
assert.match(screen, /\['absence', 'settings'\]\.includes\(shellIntent\.view\)/);
assert.match(platform, /requestShellTab\?\.\(returnTo\.tab, returnTo\.subView \|\| null, returnTo\.intent \|\| null\)/);
assert.match(platform, /focusEmployeeId=\{returnTo\?\.focusEmployeeId \|\| ''\}/);
assert.match(accessPage, /useState\(focusEmployeeId \? 'people' : initialMode\)/);

// Brukerloggen står alene på egen underside, ikke på hovedsiden.
assert.equal((screen.match(/<EmployeeUsagePanel/g) || []).length, 1);
assert.match(screen, /view === 'settingsLog' && selected \? \(\s*<EmployeeUsagePanel/);
// L-08: teksten følger selskapets valg og lagringstiden, ikke en fast tekst.
const usagePanel = read('../../screens/employees/EmployeeUsagePanel.jsx');
assert.match(usagePanel, /\{notice \|\| usageLogNotice\(company\)\}/);
assert.equal(/IP-adressen hentes fra tilkoblingen/.test(usagePanel), false);
assert.match(screen, /<EmployeeUsagePanel\s+companyId=\{familyId\}\s+company=\{family\?\.company\}/);

console.log('employeeAccount.test.mjs: ok');
