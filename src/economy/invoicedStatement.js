/**
 * Utfakturert omsetning eks. mva, gruppert på fakturadato.
 * Oppstillingen på økonomi-landingssiden leser dette av fakturaene i systemet.
 */

import { parseDate, parseMoney } from './invoices.js';

export const STATEMENT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

/** Samme rekkefølge som søylene: eldste år først. */
export const STATEMENT_YEAR_COLORS = ['#4472C4', '#C00000', '#ED7D31', '#70AD47', '#7030A0'];

export const STATEMENT_YEAR_BAR = '#4472C4';

const ISSUED = new Set(['issued', 'sent', 'paid', 'overdue', 'credited', 'written_off']);
const CHART_YEAR_SPAN = 5;

function roundOre(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(amount) * 100) + Number.EPSILON);
}

function fromOre(ore) {
  return ore / 100;
}

export function formatStatementAmount(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  return new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value).replace(/\u00a0|\u202f/g, ' ');
}

export function formatStatementAxis(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('nb-NO', {
    maximumFractionDigits: 0,
  }).format(amount).replace(/\u00a0|\u202f/g, ' ');
}

export function statementYearColor(year, years) {
  const index = (years || []).findIndex((item) => Number(item) === Number(year));
  if (index < 0) return STATEMENT_YEAR_COLORS[0];
  return STATEMENT_YEAR_COLORS[index % STATEMENT_YEAR_COLORS.length];
}

function calendarToday(today) {
  if (typeof today === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
    if (match) return { year: Number(match[1]), month: Number(match[2]) - 1 };
  }
  const date = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Utkast er ikke utfakturert. Kreditnota telles med negativt beløp. */
export function invoiceCountsAsInvoiced(row) {
  if (!row || typeof row !== 'object') return false;
  const status = String(row.status || '');
  if (status === 'draft') return false;
  if (/utkast|draft/i.test(String(row.exportStatus || '')) && !ISSUED.has(status)) return false;
  const iso = parseDate(row.invoiceDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  if (parseMoney(row.amountExVat) == null) return false;
  return true;
}

function invoiceParts(row) {
  const iso = parseDate(row.invoiceDate);
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) return null;
  const amount = parseMoney(row.amountExVat);
  if (amount == null) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    ore: roundOre(amount),
  };
}

function emptyStatement(today) {
  return {
    version: 1,
    months: STATEMENT_MONTHS.slice(),
    chartYears: [],
    allYears: [],
    monthly: {},
    cumulative: {},
    totals: {},
    yearly: [],
    invoiceCount: 0,
    currency: 'NOK',
    basis: 'invoiceDate',
    vat: 'ex',
    asOf: `${today.year}-${String(today.month + 1).padStart(2, '0')}-01`,
  };
}

/**
 * @param {Array<object>} invoices fakturaliste (også kompakte listerader)
 * @param {{ today?: Date|string }} [options]
 */
export function buildInvoicedStatement(invoices, { today = new Date() } = {}) {
  const now = calendarToday(today);
  const list = Array.isArray(invoices) ? invoices : [];
  const buckets = new Map();
  let invoiceCount = 0;

  for (const row of list) {
    if (!invoiceCountsAsInvoiced(row)) continue;
    const parts = invoiceParts(row);
    if (!parts || parts.month < 0 || parts.month > 11) continue;
    invoiceCount += 1;
    if (!buckets.has(parts.year)) {
      buckets.set(parts.year, { ore: new Array(12).fill(0), count: new Array(12).fill(0) });
    }
    const bucket = buckets.get(parts.year);
    bucket.ore[parts.month] += parts.ore;
    bucket.count[parts.month] += 1;
  }

  if (!buckets.size) return { ...emptyStatement(now), invoiceCount: 0 };

  const earliest = Math.min(...buckets.keys());
  const latest = Math.max(...buckets.keys());
  const allYears = [];
  for (let year = earliest; year <= latest; year += 1) allYears.push(year);
  const chartStart = Math.max(earliest, latest - (CHART_YEAR_SPAN - 1));
  const chartYears = allYears.filter((year) => year >= chartStart);

  const monthly = {};
  const cumulative = {};
  const totals = {};
  const yearly = [];

  for (const year of allYears) {
    const bucket = buckets.get(year);
    const months = STATEMENT_MONTHS.map((_, index) => {
      const future = year > now.year || (year === now.year && index > now.month);
      const hits = bucket?.count[index] || 0;
      if (!hits && future) return null;
      return fromOre(bucket?.ore[index] || 0);
    });
    let run = 0;
    const running = months.map((value, index) => {
      if (value == null) return null;
      run += bucket?.ore[index] || 0;
      return fromOre(run);
    });
    const total = months.every((value) => value == null)
      ? null
      : fromOre(months.reduce((sum, value, index) => sum + (value == null ? 0 : (bucket?.ore[index] || 0)), 0));
    const key = String(year);
    monthly[key] = months;
    cumulative[key] = running;
    totals[key] = total;
    yearly.push({ year, amount: total });
  }

  return {
    version: 1,
    months: STATEMENT_MONTHS.slice(),
    chartYears,
    allYears,
    monthly,
    cumulative,
    totals,
    yearly,
    invoiceCount,
    currency: 'NOK',
    basis: 'invoiceDate',
    vat: 'ex',
    asOf: `${now.year}-${String(now.month + 1).padStart(2, '0')}-01`,
  };
}

