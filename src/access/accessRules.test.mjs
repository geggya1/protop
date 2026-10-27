import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Rettighetene slik de er bestemt. Kjøres i verify:web, så de ikke kan endres uten at CI blir rødt.
 *
 * Prosjekt: bare Admin på Prosjekt ser alle prosjekter. Lese og begrenset redigering ser
 *   prosjektene de er med i (deltaker, prosjektleder eller har ført timer), overalt.
 * Utstyr og kjøretøy: uten Admin på Utstyr bare utstyr personen har rettighet på (Tilgang på
 *   utstyret), også i Kalender, hendelsesskjemaet, kjøreboken og ISO.
 * Ansatte: Lese ser bare Hovedside på andre ansatte (se employeeReadAccess.test.mjs).
 * «Se som bruker»: visningen følger den valgte personen.
 * Administratorlisten på selskapet (adminUids) gir ikke Admin; bare tilgangsstyringen gjelder.
 */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// Prosjektfremdrift og produktivitet: egne prosjekter uten Admin på Prosjekt.
const timeline = read('../../screens/arbeid/ProjectTimelineScreen.jsx');
assert.match(timeline, /const allProjects = !access\.active \|\| \(access\.ready && access\.canAdmin\('projects'\)\);/);
assert.match(timeline, /myProjectIds\(\{ projects, members, timeEntries \}, me, employees\)/);
assert.match(timeline, /projects=\{visibleProjects\}/);
const productivity = read('../../screens/arbeid/ProductivityScreen.jsx');
assert.match(productivity, /const allProjects = !access\.active \|\| \(access\.ready && access\.canAdmin\('projects'\)\);/);
assert.match(productivity, /return live\.filter\(\(project\) => own\.has\(project\.id\)\);/);

// ISO: den som behandler saker ser alle prosjekter; ellers egne. Utstyr som i Utstyr.
const iso = read('../../screens/iso/IsoScreen.jsx');
assert.match(iso, /allProjects: bypass \|\| caps\.manage \|\| \(access\.ready && access\.canAdmin\('projects'\)\)/);
assert.match(iso, /allGear: bypass \|\| caps\.manage \|\| \(access\.ready && access\.canAdmin\('equipment'\)\)/);
const isoSources = read('../../screens/iso/useIsoSources.js');
assert.match(isoSources, /const own = allProjects \? null : myProjectIds\(projectState, viewer, employees\);/);
assert.match(isoSources, /filter\(\(row\) => allGear \|\| employeeMaySeeGear\(row, viewer\)\)/);

// Prosjektvelgere: timerapport, utstyrsbooking og kjørebok.
assert.match(read('../../screens/economy/EconomyHours.jsx'), /projects=\{pickableProjects\(state,/);
assert.match(read('../../screens/equipment/EquipmentScreen.jsx'), /projects: pickableProjects\(state, me, employees, \{ keepId: projectId \}\)/);
const mileage = read('../../screens/economy/MileageWizard.jsx');
assert.match(mileage, /projects: pickableProjects\(state, gearAccess\.viewer, employees,/);

// Ansattsiden: prosjektkortet viser bare prosjekter leseren selv er med i.
const employees = read('../../screens/employees/EmployeesScreen.jsx');
assert.match(employees, /projectState=\{visibleProjectState\}/);
assert.match(employees, /const own = myProjectIds\(projectState, projectViewer, rows\);/);

// Kjøretøy: Kalender, hendelsesskjema og kjørebok følger Utstyr i tilgangsstyringen.
for (const file of ['../../screens/v2/PlanScreen.jsx', '../../screens/v2/EventFormScreen.jsx']) {
  const src = read(file);
  assert.match(src, /equipmentViewerAccess\(access, \{ employees: access\.employees \}\)/, file);
  assert.equal(/canManageEquipmentAccess\(/.test(src), false, `${file}: nivånavn styrer ikke utstyr`);
}
assert.match(mileage, /const cars = vehiclesForViewer\(companyVehicles\(state\.equipment\), \{/);
assert.match(mileage, /\? !!access\.ready && access\.canEdit\('equipment'\)/);
const equipment = read('../../screens/equipment/EquipmentScreen.jsx');
assert.match(equipment, /&& \(rights === 'admin' \|\| employeeMaySeeGear\(row, me\)\)\);/);

// Administratorlisten (useApp().isAdmin) brukes ikke til tilgang i disse modulene.
for (const file of [
  '../../screens/employees/EmployeesScreen.jsx',
  '../../screens/project/ProjectWorkScreen.jsx',
  '../../screens/arbeid/ProjectTimelineScreen.jsx',
  '../../screens/arbeid/ProductivityScreen.jsx',
  '../../screens/equipment/EquipmentScreen.jsx',
]) {
  assert.equal(/isAdmin: groupAdmin/.test(read(file)), false, file);
}

// (i) i tilgangsmatrisen: hver rad og hvert trinn har en forklaring.
const matrix = read('../../components/project/CompanyAccessSettings.jsx');
assert.match(matrix, /<AccessInfo row=\{row\} action=\{action\} colors=\{colors\} onInfo=\{onInfo\} \/>/);
assert.equal((matrix.match(/<AccessInfo /g) || []).length, 2, 'både bred og smal matrise');
assert.match(matrix, /accessHelp\(info\.resourceId, info\.actionId\)/);
// Tilpassede nivå er merket, og rader som er endret fra ProTop-standard vises.
assert.match(matrix, /overrideLabel="Endret fra ProTop-standard"/);
assert.match(matrix, /levelIsCustom\(policy, row\.id\) \? ' · Tilpasset' : ''/);

const { ACCESS_HELP, accessHelp } = await import('./accessHelp.js');
const { ACCESS_RESOURCES } = await import('./companyAccess.js');
for (const row of ACCESS_RESOURCES) {
  for (const action of ['see', 'read', 'write']) {
    assert.ok(accessHelp(row.id, action).length > 10, `${row.id} ${action}`);
  }
}
for (const id of Object.keys(ACCESS_HELP)) assert.ok(ACCESS_RESOURCES.some((row) => row.id === id), id);
assert.match(accessHelp('projects', 'see'), /bare prosjekter en er med i/);
assert.match(accessHelp('equipment', 'see'), /bare firmautstyr og kjøretøy en har rettighet på/);
assert.match(accessHelp('employees', 'see'), /bare Hovedside/);

console.log('accessRules.test.mjs: ok');
