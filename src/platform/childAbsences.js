/**
 * Barnehagens fravær for barna (DS-22).
 *
 * Barnehage-plattformen skrev tidligere til families/{id}/absences, samme samlingsnavn som
 * ProTop bruker for ansattes fravær, men med et annet skjema (childName, dateKey, reason,
 * authorUid). Nye meldinger skrives til families/{id}/childAbsences. Eldre meldinger blir
 * liggende i absences (ingen migrering) og leses derfra også.
 *
 * Ren logikk uten Firebase, så den kan testes og brukes av både plattformen og ProTop.
 */

export const CHILD_ABSENCES = 'childAbsences';
export const LEGACY_CHILD_ABSENCES = 'absences';
export const CHILD_ABSENCE_LIMIT = 30;

function text(value) {
  return value == null ? '' : String(value).trim();
}

/**
 * Er raden en melding fra barnehagen (ikke et ansattfravær)?
 * Barnehagens skjema har dateKey og barn, og aldri ansatt-id.
 */
export function isChildAbsenceRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (text(row.employeeId)) return false;
  return !!(text(row.dateKey) || text(row.childName) || text(row.childId));
}

/** Nye meldinger først, og eldre fra absences, uten ansattfravær. */
export function mergeChildAbsences(fresh = [], legacy = [], max = CHILD_ABSENCE_LIMIT) {
  const byId = new Map();
  for (const row of [...(Array.isArray(fresh) ? fresh : []), ...(Array.isArray(legacy) ? legacy : [])]) {
    if (!isChildAbsenceRow(row)) continue;
    const id = text(row.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }
  return [...byId.values()]
    .sort((a, b) => text(b.dateKey).localeCompare(text(a.dateKey)))
    .slice(0, Math.max(0, Number(max) || 0));
}
