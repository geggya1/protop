import assert from 'node:assert/strict';
import {
  buildInvoicedStatement,
  chartCanvasHeight,
  formatStatementAmount,
  invoiceCountsAsInvoiced,
  invoicedStatementWorkbook,
  layoutMonthChart,
  layoutYearChart,
  statementDomain,
  statementTableYears,
  statementTip,
  statementYearColor,
  statementYearWindow,
  yearWindowEnd,
  yearWindowOffset,
} from './invoicedStatement.js';

const today = '2026-10-20';

function invoice(date, amount, extra = {}) {
  return {
    invoiceDate: date,
    amountExVat: amount,
    status: 'registered',
    ...extra,
  };
}

assert.equal(invoiceCountsAsInvoiced(invoice('2022-03-03', 10)), true);
assert.equal(invoiceCountsAsInvoiced(invoice('2026-11-01', 10, { status: 'draft' })), false);
assert.equal(invoiceCountsAsInvoiced(invoice('2024-01-02', 10, { status: 'registered', exportStatus: 'utkast' })), false);
assert.equal(invoiceCountsAsInvoiced(invoice('2024-01-02', 10, { status: 'sent', exportStatus: 'utkast' })), true);
assert.equal(invoiceCountsAsInvoiced({ invoiceDate: '', amountExVat: 10, status: 'paid' }), false);
assert.equal(invoiceCountsAsInvoiced(invoice('2022-03-03', null)), false);

const invoices = [
  invoice('2016-06-01', 5026816.02),
  invoice('2022-01-15', 1837884.95),
  invoice('2022-02-10', 2311075.63),
  invoice('2022-03-03', 2141071.58),
  invoice('2022-04-04', -100, { status: 'credited', creditNoteForId: 'inv_1' }),
  invoice('2025-06-15', 6000000),
  invoice('2026-10-02', 500),
  invoice('2026-11-01', 900, { status: 'draft' }),
  invoice('2026-12-15', 40),
];

const statement = buildInvoicedStatement(invoices, { today });

assert.equal(statement.monthly['2022'][0], 1837884.95);
assert.equal(statement.monthly['2022'][1], 2311075.63);
assert.equal(statement.monthly['2022'][2], 2141071.58);
assert.equal(statement.monthly['2022'][3], -100);
assert.equal(statement.cumulative['2022'][0], 1837884.95);
assert.equal(statement.cumulative['2022'][1], 4148960.58);
assert.equal(statement.cumulative['2022'][2], 6290032.16);
assert.equal(statement.cumulative['2022'][3], 6289932.16);
assert.equal(statement.totals['2022'], 6289932.16);
assert.equal(statement.monthly['2022'][6], 0);
assert.equal(statement.monthly['2026'][9], 500);
assert.equal(statement.monthly['2026'][10], null);
assert.equal(statement.monthly['2026'][11], 40);
assert.equal(statement.cumulative['2026'][9], 500);
assert.equal(statement.cumulative['2026'][10], null);
assert.equal(statement.cumulative['2026'][11], 540);
assert.equal(statement.totals['2026'], 540);
assert.deepEqual(statement.chartYears, [2022, 2023, 2024, 2025, 2026]);
assert.equal(statement.allYears[0], 2016);
assert.equal(statement.allYears.at(-1), 2026);
assert.equal(statement.yearly.find((row) => row.year === 2016).amount, 5026816.02);
assert.equal(statement.yearly.find((row) => row.year === 2023).amount, 0);
assert.equal(statement.invoiceCount, 8);
assert.equal(statement.monthly['2025'][5], 6000000);

const cents = buildInvoicedStatement([
  invoice('2024-05-01', 0.01),
  invoice('2024-05-02', 0.01),
  invoice('2024-05-03', 0.01),
], { today });
assert.equal(cents.monthly['2024'][4], 0.03);

assert.equal(formatStatementAmount(2141071.58).replace(/\s/g, ' '), '2 141 071,58');
assert.equal(formatStatementAmount(null), 'N/A');
assert.deepEqual(statementTip('mar', 2022, 2141071.58), {
  title: 'mar',
  body: '2022: 2 141 071,58 NOK',
});
assert.equal(statementYearColor(2022, statement.chartYears), '#4472C4');
assert.equal(statementYearColor(2023, statement.chartYears), '#C00000');
assert.equal(statementYearColor(2024, statement.chartYears), '#ED7D31');
assert.equal(statementYearColor(2025, statement.chartYears), '#70AD47');
assert.equal(statementYearColor(2026, statement.chartYears), '#7030A0');

