/**
 * Vern i timelisten mot gammel kopi og manglende lasting (DRIFT-06, DRIFT-15).
 *
 * En timeliste som har stått åpen siden før lederen godkjente eller fakturerte, har en
 * gammel kopi av låsen og timene. Før lås, opplåsing og endring av timer hentes derfor
 * fersk status fra skyen og legges på kopien her. Har prosjektene ikke kunnet lastes,
 * sier timelisten fra, og felles data (lås, prosjektdeltakelse, utlegg) endres ikke.
 */

function text(value) {
  return String(value || '').trim();
}

export const PROJECTS_NOT_LOADED = 'Prosjektene kunne ikke lastes fra skyen. Timelisten kan være ufullstendig, og låsing, nye prosjekter og utlegg er stengt til den er lastet. Sjekk nettet og prøv igjen.';

export const FRESH_CHECK_FAILED = 'Fikk ikke sjekket timelisten mot skyen. Prøv igjen når du har nett.';

/**
 * Legg fersk status fra skyen på skjermens kopi: låsene (og arkivet) slik de ligger i
 * prosjektdokumentet, og timene som ble hentet på nytt. Rader som ikke ble hentet, står.
 */
export function mergeFreshTimesheet(state, { locks = null, archive = null, entries = [] } = {}) {
  const base = state && typeof state === 'object' ? state : {};
  const fresh = new Map((entries || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const timeEntries = (Array.isArray(base.timeEntries) ? base.timeEntries : []).map((row) => (
    fresh.has(row?.id) ? { ...row, ...fresh.get(row.id) } : row
  ));
  const known = new Set(timeEntries.map((row) => row?.id));
  for (const [id, row] of fresh) {
    if (!known.has(id)) timeEntries.push(row);
  }
  return {
    ...base,
    timeEntries,
    ...(Array.isArray(locks) ? { timesheetLocks: locks } : {}),
    ...(Array.isArray(archive) ? { timesheetLockArchive: archive } : {}),
  };
}

/** Timer som lås/opplåsing kan endre: personens føringer til og med datoen. */
export function lockScopeEntryIds(state, employeeId, throughDate) {
  const id = text(employeeId);
  const through = text(throughDate);
  return (Array.isArray(state?.timeEntries) ? state.timeEntries : [])
    .filter((row) => row?.id && row.employeeId === id && (!through || text(row.date) <= through))
    .map((row) => row.id);
}

/** Melding når en av føringene (fersk fra skyen) er fakturert, ellers ''. */
export function invoicedEntryBlock(entries) {
  const invoiced = (entries || []).find((row) => row?.invoiceId);
  if (!invoiced) return '';
  return 'Timene er fakturert og kan ikke endres eller slettes. Be økonomi om en kreditnota hvis noe må rettes.';
}

/**
 * Melding når en godkjent føring (fersk fra skyen) ville fått nye timer eller ny timeart, eller blitt
 * slettet, av en som ikke godkjenner timer, ellers ''. Reglene avviser det (DRIFT-06, DRIFT-07);
 * teksten kan rettes. blocks: det som lagres ({ id, hours, timeType }); uten blocks er det sletting.
 * Fakturerte føringer stoppes av invoicedEntryBlock.
 */
export function approvedEntryBlock(entries, { blocks = null, canApprove = false } = {}) {
  if (canApprove) return '';
  const wanted = new Map((blocks || []).filter((row) => row?.id && Number(row.hours) > 0).map((row) => [row.id, row]));
  const touched = (entries || []).some((row) => {
    if (row?.status !== 'godkjent' || text(row.invoiceId)) return false;
    const next = blocks ? wanted.get(row.id) : null;
    if (!next) return true;
    return Number(next.hours) !== Number(row.hours)
      || (text(next.timeType) || 'ordinary') !== (text(row.timeType) || 'ordinary');
  });
  if (!touched) return '';
  return 'Timene er godkjent og kan ikke endres eller slettes. Be leder åpne timelisten igjen hvis noe må rettes.';
}

function lockKey(row) {
  return [row?.id, row?.throughDate, row?.lockedAt, row?.approvedAt, row?.readyForBilling ? 1 : 0].map(text).join('|');
}

/** Kort signatur av låsene, så en skjerm ser når en timeliste er låst, låst opp eller godkjent. */
export function lockSignature(locks) {
  return (Array.isArray(locks) ? locks : [])
    .filter((row) => row?.employeeId)
    .map((row) => `${text(row.employeeId)}=${lockKey(row)}`)
    .sort()
    .join(';');
}

/** De ansatte som har fått en ny, endret eller fjernet lås fra before til after. */
export function changedLockEmployees(before, after) {
  const map = (locks) => {
    const out = new Map();
    for (const row of Array.isArray(locks) ? locks : []) {
      const id = text(row?.employeeId);
      if (!id) continue;
      out.set(id, [...(out.get(id) || []), lockKey(row)].sort().join(';'));
    }
    return out;
  };
  const a = map(before);
  const b = map(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id)).sort();
}

/** Forståelig tekst når skyen avviser en lagring fra timelisten. */
export function timesheetSaveErrorText(error, fallback = 'Kunne ikke lagre timeføring.') {
  const raw = `${error?.code || ''} ${error?.message || ''}`;
  if (/permission[-_ ]denied|insufficient permissions|missing or insufficient/i.test(raw)) {
    return 'Endringen ble avvist: timene er godkjent eller fakturert, eller du mangler tilgang. Last timelisten på nytt for å se gjeldende status.';
  }
  return fallback;
}
