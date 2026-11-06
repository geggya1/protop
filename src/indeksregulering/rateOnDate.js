/**
 * Timepris på en dato ut fra prisversjonene (validFrom/validTo). Ligger i egen fil så
 * timeprisen kan regnes ut uten å laste hele indeksreguleringen ved oppstart.
 */
import { parseIsoDate } from './isoDate.js';

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function rateOnDate(versions, iso) {
  const day = parseIsoDate(iso);
  if (!day) return null;
  const hits = (Array.isArray(versions) ? versions : []).filter((row) => {
    if (!row?.validFrom || !(Number(row.rateExVat) >= 0)) return false;
    if (row.validFrom > day) return false;
    if (row.validTo && row.validTo < day) return false;
    return true;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => text(b.validFrom).localeCompare(text(a.validFrom)));
  return Number(hits[0].rateExVat);
}