export function statementRow(series, year) {
  if (!series) return [];
  return series[year] || series[String(year)] || [];
}

function niceCeil(value) {
  if (!(value > 0)) return 0;
  const exp = 10 ** Math.floor(Math.log10(value));
  const frac = value / exp;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  const nice = steps.find((step) => frac <= step + 1e-9) || 10;
  return nice * exp;
}

export function statementDomain(values) {
  let min = 0;
  let max = 0;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (max === 0 && min === 0) return { min: 0, max: 1 };
  if (min < 0 && max > 0 && Math.abs(min) < max * 0.02) min = 0;
  const top = max > 0 ? niceCeil(max * 1.05) : 0;
  const bottom = min < 0 ? -niceCeil(Math.abs(min) * 1.05) : 0;
  return { min: bottom, max: Math.max(top, bottom === 0 ? 1 : 0) };
}

function tickValues(domain) {
  const span = domain.max - domain.min;
  if (!(span > 0)) return [domain.min || 0];
  const niceSteps = [1, 2, 2.5, 5, 10];
  for (const intervals of [3, 4, 2, 5]) {
    const raw = span / intervals;
    const exp = 10 ** Math.floor(Math.log10(raw));
    const frac = raw / exp;
    const step = niceSteps.find((item) => Math.abs(frac - item) < 0.06);
    if (!step) continue;
    const nice = step * exp;
    const ticks = [];
    for (let index = 0; index <= intervals; index += 1) {
      ticks.push(Math.round((domain.min + nice * index) * 100) / 100);
    }
    return ticks;
  }
  const ticks = [];
  for (let index = 0; index <= 4; index += 1) ticks.push(domain.min + (span * index) / 4);
  return ticks;
}

function collectValues(years, series) {
  const values = [];
  for (const year of years) {
    for (const value of statementRow(series, year)) values.push(value);
  }
  return values;
}

/**
 * Søyle- eller linjelayout for månedene jan–des.
 * mode: 'bars' | 'lines'
 */
export function layoutMonthChart({
  years = [],
  series = {},
  width = 640,
  height = 220,
  mode = 'bars',
} = {}) {
  const padL = 86;
  const padR = 10;
  const padT = 10;
  const padB = 28;
  const plotW = Math.max(12, width - padL - padR);
  const plotH = Math.max(12, height - padT - padB);
  const domain = statementDomain(collectValues(years, series));
  const span = domain.max - domain.min || 1;
  const yOf = (value) => padT + ((domain.max - value) / span) * plotH;
  const groupW = plotW / 12;
  const slot = years.length ? Math.max(1, (groupW - 4) / years.length) : groupW;
  const zeroY = yOf(0);
  const bars = [];
  const segments = [];
  const points = [];

  years.forEach((year, yearIndex) => {
    const row = statementRow(series, year);
    let current = [];
    for (let month = 0; month < 12; month += 1) {
      const value = row[month];
      const cx = padL + groupW * month + groupW / 2;
      if (value == null || !Number.isFinite(value)) {
        if (current.length) segments.push({ year, points: current });
        current = [];
        continue;
      }
      if (mode === 'bars') {
        const x = padL + groupW * month + 2 + yearIndex * slot;
        const plotted = Math.min(domain.max, Math.max(domain.min, value));
        const yValue = yOf(plotted);
        const top = Math.min(zeroY, yValue);
        const h = Math.max(plotted === 0 ? 0 : 1.5, Math.abs(yValue - zeroY));
        bars.push({
          year,
          month,
          value,
          x,
          y: top,
          w: Math.max(1, slot - 1),
          h,
        });
      } else {
        const plotted = Math.min(domain.max, Math.max(domain.min, value));
        const point = { year, month, value, x: cx, y: yOf(plotted) };
        current.push(point);
        points.push(point);
      }
    }
    if (current.length) segments.push({ year, points: current });
  });

  return {
    width,
    height,
    padL,
    zeroY,
    domain,
    bars,
    segments,
    points,
    labels: STATEMENT_MONTHS.map((label, month) => ({
      label,
      x: padL + groupW * month + groupW / 2,
      y: height - 8,
    })),
    yTicks: tickValues(domain).map((value) => ({
      value,
      y: yOf(value),
      label: formatStatementAxis(value),
    })),
  };
}

