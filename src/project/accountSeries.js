/**
 * Årsregnskap over flere år.
 * Siste år kommer fra det åpne nøkkeltall-APIet. Eldre år leses fra
 * innsendte regnskapskopier og vises slik Proff gjør det: beløp i 1000,
 * driftsinntekter og driftsresultat i samme graf.
 */

const SERIES_FIELDS = [
  'fra',
  'til',
  'valuta',
  'morselskap',
  'revidert',
  'smaafortak',
  'driftsinntekter',
  'driftsresultat',
  'resultatFoerSkatt',
  'aarsresultat',
  'avskrivning',
  'ebitda',
  'egenkapital',
  'gjeld',
  'eiendeler',
];

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function amount(node, key) {
  const value = Number(node?.[key]);
  return Number.isFinite(value) ? value : null;
}

function yearOf(value) {
  const match = String(value || '').match(/^(\d{4})/);
  const year = match ? Number(match[1]) : NaN;
  return year >= 1990 && year <= 2100 ? year : null;
}

function withEbitda(row) {
  const next = { ...row };
  if (next.driftsresultat != null && next.avskrivning != null) {
    next.ebitda = next.driftsresultat + next.avskrivning;
  }
  return next;
}

function shapeOne(row) {
  if (!row || typeof row !== 'object') return null;
  const resultat = row.resultatregnskapResultat || {};
  const drift = resultat.driftsresultat || {};
  const egenkapital = row.egenkapitalGjeld?.egenkapital || {};
  const gjeld = row.egenkapitalGjeld?.gjeldOversikt || {};
  const eiendeler = row.eiendeler || {};
  const fra = text(row.regnskapsperiode?.fraDato);
  const til = text(row.regnskapsperiode?.tilDato);
  const aar = yearOf(til) || yearOf(fra) || yearOf(row.aar);
  if (!aar) return null;
  return withEbitda({
    aar,
    fra: fra || `${aar}-01-01`,
    til: til || `${aar}-12-31`,
    valuta: text(row.valuta) || 'NOK',
    morselskap: row.virksomhet?.morselskap === true,
    revidert: row.revisjon?.ikkeRevidertAarsregnskap !== true && row.revisjon?.fravalgRevisjon !== true,
    smaafortak: row.regnkapsprinsipper?.smaaForetak === true,
    driftsinntekter: amount(drift.driftsinntekter, 'sumDriftsinntekter'),
    driftsresultat: amount(drift, 'driftsresultat'),
    resultatFoerSkatt: amount(resultat, 'ordinaertResultatFoerSkattekostnad'),
    aarsresultat: amount(resultat, 'aarsresultat'),
    avskrivning: null,
    ebitda: null,
    egenkapital: amount(egenkapital, 'sumEgenkapital'),
    gjeld: amount(gjeld, 'sumGjeld'),
    eiendeler: amount(eiendeler, 'sumEiendeler'),
  });
}

/** Ett eller flere regnskap fra Regnskapsregisteret, nyeste felt øverst. */
export function shapeAccountPayload(payload) {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const years = [];
  const seen = new Set();
  for (const row of rows) {
    const shaped = shapeOne(row);
    if (!shaped || seen.has(shaped.aar)) continue;
    seen.add(shaped.aar);
    years.push(shaped);
  }
  years.sort((a, b) => a.aar - b.aar);
  if (!years.length) return null;
  return { ...years[years.length - 1], years };
}

function putYear(map, row, overwrite) {
  const aar = Number(row?.aar);
  if (!Number.isFinite(aar)) return;
  const prev = map.get(aar) || { aar };
  const next = { ...prev, aar };
  for (const key of SERIES_FIELDS) {
    const value = row[key];
    if (value == null || value === '') continue;
    if (overwrite || next[key] == null) next[key] = value;
  }
  map.set(aar, withEbitda(next));
}

/** API-tall vinner over avleste tall for samme år. Avskrivning beholdes. */
export function mergeAccountYears(primary, extras) {
  const map = new Map();
  for (const row of extras || []) putYear(map, row, false);
  const primaryYears = primary?.years || (primary ? [primary] : []);
  for (const row of primaryYears) putYear(map, row, true);
  const years = [...map.values()].sort((a, b) => a.aar - b.aar);
  if (!years.length) return null;
  const latest = years[years.length - 1];
  return { ...latest, years };
}

/** Regnskapskopier som til sammen dekker de siste årene. Nyeste først. */
export function pickCopyYears(available, newestYear) {
  const years = [...new Set((available || []).map((value) => Number(value)).filter((year) => year >= 1990))]
    .sort((a, b) => b - a);
  const newest = years.includes(Number(newestYear)) ? Number(newestYear) : years[0];
  if (!newest) return [];
  const picked = [];
  for (let year = newest; year >= newest - 8 && picked.length < 3; year -= 2) {
    if (years.includes(year)) picked.push(year);
  }
  return picked;
}

