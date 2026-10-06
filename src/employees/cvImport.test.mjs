import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipStore } from '../indeksregulering/office.js';
import { sanitizeCv } from '../imports/interpret.js';
import { emptyEmployee } from './model.js';
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
assert.equal(first.employee.cv.experience[0].employer, 'CONSULT1 AS');
assert.ok(first.added.includes('oppsummering'));
assert.ok(first.added.includes('nasjonalitet'));

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
assert.match(screen, /Lagre CV/);
assert.match(screen, /cvEditorSections/);
assert.match(screen, /readCvImport/);

console.log('cvImport.test.mjs: ok');
