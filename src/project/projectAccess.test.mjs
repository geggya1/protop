import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Prosjekttilgang: Admin ser og endrer alt. Lese og begrenset redigering ser bare
// prosjekter de er registrert i, med hovedside, egne utlegg, eget salg og egne timer.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const screen = read('../../screens/project/ProjectWorkScreen.jsx');
const detail = read('../../components/project/ProjectDetail.jsx');
const overview = read('../../components/project/ProjectOverviewTab.jsx');
const settings = read('../../components/project/ProjectSettingsTab.jsx');
const expenses = read('../../components/project/ProjectExpensesTab.jsx');
const sales = read('../../components/project/ProjectSalesTab.jsx');

assert.match(screen, /const isAdmin = [\s\S]{0,120}access\.canAdmin\('projects'\)/);
// Bare tilgangsstyringen gjelder; administratorlisten på selskapet (adminUids) gir ikke Admin på Prosjekt.
assert.equal(/groupAdmin/.test(screen), false);
assert.match(screen, /const canDeleteProjects = isAdmin;/);
assert.match(screen, /access\.canEdit\('projects'\) \|\| access\.canEdit\('assignedProjects'\)/);
// Bare Admin ser alle prosjekter og kan opprette nye.
assert.match(screen, /const seesAllProjects = isAdmin;/);
assert.match(screen, /return myProjectIds\(state, me/);
assert.match(screen, /\{isAdmin \? \(\s*<CreateMenu/);
assert.match(screen, /projectMode=\{projectMode\}\s*myEmployeeId=\{myEmployeeId\}/);

assert.match(detail, /LIMITED_TABS = new Set\(\['hovedside', 'utlegg', 'produktsalg', 'timerapport'\]\)/);
assert.match(detail, /LIMITED_TABS\.has\(row\.id\) \|\| \(editor && row\.id === 'innstillinger'\)/);
assert.match(detail, /reportEntries\.map/);
assert.match(detail, /employeeId=\{ownOnly\}/);
assert.match(detail, /canEditBasics=\{editor\}/);
assert.match(detail, /onEditForm=\{full \? onEditForm : undefined\}/);

assert.match(overview, /\{limited \? \(\s*<View style=\{styles\.kpiRow\}>/);
assert.match(overview, /\{limited \? null : \(\s*<>/);
assert.match(overview, /if \(!canEditCover \|\| !familyId \|\| uploading\) return;/);

// Begrenset: bilde, periode og adresse. Avtale, kjøreturer og timeføring bare Admin.
assert.match(settings, /const canEdit = isAdmin \|\| canEditBasics;/);
for (const title of ['Avtale', 'Kjøreturer', 'Innstillinger for timeføring']) {
  const re = new RegExp(`\\{isAdmin \\? \\(\\s*<View style=\\{\\[styles\\.panel[^\\n]*\\n\\s*<Text[^>]*>${title}<`);
  assert.match(settings, re, title);
}
assert.match(settings, /editable=\{canEdit\}\s*value=\{start\}/);

for (const src of [expenses, sales]) {
  assert.match(src, /\(!employeeId \|\| row\.employeeId === employeeId\)/);
}

// Nytt utlegg på prosjekt får den som registrerer, så det vises på ansattsiden.
assert.match(expenses, /employeeId: myEmployeeId,\s*employeeName: personName\(myEmployeeId\)/);
assert.match(expenses, /<Label colors=\{colors\} text="Medarbeider" \/>/);
assert.match(detail, /<ProjectExpensesTab[^>]*myEmployeeId=\{myEmployeeId\}\s*employees=\{employees\}/);

console.log('projectAccess.test.mjs: ok');