function closeness(left, right) {
  const a = Math.max(1, Math.abs(left));
  const b = Math.max(1, Math.abs(right));
  return Math.abs(Math.log10(a) - Math.log10(b));
}

function valueFromGroups(groups) {
  if (!groups?.length) return null;
  const negative = String(groups[0]).startsWith('-');
  const parts = groups.map((group, index) => (index === 0 ? String(group).replace(/^-/, '') : String(group)));
  if (parts.some((group) => !/^\d+$/.test(group))) return null;
  if (parts[0].length < 1 || parts[0].length > 3) return null;
  if (parts.length > 1 && parts.slice(1).some((group) => group.length !== 3)) return null;
  const value = Number(parts.join(''));
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Tallene står i to årskolonner, med et valgfritt notenummer først.
 * «4 905 529 716 926» er note 4 + 905 529 og 716 926, ikke ett beløp.
 */
function amountsFromLine(line) {
  const groups = [...String(line || '').matchAll(/-?\d+/g)].map((match) => match[0]);
  if (groups.length < 2) return null;
  const starts = [0];
  const leading = Number(groups[0]);
  if (groups.length > 3 && groups[0].length <= 2 && leading >= 1 && leading <= 20) starts.push(1);
  let best = null;
  for (const start of starts) {
    for (let mid = start + 1; mid < groups.length; mid += 1) {
      const left = valueFromGroups(groups.slice(start, mid));
      const right = valueFromGroups(groups.slice(mid));
      if (left == null || right == null) continue;
      const score = closeness(left, right);
      if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && start < best.start)) {
        best = { left, right, score, start };
      }
    }
  }
  return best ? [best.left, best.right] : null;
}

function findLineAmounts(text, labelRe, rejectRe) {
  const lines = String(text || '').split(/\n+/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!labelRe.test(line)) continue;
    if (rejectRe && rejectRe.test(line)) continue;
    const amounts = amountsFromLine(line) || amountsFromLine(`${line} ${lines[i + 1] || ''}`);
    if (amounts) return amounts;
  }
  return null;
}

function statementYears(text) {
  const source = String(text || '');
  const match = source.match(/note\s+(20\d{2})\s+(20\d{2})/i) || source.match(/\b(20\d{2})\s+(20\d{2})\b/);
  if (!match) return [];
  const left = Number(match[1]);
  const right = Number(match[2]);
  if (left < 1990 || right < 1990 || left === right) return [];
  return [left, right];
}

function matchField(label) {
  const line = String(label || '').trim();
  if (/^sum inntekter\b|^sum driftsinntekter\b/i.test(line)) return 'driftsinntekter';
  if (/^driftsresultat\b/i.test(line)) return 'driftsresultat';
  if (/^resultat f[øo]r skattekostnad\b/i.test(line)) return 'resultatFoerSkatt';
  if (/^[åa]rsresultat\b/i.test(line) && !/^[åa]rsresultat\s+etter\b/i.test(line)) return 'aarsresultat';
  if (/^avskrivning\b/i.test(line)) return 'avskrivning';
  if (/^sum eiendeler\b/i.test(line)) return 'eiendeler';
  if (/^sum egenkapital\b/i.test(line) && !/\bog\b/i.test(line)) return 'egenkapital';
  if (/^sum gjeld\b/i.test(line)) return 'gjeld';
  return '';
}

function amountNear(words, columnX) {
  const groups = (words || [])
    .filter((word) => /^-?\d+$/.test(word.text) && Math.abs(word.x - columnX) <= 180)
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text);
  return valueFromGroups(groups);
}

