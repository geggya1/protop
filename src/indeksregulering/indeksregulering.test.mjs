import assert from 'node:assert/strict';
import test from 'node:test';
import { extractContractText, MAX_LOCAL_PDF_BYTES } from './extractText.js';
import { calculate } from './engine.js';
import { createProject, emptyProjectState, postEntry } from '../project/engine.js';
import { interpretContract, interpretDocuments, mergeInterpretation } from './interpret.js';
import { buildLetter, formatMoney } from './letter.js';
import { buildPdf, exportFiles, readZip, zipStore } from './office.js';
import { fetchAllIndices, parseSsbCsv } from './ssb.js';
import { dueRegulations, dueByContractId, indexNews, regulationStatus, shouldCheckToday } from './watch.js';
import { agreementSheet, firstRegulationDate } from './summary.js';

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
  assert.equal(draft.lines.find((line) => line.unit === 'time').rate, '850');
  assert.equal(draft.lines.find((line) => line.text === 'Kontraktssum').included, false);
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

test('avkrysset linje holdes utenfor kravet', () => {
  const result = calculate({
    standard: 'NS 8407',
    model: 'engang',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '0',
    offerDate: '2024-03-01',
    regulationDate: '2026-08-01',
    lines: [
      { text: 'Kontraktssum', quantity: '1', unit: 'RS', rate: '2000000', included: false },
      { text: 'Tømrer', quantity: '10', unit: 'time', rate: '850', included: true },
    ],
  }, {
    'bki-boligblokk': monthSeries({ '2024M03': 100, '2026M08': 110 }),
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.baseSum, 8500);
  assert.equal(result.addition, 850);
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

test('tillegget kan føres som endringsinntekt', () => {
  const created = createProject(emptyProjectState(), {
    name: 'Skoleveien 4',
    number: 'P-1',
    client: 'Nordvik kommune',
    phase: 'produksjon',
  });
  assert.equal(created.ok, true);
  const result = calculate({
    standard: 'NS 8407',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '25',
    tenderDeadline: '2024-03-15',
    regulationDate: '2026-08-15',
    lines: [{ text: 'Kontraktssum', quantity: '1', unit: 'RS', rate: '2000000', included: true }],
  }, {
    'bki-boligblokk': monthSeries({ '2024M03': 139, '2026M08': 154.4 }),
  });
  assert.equal(result.addition, 221582.73);
  const booked = postEntry(created.state, {
    kind: 'income',
    account: '3100',
    costCode: '19',
    text: `Indeksregulering ${result.regulationPoint.period}`,
    amount: result.addition,
    date: result.regulationDate,
  });
  assert.equal(booked.ok, true, booked.error);
  assert.equal(booked.state.entries[0].amount, 221582.73);
  assert.equal(booked.state.entries[0].account, '3100');
});

test('NS 3405 bruker terskel, tak og kontraktsdato når avtalen sier det', () => {
  const draft = interpretContract(`
    NS 8405. Tilbudsdato 01.03.2024. Kontraktsdato 15.01.2024.
    Basismåned er kontraktsdato. Kontraktssum 100 000.
    Terskel 3 %. Maksimalt regulering 10 %.
    Materialandel: 40 %
    Skal indeksreguleres etter NS 3405.
  `);
  assert.equal(draft.terms.baseRule, 'contract');
  assert.equal(draft.terms.thresholdPercent, '3');
  assert.equal(draft.terms.capPercent, '10');
  assert.equal(draft.terms.variables[0].name, 'Materialandel');
  const small = calculate({ ...draft, regulationDate: '2026-08-01' }, {
    'bki-bustader': monthSeries({ '2024M01': 100, '2026M08': 102 }),
  });
  assert.equal(small.addition, 0);
  assert.match(small.warnings.join(' '), /terskel/i);
  const capped = calculate({ ...draft, regulationDate: '2026-08-01' }, {
    'bki-bustader': monthSeries({ '2024M01': 100, '2026M08': 130 }),
  });
  assert.equal(capped.addition, 10000);
  assert.match(capped.warnings.join(' '), /tak/i);
});

test('senere avtaledokument endrer andelen', () => {
  const draft = interpretDocuments([
    { name: 'Kontrakt', text: 'NS 8407. Tilbudsfrist 15.03.2024. Kontraktssum 2 000 000. Regulert andel 100 %. Boligblokk. Skal indeksreguleres etter NS 3405.' },
    { name: 'Tillegg', text: 'Tilleggsavtale. Regulert andel 60 %. Timepris rådgiver 1200 kr.' },
  ]);
  assert.equal(draft.sharePercent, '60');
  assert.equal(draft.documents.length, 2);
  assert.ok(draft.lines.some((line) => line.rate === '1200'));
});

test('AI-sats som ikke står i teksten blir forkastet', () => {
  const source = 'NS 8407. Tilbudsfrist 15.03.2024. Kontraktssum 2 000 000. Regulert andel 80 %.';
  const local = interpretContract(source);
  const merged = mergeInterpretation(local, {
    lines: [{ text: 'Oppfunnet', quantity: 1, unit: 'RS', rate: 999999 }],
    sharePercent: 55,
  }, source);
  assert.equal(merged.lines[0].rate, '2000000');
  assert.equal(merged.sharePercent, '80');
});

test('egen indeks på en linje', () => {
  const result = calculate({
    standard: 'avtalt',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '0',
    offerDate: '2024-03-01',
    regulationDate: '2026-08-01',
    lines: [
      { text: 'Materialer', quantity: '1', unit: 'RS', rate: '1000', indexId: 'bki-bustader-materialer', included: true },
    ],
  }, {
    'bki-boligblokk': monthSeries({ '2024M03': 100, '2026M08': 110 }),
    'bki-bustader-materialer': {
      ...monthSeries({ '2024M03': 100, '2026M08': 150 }),
      id: 'bki-bustader-materialer',
      name: 'Materialer',
    },
  });
  assert.equal(result.rows[0].index, 150);
  assert.equal(result.addition, 500);
});

test('varsler når SSB publiserer ny indeks', () => {
  assert.equal(shouldCheckToday('2026-10-03', new Date('2026-10-04T10:00:00Z')), true);
  assert.equal(shouldCheckToday('2026-10-04', new Date('2026-10-04T08:00:00Z')), false);
  const news = indexNews(
    { 'bki-boligblokk': { name: 'Boligblokk', period: '2026M07', value: 150 } },
    { 'bki-boligblokk': { name: 'Boligblokk', period: '2026M08', value: 154.4 } },
  );
  assert.equal(news.length, 1);
  assert.equal(news[0].period, '2026M08');
  const due = dueRegulations([{
    id: 'ir-1',
    title: 'Skole',
    regulatedPeriod: '2026M07',
    draft: { indexId: 'bki-boligblokk', title: 'Skole', terms: { frequency: 'month' } },
  }], {
    'bki-boligblokk': { name: 'Boligblokk', latest: { period: '2026M08', value: 154.4 } },
  });
  assert.equal(due[0].title, 'Skole');
  assert.equal(due[0].period, '2026M08');

  const never = regulationStatus({
    draft: { indexId: 'bki-boligblokk', title: 'Kai', terms: { frequency: 'month' } },
    regulatedPeriod: '',
    series: { 'bki-boligblokk': { latest: { period: '2026M08', value: 154.4 } } },
    today: '2026-09-01',
  });
  assert.equal(never.due, true);
  assert.match(never.reason, /ikke indeksregulert/);

  const locked = regulationStatus({
    draft: {
      indexId: 'bki-boligblokk',
      firstRegulationDate: '2027-01-01',
      terms: { frequency: 'year' },
    },
    regulatedPeriod: '',
    series: { 'bki-boligblokk': { latest: { period: '2026M08', value: 154.4 } } },
    today: '2026-09-01',
  });
  assert.equal(locked.due, false);
  assert.equal(locked.allowed, false);
  assert.match(locked.reason, /bundet/);

  const byContract = dueByContractId([{
    id: 'c1',
    title: 'Kai',
    indexDraft: { indexId: 'bki-boligblokk', terms: { frequency: 'month' } },
  }], [], {
    'bki-boligblokk': { latest: { period: '2026M08', value: 154.4 } },
  }, '2026-09-01');
  assert.equal(byContract.c1.due, true);
});

test('fremsiden samler avtalefeltene', () => {
  const draft = interpretContract(`
NS 8407
Byggherre: Nordvik kommune
Entreprenør: ProTop Bygg AS
Prosjekt: Skoleveien 4
Tilbudsdato: 01.03.2024
Tilbudsfrist: 15.03.2024
Første reguleringsdato: 01.05.2024
Kontraktssum: 2 000 000
Regulert andel: 80 %
Indeks: boligblokk
Skal indeksreguleres etter NS 3405.
  `);
  assert.equal(draft.firstRegulationDate, '2024-05-01');
  assert.deepEqual(draft.terms.variables, []);
  assert.equal(firstRegulationDate(draft), '2024-05-01');
  assert.equal(firstRegulationDate({ ...draft, firstRegulationDate: '' }), '2024-04-01');
  const lockedDraft = interpretContract(`
NS 8407
Oppstart: 01.03.2024
Kontraktssum: 1 000 000
Indeks: boligblokk
Skal indeksreguleres.
Bindingstid første året uten indeksregulering.
  `);
  assert.equal(lockedDraft.firstRegulationDate, '2025-03-01');
  assert.ok(lockedDraft.findings.some((line) => /bundet første året/i.test(line)));
  const result = calculate({ ...draft, regulationDate: '2026-08-15', vatPercent: '0' }, {
    'bki-boligblokk': monthSeries({ '2024M03': 139, '2026M08': 154.4 }),
  });
  const sheet = agreementSheet(draft, result, monthSeries({ '2024M03': 139, '2026M08': 154.4 }));
  const values = Object.fromEntries(sheet.groups.flatMap((group) => group.rows.map((row) => [row.label, row.value])));
  assert.equal(values['Første reguleringsdato'], '01.05.2024');
  assert.equal(values['SSB-indeks'], 'Boligblokk, i alt');
  assert.equal(values.Tilbudsdato, '01.03.2024');
  assert.equal(values.Indeksdato, 'mars 2024');
  assert.match(values['Gjeldende indeks da'], /139,0/);
  assert.equal(values['Regulert andel'], '80,00 %');
  assert.equal(values.Modell, 'Totalindeks, måned');
  assert.equal(values['SSB-kode'], '20');
  assert.match(values['Beregnet tillegg'], /177/);
  assert.equal(values.Motpart, 'Nordvik kommune');
  assert.equal(values.Prisregulering, 'Avtalt indeksregulering');
  assert.equal(sheet.title, 'Skoleveien 4');
});

test('parser bred SSB-csv', () => {
  const csv = '"Arbeidstype","Byggindeks 2026M06","Byggindeks 2026M08"\n"20",154.6,154.4\n';
  const rows = parseSsbCsv(csv);
  assert.deepEqual(rows[0].codes, ['20']);
  assert.equal(rows[0].values['2026M08'], 154.4);
});

test('leser NS 8403 oppdragsbekreftelse til indeksfeltene', () => {
  const draft = interpretContract(`
Oppdrag Madlalia Eksternt PO. nr:
Oppstart: 17.11.2025 Sluttdato: 31.12.2028
Beskrivelse av oppdraget Anleggsleder
Oppdragsgiver Igang Totalentreprenør As Organisasjons nr: 922 98 7106
Oppdragstaker Consult1 AS
NS 8403
Tabell: 14335 Start indeks: K2 2025
Avtalt honorar pris 1080,- eks mva.
Timepriser reguleres kvartalsvis.
Sted: Klepp Dato: 09.10.2025
`);
  assert.equal(draft.standard, 'NS 8403');
  assert.equal(draft.indexId, 'ppi-byggeteknisk');
  assert.equal(draft.buyer, 'Igang Totalentreprenør As');
  assert.equal(draft.startDate, '2025-11-17');
  assert.equal(draft.endDate, '2028-12-31');
  assert.equal(draft.firstRegulationDate, '2025-04-01');
  assert.equal(draft.terms.frequency, 'quarter');
  assert.ok(draft.lines.some((line) => String(line.rate) === '1080'));
});

test('varsel om timepris følger eksempelet', () => {
  const draft = {
    supplier: 'Consult1 AS',
    orgnr: '916538804',
    contactName: 'Anders Rolandsen',
    phone: '99376973',
    email: 'pr@consult1.no',
    website: 'www.consult1.no',
    place: 'Sandnes',
    title: 'Rammeavtale Prosjektaadministrasjon bygg',
    reference: '12',
    standard: 'NS 8403',
    model: 'engang',
    indexId: 'ppi-byggeteknisk',
    offerDate: '2023-06-15',
    contractDate: '2023-08-25',
    regulationDate: '2025-06-15',
    effectiveDate: '2025-08-01',
    honorar: 'Oppdraget honoreres etter medgått tid',
    sharePercent: '100',
    vatPercent: '0',
    lines: [{ text: 'Timepris', quantity: '1', unit: 'time', rate: '1050', included: true }],
  };
  const result = calculate(draft, {
    'ppi-byggeteknisk': {
      id: 'ppi-byggeteknisk',
      name: 'Byggeteknisk konsulentvirksomhet',
      table: '14335',
      codes: ['71.121'],
      frequency: 'quarter',
      basis: '2021 = 100',
      source: 'SSB Statistikkbanken, tabell 14335',
      points: [
        { period: '2023K2', value: 107.6 },
        { period: '2025K2', value: 117.7 },
      ],
    },
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.rows[0].newRate, 1148.56);
  assert.equal(result.rows[0].addition, 98.56);
  assert.equal(result.basisPoint.period, '2023K2');
  assert.equal(result.regulationPoint.period, '2025K2');
  const letter = buildLetter(draft, result, { today: '2025-08-01' });
  assert.equal(letter.title, 'Varsel om indeksregulering av timepriser');
  assert.match(letter.plain, /tabell 14335/);
  assert.match(letter.plain, /71\.121 Byggeteknisk konsulentvirksomhet/);
  assert.match(letter.plain, /107,6/);
  assert.match(letter.plain, /117,7/);
  assert.match(letter.plain, /98,56/);
  assert.match(letter.plain, /1148,56/);
  assert.match(letter.plain, /kr 1 149,- eks mva/);
  assert.match(letter.plain, /kr 1 050,- eks mva/);
  assert.match(letter.plain, /01\.08\.25/);
  assert.match(letter.plain, /916 538 804/);
  assert.match(letter.plain, /NS 8403/);
  const pdf = new TextDecoder().decode(buildPdf(letter));
  assert.match(pdf, /Varsel om indeksregulering av timepriser/);
  assert.match(pdf, /1148,56/);
  assert.match(pdf, /Consult1 AS/);
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

test('indeksbrevet kan bruke bedriftens logo', () => {
  const logo = 'data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAGAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIEAbEv/2Q==';
  const draft = {
    ...interpretContract('NS 8407. Tilbudsfrist 15.03.2024. Kontraktssum 2 000 000. Boligblokk. Skal indeksreguleres.'),
    supplier: 'ProTop Bygg AS',
    buyer: 'Nordvik kommune',
    regulationDate: '2026-08-15',
    useCompanyLogo: true,
  };
  const result = calculate(draft, {
    'bki-boligblokk': monthSeries({ '2024M03': 140, '2026M08': 154.4 }),
  });
  const without = buildLetter({ ...draft, useCompanyLogo: false }, result, { today: '2026-10-04', logo: { dataUrl: logo, width: 12, height: 6 } });
  assert.equal(without.notice.logo, null);
  const letter = buildLetter(draft, result, { today: '2026-10-04', logo: { dataUrl: logo, width: 12, height: 6 } });
  assert.equal(letter.notice.logo.dataUrl, logo);
  const pdf = new TextDecoder().decode(buildPdf(letter));
  assert.match(pdf, /\/Im1 Do/);
  assert.match(pdf, /DCTDecode/);
  const files = exportFiles(draft, result, letter, []);
  const docx = readZip(files[1].bytes);
  assert.ok(docx['word/media/logo.jpg']?.length > 20);
  assert.match(new TextDecoder().decode(docx['word/document.xml']), /rIdLogo/);
  assert.match(new TextDecoder().decode(docx['word/document.xml']), /ProTop Bygg AS/);
});

test('stor PDF leses ikke i nettleseren', async () => {
  const huge = new Uint8Array(MAX_LOCAL_PDF_BYTES + 20);
  huge.set(Buffer.from('%PDF-1.4'), 0);
  await assert.rejects(
    () => extractContractText(huge, 'stor.pdf', 'application/pdf'),
    /PDF_TOO_LARGE_FOR_LOCAL/,
  );
});

test('hopper over store FlateDecode-strømmer i PDF', async () => {
  const filler = 'x'.repeat(260000);
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length 260000 >>\nstream\n'),
    Buffer.from(filler),
    Buffer.from('\nendstream\nendobj\nBT (NS 8407 Kontraktssum 2000000) Tj ET\n%%EOF'),
  ]);
  const text = await extractContractText(pdf, 'skannet.pdf', 'application/pdf');
  assert.match(text, /NS 8407/);
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

test('leser zlib-komprimert PDF med TJ-bokstaver', async () => {
  const { deflateSync } = await import('node:zlib');
  const content = 'BT /F1 10 Tf [(Oppdragsgiver )-2(Igang Totalentreprenør As)] TJ [( NS 8403 )] TJ [(Avtalt honorar pris 1080,-)] TJ ET';
  const packed = deflateSync(Buffer.from(content, 'latin1'));
  const stream = Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length ${packed.length} >>\nstream\n`),
    packed,
    Buffer.from('\nendstream\nendobj\n%%EOF'),
  ]);
  const text = await extractContractText(stream, 'ns8403.pdf', 'application/pdf');
  assert.match(text, /Oppdragsgiver/);
  assert.match(text, /Igang Totalentreprenør As/);
  assert.match(text, /NS 8403/);
  const draft = interpretContract(text);
  assert.equal(draft.standard, 'NS 8403');
  assert.equal(draft.buyer, 'Igang Totalentreprenør As');
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
  const konsulent = bundle.series['ppi-byggeteknisk'];
  assert.equal(konsulent?.table, '14335');
  assert.ok(konsulent?.latest?.value > 100, JSON.stringify(konsulent?.latest));
  assert.ok(konsulent.points.some((point) => point.period === '2023K2' && point.value === 107.6));
  assert.ok(konsulent.points.some((point) => point.period === '2025K2' && point.value === 117.7));
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
