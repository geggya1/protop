import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lese på ansatte: andre ansatte vises bare med hovedsiden, uten sensitive kort.
const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../../screens/employees/EmployeeDetailView.jsx', import.meta.url), 'utf8');

assert.match(screen, /const limitedPerson = !!selected && !isAdmin && !isSelfRow\(selected\)/);
// Tre nivåer: Lese = hovedside, begrenset = + Oversikt/Timer/Fravær (bare visning), Admin = alt.
assert.match(screen, /READER_PERSON_VIEWS = new Set\(\['detail'\]\)/);
assert.match(screen, /EDITOR_PERSON_VIEWS = new Set\(\['detail', 'overview', 'hours', 'report', 'absence'\]\)/);
assert.match(screen, /<ArbeidScreen\s+lockedEmployeeId=\{selected\.id\}\s+embedded\s+readOnly=\{readOnlyPerson\}/);
assert.match(screen, /employeesAdmin = [\s\S]{0,120}canAdmin\('employees'\)/);
assert.match(screen, /allowedTabViews\(selected, tab\.id\)\.length > 0/);
assert.match(screen, /nativeID="employee-sub-tabs"/);
assert.match(screen, /readOnly=\{readOnlyPerson\}/);
assert.match(screen, /canDelete=\{employeesAdmin\}/);
assert.match(screen, /const canInvite = employeesAdmin/);
assert.match(screen, /setView\(personViewAllowed\(row, nextView\) \? nextView : 'detail'\)/);
assert.match(screen, /limited=\{limitedPerson\}/);
// Ansettelsesdata ligger under Innstillinger.
assert.match(screen, /view === 'settings' && personEmployee \? \(\s*<EmployeeDetailView\s*section="employment"/);

assert.match(detail, /section === 'employment'/);
assert.match(detail, /!limited && \(personalRows\.length \|\| canEdit\)/);
assert.match(detail, /!limited && \(workRows\.length \|\| canEdit\)/);
assert.match(detail, /gaps && !limited/);
assert.match(detail, /limited \|\| !showAdminCards \? null : \(\s*<View[^>]*>\s*<Text[^>]*>Tagger/);
// Hovedsiden har ikke lenger Ansettelsesdata direkte; kortet ligger i employmentCard.
const home = detail.slice(detail.indexOf('nativeID="employee-detail"'));
assert.equal(/title="Ansettelsesdata"/.test(home), false);
assert.equal(/\{employmentCard\}/.test(home), false);

// Lenker til skjulte undersider (timeføring, CV) vises ikke for Lese.
assert.match(detail, /onHours && !limited \?/);
assert.match(detail, /right=\{limited \? null : \(/);
assert.match(detail, /!limited && \(employee\.cv\?\.projects/);

const arbeid = readFileSync(new URL('../../screens/arbeid/ArbeidScreen.jsx', import.meta.url), 'utf8');
assert.ok((arbeid.match(/if \(readOnly\) return;/g) || []).length >= 12);
// Skrivebeskyttet: ingen knapper for føring, bare en eventuell melding.\nassert.match(arbeid, /const actions = readOnly \? /);
const absence = readFileSync(new URL('../../screens/arbeid/AbsenceOverviewView.jsx', import.meta.url), 'utf8');
assert.match(absence, /onRegister=\{readOnly \? null : register\}/);
assert.match(absence, /canEditOpening=\{!!employeeId && !readOnly\}/);

// Timelisten på ansattsiden vises selv om leseren ikke er koblet til en ansatt.
assert.match(arbeid, /if \(!linked && !manager && !lockedId\)/);
// Fraværsoversikten på ansattsiden ruller.
assert.match(screen, /<ScrollView\s+nativeID="employee-absence-view"/);

// Mangler, Tagger, Brukslogg og Hendelser er bare for Admin (og personen selv).
assert.match(screen, /showAdminCards=\{!readOnlyPerson\}/);
assert.match(screen, /enabled=\{employeesAdmin \|\| isSelfRow\(detailEmployee\)\}/);
assert.match(detail, /gaps && !limited && showAdminCards/);
assert.match(detail, /limited \|\| !showAdminCards \? null/);

// Tannhjul og «Skriv ut utvalg» på timelisten skjules i skrivebeskyttet modus.

const report = readFileSync(new URL('../../screens/economy/EconomyHours.jsx', import.meta.url), 'utf8');
// Timerapporten: Lese åpner føringen uten å endre, begrenset redigering endrer uten å slette, Admin gjør alt.
assert.equal((report.match(/if \(!canImport\) return;/g) || []).length, 2);
assert.equal((report.match(/\{!canImport \? null : \(\s*<TouchableOpacity\s+onPress=\{importFile\}/g) || []).length, 2);
assert.match(report, /const canImport = rights === 'admin';/);
assert.match(report, /if \(!editing \|\| editing\.rights === 'read'\) return;/);
assert.match(report, /if \(editing\?\.rights !== 'admin'\) return;/);
assert.match(report, /readOnly=\{editing\?\.rights === 'read'\}\s+canDelete=\{editing\?\.rights === 'admin'\}/);
const entryModal = readFileSync(new URL('../../components/arbeid/TimeEntryModal.jsx', import.meta.url), 'utf8');
assert.match(entryModal, /\{canDelete && !readOnly && blocks\.some/);
assert.match(entryModal, /\{readOnly \? 'Lukk' : 'Avbryt'\}/);

// Timerapporten ruller selv når den er innebygd på ansattsiden.
assert.match(report, /const Shell = embedded \? ScrollView : View;/);
// Fraværsoversikten er venstrestilt.
assert.match(absence, /frame: \{[^}]*alignSelf: 'flex-start'/);

// Egen profil følger «Egen profil» (ownProfile).
assert.match(screen, /SELF_EDITOR_VIEWS = new Set\(\['detail', 'hours', 'report', 'saldo', 'absence', 'overview', 'files', 'expenses', 'cv'\]\)/);
assert.match(screen, /access\.canEdit\('ownProfile'\) \? 'editor' : 'reader'/);
assert.match(screen, /fullPersonAccess = employeesAdmin \|\| \(selfSelected && ownLevel === 'admin'\)/);
assert.match(screen, /hideReportTools=\{!fullPersonAccess\}/);
assert.match(screen, /memberProjectsOnly=\{!fullPersonAccess\}/);
assert.match(screen, /hideBillable=\{!fullPersonAccess\}\s+embedded\s+rights=\{fullPersonAccess \? 'admin' : selfEditor \? 'edit' : 'read'\}/);
assert.match(screen, /<TimesaldoScreen\s+lockedEmployeeId=\{selected\.id\}\s+embedded\s+rights=\{fullPersonAccess \? 'admin' : selfEditor \? 'edit' : 'read'\}/);
assert.match(screen, /<ProjectExpensesScreen [^>]*canImport=\{fullPersonAccess\}/);
assert.match(screen, /canEdit=\{fullPersonAccess \|\| selfEditor\}\s*canDelete=\{fullPersonAccess\}/);
assert.match(screen, /canEdit=\{isAdmin \|\| \(isSelfRow\(detailEmployee\) && ownLevel !== 'reader'\)\}/);

// Timelisten: «Skriv ut utvalg» ligger under tannhjulet, som kan skjules.
assert.match(arbeid, /\{readOnly \|\| hideReportTools \? null : \(/);
assert.match(arbeid, /includeJoinable: !memberProjectsOnly/);
const gearPanel = arbeid.slice(arbeid.indexOf('nativeID="arbeid-report-panel"'));
assert.match(gearPanel.slice(0, 2500), /nativeID="timesheet-print"/);
assert.equal((arbeid.match(/nativeID="timesheet-print"/g) || []).length, 1);

const saldo = readFileSync(new URL('../../screens/arbeid/TimesaldoScreen.jsx', import.meta.url), 'utf8');
assert.match(saldo, /\{readOnly \? \(\s*<Text/);
// Timesaldo: Lese = bare se, begrenset redigering = justere uten å fjerne, Admin = alt.
assert.match(saldo, /const readOnly = rights === 'read';/);
assert.match(saldo, /if \(!edit \|\| !activeId \|\| readOnly\) return;/);
assert.match(saldo, /Bare Admin kan fjerne en justering\./);

const expensesUi = readFileSync(new URL('../../screens/economy/ProjectExpensesScreen.jsx', import.meta.url), 'utf8');
assert.match(expensesUi, /\{canImport \? \(/);
assert.match(expensesUi, /sideFilters \? <View style=\{styles\.side\}>\{filterPanel\}<\/View> : null/);

const companyAbsence = readFileSync(new URL('../../screens/arbeid/CompanyAbsenceDesktop.jsx', import.meta.url), 'utf8');
assert.match(companyAbsence, /\{canChooseEmployee \? \(\s*<View style=\{styles\.kpis\}>/);

// Fravær på ansattsiden: bare den ansatte, uten bedriftens nøkkeltall.
assert.match(absence, /const visiblePeople = canChooseEmployee\s*\? people\s*: people\.filter/);
assert.match(absence, /showKpis=\{canChooseEmployee\}/);
assert.match(absence, /\{wide && showKpis \? \(/);

// «Vis som»: den valgte ansatte gjenkjennes som «meg», også uten knyttet bruker.
assert.match(screen, /if \(access\.previewing && access\.viewingAs\) return row\.id === access\.viewingAs\.id;/);
assert.match(screen, /const selfSelected = isSelfRow\(selected\);/);
assert.equal(/selected\.personUid !== uid/.test(screen), false);
assert.match(screen, /onPushProfile=\{access\.previewing \? undefined : pushProfile\}/);

// Prosjekt: bare «Tildelte prosjekt» viser prosjektene personen er registrert i.
const projectsUi = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
assert.match(projectsUi, /const seesAllProjects = isAdmin;/);
assert.match(projectsUi, /if \(!projectVisible\(item\)\) return false;/);
assert.match(projectsUi, /item\.id === selectedId && projectVisible\(item\)/);

console.log('employeeReadAccess.test.mjs: ok');