/** Samme tall, men gruppert etter hvor de står under årstallene. */
export function parsePositionedStatement(lines) {
  let columns = [];
  const rows = new Map();
  const ensure = (year) => {
    if (!rows.has(year)) {
      rows.set(year, {
        aar: year,
        fra: `${year}-01-01`,
        til: `${year}-12-31`,
        valuta: 'NOK',
      });
    }
    return rows.get(year);
  };
  const list = lines || [];
  for (let i = 0; i < list.length; i += 1) {
    const line = list[i];
    const header = (line.words || []).filter((word) => /^20\d{2}$/.test(word.text));
    if (header.length >= 2) {
      columns = header.slice(0, 2).map((word) => ({ year: Number(word.text), x: word.x }));
      continue;
    }
    const next = list[i + 1];
    const wrappedTax = /resultat f[øo]r$/i.test(String(line.text || '').trim())
      && next && /^skattekostnad\b/i.test(String(next.text || '').trim());
    const field = wrappedTax ? 'resultatFoerSkatt' : matchField(line.text);
    if (!field || columns.length < 2) continue;
    const nextIsNumbers = next && !/[a-zA-ZæøåÆØÅ]{3,}/.test(next.text || '');
    const amountLine = wrappedTax ? next : line;
    for (const column of columns) {
      const value = amountNear(amountLine.words, column.x)
        ?? (!wrappedTax && nextIsNumbers ? amountNear(next.words, column.x) : null);
      if (value == null) continue;
      const row = ensure(column.year);
      if (row[field] == null) row[field] = value;
    }
  }
  return [...rows.values()]
    .map((row) => reconcileBalance(withEbitda(row)))
    .filter((row) => row.driftsinntekter != null || row.driftsresultat != null || row.resultatFoerSkatt != null || row.aarsresultat != null || row.eiendeler != null || row.egenkapital != null)
    .sort((a, b) => a.aar - b.aar);
}

export function linesFromWords(words) {
  const buckets = [];
  for (const word of words || []) {
    const y = Number(word.y);
    const x = Number(word.x);
    if (!Number.isFinite(y) || !Number.isFinite(x) || !word.text) continue;
    let bucket = buckets.find((row) => Math.abs(row.y - y) < 14);
    if (!bucket) {
      bucket = { y, words: [] };
      buckets.push(bucket);
    }
    bucket.words.push({ text: String(word.text), x });
  }
  return buckets
    .sort((a, b) => a.y - b.y)
    .map((bucket) => {
      const wordsInLine = bucket.words.sort((a, b) => a.x - b.x);
      return { text: wordsInLine.map((word) => word.text).join(' '), words: wordsInLine };
    });
}

/** Tekst fra resultat og balanse, med kolonnene inneværende og forrige år. */
export function parseAccountStatement(text) {
  const years = statementYears(text);
  if (years.length < 2) return [];
  const fields = {
    driftsinntekter: findLineAmounts(text, /^sum inntekter\b|^sum driftsinntekter\b/i),
    driftsresultat: findLineAmounts(text, /^driftsresultat\b/i),
    resultatFoerSkatt: findLineAmounts(text, /^resultat f[øo]r skattekostnad\b/i),
    aarsresultat: findLineAmounts(text, /^[åa]rsresultat\b/i, /^[åa]rsresultat\s+etter\b/i),
    avskrivning: findLineAmounts(text, /^avskrivning\b/i),
    eiendeler: findLineAmounts(text, /^sum eiendeler\b/i),
    egenkapital: findLineAmounts(text, /^sum egenkapital\b/i, /\bog\b/i),
    gjeld: findLineAmounts(text, /^sum gjeld\b/i),
  };
  return years.map((aar, index) => {
    const pick = (pair) => (pair ? pair[index] ?? null : null);
    const driftsresultat = pick(fields.driftsresultat);
    const avskrivning = pick(fields.avskrivning);
    return withEbitda({
      aar,
      fra: `${aar}-01-01`,
      til: `${aar}-12-31`,
      valuta: 'NOK',
      driftsinntekter: pick(fields.driftsinntekter),
      driftsresultat,
      resultatFoerSkatt: pick(fields.resultatFoerSkatt),
      aarsresultat: pick(fields.aarsresultat),
      avskrivning,
      ebitda: null,
      eiendeler: pick(fields.eiendeler),
      egenkapital: pick(fields.egenkapital),
      gjeld: pick(fields.gjeld),
    });
  }).map(reconcileBalance).filter((row) => row.driftsinntekter != null || row.eiendeler != null);
}

/** Eiendeler skal være egenkapital pluss gjeld. Hvis ikke, er avlesingen usikker. */
function reconcileBalance(row) {
  const { eiendeler, egenkapital, gjeld } = row;
  if (eiendeler == null || egenkapital == null || gjeld == null) return row;
  const diff = Math.abs(egenkapital + gjeld - eiendeler);
  if (diff <= Math.max(10, Math.abs(eiendeler) * 0.005)) return row;
  return { ...row, eiendeler: null, egenkapital: null, gjeld: null };
}

/** Siste offisielle år må stemme før avleste år brukes. */
export function ocrAgrees(apiYear, ocrYears) {
  if (apiYear?.driftsinntekter == null) return true;
  const ocr = (ocrYears || []).find((row) => Number(row?.aar) === Number(apiYear.aar));
  if (!ocr || ocr.driftsinntekter == null) return false;
  const diff = Math.abs(ocr.driftsinntekter - apiYear.driftsinntekter);
  return diff <= Math.max(2, Math.abs(apiYear.driftsinntekter) * 0.005);
}

