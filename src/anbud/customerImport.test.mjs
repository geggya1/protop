import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';
import { parseCustomerFile } from './customerImport.js';
import { zipStore } from '../indeksregulering/office.js';

function u16(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}
function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(n);
  return buf;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Excel-style ZIP: local headers have size 0 and a data descriptor after the payload. */
function zipWithDataDescriptor(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.from(file.data);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(8), u16(8), u16(0), u16(0),
      u32(0), u32(0), u32(0), u16(name.length), u16(0),
      name, compressed,
      u32(0x08074b50), u32(crc), u32(compressed.length), u32(raw.length),
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(8), u16(8), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...locals, central, end]));
}

const csv = await parseCustomerFile(new TextEncoder().encode(
  'Navn;Org.nr;Adresse;Postnr;Poststed;E-post;Telefon\n'
  + 'Igang AS;922987106;Storgata 1;8006;Bodø;post@igang.no;92082276\n'
  + 'Kari Nordmann;;Gate 2;0001;Oslo;kari@ex.no;99999999\n',
), 'kunder.csv');
assert.equal(csv.length, 2);
assert.equal(csv[0].name, 'Igang AS');
assert.equal(csv[0].orgnr, '922987106');
assert.equal(csv[0].place, 'Bodø');
assert.equal(csv[1].name, 'Kari Nordmann');
assert.equal(csv[1].email, 'kari@ex.no');

const xml = await parseCustomerFile(new TextEncoder().encode(`<?xml version="1.0"?>
<kunder>
  <kunde>
    <navn>Sola kommune</navn>
    <orgnr>964967668</orgnr>
    <adresse>Rådhuset</adresse>
    <postnr>4050</postnr>
    <poststed>Sola</poststed>
    <epost>post@sola.kommune.no</epost>
  </kunde>
  <kunde>
    <navn>Ola Nordmann</navn>
    <personnummer>01017012345</personnummer>
    <type>privat</type>
  </kunde>
</kunder>`), 'kunder.xml');
assert.equal(xml.length, 2);
assert.equal(xml[0].orgnr, '964967668');
assert.equal(xml[1].personnummer, '01017012345');
assert.equal(xml[1].kind, 'person');

const xlsx = zipStore([
  {
    name: 'xl/worksheets/sheet1.xml',
    data: `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Navn</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Org.nr</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Adresse</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>ProTop AS</t></is></c>
      <c r="B2" t="inlineStr"><is><t>123456789</t></is></c>
      <c r="C2" t="inlineStr"><is><t>Oslo</t></is></c>
    </row>
  </sheetData>
</worksheet>`,
  },
]);
const sheet = await parseCustomerFile(xlsx, 'kunder.xlsx');
assert.equal(sheet.length, 1);
assert.equal(sheet[0].name, 'ProTop AS');
assert.equal(sheet[0].orgnr, '123456789');
assert.equal(sheet[0].address, 'Oslo');

const poweroffice = await parseCustomerFile(new TextEncoder().encode(
  'Kundenummer;Kundenavn;Org.nr.;Hovedadresse - Linje 1;Hovedadresse - Postnummer;Hovedadresse - Postal sted;E-post;MVA-nummer\n'
  + '10180;3dvibber AS;920273068;Kvernstien 2;4073;Randaberg;;0192:920273068\n',
), 'overview.csv');
assert.equal(poweroffice.length, 1);
assert.equal(poweroffice[0].name, '3dvibber AS');
assert.equal(poweroffice[0].orgnr, '920273068');
assert.equal(poweroffice[0].address, 'Kvernstien 2');
assert.equal(poweroffice[0].postalCode, '4073');
assert.equal(poweroffice[0].place, 'Randaberg');

const descriptorSheet = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Kundenavn</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Org.nr.</t></is></c>
      <c r="C1" t="inlineStr"><is><t>Hovedadresse - Linje 1</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>3dvibber AS</t></is></c>
      <c r="B2" t="inlineStr"><is><t>920273068</t></is></c>
      <c r="C2" t="inlineStr"><is><t>Kvernstien 2</t></is></c>
    </row>
  </sheetData>
</worksheet>`;
const described = await parseCustomerFile(zipWithDataDescriptor([
  { name: 'xl/worksheets/sheet1.xml', data: descriptorSheet },
]), 'overview.xlsx');
assert.equal(described.length, 1);
assert.equal(described[0].name, '3dvibber AS');
assert.equal(described[0].orgnr, '920273068');
assert.equal(described[0].address, 'Kvernstien 2');

const sample = '/home/ubuntu/.cursor/projects/workspace/uploads/overview_86e1.xlsx';
if (existsSync(sample)) {
  const live = await parseCustomerFile(new Uint8Array(readFileSync(sample)), 'overview.xlsx');
  assert.ok(live.length >= 40, `expected PowerOffice rows, got ${live.length}`);
  const first = live.find((row) => row.name === '3dvibber AS');
  assert.equal(first?.orgnr, '920273068');
  assert.equal(first?.address, 'Kvernstien 2');
  assert.equal(first?.place, 'Randaberg');
}

console.log('customerImport.test.mjs: ok');
