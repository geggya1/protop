/**
 * Barnerettigheter for familieoppgaver (parentTodos):
 * - Kan opprette nye og tildele
 * - Eksisterende egne/tildelte: kun lesetilgang (ferdig/kommentar håndteres i UI)
 */

export function canChildCreateParentTasks(isChild) {
  return isChild === true;
}

/** Lesemodus for eksisterende oppgave når bruker er innlogget barn. */
export function isChildParentTaskReadOnly({ isChild, isNew }) {
  if (isNew) return false;
  return isChild === true;
}
