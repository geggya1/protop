/**
 * ProTop samhandling shell.
 * Visible modules: hjem, venner, kalender, e-post, oppgaver, notat.
 * Account chrome (innstillinger, hjelp, personvern) stays so the shell can be used.
 * Family modules from the ProTop catalog are not shown.
 */

export const PROTOP_SHELL_MODULE_IDS = [
  'home',
  'friends',
  'plan',
  'mail',
  'stars',
  'notes',
  'settings',
  'help',
  'legal',
  'more',
];

export const PROTOP_SHELL_MODULE_ID_SET = new Set(PROTOP_SHELL_MODULE_IDS);

/** Dock holds five shortcuts. Venner stays in the drawer (Hoved). */
export const PROTOP_BOTTOM_SHORTCUT_IDS = ['home', 'plan', 'mail', 'stars', 'notes'];

export function isProtopShellModule(id) {
  return PROTOP_SHELL_MODULE_ID_SET.has(id);
}

export function applyProtopShellSections(sections) {
  return (sections || [])
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((item) => isProtopShellModule(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}

export function applyProtopShellApps(apps) {
  return (apps || []).filter((app) => isProtopShellModule(app.id));
}
