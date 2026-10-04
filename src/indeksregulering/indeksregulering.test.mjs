import assert from 'node:assert/strict';
import test from 'node:test';
import { extractContractText } from './extractText.js';
import { calculate } from './engine.js';
import { interpretContract } from './interpret.js';
import { buildLetter, formatMoney } from './letter.js';
import { buildPdf, exportFiles, readZip, zipStore } from './office.js';
import { fetchAllIndices, parseSsbCsv } from './ssb.js';

const AVTALE = `
NS 8407 Totalentreprise
Byggherre: Nordvik kommune
Entreprenør: ProTop Bygg AS
Prosjekt: Skoleveien 4
Kontraktsnummer: K-2024-18
Tilbudsfrist: 15.03.2024
Tilbudsdato: 01.03.2024
Kontraktssum: 2 000 000 kr eks. mva
Regulert andel: 80 %
Indeks: boligblokk, i alt
Kontraktssummen skal indeksreguleres etter NS 3405.
Timepris tømrer 850 kr
`;

function monthSeries(values) {
  const points = Object.entries(values).map(([period, value]) => ({ period, value }));
  points.sort((a, b) => (a.period < b.period ? -1 : 1));
  return {
    id: 'bki-boligblokk',
    name: 'Boligblokk, i alt',
    table: '08655',
    basis: '2015 = 100',
    frequency: 'month',
    source: 'SSB Statistikkbanken, tabell 08655',
    url: 'https://www.ssb.no/statbank/table/08655/',
    points,
    latest: points[points.length - 1],
  };
}

test('leser NS 8407-avtale', () => {
  const draft = interpretContract(AVTALE);
  assert.equal(draft.standard, 'NS 8407');
  assert.equal(draft.model, 'ns3405');
  assert.equal(draft.indexId, 'bki-boligblokk');
  assert.equal(draft.tenderDeadline, '2024-03-15');
  assert.equal(draft.offerDate, '2024-03-01');
  assert.equal(draft.sharePercent, '80');
  assert.equal(draft.buyer, 'Nordvik kommune');
  assert.equal(draft.supplier, 'ProTop Bygg AS');
  assert.equal(draft.title, 'Skoleveien 4');
  assert.equal(draft.reference, 'K-2024-18');
  assert.equal(draft.regulationExcluded, false);
  assert.equal(draft.lines[0].rate, '850');
});

test('fast andel snus til regulert andel', () => {
  const draft = interpretContract('NS 8405. Fast andel på 20 %. Kontraktssum 500 000. Tilbudsdato 01.01.2024. Skal indeksreguleres.');
  assert.equal(draft.standard, 'NS 8405');
  assert.equal(draft.sharePercent, '80');
  assert.equal(draft.lines[0].rate, '500000');
});

test('fastpris blir ikke et krav før den overstyres', () => {
  const draft = interpretContract('NS 8406. Prisene er faste og uten indeksregulering. Kontraktssum 100 000. Tilbudsdato 02.02.2024.');
  assert.equal(draft.regulationExcluded, true);
  const result = calculate({
    ...draft,
    regulationDate: '2026-08-01',
  }, {
    'bki-bustader': monthSeries({ '2024M02': 100, '2026M08': 110 }),
  });
  assert.equal(result.ok, false);
});

