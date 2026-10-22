// Felles regler for sletting av indeksreguleringsbrev på en avtale.
// Brukes både når data normaliseres og når to kopier slås sammen,
// slik at et slettet brev ikke kommer tilbake fra en annen enhet.

/** Et brev som er sendt (eller er under sending) skal aldri forsvinne. */
export function indexLetterWasSent(row) {
  return row?.status === 'sendt'
    || row?.status === 'sending'
    || row?.mailStatus === 'sendt'
    || !!row?.sentAt;
}

function dayBefore(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Fjerner prisversjoner som hører til slettede brev, og åpner igjen
 * prisen som ble avsluttet av den slettede versjonen.
 */
export function dropCasePriceVersions(versions, caseIds) {
  const rows = Array.isArray(versions) ? versions : [];
  const ids = caseIds instanceof Set ? caseIds : new Set(caseIds || []);
  if (!ids.size) return rows;
  const removed = rows.filter((row) => row?.caseId && ids.has(row.caseId));
  if (!removed.length) return rows;
  const kept = rows.filter((row) => !(row?.caseId && ids.has(row.caseId)));
  const closedBy = new Set(removed.map((row) => dayBefore(row.validFrom)).filter(Boolean));
  return kept.map((row) => {
    if (!row?.validTo || !closedBy.has(row.validTo)) return row;
    const later = kept.some((other) => other !== row && other?.validFrom && other.validFrom > row.validFrom);
    return later ? row : { ...row, validTo: '' };
  });
}

/**
 * Tar bort slettede brev fra saker, reguleringslogg og prisversjoner.
 * Sendte brev blir alltid stående, og deres id fjernes fra slettelisten.
 */
export function applyIndexDeletions({ indexCases, regulations, priceVersions, deletedIndexCaseIds }) {
  const cases = Array.isArray(indexCases) ? indexCases : [];
  const regs = Array.isArray(regulations) ? regulations : [];
  const sent = new Set([
    ...cases.filter(indexLetterWasSent).map((row) => row.id),
    ...regs.filter(indexLetterWasSent).map((row) => row.id),
  ]);
  const deleted = (Array.isArray(deletedIndexCaseIds) ? deletedIndexCaseIds : []).filter((id) => id && !sent.has(id));
  const gone = new Set(deleted);
  return {
    indexCases: cases.filter((row) => !gone.has(row?.id)),
    regulations: regs.filter((row) => !gone.has(row?.id)),
    priceVersions: dropCasePriceVersions(priceVersions, gone),
    deletedIndexCaseIds: deleted,
  };
}
