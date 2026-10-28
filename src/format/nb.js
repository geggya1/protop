/**
 * Felles norsk visning av beløp, datoer og timer (UX-14).
 * Én kilde i stedet for de lokale formaterne i modulene. Skrevet uten Intl, så
 * resultatet er likt i nettleseren, i Hermes på Android og i Node-testene.
 *
 *   formatKr(1234.5)          → «1 234,50 kr»
 *   formatKr(1234.5, { decimals: 0 }) → «1 235 kr»
 *   formatDate('2026-03-03')  → «03.03.2026»
 *   formatDateLong('2026-03-03') → «3. mars 2026»
 *   formatHours(7.5)          → «7,5 t»
 *   EMPTY                     → «–» (tom verdi)
 */

export const EMPTY = '–';

// Mellomrom som ikke brytes, mellom tusener og foran «kr» og «t».
const NBSP = ' ';
const MINUS = '−';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** Tall fra tall eller norsk/engelsk tekst («1 234,50», «1234.5», «kr 99»). null når det ikke er et tall. */
export function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let raw = String(value).replace(/kr|nok/gi, '').replace(/[\s  ]/g, '').replace(MINUS, '-');
  if (!raw) return null;
  // «1.234,50» (tusenpunktum og desimalkomma) og «1234,5».
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Tall med tusenskille og desimalkomma: 1234.5 → «1 234,5» (decimals = antall desimaler). */
export function formatNumber(value, { decimals = 0, empty = EMPTY } = {}) {
  const n = toNumber(value);
  if (n == null) return empty;
  const places = Math.max(0, Math.min(6, Number(decimals) || 0));
  const fixed = Math.abs(n).toFixed(places);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const negative = n < 0 && Number(fixed) !== 0;
  return `${negative ? MINUS : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

/** Beløp i kroner: «1 234,50 kr». decimals: 2 (standard) eller 0. */
export function formatKr(value, { decimals = 2, empty = EMPTY, suffix = true } = {}) {
  const text = formatNumber(value, { decimals, empty: '' });
  if (!text) return empty;
  return suffix ? `${text}${NBSP}kr` : text;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Lokal dato uten tidssone-forskyvning. Ugyldig dag eller måned (31.02) gir null. */
function localDate(year, month, day) {
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.getMonth() === Number(month) - 1 && d.getDate() === Number(day) ? d : null;
}

/** Dato fra Date, ISO-tekst («2026-03-03», med eller uten klokkeslett), «3.3.2026» eller tidsstempel. */
export function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.toDate === 'function') return toDate(value.toDate());
  const raw = String(value).trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return localDate(m[1], m[2], m[3]);
  m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return localDate(m[3], m[2], m[1]);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «03.03.2026» */
export function formatDate(value, { empty = EMPTY } = {}) {
  const d = toDate(value);
  if (!d) return empty;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** «3. mars 2026» */
export function formatDateLong(value, { empty = EMPTY } = {}) {
  const d = toDate(value);
  if (!d) return empty;
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO-dato for lagring: «2026-03-03». */
export function isoDate(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Timer fra tall, «7,5», «7.5» eller «7:30». null når det ikke er et tall. */
export function toHours(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim().replace(/\s*t(imer)?$/i, '').replace(MINUS, '-');
  if (!raw) return null;
  const m = raw.match(/^([+-]?)(\d+):(\d{1,2})$/);
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
  return toNumber(raw);
}

/** Timer med én desimal og «t»: 7.5 → «7,5 t», 8 → «8 t», 7:45 → «7,75 t». */
export function formatHours(value, { empty = EMPTY, unit = true, decimals } = {}) {
  const n = toHours(value);
  if (n == null) return empty;
  const rounded = Math.round(n * 100) / 100;
  const places = decimals != null ? decimals : (Number.isInteger(rounded) ? 0 : (Number.isInteger(rounded * 10) ? 1 : 2));
  const text = formatNumber(rounded, { decimals: places, empty });
  return unit ? `${text}${NBSP}t` : text;
}

/**
 * Timer i et inndatafelt: «7,5» uten «t», og tomt for 0 så plassholderen viser formatet.
 * Verdier som ikke går opp i to desimaler (7 t 20 min) vises som «7:20», så lagring uten
 * endring ikke runder av minuttene.
 */
export function hoursInputText(value) {
  const n = toHours(value);
  if (!n) return '';
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    const abs = Math.abs(n);
    let h = Math.floor(abs);
    let m = Math.round((abs - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return `${n < 0 ? '-' : ''}${h}:${pad(m)}`;
  }
  return formatHours(n, { unit: false, empty: '' });
}
