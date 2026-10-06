import assert from 'node:assert/strict';
import { customersFromTable } from '../anbud/customerImport.js';
import { planEmployeeImport } from '../employees/import.js';
import { readCustomerImport, readEmployeeImport } from './assist.js';
import {
  claimAssignments,
  columnsNeedingHelp,
  fileMedia,
  mergeCustomerRows,
  sanitizeColumnMap,
  sanitizeOcrRows,
} from './interpret.js';

const unknown = new TextEncoder().encode(
  'Juridisk navn;Organisasjonsnr;Gateadresse;Poststedet\n'
  + 'Eksempel AS;923456785;Storgata 1;Ålgård\n',
);

await assert.rejects(
  () => readCustomerImport(unknown, 'kunder.csv'),
  /Fant ingen kunder/,
);

let asked = 0;
const assisted = await readCustomerImport(unknown, 'kunder.csv', {
  familyId: 'fam',
  ask: async (payload) => {
    asked += 1;
    assert.equal(payload.mode, 'columns');
    assert.equal(payload.kind, 'customers');
    assert.equal(payload.headers[0], 'Juridisk navn');
    return {
      engine: 'gemini',
      summary: 'Navn, organisasjon og adresse',
      columns: {
        'Juridisk navn': 'name',
        Organisasjonsnr: 'orgnr',
        Gateadresse: 'address',
        Poststedet: 'place',
        Fantasi: 'name',
      },
    };
  },
});
assert.equal(asked, 1);
assert.equal(assisted.engine, 'gemini');
assert.equal(assisted.rows.length, 1);
assert.equal(assisted.rows[0].name, 'Eksempel AS');
assert.equal(assisted.rows[0].orgnr, '923456785');
assert.equal(assisted.rows[0].address, 'Storgata 1');
assert.equal(assisted.rows[0].place, 'Ålgård');

const known = new TextEncoder().encode('Navn;Org.nr;Adresse\nProTop AS;923456793;Oslo\n');
let knownAsked = 0;
const direct = await readCustomerImport(known, 'kunder.csv', {
  familyId: 'fam',
  ask: async () => { knownAsked += 1; return { columns: {} }; },
});
assert.equal(knownAsked, 0);
assert.equal(direct.engine, 'lokal');
assert.equal(direct.rows[0].address, 'Oslo');

const tricky = [
  ['Kundenavn', 'Org.nr.', 'Hovedadresse - Linje 1', 'E-faktura-adresse'],
  ['Eksempel AS', '923456785', 'Kvernstien 2', '0192:923456785'],
];
const claimed = claimAssignments(
  tricky[0],
  tricky[0].map((header) => header === 'E-faktura-adresse' ? '' : 'keep'),
  { 'E-faktura-adresse': 'email', 'Hovedadresse - Linje 1': 'address' },
);
assert.deepEqual(claimed, { 'E-faktura-adresse': 'email' });
const merged = mergeCustomerRows(
  customersFromTable(tricky),
  customersFromTable(tricky, claimed),
);
assert.equal(merged[0].address, 'Kvernstien 2');
assert.equal(merged[0].email, '');

const gaps = columnsNeedingHelp(tricky, (header) => (
  header === 'E-faktura-adresse' ? '' : 'field'
));
assert.deepEqual(gaps.map((gap) => gap.header), ['E-faktura-adresse']);

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
assert.equal(fileMedia(pdf, 'liste.bin').kind, 'pdf');
const scanned = await readCustomerImport(pdf, 'liste.pdf', {
  familyId: 'fam',
  ask: async (payload) => {
    assert.equal(payload.mode, 'ocr');
    assert.equal(payload.media.mime, 'application/pdf');
    return {
      engine: 'ocr+gemini',
      summary: 'Ett firma',
      rows: [{ name: 'Skannet AS', orgnr: '923456807', email: 'ikke-en-epost', address: 'Kaia 4' }],
    };
  },
});
assert.equal(scanned.engine, 'ocr+gemini');
assert.equal(scanned.rows[0].name, 'Skannet AS');
assert.equal(scanned.rows[0].address, 'Kaia 4');
assert.equal(scanned.rows[0].email, '');

const staff = new TextEncoder().encode('Person;Jobbmail\nAda Lovelace;ada@example.com\n');
const employee = await readEmployeeImport(staff, 'ansatte.csv', { familyId: 'fam' }, async (payload) => {
  assert.equal(payload.kind, 'employees');
  return {
    engine: 'gemini',
    columns: { Person: 'fullName', Jobbmail: 'workEmail' },
  };
});
assert.equal(employee.interpretation.engine, 'gemini');
assert.equal(employee.rows[0].action, 'create');
assert.equal(employee.rows[0].name, 'Ada Lovelace');
assert.equal(employee.rows[0].email, 'ada@example.com');

const ocrStaff = await readEmployeeImport(pdf, 'ansatte.pdf', { familyId: 'fam' }, async () => ({
  engine: 'ocr+gemini',
  rows: [{ fullName: 'Ola Nordmann', workEmail: 'ola@example.com', title: 'Rørlegger' }],
}));
assert.equal(ocrStaff.rows[0].name, 'Ola Nordmann');
assert.equal(ocrStaff.rows[0].employee.company.title, 'Rørlegger');

const mapped = sanitizeColumnMap({
  columns: [
    { header: 'Firma', field: 'name' },
    { header: 'Firma', field: 'notes' },
    { header: 'Slett', field: 'dropDatabase' },
  ],
  summary: 'Ett navn',
}, 'customers');
assert.equal(mapped.columns.Firma, 'name');
assert.equal(mapped.columns.Slett, undefined);

const ocr = sanitizeOcrRows({
  rows: [
    { name: 'Eksempel AS', email: 'uten-alfakrøll' },
    { name: '' },
  ],
}, 'customers');
assert.equal(ocr.rows.length, 1);
assert.equal(ocr.rows[0].email, undefined);

await assert.rejects(
  () => planEmployeeImport(staff, 'ansatte.csv'),
  /navnekolonne|medarbeiderliste/,
);

console.log('interpret.test.mjs: ok');
