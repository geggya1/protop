/**
 * Steps for the "Tilpass hjem" wizard.
 * Dock (bunnmeny) is skipped when the form has no bottom bar.
 * The last step (`board`) is not a form panel — finishing the previous step
 * opens the live home dashboard in edit mode with default widgets.
 */

export const HOME_SETUP_STEP_DEFS = [
  { id: 'image', label: 'Bilde' },
  { id: 'dock', label: 'Meny', requiresDock: true },
  { id: 'board', label: 'Widgets', opensHomeEdit: true },
];

export function homeSetupSteps({ showDock = true } = {}) {
  return HOME_SETUP_STEP_DEFS.filter((step) => !step.requiresDock || showDock);
}

/** Form panels only (excludes the live-home handoff step). */
export function homeSetupFormSteps(steps) {
  return (steps || []).filter((step) => !step.opensHomeEdit);
}

export function homeSetupStepIndex(steps, id) {
  const idx = (steps || []).findIndex((step) => step.id === id);
  return idx < 0 ? 0 : idx;
}

export function lookHintForRole(look, role = 'parent') {
  if (!look) return '';
  if (role === 'child' && look.childHint) return look.childHint;
  return look.hint || '';
}
