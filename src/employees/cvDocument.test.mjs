import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cvDocumentFile, cvDocumentLines } from './cvDocument.js';

const cv = {
  name: 'Geir Ove Andersen',
  title: 'Partner | Prosjekt- og prosjekteringsleder',
  facts: [
    ['Født', '29.12.1986'],
    ['Sivil status', 'Ugift'],
    ['Nasjonalitet', 'Norsk'],
    ['Språk', 'Norsk'],
    ['Arbeidsgiver', 'CONSULT1 AS'],
  ],
  summary: 'Andersen er en erfaren prosjektleder med 21 års bransjeerfaring.',
  education: [
    { id: 'e1', when: '2008 – 2012', school: 'Bergen Tekniske fagskole (BTF)', program: 'Elkraft', from: '2008' },
    { id: 'e2', when: '2022 – 2025', school: 'Universitet i Stavanger (UiS)', program: 'EMBA', from: '2022' },
    { id: 'e3', when: '2020 – 2022', school: 'HFY', program: 'Bachelor', from: '2020' },
  ],
  certifications: ['Lift kurs', 'Varmt arbeidskurs'],
  courses: [
    { id: 'c1', when: '02. 2019', title: 'Digitalisering' },
    { id: 'c2', when: '06. 2026', title: 'Samspillsentreprise' },
  ],
  experience: [
    {
      id: 'x1',
      employer: 'Consult1 AS',
      place: 'Sandnes',
      title: 'Partner',
      when: '2016 – d.d.',
      tasks: ['Prosjekteringsleder', 'SHA-koordinator'],
    },
  ],
  projects: [
    {
      title: 'Ny brannstasjon',
      address: 'Austvegen 46, 4341 Bryne',
      category: 'Offentlig næring',
      client: 'Klepp kommune',
      period: 'aug. 25 - mars 30',
      cost: '350 mill',
      roles: 'Prosjektleder\nProsjekteringsledelse',
      responsibility: 'Prosjekteringsledelse for skisse.',
    },
  ],
  custom: [],
};

const lines = cvDocumentLines(cv);
assert.equal(lines[0], 'CURRICULUM VITAE');
assert.ok(lines.includes('Geir Ove Andersen'));
assert.ok(lines.includes('Profil'));
assert.ok(lines.includes('Født 29.12.1986'));
assert.ok(lines.includes('Oppsummering og nøkkelkvalifikasjoner'));
assert.ok(lines.some((line) => line.startsWith('• Andersen er en erfaren')));
assert.ok(lines.includes('Utdanning'));

const eduStart = lines.indexOf('Utdanning');
const eduBlock = lines.slice(eduStart + 1, lines.indexOf('Sertifiseringer'));
assert.match(eduBlock[0], /2022/);
assert.match(eduBlock[1], /2020/);
assert.match(eduBlock[2], /2008/);

assert.ok(lines.includes('• Lift kurs'));
assert.ok(lines.includes('Kurs'));
const courseStart = lines.indexOf('Kurs');
assert.match(lines[courseStart + 1], /06\. 2026/);
assert.ok(lines.includes('Erfaringer'));
assert.ok(lines.includes('Consult1 AS'));
assert.ok(lines.includes('• Prosjekteringsleder'));
assert.ok(lines.includes('Referanseprosjekter'));
assert.ok(lines.includes('Ny brannstasjon'));
assert.ok(lines.includes('Kunde Klepp kommune'));
assert.ok(lines.some((line) => line.startsWith('Roller i prosjektet')));

const file = cvDocumentFile(cv);
assert.match(file.filename, /\.pdf$/);
assert.equal(file.mime, 'application/pdf');
assert.equal(String.fromCharCode(...file.bytes.slice(0, 4)), '%PDF');
assert.ok(file.bytes.length > 500);

const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(screen, /cvDocumentFile/);
assert.match(screen, /Eksporter PDF/);
assert.match(screen, /onAddedItem/);
assert.match(screen, /editExpanded/);
assert.equal(screen.includes('hideItems={editSection === \'projects\' && !editItemId}'), false);

const fields = readFileSync(new URL('../../screens/employees/EmployeeFields.jsx', import.meta.url), 'utf8');
assert.match(fields, /RichTextField/);
assert.match(fields, /Legg til/);
assert.match(fields, /onAddedItem/);
assert.match(fields, /Flytt/);

console.log('cvDocument.test.mjs: ok');
