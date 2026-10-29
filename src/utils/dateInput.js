/**
 * Datofelt med kalender (components/DateInput.jsx): lesing og skriving av datoverdier.
 * Appen lagrer datoer som «åååå-mm-dd» (iso) noen steder og «dd.mm.åååå» (nb) andre steder.
 * Feltet leser begge og skriver tilbake i formatet feltet bruker.
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function valid(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** «åååå-mm-dd» fra iso, nb («7.10.2026», «07.10.26»), Date eller tom. Ugyldig gir tom streng. */
export function toIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : valid(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const raw = String(value).trim();
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s|$)/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return valid(year, Number(m[2]), Number(m[1]));
  }
  return '';
}

/** Visning i feltet: «07.10.2026». */
export function displayDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Verdien tilbake i feltets format. format 'nb' gir «dd.mm.åååå», ellers iso. */
export function outputDate(iso, format = 'iso') {
  const clean = toIsoDate(iso);
  if (!clean) return '';
  return format === 'nb' ? displayDate(clean) : clean;
}

/** Formatet en lagret verdi har, så feltet skriver tilbake på samme måte. */
export function detectDateFormat(value, fallback = 'iso') {
  const raw = String(value || '').trim();
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(raw)) return 'nb';
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return 'iso';
  return fallback;
}
