import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipStore } from '../indeksregulering/office.js';
import { sanitizeCv } from '../imports/interpret.js';
import { emptyEmployee, gapReport } from './model.js';
import { applyImportedCv, readCvImport, textFromDocx } from './cvImport.js';

const clean = sanitizeCv({
  headline: 'Prosjekt- og byggeleder',
  summary: 'Erfaring fra offentlige bygg.',
  nationality: 'Norsk',
  maritalStatus: 'Gift',
  education: [{ from: '2004', to: '2007', school: 'UiS', program: 'Bygg' }, { school: '' }],
  certifications: [{ title: 'Sentral godkjenning' }],
  experience: [{ employer: 'CONSULT1 AS', from: '2016', current: 'ja', title: 'Prosjektleder', tasks: 'Ledelse\nKalkyle' }],
  projects: [{ title: 'Havn', client: 'Havnen', email: 'ikke-epost', responsibility: 'Prosjektleder' }],
  summaryNote: 'Lest fra CV',
  extra: 'skal bort',
});
assert.equal(clean.cv.headline, 'Prosjekt- og byggeleder');
assert.equal(clean.cv.education.length, 1);
assert.equal(clean.cv.experience[0].current, true);
assert.equal(clean.cv.experience[0].to, '');
assert.match(clean.cv.experience[0].tasks, /Kalkyle/);
assert.equal(clean.cv.projects[0].email, '');
assert.equal(clean.summary, 'Lest fra CV');
assert.equal(clean.cv.extra, undefined);

const first = applyImportedCv(emptyEmployee('emp-anders'), clean.cv);
assert.equal(first.employee.cv.summary, 'Erfaring fra offentlige bygg.');
assert.equal(first.employee.person.nationality, 'Norsk');
assert.equal(first.employee.person.maritalStatus, 'Gift');
assert.equal(first.employee.company.title, 'Prosjekt- og byggeleder');
assert.equal(first.employee.cv.experience[0].employer, 'CONSULT1 AS');
assert.ok(first.added.includes('oppsummering'));
assert.ok(first.added.includes('nasjonalitet'));
assert.ok(first.added.includes('tittel'));
const filledGaps = gapReport(first.employee).cv.map((item) => item.label);
for (const label of ['Tittel', 'Nasjonalitet', 'Sivil status', 'Oppsummering og nøkkelkvalifikasjoner', 'Utdanning', 'Erfaring']) {
  assert.equal(filledGaps.includes(label), false, label);
}

const again = applyImportedCv(first.employee, {
  ...clean.cv,
  summary: 'En annen tekst',
  education: [{ from: '2010', to: '2012', school: 'NTNU', program: 'Master' }],
});
assert.equal(again.employee.cv.summary, 'Erfaring fra offentlige bygg.');
assert.ok(again.kept.includes('oppsummering'));
assert.equal(again.employee.cv.education.length, 2);
assert.equal(applyImportedCv(again.employee, clean.cv).employee.cv.education.length, 2);

const docx = zipStore([{
  name: 'word/document.xml',
  data: '<w:document><w:p><w:r><w:t>Anders Rolandsen</w:t></w:r></w:p><w:p><w:r><w:t>Prosjekt- og byggeleder med erfaring fra offentlige bygg.</w:t></w:r></w:p></w:document>',
}]);
const text = await textFromDocx(docx);
assert.match(text, /Anders Rolandsen/);
assert.match(text, /offentlige bygg/);

const read = await readCvImport(new TextEncoder().encode(text), 'anders.txt', {
  familyId: 'fam',
  ask: async (payload) => {
    assert.equal(payload.kind, 'cv');
    assert.match(payload.text, /Anders Rolandsen/);
    return { cv: clean.cv, engine: 'gemini', summary: 'Lest fra CV' };
  },
});
assert.equal(read.cv.headline, 'Prosjekt- og byggeleder');

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const scanned = await readCvImport(pdf, 'cv.pdf', {
  familyId: 'fam',
  ask: async (payload) => {
    assert.equal(payload.kind, 'cv');
    assert.equal(payload.media.mime, 'application/pdf');
    assert.equal(payload.text, undefined);
    return { cv: { summary: 'Fra skann' }, engine: 'ocr+gemini', summary: 'Skannet' };
  },
});
assert.equal(scanned.engine, 'ocr+gemini');
assert.equal(scanned.cv.summary, 'Fra skann');

