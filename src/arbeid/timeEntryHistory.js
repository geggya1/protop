/**
 * Endringshistorikk for timeføringer. Oversikten over arbeidstiden skal være pålitelig
 * (AML § 10-7), så en endring skal vise hva som ble endret, av hvem og når.
 * Ren logikk. Lagringen (timeEntryStorage, normalizeTimeEntryRow og reglene) må ta vare på
 * feltet history før dette er i bruk. Se loggen for L-13.
 */

/** Feltene som påvirker arbeidstid, fakturering og lønn. */
export const TRACKED_TIME_FIELDS = [
  'date', 'hours', 'billableHours', 'clockIn', 'clockOut', 'projectId', 'activityId',
  'timeType', 'description', 'status', 'employeeId',
];

const MAX_HISTORY = 100;

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function same(a, b) {
  if (typeof a === 'number' || typeof b === 'number') return Number(a || 0) === Number(b || 0);
  return text(a) === text(b);
}

/** [{ field, from, to }] for feltene som er endret. */
export function timeEntryChanges(before = {}, after = {}) {
  const out = [];
  for (const field of TRACKED_TIME_FIELDS) {
    const from = before?.[field] ?? '';
    const to = after?.[field] ?? '';
    if (!same(from, to)) out.push({ field, from: text(from, 120), to: text(to, 120) });
  }
  return out;
}

/**
 * Føringen med en ny rad i history. previous er føringen før endringen (null ved ny føring).
 * Uten endringer i sporede felt returneres next uendret.
 */
export function withTimeEntryHistory(previous, next, { actor = null, at = '', reason = '' } = {}) {
  const kind = previous ? 'changed' : 'created';
  const changes = previous ? timeEntryChanges(previous, next) : [];
  if (previous && !changes.length) return next;
  const history = Array.isArray(previous?.history) ? previous.history : (Array.isArray(next?.history) ? next.history : []);
  const row = {
    at: text(at, 40) || new Date().toISOString(),
    kind,
    byUid: text(actor?.byUid || actor?.uid, 128),
    byName: text(actor?.byName || actor?.name, 120),
    ...(changes.length ? { changes } : {}),
    ...(text(reason) ? { reason: text(reason) } : {}),
  };
  return { ...next, history: [...history, row].slice(-MAX_HISTORY) };
}

/** Rad som beholdes når en føring slettes, så slettingen også kan spores. */
export function deletedTimeEntryRecord(entry, { actor = null, at = '', reason = '' } = {}) {
  return {
    entryId: text(entry?.id, 120),
    employeeId: text(entry?.employeeId, 120),
    date: text(entry?.date, 10),
    hours: Number(entry?.hours) || 0,
    projectId: text(entry?.projectId, 120),
    at: text(at, 40) || new Date().toISOString(),
    kind: 'deleted',
    byUid: text(actor?.byUid || actor?.uid, 128),
    byName: text(actor?.byName || actor?.name, 120),
    ...(text(reason) ? { reason: text(reason) } : {}),
  };
}

/**
 * Endret av en annen enn den som førte timen: den ansatte bør få beskjed.
 * Sammenligner med createdByUid (eller den ansattes egen uid når den er kjent).
 */
export function changedByOther(entry, actorUid, { employeeUid = '' } = {}) {
  const owner = text(employeeUid) || text(entry?.createdByUid);
  const actor = text(actorUid);
  return !!owner && !!actor && owner !== actor;
}
