import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import {
  buildSheetImport, columnIndex, detectHeaderRow, excelDate, fieldValue, parseCsv, planSheetImport, readSpreadsheet, suggestMapping,
} from './spreadsheet.js';
import { registerDef } from './registers.js';

const actor = { uid: 'u1', name: 'Kari Kvalitet' };

/** En liten .xlsm slik Excel lagrer den: delte strenger, datoformat og et skjult ark. */
function workbook() {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <workbookPr/>
        <sheets>
          <sheet name="Risiko-register" sheetId="1" r:id="rId1"/>
          <sheet name="Oppslag" sheetId="2" state="hidden" r:id="rId2"/>
        </sheets>
      </workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/>
      </Relationships>`,
    'xl/sharedStrings.xml': `<?xml version="1.0"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <si><t>Risikoregister Consult1</t></si>
        <si><t>ID</t></si>
        <si><t>Aktivitet</t></si>
        <si><t>Uønsket hendelse</t></si>
        <si><t>Sannsynlighet</t></si>
        <si><t>Konsekvens</t></si>
        <si><t>Tiltak</t></si>
        <si><t>Ansvarlig</t></si>
        <si><t>Neste vurdering</t></si>
        <si><t>Strategisk</t></si>
        <si><t>R01</t></si>
        <si><t>Salg</t></si>
        <si><r><t>Tap av </t></r><r><rPr><b/></rPr><t>nøkkelkunde</t></r></si>
        <si><t>Kundeoppfølging &amp; avtaler</t></si>
        <si><t>Daglig leder</t></si>
        <si><t>R02</t></si>
        <si><t>Drift</t></si>
        <si><t>IT-bortfall</t></si>
        <si><t>Sju</t></si>
      </sst>`,
    'xl/styles.xml': `<?xml version="1.0"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts>
        <cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs>
      </styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c></row>
        <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c><c r="D3" t="s"><v>4</v></c><c r="E3" t="s"><v>5</v></c><c r="F3" t="s"><v>6</v></c><c r="G3" t="s"><v>7</v></c><c r="H3" t="s"><v>8</v></c></row>
        <row r="4"><c r="A4" t="s"><v>9</v></c></row>
        <row r="5"><c r="A5" t="s"><v>10</v></c><c r="B5" t="s"><v>11</v></c><c r="C5" t="s"><v>12</v></c><c r="D5"><v>3</v></c><c r="E5"><v>4</v></c><c r="F5" t="s"><v>13</v></c><c r="G5" t="s"><v>14</v></c><c r="H5" s="1"><v>46387</v></c></row>
        <row r="6"><c r="A6" t="s"><v>15</v></c><c r="B6" t="s"><v>16</v></c><c r="C6" t="s"><v>17</v></c><c r="D6" t="s"><v>18</v></c><c r="E6"><v>2</v></c><c r="G6" t="inlineStr"><is><t>Kvalitetsleder</t></is></c></row>
      </sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
    'xl/vbaProject.bin': 'binær makro',
  };
  const zip = {};
  for (const [k, v] of Object.entries(files)) zip[k] = strToU8(v);
  return zipSync(zip);
}

test('readSpreadsheet: .xlsm med delte strenger, datoer, rik tekst og skjult ark', () => {
  const { sheets } = readSpreadsheet(workbook(), 'Risikoregister.xlsm');
  assert.deepEqual(sheets.map((s) => [s.name, s.hidden]), [['Risiko-register', false], ['Oppslag', true]]);
  const rows = sheets[0].rows;
  assert.equal(rows[0][0], 'Risikoregister Consult1');
  assert.deepEqual(rows[1], []);
  assert.equal(rows[4][2], 'Tap av nøkkelkunde');
  assert.equal(rows[4][5], 'Kundeoppfølging & avtaler');
  assert.equal(rows[4][7], excelDate(46387));
  assert.equal(rows[5][6], 'Kvalitetsleder');
});

test('hjelpere: kolonner, datoer og CSV fra SharePoint-eksport', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('AB12'), 27);
  assert.equal(excelDate(45658), '2025-01-01');
  const rows = parseCsv('﻿Tittel;Kategori;Merknad\n"Leverandør; A";Kritisk;"Sier ""ja"""\r\nB;Lav;\n');
  assert.deepEqual(rows, [['Tittel', 'Kategori', 'Merknad'], ['Leverandør; A', 'Kritisk', 'Sier "ja"'], ['B', 'Lav', '']]);
  assert.throws(() => readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), 'gammel.xls'), /lagre som \.xlsx/);
});