export function layoutYearChart({
  years = [],
  amounts = [],
  width = 640,
  height = 220,
} = {}) {
  const padL = 86;
  const padR = 10;
  const padT = 10;
  const padB = 28;
  const plotW = Math.max(12, width - padL - padR);
  const plotH = Math.max(12, height - padT - padB);
  const domain = statementDomain(amounts);
  const span = domain.max - domain.min || 1;
  const yOf = (value) => padT + ((domain.max - value) / span) * plotH;
  const count = Math.max(years.length, 1);
  const groupW = plotW / count;
  const barW = Math.max(4, Math.min(28, groupW * 0.55));
  const zeroY = yOf(0);
  const bars = years.map((year, index) => {
    const value = Number.isFinite(amounts[index]) ? amounts[index] : null;
    const cx = padL + groupW * index + groupW / 2;
    if (value == null) {
      return { year, value: null, x: cx - barW / 2, y: zeroY, w: barW, h: 0 };
    }
    const plotted = Math.min(domain.max, Math.max(domain.min, value));
    const yValue = yOf(plotted);
    return {
      year,
      value,
      x: cx - barW / 2,
      y: Math.min(zeroY, yValue),
      w: barW,
      h: Math.max(plotted === 0 ? 0 : 1.5, Math.abs(yValue - zeroY)),
    };
  });
  return {
    width,
    height,
    padL,
    zeroY,
    domain,
    bars,
    labels: years.map((year, index) => ({
      label: String(year),
      x: padL + groupW * index + groupW / 2,
      y: height - 8,
    })),
    yTicks: tickValues(domain).map((value) => ({
      value,
      y: yOf(value),
      label: formatStatementAxis(value),
    })),
  };
}

export function chartCanvasWidth(containerWidth, groups, minGroup = 44) {
  const safe = Number(containerWidth) > 0 ? containerWidth : 320;
  return Math.max(safe, 96 + groups * minGroup);
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value) {
  if (value == null || value === 'N/A') {
    return '<Cell><Data ss:Type="String">N/A</Data></Cell>';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`;
}

function sheet(name, rows) {
  const body = rows.map((row) => `<Row>${row.map(cell).join('')}</Row>`).join('');
  return `<Worksheet ss:Name="${xml(name)}"><Table>${body}</Table></Worksheet>`;
}

function monthSheet(name, statement, series) {
  const years = statement?.chartYears || [];
  const header = ['', ...years];
  const rows = [header];
  STATEMENT_MONTHS.forEach((label, index) => {
    rows.push([
      label,
      ...years.map((year) => {
        const value = statementRow(series, year)[index];
        return value == null ? 'N/A' : value;
      }),
    ]);
  });
  rows.push([
    '',
    ...years.map((year) => statement?.totals?.[year] ?? statement?.totals?.[String(year)] ?? null),
  ]);
  return sheet(name, rows);
}

/** Regneark som Excel åpner. section: monthly | cumulative | yearly | all */
export function invoicedStatementWorkbook(statement, section = 'all') {
  const sheets = [];
  if (section === 'all' || section === 'monthly') {
    sheets.push(monthSheet('Utfakturert per måned', statement, statement?.monthly));
  }
  if (section === 'all' || section === 'cumulative') {
    sheets.push(monthSheet('Utfakturert gjennom året', statement, statement?.cumulative));
  }
  if (section === 'all' || section === 'yearly') {
    const rows = [['År', 'Omsetning']];
    for (const row of statement?.yearly || []) {
      rows.push([row.year, row.amount == null ? 'N/A' : row.amount]);
    }
    sheets.push(sheet('Omsetning per år', rows));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.join('\n')}
</Workbook>`;
}

export function statementTip(monthLabel, year, value) {
  return {
    title: monthLabel,
    body: `${year}: ${formatStatementAmount(value)} NOK`,
  };
}