const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(screen, /Importer CV/);
assert.match(screen, /fra teksten i filen/);
assert.match(screen, /employee-cv-attention/);
assert.equal(screen.includes('Blyanten åpner ett avsnitt'), false);
assert.equal(screen.includes('Se over CV-en over'), false);
assert.equal(screen.includes('function ReferenceSheets'), false);
assert.match(screen, /editSection/);
assert.match(screen, /Referanseark som PDF/);
assert.match(screen, /slimCvDocument/);
assert.match(screen, /countInlineCvImages/);
assert.match(screen, /employee-cv-progress/);
assert.match(screen, /Laster opp bilder/);
assert.match(screen, /CV-en er ikke lagret/);
assert.match(screen, /review/);
const fields = readFileSync(new URL('../../screens/employees/EmployeeFields.jsx', import.meta.url), 'utf8');
assert.match(fields, /Rediger/);
assert.match(fields, /focusItemId/);
const viewSource = readFileSync(new URL('../../screens/employees/EmployeeCvView.jsx', import.meta.url), 'utf8');
assert.equal(viewSource.includes('Referanseark'), false);
assert.match(viewSource, /onEditProject/);
const cvStart = screen.indexOf('employee-cv-editor');
const cvBlock = screen.slice(cvStart, screen.indexOf("view === 'mine'", cvStart));
assert.ok(cvBlock.indexOf('Lagre CV') < cvBlock.indexOf('EmployeeCvView'));
assert.equal(cvBlock.includes('Kopier tekst'), false);
assert.equal(cvBlock.includes('Skriv ut'), false);
assert.equal(cvBlock.includes('Importer prosjekter'), false);
assert.match(cvBlock, /editSection/);
assert.match(cvBlock, /<Modal/);
assert.match(cvBlock, /employee-cv-section/);
assert.ok(cvBlock.indexOf('EmployeeCvView') < cvBlock.indexOf('<Modal'));
assert.match(screen, /Importer prosjekter/);
assert.match(screen, /Lagre CV/);
assert.match(screen, /cvEditorSections/);
assert.match(screen, /readCvImport/);
assert.match(screen, /readProjectTable/);

const named = sanitizeCv({
  firstName: 'Titi',
  middleName: 'Alexandru',
  lastName: 'Georgescu',
  birthDate: '6.4.1980',
  headline: 'Prosjekt- og byggeleder',
  projects: [{
    title: 'Kraftverk',
    address: 'Evje',
    email: 'eirik.smedstad@t infos.no',
    phone: '518000',
    link: { owner: 'company', companyProjectId: 'prj_senere' },
  }],
});
assert.equal(named.cv.firstName, 'Titi');
assert.equal(named.cv.projects[0].email, 'eirik.smedstad@tinfos.no');
assert.equal(named.cv.projects[0].phone, '518000');
assert.equal(named.cv.projects[0].link.owner, 'person');
assert.equal(named.cv.projects[0].link.companyProjectId, 'prj_senere');
const withName = applyImportedCv(emptyEmployee('emp-titi'), named.cv);
assert.equal(withName.employee.person.firstName, 'Titi');
assert.equal(withName.employee.person.middleName, 'Alexandru');
assert.equal(withName.employee.person.lastName, 'Georgescu');
assert.equal(withName.employee.person.birthDate, '6.4.1980');
assert.equal(withName.employee.cv.projects[0].address, 'Evje');
assert.equal(withName.employee.cv.projects[0].source, 'cv');

const pictured = applyImportedCv(emptyEmployee('emp-bilde'), {
  headline: 'Partner',
  photo: 'data:image/png;base64,aaaa',
  projects: [{ title: 'Bro', client: 'Oslo', period: '2024', images: ['data:image/png;base64,bbbb'] }],
});
assert.equal(pictured.employee.person.photoUrl, 'data:image/png;base64,aaaa');
assert.deepEqual(pictured.employee.cv.projects[0].images, ['data:image/png;base64,bbbb']);
assert.ok(pictured.added.includes('bilde'));

const many = sanitizeCv({
  projects: Array.from({ length: 76 }, (_, index) => ({
    title: `Prosjekt ${index + 1}`,
    client: 'Kommunen',
    period: '2020',
  })),
  courses: Array.from({ length: 68 }, (_, index) => ({
    date: `01.${2000 + (index % 20)}`,
    title: `Kurs ${index + 1}`,
  })),
});
assert.equal(many.cv.projects.length, 76);
assert.equal(many.cv.projects[75].title, 'Prosjekt 76');
assert.equal(many.cv.courses.length, 68);

console.log('cvImport.test.mjs: ok');
