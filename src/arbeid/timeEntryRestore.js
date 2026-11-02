/**
 * Gjenoppretting av slettede timeføringer fra slettelloggen (families/{id}/timeEntryDeletions).
 * Ren logikk. Klienten (src/economy/timeEntryRestoreClient.js) leser loggen og lagrer føringen.
 *
 * En gjenopprettet føring får ny id og restoredFrom = id-en som ble slettet:
 * - Enheten som slettet føringen, husker id-en som slettet (gravstein i timeEntryStorage) og ville
 *   ellers skjult den igjen.
 * - restoredFrom viser at føringen allerede er gjenopprettet, så den ikke legges inn to ganger.
 * Den gjenopprettede føringen har status «registrert» og ingen fakturakobling: den går gjennom
 * godkjenning og fakturering på nytt.
 */

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

/** Ny id for føringen som gjenopprettes. Samme sletting gir alltid samme id (to klikk = én føring). */
export function restoredEntryId(record) {
  const source = text(record?.entryId, 100) || text(record?.id, 100);
  return source ? `${source}_gjenopprettet` : '';
}

/**
 * Føringen slik den skal lagres igjen. Med en hel kopi (snapshot) kommer alt tilbake;
 * eldre slettinger har bare dato, timer, prosjekt og ansatt.
 * Returnerer null når slettingen mangler det en føring må ha.
 */
export function restoredTimeEntry(record, { at = '' } = {}) {
  if (!record || typeof record !== 'object') return null;
  const snap = record.snapshot && typeof record.snapshot === 'object' ? record.snapshot : null;
  const base = snap || {
    employeeId: record.employeeId,
    projectId: record.projectId,
    date: record.date,
    hours: record.hours,
  };
  const projectId = text(base.projectId, 120);
  const employeeId = text(base.employeeId, 120);
  const date = text(base.date, 10);
  const id = restoredEntryId(record);
  if (!projectId || !employeeId || !date || !id) return null;
  const stamp = text(at, 40) || new Date().toISOString();
  const { history: _history, ...rest } = base;
  return {
    ...rest,
    id,
    projectId,
    employeeId,
    date,
    hours: Number(base.hours) || 0,
    invoiceId: null,
    status: 'registrert',
    restoredFrom: text(record.entryId, 120),
    createdAt: text(base.createdAt, 40) || stamp,
    updatedAt: stamp,
  };
}

/**
 * Slettingene til visning, nyeste først. restored = id-ene (restoredFrom) som allerede er
 * gjenopprettet. employees/projects: lister med { id, name } for navn i stedet for id.
 */
export function deletionRows(records = [], { restored = new Set(), employees = [], projects = [] } = {}) {
  const empName = new Map((Array.isArray(employees) ? employees : []).map((row) => [text(row?.id), text(row?.name)]));
  const projName = new Map((Array.isArray(projects) ? projects : []).map((row) => [
    text(row?.id),
    [text(row?.number || row?.projectNumber), text(row?.name)].filter(Boolean).join(' '),
  ]));
  const done = restored instanceof Set ? restored : new Set(restored || []);
  return (Array.isArray(records) ? records : [])
    .filter((row) => row && typeof row === 'object' && text(row.entryId))
    .map((row) => {
      const snap = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
      const employeeId = text(snap.employeeId || row.employeeId);
      const projectId = text(snap.projectId || row.projectId);
      return {
        key: text(row.id) || `${text(row.entryId)}-${text(row.at)}`,
        record: row,
        entryId: text(row.entryId),
        at: text(row.at, 40),
        byName: text(row.byName, 120) || 'Ukjent',
        reason: text(row.reason),
        date: text(snap.date || row.date, 10),
        hours: Number(snap.hours ?? row.hours) || 0,
        employee: empName.get(employeeId) || text(snap.employeeName) || 'Ukjent ansatt',
        project: projName.get(projectId) || [text(snap.projectNumber), text(snap.projectName)].filter(Boolean).join(' ') || 'Ukjent prosjekt',
        description: text(snap.description, 160),
        full: !!row.snapshot,
        restorable: !!restoredTimeEntry(row),
        restored: done.has(text(row.entryId)),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Filtrer på ansatt (navn) eller fritekst i prosjekt og beskrivelse. */
export function filterDeletionRows(rows = [], query = '') {
  const q = text(query).toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => [row.employee, row.project, row.description, row.byName, row.date]
    .some((value) => String(value || '').toLowerCase().includes(q)));
}

/** Grunnen som står i endringshistorikken til den gjenopprettede føringen. */
export function restoreReason(record) {
  const who = text(record?.byName, 80);
  const when = text(record?.at, 10);
  const parts = ['Gjenopprettet'];
  if (when || who) parts.push(`slettet ${[when, who ? `av ${who}` : ''].filter(Boolean).join(' ')}`);
  return parts.join(', ');
}