const domain = statementDomain([0, 6000000]);
assert.equal(domain.max, 7500000);
const bars = layoutMonthChart({
  years: statement.chartYears,
  series: statement.monthly,
  width: 860,
  height: 228,
  mode: 'bars',
});
assert.deepEqual(bars.yTicks.map((tick) => tick.value), [0, 2500000, 5000000, 7500000]);
const march = bars.bars.find((bar) => bar.year === 2022 && bar.month === 2);
const january = bars.bars.find((bar) => bar.year === 2022 && bar.month === 0);
assert.ok(march.x > january.x);
assert.ok(march.h > 0);
assert.equal(bars.bars.some((bar) => bar.year === 2026 && bar.month === 10), false);

const lines = layoutMonthChart({
  years: [2026],
  series: statement.cumulative,
  width: 860,
  height: 228,
  mode: 'lines',
});
assert.equal(lines.segments.length, 2);
assert.equal(lines.segments[0].points.at(-1).month, 9);
assert.equal(lines.segments[1].points[0].month, 11);
assert.equal(lines.points.some((point) => point.month === 10), false);

const years = layoutYearChart({
  years: statement.allYears,
  amounts: statement.yearly.map((row) => row.amount),
  width: 860,
  height: 228,
});
assert.equal(years.bars[0].year, 2016);
assert.ok(years.bars.at(-1).x > years.bars[0].x);
assert.equal(years.domain.max, 7500000);

const book = invoicedStatementWorkbook(statement, 'all');
assert.match(book, /Utfakturert per måned/);
assert.match(book, /Utfakturert gjennom året/);
assert.match(book, /Omsetning per år/);
assert.match(book, /<Data ss:Type="Number">2141071\.58<\/Data>/);
assert.match(book, /<Data ss:Type="String">N\/A<\/Data>/);
assert.match(book, /5026816\.02/);

const empty = buildInvoicedStatement([], { today });
assert.equal(empty.invoiceCount, 0);
assert.deepEqual(empty.chartYears, []);
assert.equal(invoicedStatementWorkbook(empty, 'yearly').includes('Omsetning per år'), true);

assert.equal(chartCanvasHeight(0), 228);
assert.equal(chartCanvasHeight(860), 228);
assert.equal(chartCanvasHeight(1400), 280);
assert.equal(chartCanvasHeight(2600), 340);

// Alle år ligger i tabellen; fem vises om gangen og eldre blas frem.
const tableYears = statementTableYears(statement);
assert.equal(tableYears.length, 11);
assert.deepEqual(statementTableYears({ chartYears: [2025, 2026] }), [2025, 2026]);
assert.deepEqual(statementYearWindow(tableYears, 10), [2022, 2023, 2024, 2025, 2026]);
assert.deepEqual(statementYearWindow(tableYears, 9), [2021, 2022, 2023, 2024, 2025]);
assert.deepEqual(statementYearWindow(tableYears, 0), [2016, 2017, 2018, 2019, 2020]);
assert.deepEqual(statementYearWindow([2025, 2026], 1), [2025, 2026]);
assert.deepEqual(statementYearWindow([], 3), []);

// Fem kolonner på 200 px synlige, elleve år totalt.
const wide = { viewport: 1000, column: 200, count: 11 };
assert.equal(yearWindowOffset({ ...wide, end: 10 }), 1200);
assert.equal(yearWindowEnd({ ...wide, offset: 1200 }), 10);
assert.equal(yearWindowOffset({ ...wide, end: 9 }), 1000);
assert.equal(yearWindowEnd({ ...wide, offset: 1000 }), 9);
assert.equal(yearWindowEnd({ ...wide, offset: 0 }), 4);
assert.equal(yearWindowOffset({ ...wide, end: 0 }), 0);
// Mobil: to kolonner synlige, utsnittet er fortsatt fem år.
const narrow = { viewport: 294, column: 132, count: 11 };
assert.equal(yearWindowEnd({ ...narrow, offset: yearWindowOffset({ ...narrow, end: 10 }) }), 10);
assert.equal(yearWindowEnd({ ...narrow, offset: 0 }), 4);
// Uten måling vises de siste årene.
assert.equal(yearWindowEnd({ offset: 0, viewport: 0, column: 0, count: 11 }), 10);

// Hvert år beholder fargen når utsnittet flyttes.
assert.equal(statementYearColor(2026, tableYears), '#7030A0');
assert.equal(statementYearColor(2022, tableYears), '#4472C4');
assert.equal(statementYearColor(2021, tableYears), '#7030A0');
assert.equal(statementYearColor(2017, tableYears), '#4472C4');
assert.equal(new Set(statementYearWindow(tableYears, 7).map((year) => statementYearColor(year, tableYears))).size, 5);
assert.equal(statementYearColor(2025, [2025, 2026]), '#4472C4');
assert.equal(statementYearColor(2026, [2025, 2026]), '#C00000');
assert.match(invoicedStatementWorkbook(statement, 'monthly'), /<Data ss:Type="Number">2016<\/Data>/);

console.log('invoicedStatement.test.mjs: ok');
