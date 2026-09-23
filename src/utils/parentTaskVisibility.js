/** Spesiell assignedTo-verdi: synlig for alle i familien. */
export const FAMILY_ASSIGNEE = 'family';

/**
 * Hvem skal se familieoppgaven under «Mine oppgaver»?
 *
 * - assignedTo === 'family' → alle
 * - assignedTo satt → kun den personen
 * - assignedTo null («Meg») → kun oppretter (også barn som opprettet selv)
 * - foresattes «Meg» uten createdBy (legacy) → synlig for foresatt, ikke barn
 *
 * `asChild` er true for innlogget barn eller «vis som barn».
 * Barn ser ikke andres private «Meg»-oppgaver — kun egne, tildelte, eller hele familien.
 */
export function parentTaskVisibleToUser(task, { uid, ids, asChild = false } = {}) {
  if (!task || task.deleted || task.active === false) return false;

  const assignee = task.assignedTo || null;
  const idSet = ids instanceof Set
    ? ids
    : new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));

  if (assignee === FAMILY_ASSIGNEE || task.audience === 'family') {
    return true;
  }

  if (!assignee) {
    // «Meg»: kun oppretter. Barn ser ikke foresattes private oppgaver.
    if (!task.createdBy) return !asChild;
    return !!uid && task.createdBy === uid;
  }

  return idSet.has(assignee);
}
