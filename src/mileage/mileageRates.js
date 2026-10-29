/**
 * Satser for bilgodtgjørelse (egen bil), per år.
 * - state: statens sats i særavtalen for reiser innenlands (statens reiseregulativ).
 * - taxFree: trekkfri sats fra Skatteetaten (forskrift om satser).
 *
 * Serveren henter gjeldende satser automatisk (functions/mileageRates.js) og lagrer dem.
 * Tabellen under er kjente satser og brukes når hentingen ikke har svart.
 * Brukes både i appen og på serveren (ren modul).
 */

export const KNOWN_MILEAGE_RATES = {
  2025: { state: 5.0, taxFree: 3.5 },
  2026: { state: 5.3, taxFree: 3.5 },
};

// Rimelige grenser for en km-sats. Et tall utenfor er feillest og brukes ikke.
const MIN_RATE = 1;
const MAX_RATE = 15;

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function yearOf(date) {
  const year = Number(String(date || '').slice(0, 4));
  return Number.isFinite(year) && year > 2000 ? year : new Date().getFullYear();
}

/**
 * Satsene som gjelder på en dato: hentede satser går foran kjente, og et år uten egne satser
 * bruker siste år før. { state, taxFree, year, source: 'fetched'|'known' }.
 */
export function mileageRatesFor(date, fetched = {}) {
  const year = yearOf(date);
  const table = { ...KNOWN_MILEAGE_RATES };
  for (const [key, row] of Object.entries(fetched || {})) {
    const known = table[key] || {};
    table[key] = {
      state: plausibleRate(row?.state) ? round2(row.state) : known.state,
      taxFree: plausibleRate(row?.taxFree) ? round2(row.taxFree) : known.taxFree,
      fetched: plausibleRate(row?.state) || plausibleRate(row?.taxFree),
    };
  }
  const years = Object.keys(table).map(Number).filter((y) => y <= year).sort((a, b) => b - a);
  const pick = (field) => {
    for (const y of years) {
      if (plausibleRate(table[y]?.[field])) return { value: table[y][field], year: y };
    }
    const first = Object.keys(table).map(Number).sort((a, b) => a - b)[0];
    return { value: table[first][field], year: first };
  };
  const state = pick('state');
  const taxFree = pick('taxFree');
  return {
    state: state.value,
    taxFree: taxFree.value,
    year: state.year,
    source: table[state.year]?.fetched ? 'fetched' : 'known',
  };
}

export function plausibleRate(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= MIN_RATE && n <= MAX_RATE;
}

/**
 * Godtar en hentet sats: innenfor rimelige grenser, for et år nær i tid, og ikke mer enn 40 %
 * fra forrige kjente sats (et slikt hopp er nesten alltid feillest).
 */
export function acceptFetchedRate(value, { year, previous, today = new Date() } = {}) {
  if (!plausibleRate(value)) return false;
  const now = today.getFullYear();
  if (!(Number(year) >= now - 1 && Number(year) <= now + 1)) return false;
  if (plausibleRate(previous) && Math.abs(Number(value) - Number(previous)) / Number(previous) > 0.4) return false;
  return true;
}