test('detectHeaderRow og suggestMapping finner kolonnene i et risikoregister', () => {
  const rows = readSpreadsheet(workbook(), 'Risikoregister.xlsm').sheets[0].rows;
  const header = detectHeaderRow(rows);
  assert.equal(header, 2);
  const mapping = suggestMapping(rows[header], 'risiko');
  assert.equal(mapping.title, 2, 'Uønsket hendelse → risiko');
  assert.equal(mapping.activity, 1);
  assert.equal(mapping.inherentL, 3);
  assert.equal(mapping.inherentC, 4);
  assert.equal(mapping.plan, 5);
  assert.equal(mapping.ownerName, 6);
  assert.equal(mapping.nextReview, 7);
});

test('fieldValue tolker tall, datoer, valg og lister', () => {
  const def = registerDef('risiko');
  const f = (k) => def.fields.find((x) => x.key === k);
  assert.deepEqual(fieldValue(f('inherentL'), '4,0'), { value: 4 });
  assert.deepEqual(fieldValue(f('nextReview'), '31.12.2026'), { value: '2026-12-31' });
  assert.deepEqual(fieldValue(f('category'), 'arbeidsmiljø'), { value: 'arbeidsmiljo' });
  assert.ok(fieldValue(f('category'), 'Romfart').error);
  const months = registerDef('aarshjul').fields.find((x) => x.key === 'months');
  assert.deepEqual(fieldValue(months, 'Januar, juni').value, ['Januar', 'Juni']);
});

test('planSheetImport og buildSheetImport: mellomoverskrifter, standardverdier, feil og idempotens', () => {
  const rows = readSpreadsheet(workbook(), 'Risikoregister.xlsm').sheets[0].rows;
  const mapping = suggestMapping(rows[2], 'risiko');
  const plan = planSheetImport({
    registerKey: 'risiko', rows, headerRow: 2, mapping, defaults: { kind: 'Risiko' }, groupField: 'category',
    fileName: 'Risikoregister.xlsm', sheetName: 'Risiko-register',
  });
  assert.equal(plan.rows.length, 2);
  const [r1, r2] = plan.rows;
  assert.equal(r1.status, 'ny');
  assert.equal(r1.values.category, 'strategisk', 'mellomoverskriften «Strategisk» blir kategori');
  assert.equal(r1.values.kind, 'Risiko');
  assert.equal(r1.values.inherentL, 3);
  assert.equal(r1.values.importKey, 'xlsx:risikoregister:risiko-register:5');
  assert.equal(r2.status, 'feil', '«Sju» er ikke et tall');
  assert.match(r2.errors.join(' '), /Sju/);

  const built = buildSheetImport(plan, 'risiko', { actor });
  assert.equal(built.ok, true);
  assert.equal(built.records.length, 1);
  assert.equal(built.records[0].title, 'Tap av nøkkelkunde');
  assert.equal(built.records[0].origin.system, 'Excel');

  const again = planSheetImport({
    registerKey: 'risiko', rows, headerRow: 2, mapping, defaults: { kind: 'Risiko' }, groupField: 'category',
    fileName: 'Risikoregister.xlsm', sheetName: 'Risiko-register', existing: built.records,
  });
  assert.equal(again.counts.finnes, 1);
  assert.equal(again.counts.ny, 0);
});

test('koblede felt: kompetansebevis finner kravet etter navn eller nummer', () => {
  const krav = [{ id: 'k1', register: 'kompetansekrav', number: 'KKR-2026-001', title: 'Arbeid på vei', state: 'aktiv' }];
  const rows = [['Ansatt', 'Krav', 'Kurs', 'Gyldig til'], ['Ada Nordmann', 'arbeid på vei', 'Kurs 1', '01.06.2027'], ['Bo', 'Ukjent kurs', 'X', '']];
  const mapping = suggestMapping(rows[0], 'kompetanse');
  assert.equal(mapping.requirementId, 1);
  const plan = planSheetImport({ registerKey: 'kompetanse', rows, mapping, fileName: 'Kurs.xlsx', sheetName: 'Ark1', refs: { kompetansekrav: krav } });
  assert.equal(plan.rows[0].status, 'ny');
  assert.equal(plan.rows[0].values.requirementId, 'k1');
  assert.equal(plan.rows[0].values.validTo, '2027-06-01');
  assert.equal(plan.rows[1].status, 'feil');
  assert.match(plan.rows[1].errors.join(' '), /Fant ikke «Ukjent kurs»/);
});
