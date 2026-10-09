import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { cvDocumentFileSync, cvDocumentLines, cvPdf } from './cvDocument.js';

/** Minimal 1x1 JPEG (FF D8 … FF D9). */
const TINY_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

const cv = {
  name: 'Geir Ove Andersen',
  title: 'Partner | Prosjekt- og prosjekteringsleder',
  photoUrl: '',
  facts: [
    ['Født', '29.12.1986'],
    ['Sivil status', 'Ugift'],
    ['Nasjonalitet', 'Norsk'],
    ['Språk', 'Norsk'],
    ['Arbeidsgiver', 'CONSULT1 AS'],
  ],
  summary: 'Andersen er en erfaren prosjektleder med 21 års bransjeerfaring. Han leder komplekse prosjekter.',
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
      id: 'p1',
      title: 'Ny brannstasjon',
      address: 'Austvegen 46, 4341 Bryne',
      category: 'Offentlig næring',
      object: 'Næring',
      client: 'Klepp kommune',
      period: 'aug. 25 - mars 30',
      cost: '350 mill',
      contact: 'Gehan Skhmot',
      phone: '47662850',
      email: 'gehan@example.no',
      employer: 'CONSULT1 AS',
      roles: 'Prosjektleder\nProsjekteringsledelse',
      responsibility: 'Prosjekteringsledelse for skisse.',
      images: [],
    },
  ],
  custom: [],
};

const lines = cvDocumentLines(cv);
assert.equal(lines[0], 'CURRICULUM VITAE');
assert.ok(lines.includes('Geir Ove Andersen'));
assert.ok(lines.includes('Profil'));
assert.ok(lines.includes('Oppsummering og nøkkelkvalifikasjoner'));
assert.ok(lines.some((line) => line.startsWith('- Andersen er en erfaren')));
assert.ok(lines.includes('Utdanning'));
const eduStart = lines.indexOf('Utdanning');
const eduBlock = lines.slice(eduStart + 1, lines.indexOf('Sertifiseringer'));
assert.match(eduBlock[0], /2022/);
assert.ok(lines.includes('- Lift kurs'));
assert.ok(lines.includes('Referanseprosjekter'));
assert.ok(lines.includes('Kunde Klepp kommune'));

const photo = { bytes: TINY_JPEG, width: 1, height: 1 };
const projectImage = { bytes: TINY_JPEG, width: 1, height: 1 };
const file = cvDocumentFileSync(cv, {
  photo,
  projects: { p1: projectImage },
});
assert.match(file.filename, /\.pdf$/);
assert.equal(file.mime, 'application/pdf');
assert.equal(String.fromCharCode(...file.bytes.slice(0, 4)), '%PDF');
assert.ok(file.bytes.length > 2000, 'PDF med bilder skal være større enn ren tekst');

const raw = new TextDecoder('latin1').decode(file.bytes);
assert.match(raw, /Helvetica-Bold/);
assert.match(raw, /Helvetica-Oblique/);
assert.match(raw, /\/Photo Do/);
assert.match(raw, /\/Prjp1 Do/);
assert.match(raw, /CURRICULUM VITAE/);
assert.match(raw, /Oppsummering/);
assert.equal(raw.includes('•'), false, 'bullet-tegn skal ikke ligge som Unicode i PDF');

const outPath = new URL('../../.tmp-cv-export-test.pdf', import.meta.url);
writeFileSync(outPath, file.bytes);

const pageCount = (raw.match(/\/Type \/Page[^s]/g) || []).length;
assert.ok(pageCount >= 1 && pageCount <= 8, `forventet få sider uten masse prosjekter, fikk ${pageCount}`);

const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(screen, /cvDocumentFile/);
assert.match(screen, /Eksporter PDF/);
assert.match(screen, /busyKind === 'pdf'/);
assert.match(screen, /family\?\.company\?\.logo/);

// Sync API fortsatt tilgjengelig
assert.equal(String.fromCharCode(...cvPdf(cv).slice(0, 4)), '%PDF');

console.log('cvDocument.test.mjs: ok');
