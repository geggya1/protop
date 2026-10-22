import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lese på ansatte: andre ansatte vises bare med hovedsiden, uten sensitive kort.
const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../../screens/employees/EmployeeDetailView.jsx', import.meta.url), 'utf8');

assert.match(screen, /const limitedPerson = !!selected && !isAdmin && selected\.personUid !== uid/);
assert.match(screen, /!limitedPerson \|\| tab\.id === 'home'/);
assert.match(screen, /setView\(personViewAllowed\(row, nextView\) \? nextView : 'detail'\)/);
assert.match(screen, /limited=\{limitedPerson\}/);
// Ansettelsesdata ligger under Innstillinger.
assert.match(screen, /view === 'settings' && personEmployee \? \(\s*<EmployeeDetailView\s*section="employment"/);

assert.match(detail, /section === 'employment'/);
assert.match(detail, /!limited && \(personalRows\.length \|\| canEdit\)/);
assert.match(detail, /!limited && \(workRows\.length \|\| canEdit\)/);
assert.match(detail, /gaps && !limited/);
assert.match(detail, /limited \? null : \(\s*<View[^>]*>\s*<Text[^>]*>Tagger/);
// Hovedsiden har ikke lenger Ansettelsesdata direkte; kortet ligger i employmentCard.
const home = detail.slice(detail.indexOf('nativeID="employee-detail"'));
assert.equal(/title="Ansettelsesdata"/.test(home), false);
assert.equal(/\{employmentCard\}/.test(home), false);

console.log('employeeReadAccess.test.mjs: ok');
