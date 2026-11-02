/**
 * Nummerserier i et konsern: morselskapet fordeler prosjekt- og kundenummer, så selskapene ikke
 * bruker de samme numrene (viktig når regnskap, rapporter eller felles prosjekter går på tvers).
 *
 * Hvert selskap får { project: { from, to }, customer: { from, to } } på bedriften (numberSeries).
 * Neste nummer er høyeste nummer i serien + 1, eller starten av serien. Nummer utenfor serien
 * (eldre eller importerte) teller ikke.
 */

export const SERIES_KINDS = [
  { id: 'project', label: 'Prosjektnummer' },
  { id: 'customer', label: 'Kundenummer' },
];

function int(value) {
  const n = Number(String(value ?? '').replace(/\s/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function normalizeRange(raw) {
  const from = int(raw?.from);
  const to = int(raw?.to);
  if (from == null || to == null || to < from) return null;
  return { from, to };
}

export function normalizeSeries(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const { id } of SERIES_KINDS) {
    const range = normalizeRange(src[id]);
    if (range) out[id] = range;
  }
  return out;
}

export function rangeLabel(range) {
  const r = normalizeRange(range);
  return r ? `${r.from}–${r.to}` : '';
}

/** Overlapp mellom selskapenes serier. Svar: feilmelding eller tom tekst. names: { companyId: navn }. */
export function seriesConflict(assignments = {}, names = {}) {
  const entries = Object.entries(assignments || {}).map(([id, series]) => [id, normalizeSeries(series)]);
  for (const { id: kind, label } of SERIES_KINDS) {
    const rows = entries.map(([id, s]) => ({ id, range: s[kind] })).filter((row) => row.range);
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i].range;
        const b = rows[j].range;
        if (a.from <= b.to && b.from <= a.to) {
          return `${label}: seriene til ${names[rows[i].id] || rows[i].id} og ${names[rows[j].id] || rows[j].id} overlapper.`;
        }
      }
    }
  }
  for (const [id, raw] of Object.entries(assignments || {})) {
    for (const { id: kind, label } of SERIES_KINDS) {
      const r = raw?.[kind];
      if (r && (r.from !== '' || r.to !== '') && (r.from != null || r.to != null) && !normalizeRange(r)) {
        return `${label} for ${names[id] || id}: «fra» må være et tall og mindre enn «til».`;
      }
    }
  }
  return '';
}

/**
 * Forslag: selskapene i rekkefølge får hver sin blokk (standard 10 000 nummer), morselskapet først.
 * 10000–19999, 20000–29999 osv.
 */
export function suggestSeries(companyIds = [], { start = 10000, size = 10000 } = {}) {
  const out = {};
  companyIds.forEach((id, i) => {
    const from = start + i * size;
    out[id] = { project: { from, to: from + size - 1 }, customer: { from, to: from + size - 1 } };
  });
  return out;
}

/** Neste ledige nummer i serien. Null når serien ikke er satt. full: serien er brukt opp. */
export function nextInRange(numbers = [], range) {
  const r = normalizeRange(range);
  if (!r) return null;
  let max = r.from - 1;
  for (const raw of numbers || []) {
    const n = Number(String(raw ?? '').replace(/\s/g, ''));
    if (Number.isInteger(n) && n >= r.from && n <= r.to && n > max) max = n;
  }
  const next = max + 1;
  return { number: String(next), full: next > r.to };
}

/** Er nummeret innenfor serien? Tom serie = alt er lov. */
export function inRange(number, range) {
  const r = normalizeRange(range);
  if (!r) return true;
  const n = Number(String(number ?? '').replace(/\s/g, ''));
  return Number.isInteger(n) && n >= r.from && n <= r.to;
}

// Gjeldende selskaps serier, satt av appen når selskap velges (AppContext). Ren modul-tilstand,
// så nummerfunksjonene (kunder, prosjekter) kan bruke serien uten å få selskapet sendt inn overalt.
let ACTIVE = {};

export function setActiveNumberSeries(series) {
  ACTIVE = normalizeSeries(series);
}

export function activeRange(kind) {
  return ACTIVE[kind] || null;
}