export function roundThousands(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.sign(n) * Math.round(Math.abs(n) / 1000);
}

export function formatThousands(value) {
  const rounded = roundThousands(value);
  if (rounded == null) return '';
  try {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(rounded);
  } catch {
    return String(rounded);
  }
}

export function periodLabel(row) {
  const match = String(row?.til || '').match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return row?.aar ? String(row.aar) : '';
}

function niceCeil(value) {
  const abs = Math.abs(Number(value) || 0);
  if (abs <= 0) return 1;
  const exp = Math.floor(Math.log10(abs));
  const pow = 10 ** exp;
  const n = abs / pow;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((item) => item >= n - 1e-9) || 10;
  return step * pow;
}

function formatAxis(value) {
  const rounded = Math.round(value);
  try {
    return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(rounded);
  } catch {
    return String(rounded);
  }
}

function lineSegments(points) {
  const runs = [];
  let current = [];
  for (const point of points) {
    if (point == null) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length) runs.push(current);
  return runs
    .filter((run) => run.length >= 2)
    .map((run) => run.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '));
}

/** Geometri for linje- og stolpediagram. Y-verdier er allerede i tusen kroner. */
export function buildAccountChart(years, { width = 320, height = 188 } = {}) {
  const rows = (years || []).slice(-5);
  const pad = { l: 48, r: 10, t: 14, b: 28 };
  const plotW = Math.max(20, width - pad.l - pad.r);
  const plotH = Math.max(20, height - pad.t - pad.b);
  const samples = [];
  for (const row of rows) {
    const revenue = roundThousands(row?.driftsinntekter);
    const ebit = roundThousands(row?.driftsresultat);
    if (revenue != null) samples.push(revenue);
    if (ebit != null) samples.push(ebit);
  }
  const minSample = samples.length ? Math.min(...samples) : 0;
  const maxSample = samples.length ? Math.max(...samples) : 1;
  const yMin = minSample < 0 ? -niceCeil(minSample) : 0;
  const yMax = Math.max(niceCeil(Math.max(maxSample, 1)), yMin + 1);
  const yOf = (value) => pad.t + (1 - (value - yMin) / (yMax - yMin)) * plotH;
  const count = Math.max(rows.length, 1);
  const xOf = (index) => {
    if (count === 1) return pad.l + plotW / 2;
    const inset = Math.min(18, plotW * 0.06);
    return pad.l + inset + (index / (count - 1)) * (plotW - inset * 2);
  };
  const ticks = [];
  for (let i = 0; i <= 4; i += 1) {
    const value = yMin + ((yMax - yMin) * i) / 4;
    ticks.push({ value, y: yOf(value), label: formatAxis(value) });
  }
  const revenuePoints = rows.map((row, index) => {
    const value = roundThousands(row?.driftsinntekter);
    return value == null ? null : { x: xOf(index), y: yOf(value) };
  });
  const ebitPoints = rows.map((row, index) => {
    const value = roundThousands(row?.driftsresultat);
    return value == null ? null : { x: xOf(index), y: yOf(value) };
  });
  const slot = plotW / count;
  const barW = Math.max(6, Math.min(16, slot * 0.22));
  const bars = [];
  rows.forEach((row, index) => {
    const cx = xOf(index);
    for (const [series, raw, shift] of [
      ['revenue', row?.driftsinntekter, -barW - 1.5],
      ['ebit', row?.driftsresultat, 1.5],
    ]) {
      const value = roundThousands(raw);
      if (value == null) continue;
      const y0 = yOf(0);
      const y1 = yOf(value);
      bars.push({
        aar: row.aar,
        series,
        x: cx + shift,
        y: Math.min(y0, y1),
        width: barW,
        height: Math.max(1.5, Math.abs(y1 - y0)),
      });
    }
  });
  return {
    width,
    height,
    yTicks: ticks,
    zeroY: yOf(0),
    revenueSegments: lineSegments(revenuePoints),
    ebitSegments: lineSegments(ebitPoints),
    dots: rows.flatMap((row, index) => {
      const dots = [];
      if (revenuePoints[index]) dots.push({ aar: row.aar, series: 'revenue', ...revenuePoints[index] });
      if (ebitPoints[index]) dots.push({ aar: row.aar, series: 'ebit', ...ebitPoints[index] });
      return dots;
    }),
    bars,
    labels: rows.map((row, index) => ({
      aar: row.aar,
      x: xOf(index),
      y: height - 8,
      text: periodLabel(row),
    })),
    hits: rows.map((row, index) => ({
      aar: row.aar,
      x: Math.max(pad.l, xOf(index) - slot / 2),
      y: pad.t,
      width: slot,
      height: plotH,
    })),
  };
}
