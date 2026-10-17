import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assigneeFromChoice, followUpChoices, normalizeAssignees } from './assignees.js';

const kept = normalizeAssignees([
  { source: 'intern', employeeId: 'e1', name: 'Geir Ove Andersen', email: 'geir@consult1.no', phone: '90000000' },
  { source: 'ukjent', name: 'Ekstern Kari', email: 'kari@ekstern.no', phone: '' },
  { name: '', email: '', phone: '' },
]);
assert.equal(kept.length, 2);
assert.equal(kept[0].source, 'intern');
assert.equal(kept[0].email, 'geir@consult1.no');
assert.equal(kept[1].source, 'ny');

const choices = followUpChoices([
  { id: 'i1', company: { status: 'active', personnelKind: 'staff', email: 'geir@consult1.no' }, person: { firstName: 'Geir', lastName: 'Andersen', phone: '90000001' } },
  { id: 'x1', company: { status: 'active', personnelKind: 'external', email: 'kari@partner.no' }, person: { firstName: 'Kari', lastName: 'Ekstern', phone: '90000002' } },
  { id: 'n1', company: { status: 'inactive', personnelKind: 'staff' }, person: { firstName: 'Sluttet', lastName: 'Ansatt' } },
  { id: 'h1', company: { status: 'active', personnelKind: 'innleid' }, person: { firstName: 'Leie', lastName: 'Person', phone: '90000003' } },
]);
assert.deepEqual(choices.map((row) => row.id), ['i1', 'x1', 'h1']);
assert.equal(choices[0].kind, 'intern');
assert.equal(choices[0].email, 'geir@consult1.no');
assert.equal(choices[0].phone, '90000001');
assert.equal(choices[1].kind, 'ekstern');
assert.equal(choices[2].kind, 'ekstern');
const byLevel = followUpChoices([
  { id: 'a1', company: { status: 'active', personnelKind: 'staff', accessLevel: 'regnskap_ekstern' }, person: { firstName: 'Regn', lastName: 'Skap' } },
  { id: 'a2', company: { status: 'active', personnelKind: 'external', accessLevel: 'ansatt' }, person: { firstName: 'Fast', lastName: 'Ansatt' } },
  { id: 'a3', company: { status: 'active', personnelKind: 'staff', accessLevel: 'ansatt_andre_avdelinger' }, person: { firstName: 'Anne', lastName: 'Avdeling' } },
]);
assert.equal(byLevel.find((row) => row.id === 'a1').kind, 'ekstern');
assert.equal(byLevel.find((row) => row.id === 'a2').kind, 'intern');
assert.equal(byLevel.find((row) => row.id === 'a3').kind, 'ekstern');

const picked = assigneeFromChoice(choices[1]);
assert.equal(picked.source, 'ekstern');
assert.equal(picked.employeeId, 'x1');
assert.equal(picked.email, 'kari@partner.no');

const drop = readFileSync(new URL('../../screens/anbud/FileDropZone.jsx', import.meta.url), 'utf8');
assert.match(drop, /createElement\(\s*'div'/);
assert.match(drop, /dataTransfer/);
assert.match(drop, /onDrop/);
const wizard = readFileSync(new URL('../../screens/anbud/AgreementCreateWizard.jsx', import.meta.url), 'utf8');
const form = readFileSync(new URL('../../screens/anbud/DirectAgreementForm.jsx', import.meta.url), 'utf8');
assert.match(wizard, /FileDropZone/);
assert.match(form, /FileDropZone/);
assert.equal(wizard.includes('onDragOver'), false);
assert.equal(form.includes('onDragOver'), false);
assert.match(form, /agreement-read-job/);
assert.match(form, /SUGGESTION_MARK/);
assert.match(form, /AgreementAssigneesField/);
const suggestions = readFileSync(new URL('./agreementSuggestions.js', import.meta.url), 'utf8');
assert.match(suggestions, /Automatisk foreslått \(kontroller\)/);

console.log('assignees.test.mjs: ok');
