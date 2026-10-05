import assert from 'node:assert/strict';
import { parseCustomerFile } from './customerImport.js';
import { zipStore } from '../indeksregulering/office.js';

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

console.log('customerImport.test.mjs: ok');
