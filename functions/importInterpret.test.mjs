import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfFromJpegs } from '../src/imports/filePayload.js';
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
assert.equal(kept.engine, 'text');
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

let pageCalls = [];
const oneByOne = await handleInterpretImport({
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
      { inline_data: { mime_type: 'image/jpeg', data: 'a' } },
      { inline_data: { mime_type: 'image/jpeg', data: 'b' } },
    ],
  }),
  callGeminiJson: async (_key, _prompt, parts) => {
    const images = parts.filter((part) => part.inline_data).map((part) => part.inline_data.data);
    pageCalls.push(images.join('+'));
    if (images.length > 1) throw new Error('Gemini HTTP 400 (gemini-2.5-flash): invalid image');
    if (images[0] === 'a') return { firstName: 'Titi', headline: 'Rådgiver' };
    return { lastName: 'Georgescu', projects: [{ title: 'Bro' }] };
  },
});
assert.deepEqual(pageCalls, ['a+b', 'a', 'b']);
assert.equal(oneByOne.cv.firstName, 'Titi');
assert.equal(oneByOne.cv.lastName, 'Georgescu');
assert.equal(oneByOne.cv.projects[0].title, 'Bro');

const source = readFileSync(new URL('./importInterpret.js', import.meta.url), 'utf8');
assert.match(source, /imageBase64.length <= 1_500_000/);
assert.match(source, /extractPdfLines/);

function be16(value) {
  return [(value >> 8) & 255, value & 255];
}

function jpegSegment(marker, payload) {
  const body = Uint8Array.from(payload);
  return Uint8Array.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]);
}

function logoJpeg() {
  const entropy = new Uint8Array(12_000);
  entropy.fill(0x22);
  return Uint8Array.from([
    0xff, 0xd8,
    ...jpegSegment(0xc0, [8, ...be16(40), ...be16(30), 1, 1, 0x11, 0]),
    ...jpegSegment(0xda, [1, 0, 0]),
    ...entropy,
    0xff, 0xd9,
  ]);
}

function textPdf(lines) {
  const commands = lines.map((line, index) => {
    const encoded = Buffer.from(line, 'latin1').toString('latin1')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
    return `BT /F1 12 Tf 40 ${760 - index * 16} Td (${encoded}) Tj ET`;
  });
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const cvLines = [
  'CURRICULUM VITAE',
  'Geir Ove Andersen',
  'Partner | Prosjekt- og prosjekteringsleder',
  'Profil',
  'Født 29.12.1986',
  'Sivil status Ugift',
  'Nasjonalitet Norsk',
  'Språk Norsk',
  'Oppsummering og nøkkelkvalifikasjoner',
  'Andersen leder prosjekter fra tidligfase til ferdigstillelse.',
  'Utdanning',
  '2020 - 2022 Høyskolen for yrkesfag - Bachelor i byggeplassledelse',
  'Erfaringer',
  'Consult1 AS',
  'Svanholmen 7, 4313 Sandnes',
  'Partner',
  '2016 - d.d.',
  'Arbeidsoppgaver',
  '- Prosjekteringsledelse og prosjektledelse',
];
const mixedPdf = Buffer.concat([textPdf(cvLines), Buffer.from(logoJpeg())]);
let mixedParts = null;
const fromText = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  mime: 'application/pdf',
  imageBase64: mixedPdf.toString('base64'),
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async (_key, _prompt, parts) => {
    mixedParts = parts;
    throw new Error('Gemini HTTP 404 (gemini-3.8-flash): model not found');
  },
});
assert.equal(mixedParts.some((part) => part.inline_data || part.inlineData), false);
assert.match(mixedParts.map((part) => part.text || '').join('\n'), /Nasjonalitet Norsk/);
assert.equal(fromText.engine, 'text');
assert.equal(fromText.cv.firstName, 'Geir');
assert.equal(fromText.cv.lastName, 'Andersen');
assert.equal(fromText.cv.headline, 'Partner | Prosjekt- og prosjekteringsleder');
assert.equal(fromText.cv.birthDate, '29.12.1986');
assert.equal(fromText.cv.maritalStatus, 'Ugift');
assert.equal(fromText.cv.nationality, 'Norsk');
assert.match(fromText.cv.summary, /tidligfase/);
assert.equal(fromText.cv.education[0].school, 'Høyskolen for yrkesfag');
assert.equal(fromText.cv.experience[0].employer, 'Consult1 AS');
assert.equal(fromText.cv.experience[0].from, '2016');
assert.equal(fromText.cv.experience[0].current, true);
assert.equal(fromText.cv.experience.length, 1);

