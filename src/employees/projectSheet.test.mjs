import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProjectSheet } from './cvText.js';
import { projectSheetFile, projectSheetLines } from './projectSheet.js';

const project = {
  title: 'Næringsbygg 7 etasjer - Byfjordparken',
  address: 'Dusavikveien 69, 4007 Stavanger, Norge',
  client: 'Jærentreprenør AS',
  period: 'aug. 17 - jan. 21',
  area: '59 172 m2',
  cost: '190 MNOK eks mva',
  buildingClass: '3',
  description: 'Byfjordparken ILK2 finner du i den nye bydelen.',
  referenceName: 'Geir Ove Andersen',
  responsibility: 'Assisterende prosjekteringsledelse.',
  contact: 'Leif Jarle Vigre',
  contactCompany: 'Jærentreprenør AS',
  phone: '93419004',
  email: 'lv@example.no',
  roles: 'Byggeleder\nProsjektleder',
  category: '',
  object: '',
};

const lines = projectSheetLines(project, '');
assert.equal(lines[0], project.title);
assert.ok(lines.includes('Oppdragsgiver: Jærentreprenør AS'));
assert.ok(lines.includes('Areal: 59 172 m2'));
assert.ok(lines.includes('Tiltaksklasse: 3'));
assert.equal(lines.some((line) => line.startsWith('Kategori:')), false);
assert.equal(lines.some((line) => line.startsWith('Objekt:')), false);
assert.ok(lines.includes('Geir Ove Andersen'));
assert.ok(lines.includes('- Prosjektleder'));

const roundtrip = parseProjectSheet(lines.join('\n'));
assert.equal(roundtrip.client, project.client);
assert.equal(roundtrip.area, project.area);
assert.equal(roundtrip.cost, project.cost);
assert.equal(roundtrip.buildingClass, project.buildingClass);
assert.equal(roundtrip.contact, project.contact);
assert.equal(roundtrip.contactCompany, project.contactCompany);
assert.equal(roundtrip.phone, project.phone);
assert.equal(roundtrip.email, project.email);
assert.match(roundtrip.roles, /Prosjektleder/);
assert.equal(roundtrip.category, '');
assert.equal(roundtrip.object, '');

const pdf = projectSheetFile(project, 'pdf', 'Geir Ove Andersen');
assert.match(pdf.filename, /\.pdf$/);
assert.equal(String.fromCharCode(...pdf.bytes.slice(0, 4)), '%PDF');

const docx = projectSheetFile(project, 'docx');
assert.match(docx.filename, /\.docx$/);
assert.equal(docx.bytes[0], 0x50);
assert.equal(docx.bytes[1], 0x4b);

const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(screen, /Referanseark/);
assert.match(screen, /projectSheetFile/);
const view = readFileSync(new URL('../../screens/employees/EmployeeCvView.jsx', import.meta.url), 'utf8');
assert.equal(view.includes('Tiltaksklasse'), false);
assert.equal(view.includes('Areal'), false);

console.log('projectSheet.test.mjs: ok');
