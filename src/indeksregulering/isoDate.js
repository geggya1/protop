/** Dato som «2026-03-03» eller «3.3.2026» → «2026-03-03», ellers tom tekst. */
export function parseIsoDate(raw) {
  const text = String(raw ?? '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validIso(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) return validIso(match[3], match[2].padStart(2, '0'), match[1].padStart(2, '0'));
  return '';
}

function validIso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${year}-${month}-${day}`;
}
