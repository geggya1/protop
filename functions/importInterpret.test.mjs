import assert from 'node:assert/strict';
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

console.log('importInterpret.test.mjs: ok');
