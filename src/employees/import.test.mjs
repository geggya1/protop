import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { zipStore } from '../indeksregulering/office.js';
import { planEmployeeImport } from './import.js';
import { displayName, normalizeEmployee, validNationalId } from './model.js';

function sampleNationalId(seed = '010180') {
  const weights1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const weights2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const rest = (sum) => {
    const mod = 11 - (sum % 11);
    return mod === 11 ? 0 : mod;
  };
  for (let n = 0; n < 800; n += 1) {
    const nine = `${seed}${String(n).padStart(3, '0')}`.slice(0, 9);
    const nums = [...nine].map(Number);
    const k1 = rest(weights1.reduce((sum, weight, index) => sum + weight * nums[index], 0));
    if (k1 === 10) continue;
    const ten = [...nums, k1];
    const k2 = rest(weights2.reduce((sum, weight, index) => sum + weight * ten[index], 0));
    if (k2 === 10) continue;
    return `${nine}${k1}${k2}`;
  }
  throw new Error('fant ikke gyldig test-personnummer');
}

const FNR = sampleNationalId();
const serial = Math.round((Date.UTC(1981, 3, 8) - Date.UTC(1899, 11, 30)) / 86400000);

function colName(index) {
  let n = index + 1;
  let out = '';
  while (n) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function rowXml(rowNumber, values) {
  const cells = values.map((value, index) => {
    if (value == null || value === '') return '';
    const ref = `${colName(index)}${rowNumber}`;
    if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
    const text = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  }).join('');
  return `<row r="${rowNumber}">${cells}</row>`;
}

function sheet(rows) {
  return `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows.join('')}</sheetData>
</worksheet>`;
}

const headers = [
  'Navn', 'E-post', 'Mobil', 'Avdeling', 'Tittel', 'Ansettelsesstatus', 'Tilgangsstyringsrolle',
  'Kan logge inn', 'Lisens', 'Behandle juridiske saker', 'Fakturering', 'Timeregistrering', 'Administrator',
  'Personnummer', 'Fødselsdato', 'Arbeidsprosent', 'Eksternt ansattnummer', 'Type ansatt',
  'Standard rolle på prosjekter', 'Kommentar fra HR',
];

const geir = [
  'Geir Ove Andersen', 'geir@firma.example', '90011122', 'Bygg #1', 'Prosjekt- og byggeleder', 'Nåværende', 'Leder',
  'Ja', 'Ja', 'Ja', 'Ja', 'Nei', 'Ja',
  FNR, serial, '100', '1042', 'Fast ansatt',
  'Prosjektleder', 'Nøkkelperson',
];
const geirAgain = [...geir];
geirAgain[2] = '91122333';
const xlsx = zipStore([
  { name: 'xl/worksheets/sheet1.xml', data: sheet([rowXml(1, ['Oversikt'])]) },
  {
    name: 'xl/worksheets/sheet2.xml',
    data: sheet([
      rowXml(1, ['Medarbeidere']),
      rowXml(3, headers),
      rowXml(4, geir),
      rowXml(5, ['Ada Nordmann', 'ada@nord.example', '', 'Bygg #2', '', 'Nåværende', '', 'Nei', 'Nei', 'Nei', 'Nei', 'Nei', 'Nei', '', '', '80']),
      rowXml(6, ['Kari Moen', 'kari@firma.example', '', 'Ukjent avdeling', 'Rådgiver', 'Sluttet', 'Lesetilgang', 'Ja', 'Nei', 'Nei', '', '', '', '', '08.04.1981', '0,5', '', 'Ekstern']),
      rowXml(7, ['Ola Ugyldig', 'ola@firma.example', '90000001', '', '', 'Nåværende', '', '', '', '', '', '', '', '01018000000']),
      rowXml(8, ['Kari', 'kari.en@firma.example', '90000002']),
      rowXml(9, ['Eva Dahl', 'eva@firma.example', '90000003', '', '', 'Nåværende', 'Medarbeider', 'Nei', 'Nei', 'Nei', '', '', '', '', '32.13.2020']),
      rowXml(10, ['Nils Holm', 'nils@firma.example', '90000004', '', '', 'Nåværende', '', 'Ja', 'Nei', 'Nei', 'Nei', 'Nei', 'Ja']),
      rowXml(11, geirAgain),
    ]),
  },
]);

const ada = normalizeEmployee({
  id: 'emp-ada',
  personUid: 'user-ada',
  person: { firstName: 'Ada', lastName: 'Nordmann', email: 'ada@nord.example', phone: '+4799376973' },
  company: {
    title: 'Prosjektleder',
    accessRole: 'Medarbeider',
    canLogin: true,
    hasLicense: true,
    departmentIds: ['d2'],
    extraDepartments: ['Anlegg #2'],
    permissions: ['Gammel rettighet'],
  },
  cv: { summary: 'Beholdes.' },
});

const plan = await planEmployeeImport(xlsx, 'overview (2).xlsx', {
  existing: [ada],
  departments: [
    { id: 'd1', name: 'Bygg #1' },
    { id: 'd2', name: 'Bygg #2' },
  ],
});

assert.deepEqual(plan.permissionColumns, ['Fakturering', 'Timeregistrering', 'Administrator']);
assert.deepEqual(plan.customColumns, ['Kommentar fra HR']);
const byName = Object.fromEntries(plan.rows.map((row) => [row.name, row]));
assert.equal(byName['Geir Ove Andersen'].action, 'create');
assert.equal(plan.rows.filter((row) => row.name === 'Geir Ove Andersen').length, 1);
const geirRow = byName['Geir Ove Andersen'].employee;
assert.equal(geirRow.person.firstName, 'Geir');
assert.equal(geirRow.person.middleName, 'Ove');
assert.equal(geirRow.person.lastName, 'Andersen');
assert.equal(geirRow.person.phone.startsWith('+47'), true);
assert.equal(geirRow.person.phone.endsWith('91122333'), true);
assert.equal(geirRow.person.birthDate, '1981-04-08');
assert.equal(validNationalId(geirRow.person.nationalId), true);
assert.equal(geirRow.company.accessRole, 'Leder');
assert.deepEqual(geirRow.company.permissions, ['Fakturering', 'Administrator']);
assert.equal(geirRow.company.canLogin, true);
assert.equal(geirRow.company.hasLicense, true);
assert.equal(geirRow.company.canHandleLegal, true);
assert.equal(geirRow.company.projectRole, 'Prosjektleder');
assert.equal(geirRow.company.externalEmployeeNumber, '1042');
assert.deepEqual(geirRow.company.departmentIds, ['d1']);
assert.equal(geirRow.customFields.some((field) => field.label === 'Kommentar fra HR' && field.value === 'Nøkkelperson' && field.owner === 'company'), true);
assert.equal(geirRow.adminUids, undefined);
assert.equal(geirRow.isAdmin, undefined);

const adaRow = byName['Ada Nordmann'];
assert.equal(adaRow.action, 'update');
assert.equal(adaRow.employee.id, 'emp-ada');
assert.equal(adaRow.employee.personUid, 'user-ada');
assert.equal(adaRow.employee.company.title, 'Prosjektleder');
assert.equal(adaRow.employee.company.accessRole, 'Medarbeider');
assert.equal(adaRow.employee.company.canLogin, false);
assert.equal(adaRow.employee.company.hasLicense, false);
assert.deepEqual(adaRow.employee.company.permissions, []);
assert.deepEqual(adaRow.employee.company.departmentIds, ['d2']);
assert.deepEqual(adaRow.employee.company.extraDepartments, []);
assert.equal(adaRow.employee.company.workPercent, '80');
assert.equal(adaRow.employee.cv.summary, 'Beholdes.');

const kari = byName['Kari Moen'].employee;
assert.equal(kari.company.status, 'former');
assert.equal(kari.company.accessRole, 'Lesetilgang');
assert.equal(kari.company.external, true);
assert.equal(kari.company.canLogin, true);
assert.equal(kari.company.workPercent, '50');
assert.equal(kari.person.birthDate, '1981-04-08');
assert.deepEqual(kari.company.extraDepartments, ['Ukjent avdeling']);

assert.equal(byName['Ola Ugyldig'].action, 'skip');
assert.match(byName['Ola Ugyldig'].reason, /Personnummer/);
assert.equal(byName['Ola Ugyldig'].employee, null);
assert.equal(byName.Kari.action, 'skip');
assert.match(byName.Kari.reason, /etternavn/);
assert.equal(byName['Eva Dahl'].action, 'create');
assert.equal(byName['Eva Dahl'].employee.person.birthDate, '');
assert.ok(byName['Eva Dahl'].warnings.some((line) => line.includes('Fødselsdato')));
assert.equal(byName['Eva Dahl'].employee.company.accessRole, 'Medarbeider');
assert.equal(byName['Nils Holm'].employee.company.accessRole, 'Administrator');
assert.deepEqual(byName['Nils Holm'].employee.company.permissions, ['Administrator']);
assert.equal(byName['Nils Holm'].employee.isAdmin, undefined);

const csv = await planEmployeeImport(new TextEncoder().encode(
  'Fornavn;Etternavn;E-post;Rettigheter;Avdeling\n'
  + 'Bo;Berg;bo@firma.example;"Administrator, Fakturering";Bygg #1\n',
), 'overview.csv', { departments: [{ id: 'd1', name: 'Bygg #1' }] });
assert.equal(csv.rows.length, 1);
assert.equal(csv.rows[0].action, 'create');
assert.equal(csv.rows[0].employee.company.accessRole, 'Administrator');
assert.deepEqual(csv.rows[0].employee.company.permissions, ['Administrator', 'Fakturering']);
assert.deepEqual(csv.rows[0].employee.company.departmentIds, ['d1']);
assert.equal(displayName(csv.rows[0].employee), 'Bo Berg');

function le(n, size) {
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  if (size === 2) view.setUint16(0, n, true);
  else view.setUint32(0, n, true);
  return out;
}
function joinBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function deflatedSheet(xml) {
  const raw = new TextEncoder().encode(xml);
  const compressed = zlib.deflateRawSync(raw);
  const name = new TextEncoder().encode('xl/worksheets/sheet1.xml');
  const crc = crc32(raw);
  const local = joinBytes([
    le(0x04034b50, 4), le(20, 2), le(8, 2), le(8, 2), le(0, 2), le(0, 2),
    le(0, 4), le(0, 4), le(0, 4), le(name.length, 2), le(0, 2),
    name, compressed,
    le(0x08074b50, 4), le(crc, 4), le(compressed.length, 4), le(raw.length, 4),
  ]);
  const central = joinBytes([
    le(0x02014b50, 4), le(20, 2), le(20, 2), le(8, 2), le(8, 2), le(0, 2), le(0, 2),
    le(crc, 4), le(compressed.length, 4), le(raw.length, 4),
    le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4),
    name,
  ]);
  const eocd = joinBytes([
    le(0x06054b50, 4), le(0, 2), le(0, 2), le(1, 2), le(1, 2),
    le(central.length, 4), le(local.length, 4), le(0, 2),
  ]);
  return joinBytes([local, central, eocd]);
}

const packed = deflatedSheet(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Navn</t></is></c>
      <c r="B1" t="inlineStr"><is><t>E-post</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Tilgangsstyringsrolle</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Liv Haug</t></is></c>
      <c r="B2" t="inlineStr"><is><t>liv@firma.example</t></is></c>
      <c r="C2" t="inlineStr"><is><t>Administrator</t></is></c>
    </row>
  </sheetData>
</worksheet>`);
const packedPlan = await planEmployeeImport(packed, 'overview (2).xlsx');
assert.equal(packedPlan.rows[0].name, 'Liv Haug');
assert.equal(packedPlan.rows[0].employee.company.accessRole, 'Administrator');
assert.equal(packedPlan.rows[0].employee.isAdmin, undefined);

console.log('import.test.mjs: ok');
