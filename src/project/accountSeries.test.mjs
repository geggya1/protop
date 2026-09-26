import assert from 'node:assert/strict';
import {
  buildAccountChart,
  formatThousands,
  mergeAccountYears,
  ocrAgrees,
  parseAccountStatement,
  parsePositionedStatement,
  pickCopyYears,
  shapeAccountPayload,
} from './accountSeries.js';

const api = shapeAccountPayload([{
  regnskapsperiode: { fraDato: '2025-01-01', tilDato: '2025-12-31' },
  valuta: 'NOK',
  virksomhet: { morselskap: true },
  revisjon: { ikkeRevidertAarsregnskap: false, fravalgRevisjon: false },
  regnkapsprinsipper: { smaaForetak: true },
  resultatregnskapResultat: {
    ordinaertResultatFoerSkattekostnad: 6061074,
    aarsresultat: 4178408,
    driftsresultat: { driftsresultat: 6512469, driftsinntekter: { sumDriftsinntekter: 50613141 } },
  },
  egenkapitalGjeld: { egenkapital: { sumEgenkapital: 4298523 }, gjeldOversikt: { sumGjeld: 16891593 } },
  eiendeler: { sumEiendeler: 21190117 },
}]);
assert.equal(api.driftsinntekter, 50613141);
assert.equal(api.resultatFoerSkatt, 6061074);
assert.equal(api.years.length, 1);
assert.equal(api.aar, 2025);

const statement = `
Beløp i: NOK Note 2025 2024
Sum inntekter 50 613 141 44 758 279
Avskrivning av driftsmidler 4 905 529 716 926
Driftsresultat 6 512 469 5 337 289
Resultat før skattekostnad 6 061 074 5 359 971
Årsresultat 7 4 178 408 4 117 596
Årsresultat etter minoritetsinteresser 4 178 408 4 117 596
SUM EIENDELER 21 190 117 18 462 344
Sum egenkapital 7 4 298 523 5 370 115
Sum gjeld 16 891 593 13 092 229
SUM EGENKAPITAL OG GJELD 21 190 117 18 462 344
`;
const parsed = parseAccountStatement(statement);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].aar, 2025);
assert.equal(parsed[0].driftsinntekter, 50613141);
assert.equal(parsed[0].driftsresultat, 6512469);
assert.equal(parsed[0].avskrivning, 905529);
assert.equal(parsed[0].ebitda, 7417998);
assert.equal(parsed[0].aarsresultat, 4178408);
assert.equal(parsed[0].egenkapital, 4298523);
assert.equal(parsed[0].gjeld, 16891593);
assert.equal(parsed[0].eiendeler, 21190117);
assert.equal(parsed[1].aar, 2024);
assert.equal(parsed[1].driftsinntekter, 44758279);
assert.equal(parsed[1].driftsresultat, 5337289);
assert.equal(parsed[1].avskrivning, 716926);
const positioned = parsePositionedStatement([
  {
    text: 'Beløp i: NOK Note 2025 2024',
    words: [{ text: 'Note', x: 708 }, { text: '2025', x: 1123 }, { text: '2024', x: 1457 }],
  },
  {
    text: 'Avskrivning av driftsmidler 4 905 529 716 926',
    words: [
      { text: 'Avskrivning', x: 299 }, { text: 'driftsmidler', x: 558 },
      { text: '4', x: 682 }, { text: '905', x: 1065 }, { text: '529', x: 1132 },
      { text: '716', x: 1399 }, { text: '926', x: 1466 },
    ],
  },
  {
    text: 'Sum egenkapital vi 1 252 519 100 000',
    words: [
      { text: 'Sum', x: 234 }, { text: 'egenkapital', x: 400 }, { text: 'vi', x: 680 },
      { text: '1', x: 1016 }, { text: '252', x: 1065 }, { text: '519', x: 1132 },
      { text: '100', x: 1399 }, { text: '000', x: 1466 },
    ],
  },
]);
assert.equal(positioned.find((row) => row.aar === 2025).avskrivning, 905529);
assert.equal(positioned.find((row) => row.aar === 2024).avskrivning, 716926);
assert.equal(positioned.find((row) => row.aar === 2025).egenkapital, 1252519);
assert.equal(positioned.find((row) => row.aar === 2024).egenkapital, 100000);
const wrappedTax = parsePositionedStatement([
  {
    text: 'Note 2023 2022',
    words: [{ text: '2023', x: 1123 }, { text: '2022', x: 1457 }],
  },
  {
    text: 'Ordinært resultat før',
    words: [{ text: 'Ordinært', x: 220 }, { text: 'resultat', x: 340 }, { text: 'før', x: 430 }],
  },
  {
    text: 'skattekostnad 5 216 451 5 248 296',
    words: [
      { text: 'skattekostnad', x: 320 },
      { text: '5', x: 1000 }, { text: '216', x: 1060 }, { text: '451', x: 1130 },
      { text: '5', x: 1340 }, { text: '248', x: 1400 }, { text: '296', x: 1460 },
    ],
  },
]);
assert.equal(wrappedTax.find((row) => row.aar === 2023).resultatFoerSkatt, 5216451);
assert.equal(wrappedTax.find((row) => row.aar === 2022).resultatFoerSkatt, 5248296);

assert.ok(ocrAgrees(api, parsed));
assert.equal(ocrAgrees(api, [{ aar: 2025, driftsinntekter: 100 }]), false);

const merged = mergeAccountYears(api, parsed);
assert.equal(merged.years.length, 2);
assert.equal(merged.driftsinntekter, 50613141);
assert.equal(merged.years.find((row) => row.aar === 2025).avskrivning, 905529);
assert.equal(merged.years.find((row) => row.aar === 2025).ebitda, 7417998);
assert.equal(merged.years[0].aar, 2024);

assert.deepEqual(pickCopyYears(['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'], 2025), [2025, 2023, 2021]);
assert.match(formatThousands(50613141), /50[\s\u00a0\u202f]?613/);
assert.match(formatThousands(7417998), /7[\s\u00a0\u202f]?418/);

const revenue = [24000000, 29000000, 38000000, 45000000, 50613000];
const series = [2021, 2022, 2023, 2024, 2025].map((aar, index) => ({
  aar,
  til: `${aar}-12-31`,
  driftsinntekter: revenue[index],
  driftsresultat: (3000 + index * 800) * 1000,
}));
const chart = buildAccountChart(series, { width: 360, height: 196 });
assert.equal(chart.labels.length, 5);
assert.equal(chart.labels[0].text, '2021-12');
assert.equal(chart.labels[4].text, '2025-12');
assert.ok(chart.labels[0].x < chart.labels[4].x);
assert.equal(chart.revenueSegments.length, 1);
assert.equal(chart.ebitSegments.length, 1);
const revenueDots = chart.dots.filter((dot) => dot.series === 'revenue');
assert.ok(revenueDots[0].y > revenueDots[4].y);
assert.equal(chart.bars.length, 10);
assert.equal(chart.yTicks[0].label, '0');
assert.equal(chart.yTicks[chart.yTicks.length - 1].value, 60000);

console.log('accountSeries.test.mjs ok');
