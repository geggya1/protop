import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lese på ansatte: andre ansatte vises bare med hovedsiden, uten sensitive kort.
const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../../screens/employees/EmployeeDetailView.jsx', import.meta.url), 'utf8');

assert.match(screen, /const limitedPerson = !!selected && !isAdmin && selected\.personUid !== uid/);
// Tre nivåer: Lese = hovedside, begrenset = + Oversikt/Timer/Fravær (bare visning), Admin = alt.
assert.match(screen, /READER_PERSON_VIEWS = new Set\(\['detail'\]\)/);
assert.match(screen, /EDITOR_PERSON_VIEWS = new Set\(\['detail', 'overview', 'hours', 'absence'\]\)/);
assert.match(screen, /employeesAdmin = [\s\S]{0,120}canAdmin\('employees'\)/);
assert.match(screen, /allowedTabViews\(selected, tab\.id\)\.length > 0/);
assert.match(screen, /nativeID="employee-sub-tabs"/);
assert.match(screen, /<ArbeidScreen lockedEmployeeId=\{selected\.id\} embedded readOnly=\{readOnlyPerson\} \/>/);
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
assert.match(arbeid, /const actions = readOnly \? null : \(/);
const absence = readFileSync(new URL('../../screens/arbeid/AbsenceOverviewView.jsx', import.meta.url), 'utf8');
assert.match(absence, /onRegister=\{readOnly \? null : register\}/);
assert.match(absence, /canEditOpening=\{!!employeeId && !readOnly\}/);

// Timelisten på ansattsiden vises selv om leseren ikke er koblet til en ansatt.
assert.match(arbeid, /if \(!linked && !manager && !lockedId\)/);
// Fraværsoversikten på ansattsiden ruller.
assert.match(screen, /<ScrollView\s+nativeID="employee-absence-view"/);

// Mangler, Tagger, Brukslogg og Hendelser er bare for Admin (og personen selv).
assert.match(screen, /showAdminCards=\{!readOnlyPerson\}/);
assert.match(screen, /enabled=\{employeesAdmin \|\| detailEmployee\.personUid === uid\}/);
assert.match(detail, /gaps && !limited && showAdminCards/);
assert.match(detail, /limited \|\| !showAdminCards \? null/);

// Tannhjul og «Skriv ut utvalg» på timelisten skjules i skrivebeskyttet modus.
assert.match(arbeid, /\{readOnly \? null : \(\s*<TouchableOpacity\s+onPress=\{\(\) => setReportMenuOpen\(true\)\}/);
assert.match(arbeid, /\{isPhone \|\| readOnly \? null : \(/);

console.log('employeeReadAccess.test.mjs: ok');
