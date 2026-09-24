/**
 * ProTop uses the Weekplan shell unchanged: same mobile dock, tablet rail,
 * and home grid. Only the module set changes.
 *
 * Kept: hjem, venner, prosjekt, kalender, e-post, oppgaver, notat,
 * plus innstillinger, varslinger, hjelp and the rest of the account section.
 * Family product modules are not shown.
 */

export const PROTOP_PRODUCT_MODULE_IDS = [
  'home',
  'friends',
  'projects',
  'plan',
  'mail',
  'stars',
  'notes',
];

/** Drawer and help entries that belong to the shell, not a removed module. */
export const PROTOP_SHELL_CHROME_IDS = [
  'settings',
  'help',
  'legal',
  'moduleAccess',
  'restrictions',
  'subscription',
  'notifications',
  'more',
  'members',
  'groupSettings',
  'help-lightbulb',
  'support',
  'news',
];

export const PROTOP_SHELL_MODULE_IDS = [
  ...PROTOP_PRODUCT_MODULE_IDS,
  ...PROTOP_SHELL_CHROME_IDS,
];

export const PROTOP_SHELL_MODULE_ID_SET = new Set(PROTOP_SHELL_MODULE_IDS);

/** Dock holds five shortcuts. Venner stays in the drawer (Hoved). */
export const PROTOP_BOTTOM_SHORTCUT_IDS = ['home', 'projects', 'plan', 'mail', 'stars'];

/** Home widgets that belong to the kept shell. Same grid, without family modules. */
export const PROTOP_HOME_WIDGET_TYPES = [
  'weather',
  'clock',
  'date',
  'weekPlan',
  'nextEvent',
  'timeline',
  'tasks',
  'notes',
  'reminders',
  'shortcuts',
  'appFolder',
];

const PROTOP_HOME_WIDGET_SET = new Set(PROTOP_HOME_WIDGET_TYPES);

export function isProtopShellModule(id) {
  return PROTOP_SHELL_MODULE_ID_SET.has(id);
}

export function isProtopHomeWidget(type) {
  return PROTOP_HOME_WIDGET_SET.has(type);
}

export function applyProtopShellSections(sections) {
  return (sections || [])
    .map((section) => {
      if (section.id === 'account') return section;
      return {
        ...section,
        items: (section.items || []).filter((item) => isProtopShellModule(item.id)),
      };
    })
    .filter((section) => (section.items || []).length > 0);
}

export function applyProtopShellApps(apps) {
  return (apps || []).filter((app) => PROTOP_PRODUCT_MODULE_IDS.includes(app.id));
}