const scanPdf = pdfFromJpegs([{ bytes: logoJpeg(), width: 30, height: 40 }]);
let scanImages = 0;
const fromScan = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  mime: 'application/pdf',
  imageBase64: Buffer.from(scanPdf).toString('base64'),
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async (_key, _prompt, parts) => {
    scanImages = parts.filter((part) => part.inline_data || part.inlineData).length;
    return { firstName: 'Skann', headline: 'Rådgiver', summaryNote: 'Bilde' };
  },
});
assert.equal(scanImages, 1);
assert.equal(fromScan.engine, 'ocr+gemini');
assert.equal(fromScan.cv.firstName, 'Skann');

function multiPageTextPdf(pageLines) {
  const count = pageLines.length;
  const fontId = 3 + count * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`,
  ];
  pageLines.forEach((lines, index) => {
    const stream = lines.map((line, lineIndex) => {
      const encoded = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 11 Tf 40 ${800 - lineIndex * 18} Td (${encoded}) Tj ET`;
    }).join('\n');
    const pageId = 3 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.length; id += 1) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body);
}

const manyLines = [
  'CURRICULUM VITAE',
  'Kari Nordmann',
  'Prosjektleder',
  'Referanseprosjekter',
];
for (let index = 1; index <= 70; index += 1) {
  manyLines.push(`Prosjekt ${String(index).padStart(3, '0')} med et langt navn`);
  manyLines.push('Kategori Offentlig');
  manyLines.push('Kunde Kommunen');
  manyLines.push('Periode 2020');
  manyLines.push('Ansvar i prosjektet Oppfolging av byggherre og prosjektering');
  manyLines.push('sammen med de andre i teamet gjennom hele perioden');
  manyLines.push(`Detalj ${String(index).padStart(3, '0')} ${'arbeid '.repeat(8).trim()}`);
  manyLines.push(`Notat ${String(index).padStart(3, '0')} ${'oppfolging '.repeat(6).trim()}`);
  manyLines.push(`Merknad ${String(index).padStart(3, '0')} ${'koordinering '.repeat(5).trim()}`);
  manyLines.push(`Videre ${String(index).padStart(3, '0')} ${'ferdigstillelse '.repeat(4).trim()}`);
}
assert.ok(manyLines.join('\n').length > 30000);
const projectPages = [];
for (let index = 0; index < manyLines.length; index += 40) projectPages.push(manyLines.slice(index, index + 40));
const manyPdf = multiPageTextPdf(projectPages);
const manyCv = await handleInterpretImport({
  familyId: 'fam',
  kind: 'cv',
  mode: 'ocr',
  mime: 'application/pdf',
  imageBase64: manyPdf.toString('base64'),
}, { uid: 'user' }, {
  ...deps,
  callGeminiJson: async () => {
    throw new Error('Gemini HTTP 404 (gemini-3.8-flash): model not found');
  },
});
assert.equal(manyCv.engine, 'text');
assert.equal(manyCv.cv.projects.length, 70);
assert.equal(manyCv.cv.projects[0].title, 'Prosjekt 001 med et langt navn');
assert.equal(manyCv.cv.projects[69].title, 'Prosjekt 070 med et langt navn');
assert.equal(manyCv.cv.projects[69].client, 'Kommunen');

console.log('importInterpret.test.mjs: ok');