test('NS 3405 med én måned og 80 prosent', () => {
  const draft = interpretContract('NS 8407. Tilbudsfrist 15.03.2024. Kontraktssum 2 000 000. Regulert andel 80 %. Boligblokk.');
  draft.regulationDate = '2026-08-15';
  const result = calculate(draft, {
    'bki-boligblokk': monthSeries({ '2024M03': 140, '2026M08': 154.4 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.basisKind, 'tilbudsfrist');
  assert.equal(result.basisPoint.period, '2024M03');
  assert.equal(result.regulationPoint.value, 154.4);
  assert.equal(result.addition, 164571.43);
  assert.equal(result.vat, 41142.86);
  assert.equal(result.payable, 205714.29);
  assert.equal(result.regulated, 2164571.43);
  const letter = buildLetter(draft, result, { today: '2026-10-04' });
  assert.match(letter.plain, /164 571,43/);
  assert.match(letter.plain, /boligblokk/i);
  assert.match(letter.plain, /NS 3405/);
  assert.match(letter.plain, /t0/);
});

test('full regulering av sats og mengde', () => {
  const result = calculate({
    standard: 'NS 8405',
    model: 'ns3405',
    indexId: 'bki-bustader',
    sharePercent: '100',
    vatPercent: '25',
    offerDate: '2024-01-10',
    regulationDate: '2026-06-01',
    lines: [{ text: 'Tømrer', quantity: '10', unit: 'time', rate: '850' }],
    periods: [],
  }, {
    'bki-bustader': monthSeries({ '2024M01': 100, '2026M06': 110 }),
  });
  assert.equal(result.baseSum, 8500);
  assert.equal(result.addition, 850);
  assert.equal(result.rows[0].newRate, 935);
});

test('månedlig produksjon bruker hver måneds indeks', () => {
  const result = calculate({
    standard: 'NS 8407',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '0',
    tenderDeadline: '2024-03-15',
    regulationDate: '2026-08-01',
    lines: [],
    periods: [
      { month: '2026-06', amount: '1000' },
      { month: '2026-08', amount: '1000' },
    ],
  }, {
    'bki-boligblokk': monthSeries({ '2024M03': 100, '2026M06': 110, '2026M08': 120 }),
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].addition, 100);
  assert.equal(result.rows[1].addition, 200);
  assert.equal(result.addition, 300);
});

test('husleie varsler når året ikke er gått', () => {
  const result = calculate({
    standard: 'husleieloven',
    model: 'husleie',
    indexId: 'kpi',
    sharePercent: '100',
    vatPercent: '25',
    offerDate: '2026-01-01',
    noticeDate: '2026-10-04',
    regulationDate: '2026-11-01',
    lines: [{ text: 'Husleie', quantity: '1', unit: 'mnd', rate: '12000' }],
  }, {
    kpi: {
      ...monthSeries({ '2026M01': 100, '2026M10': 103 }),
      id: 'kpi',
      name: 'Konsumprisindeksen',
      frequency: 'month',
    },
  }, new Date('2026-10-04T12:00:00Z'));
  assert.equal(result.ok, true);
  assert.equal(result.vat, 0);
  assert.equal(result.addition, 360);
  assert.ok(result.warnings.some((line) => line.includes('§ 4-2')));
});

test('bruker siste publiserte indeks når måneden mangler', () => {
  const result = calculate({
    standard: 'avtalt',
    model: 'engang',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '0',
    offerDate: '2024-03-01',
    regulationDate: '2026-10-04',
    lines: [{ text: 'Sum', quantity: '1', unit: 'RS', rate: '1000' }],
  }, {
    'bki-boligblokk': monthSeries({ '2024M03': 100, '2026M08': 110 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.regulationPoint.period, '2026M08');
  assert.equal(result.addition, 100);
  assert.ok(result.warnings.some((line) => line.includes('Gjeldende')));
});

test('vektet delindeks', () => {
  const arbeid = monthSeries({ '2024M01': 100, '2026M01': 110 });
  const materialer = monthSeries({ '2024M01': 100, '2026M01': 130 });
  const result = calculate({
    standard: 'avtalt',
    model: 'vektet',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '0',
    offerDate: '2024-01-15',
    regulationDate: '2026-01-15',
    lines: [{ text: 'Sum', quantity: '1', unit: 'RS', rate: '1000' }],
    weights: [
      { indexId: 'bki-bustader-arbeid', weight: '50' },
      { indexId: 'bki-bustader-materialer', weight: '50' },
    ],
  }, {
    'bki-bustader-arbeid': { ...arbeid, name: 'Arbeidskraft' },
    'bki-bustader-materialer': { ...materialer, name: 'Materialer' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.basisPoint.value, 100);
  assert.equal(result.regulationPoint.value, 120);
  assert.equal(result.addition, 200);
});

test('parser bred SSB-csv', () => {
  const csv = '"Arbeidstype","Byggindeks 2026M06","Byggindeks 2026M08"\n"20",154.6,154.4\n';
  const rows = parseSsbCsv(csv);
  assert.deepEqual(rows[0].codes, ['20']);
  assert.equal(rows[0].values['2026M08'], 154.4);
});

test('pdf, word og excel inneholder kravet', () => {
  const draft = {
    ...interpretContract('NS 8407. Tilbudsfrist 15.03.2024. Kontraktssum 2 000 000. Boligblokk. Skal indeksreguleres.'),
    supplier: 'ProTop Bygg AS',
    buyer: 'Nordvik kommune',
    regulationDate: '2026-08-15',
  };
  const result = calculate(draft, {
    'bki-boligblokk': monthSeries({ '2024M03': 140, '2026M08': 154.4 }),
  });
  assert.equal(result.addition, 205714.29);
  const letter = buildLetter(draft, result, { today: '2026-10-04' });
  const files = exportFiles(draft, result, letter, [monthSeries({ '2024M03': 140, '2026M08': 154.4 })]);
  const pdf = new TextDecoder().decode(files[0].bytes);
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /Indeksregulering/);
  assert.match(pdf, /205 714,29|205714/);
  const docx = readZip(files[1].bytes);
  const word = new TextDecoder().decode(docx['word/document.xml']);
  assert.match(word, /205714\.29/);
  assert.match(word, /ProTop Bygg AS/);
  const xlsx = readZip(files[2].bytes);
  const sheet = new TextDecoder().decode(xlsx['xl/worksheets/sheet2.xml']);
  assert.match(sheet, /205714\.29/);
  assert.equal(formatMoney(result.addition), '205 714,29');
});

test('leser tekst ut av pdf og word', async () => {
  const pdf = buildPdf({
    paragraphs: [{ heading: 'Avtale', lines: ['NS 8407 Kontraktssum 2000000 Tilbudsdato 15.03.2024'] }],
  });
  const fromPdf = await extractContractText(pdf, 'avtale.pdf', 'application/pdf');
  assert.match(fromPdf, /NS 8407/);
  const docx = zipStore([{
    name: 'word/document.xml',
    data: '<w:document><w:p><w:t>NS 8405 Kontraktssum 500000</w:t></w:p></w:document>',
  }]);
  const fromDocx = await extractContractText(docx, 'avtale.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(fromDocx, /NS 8405/);
});

test('henter boligblokk og KPI fra SSB', { timeout: 60000 }, async () => {
  const bundle = await fetchAllIndices();
  const bolig = bundle.series['bki-boligblokk'];
  const kpi = bundle.series.kpi;
  assert.ok(bolig?.latest?.value > 120 && bolig.latest.value < 220, JSON.stringify(bolig?.latest));
  assert.ok(bolig.latest.period >= '2026M06');
  assert.equal(bolig.table, '08655');
  assert.ok(kpi?.latest?.value > 90 && kpi.latest.value < 140, JSON.stringify(kpi?.latest));
  assert.ok(bundle.series['bki-veg']?.latest?.value > 90);
  assert.ok(bundle.series['bki-ror']?.latest?.value > 100);
  const draft = interpretContract(AVTALE);
  draft.lines = [{ text: 'Kontraktssum', quantity: '1', unit: 'RS', rate: '2000000' }];
  draft.sharePercent = '100';
  draft.regulationDate = '2026-08-15';
  const result = calculate(draft, bundle.series);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.series.name, 'Boligblokk, i alt');
  assert.ok(result.regulationPoint.value > 0);
  assert.ok(result.basisPoint.value > 0);
});
