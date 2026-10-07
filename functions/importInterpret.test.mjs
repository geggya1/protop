import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleInterpretImport } from './importInterpret.js';

const deps = {
  db: {},
  assertFamilyAdult: async () => ({ role: 'admin' }),
  checkAndIncrementUsage: async () => {},
  getGeminiKey: () => 'test-key',
  friendlyGeminiError: (err) => err?.message || 'feil',
  passthroughErrors: true,
};

const columns = await handleInterpretImport({
  familyId: 'fam',
  kind: 'customers',
  mode: 'columns',
  headers: ['Juridisk navn', 'Organisasjon'],
  samples: [['Eksempel AS', '923456785']],
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async (_key, prompt, parts) => {
    assert.match(prompt, /orgnr/);
    assert.match(parts[0].text, /Juridisk navn/);
    assert.match(parts[0].text, /923456785/);
    return {
      columns: [
        { header: 'Juridisk navn', field: 'name' },
        { header: 'Organisasjon', field: 'orgnr' },
        { header: 'Hack', field: 'deleteAll' },
      ],
      summary: 'Navn og organisasjonsnummer',
    };
  },
});
assert.equal(columns.engine, 'gemini');
assert.equal(columns.columns['Juridisk navn'], 'name');
assert.equal(columns.columns.Organisasjon, 'orgnr');
assert.equal(columns.columns.Hack, undefined);

const scanned = await handleInterpretImport({
  familyId: 'fam',
  kind: 'employees',
  mode: 'ocr',
  mime: 'image/png',
  imageBase64: 'a'.repeat(120),
}, { uid: 'user' }, {
  ...deps,
  documentParts: async () => ({
    usedOcr: true,
    parts: [{ text: 'ocr' }],
  }),
  callGeminiJson: async () => ({
    rows: [
      { fullName: 'Ada Lovelace', workEmail: 'ada@example.com', phone: '12' },
      { comment: 'uten navn' },
    ],
    summary: 'Én medarbeider',
  }),
});
assert.equal(scanned.engine, 'ocr+gemini');
assert.equal(scanned.rows.length, 1);
assert.equal(scanned.rows[0].fullName, 'Ada Lovelace');
assert.equal(scanned.rows[0].phone, undefined);

await assert.rejects(
  () => handleInterpretImport({ familyId: 'fam', mode: 'columns' }, {}, deps),
  /Ikke innlogget/,
);

const cv = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  text: 'Anders Rolandsen. Prosjektleder. Utdanning ved UiS 2004-2007. Erfaring fra CONSULT1 AS siden 2016.',
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async (_key, prompt, parts) => {
    assert.match(prompt, /education/);
    assert.match(parts[0].text, /UiS/);
    return {
      headline: 'Prosjektleder',
      summary: 'Erfaring fra CONSULT1 AS.',
      education: [{ from: '2004', to: '2007', school: 'UiS', program: 'Bygg' }],
      projects: [{ email: 'ikke' }],
      summaryNote: 'Én CV',
    };
  },
});
assert.equal(cv.engine, 'gemini');
assert.equal(cv.cv.education[0].school, 'UiS');
assert.equal(cv.cv.projects.length, 0);
assert.equal(cv.summary, 'Én CV');

const cvText = [
  'CURRICULUM VITAE',
  'Kari Nord',
  'Byggeleder',
  'Profil',
  'Født 6.4.1980',
  'Referanseprosjekter',
  'Kraftverk',
  'Evje',
  'Kategori Entreprenør',
  'Periode aug. 21 - mai 24',
  'Epost kari@eksempel .no',
].join('\n');
let seenImages = null;
const kept = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  text: 'kort',
  mime: 'application/pdf',
  imageBase64: 'a'.repeat(120),
}, { uid: 'user' }, {
  ...deps,
  documentParts: async (_data, options) => {
    seenImages = options;
    return { usedOcr: true, text: cvText, parts: [{ text: cvText }] };
  },
  callGeminiJson: async () => {
    throw new Error('modell nede');
  },
});
assert.equal(seenImages.maxImages, 4);
assert.equal(kept.engine, 'ocr+gemini');
assert.equal(kept.cv.projects.length, 1);
assert.equal(kept.cv.projects[0].title, 'Kraftverk');
assert.equal(kept.cv.projects[0].email, 'kari@eksempel.no');
assert.equal(kept.cv.projects[0].link.owner, 'person');
assert.equal(kept.cv.birthDate, '6.4.1980');

const sheetOnly = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  text: [
    'Næringsbygg 7 etasjer - Eksempelfjorden',
    'Eksempelveien 1, 0150 Oslo, Norge',
    'Oppdragsgiver',
    'Oppdrag AS',
    'Areal',
    'm2',
    '59 172',
    'Tiltaksklasse',
    '3',
  ].join('\n'),
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async () => ({
    firstName: 'Ola',
    lastName: 'Nordmann',
    headline: 'Byggeleder',
    projects: [{
      title: 'Næringsbygg 7 etasjer - Eksempelfjorden',
      category: 'Næring',
      object: 'Nybygg',
      client: 'Oppdrag AS',
    }],
  }),
});
assert.equal(sheetOnly.cv.firstName, '');
assert.equal(sheetOnly.cv.lastName, '');
assert.equal(sheetOnly.cv.headline, '');
assert.equal(sheetOnly.cv.projects.length, 1);
assert.equal(sheetOnly.cv.projects[0].area, '59 172 m2');
assert.equal(sheetOnly.cv.projects[0].buildingClass, '3');
assert.equal(sheetOnly.cv.projects[0].category, '');
assert.equal(sheetOnly.cv.projects[0].object, '');
assert.equal(sheetOnly.cv.projects[0].referenceName, '');

let cvCalls = 0;
const manyPages = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  mime: 'application/pdf',
  imageBase64: 'a'.repeat(120),
}, { uid: 'user' }, {
  ...deps,
  documentParts: async () => ({
    usedOcr: true,
    text: '',
    parts: [
      { text: 'Les CV-en.' },
      { inline_data: { mime_type: 'image/jpeg', data: 'side1' } },
      { inline_data: { mime_type: 'image/jpeg', data: 'side2' } },
      { inline_data: { mime_type: 'image/jpeg', data: 'side3' } },
      { inline_data: { mime_type: 'image/jpeg', data: 'side4' } },
    ],
  }),
  callGeminiJson: async (_key, _prompt, parts, options) => {
    cvCalls += 1;
    assert.deepEqual(options.models, ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest']);
    const images = parts.filter((part) => part.inline_data).length;
    if (images > 2) throw new Error('Gemini HTTP 400 (gemini-3.8-flash): invalid image');
    assert.equal(images, 2);
    return { firstName: 'Geir', lastName: 'Andersen', headline: 'Rådgiver', summaryNote: 'Lest' };
  },
});
assert.equal(cvCalls, 2);
assert.equal(manyPages.cv.firstName, 'Geir');
assert.equal(manyPages.cv.lastName, 'Andersen');

const source = readFileSync(new URL('./importInterpret.js', import.meta.url), 'utf8');
assert.match(source, /imageBase64.length <= 1_500_000/);

console.log('importInterpret.test.mjs: ok');
