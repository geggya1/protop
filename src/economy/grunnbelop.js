/**
 * Grunnbeløpet (1G) hentes fra NAV.
 * Beløpet gjelder vanligvis fra 1. mai til 30. april året etter.
 * Siden ber om nytt beløp når perioden er ute, omtrent én gang i året.
 */

const GRUNNBELOP_URL = 'https://g.nav.no/api/v1/grunnbeloep';

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function dateKey(value = new Date()) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value || '').slice(0, 10);
}

/** Perioden et grunnbeløp gjelder. Mai–april, ellers frem til neste 1. mai. */
export function grunnbelopPeriod(fromDate) {
  const from = dateKey(fromDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { from: '', to: '' };
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const endYear = month >= 5 ? year + 1 : year;
  const end = new Date(endYear, 4, 0);
  return {
    from,
    to: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
  };
}

/** Tomt hentetidspunkt, eller dagens dato etter «gjeldende til». */
export function grunnbelopIsStale(variables, today = new Date()) {
  const fetched = dateKey(variables?.grunnbelopFetchedAt);
  const to = dateKey(variables?.grunnbelopTo);
  const key = dateKey(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetched)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to) && key > to) return true;
  return false;
}

export async function fetchGrunnbelop(fetchImpl = globalThis.fetch, today = new Date()) {
  if (typeof fetchImpl !== 'function') throw new Error('Kunne ikke hente grunnbeløpet.');
  const response = await fetchImpl(GRUNNBELOP_URL, { headers: { accept: 'application/json' } });
  if (!response?.ok) throw new Error('Kunne ikke hente grunnbeløpet.');
  const body = await response.json();
  const amount = Number(body?.grunnbeloep);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ukjent grunnbeløp.');
  const period = grunnbelopPeriod(body?.dato);
  return {
    grunnbelop: amount,
    grunnbelopFrom: period.from,
    grunnbelopTo: period.to,
    grunnbelopFetchedAt: dateKey(today),
  };
}
