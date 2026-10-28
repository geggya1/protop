/**
 * Endringshistorikk for timeføringer. Oversikten over arbeidstiden skal være pålitelig
 * (AML § 10-7), så en endring skal vise hva som ble endret, av hvem og når.
 * Ren logikk. timeEntryStorage (timeEntryWritePlan) legger én ny rad i history ved hver
 * lagring med kjent forrige versjon (arrayUnion), og en rad i timeEntryDeletions ved sletting.
 * normalizeTimeEntryRow beholder feltet, og TimeEntryModal viser det.
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

const FIELD_LABELS = {
  date: 'dato',
  hours: 'timer',
  billableHours: 'fakturerbare timer',
  clockIn: 'kom',
  clockOut: 'gikk',
  projectId: 'prosjekt',
  activityId: 'aktivitet',
  timeType: 'timetype',
  description: 'beskrivelse',
  status: 'status',
  employeeId: 'ansatt',
};

function stamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Endringene som tekst for visning: [{ key, when, who, text }], nyeste først. */
export function timeEntryHistoryLines(history) {
  const rows = Array.isArray(history) ? history.filter((row) => row && typeof row === 'object') : [];
  return rows.map((row, index) => {
    let what = 'Endret';
    if (row.kind === 'created') what = 'Ført';
    else if (Array.isArray(row.changes) && row.changes.length) {
      what = `Endret ${row.changes.map((change) => {
        const label = FIELD_LABELS[change.field] || change.field;
        // Prosjekt, aktivitet og ansatt er id-er; vis bare at de er endret.
        if (['projectId', 'activityId', 'employeeId'].includes(change.field)) return label;
        const from = text(change.from, 40) || '–';
        const to = text(change.to, 40) || '–';
        return `${label} ${from} → ${to}`;
      }).join(', ')}`;
    }
    return {
      key: `${text(row.at, 40)}-${index}`,
      when: stamp(row.at),
      who: text(row.byName, 120) || 'Ukjent',
      text: text(row.reason) ? `${what} (${text(row.reason)})` : what,
    };
  }).reverse();
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
