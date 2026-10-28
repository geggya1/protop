/**
 * ProTop uses one shell everywhere: same mobile dock, tablet rail,
 * and home grid. Only the module set changes.
 *
 * Kept: hjem, venner, kalender, e-post, oppgaver, notat,
 * plus innstillinger, varslinger, hjelp and the rest of the account section.
 * Anbud, prosjekt and later company modules sit in their own section.
 * Family product modules are not shown.
 */

export const PROTOP_PRODUCT_MODULE_IDS = [
  'home',
  'friends',
  'chat',
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

/** Dock holds five shortcuts. Venner stays in the drawer (Personlig). */
export const PROTOP_BOTTOM_SHORTCUT_IDS = ['home', 'plan', 'mail', 'stars', 'notes'];

/**
 * Samme dock i Privat og Bedrift: Hjem · Timer · Prosjekter · Oppgaver · Meny,
 * med samme navn og ikon for samme modul. Prosjektene hører til bedriften, så
 * privat er plass 3 Kalender. Privat brukes denne docken når personen er med i en
 * bedrift og ikke har valgt egne snarveier.
 */
export const PROTOP_DOCK_ITEMS = {
  home: { id: 'home', label: 'Hjem', icon: 'home-outline', iconActive: 'home', action: { type: 'tab', tab: 'home' } },
  timeliste: { id: 'timeliste', label: 'Timer', icon: 'time-outline', iconActive: 'time', action: { type: 'tab', tab: 'timeliste' } },
  projects: { id: 'projects', label: 'Prosjekter', icon: 'business-outline', iconActive: 'business', action: { type: 'tab', tab: 'projects' } },
  plan: { id: 'plan', label: 'Kalender', icon: 'calendar-outline', iconActive: 'calendar', action: { type: 'tab', tab: 'plan' } },
  stars: { id: 'stars', label: 'Oppgaver', icon: 'checkbox-outline', iconActive: 'checkbox', action: { type: 'tab', tab: 'stars' } },
  more: { id: 'more', label: 'Meny', icon: 'menu-outline', iconActive: 'menu', action: { type: 'tab', tab: 'more' } },
};

export const COMPANY_DOCK_IDS = ['home', 'timeliste', 'projects', 'stars', 'more'];
export const PRIVATE_DOCK_IDS = ['home', 'timeliste', 'plan', 'stars', 'more'];

export function protopDock(ids) {
  return (ids || []).map((id) => PROTOP_DOCK_ITEMS[id]).filter(Boolean);
}

/**
 * Privat dock: den felles docken når personen er med i en bedrift og har standardvalget
 * (ikke egne snarveier). Ellers null, og personens egne snarveier gjelder.
 */
export function privateDockPreset({ hasCompany = false, bottomShortcutIds = [] } = {}) {
  if (!hasCompany) return null;
  const ids = bottomShortcutIds || [];
  const isDefault = ids.length === PROTOP_BOTTOM_SHORTCUT_IDS.length
    && ids.every((id, index) => id === PROTOP_BOTTOM_SHORTCUT_IDS[index]);
  return isDefault ? protopDock(PRIVATE_DOCK_IDS) : null;
}

/** Home widgets that belong to the kept shell. Same grid, without family modules. */
export const PROTOP_HOME_WIDGET_TYPES = [
  'weather',
  'clock',
  'date',
  'weeklyPlan',
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

export function applyProtopShellSections(sections, extraIds = []) {
  const extra = new Set(extraIds || []);
  return (sections || [])
    .map((section) => {
      if (section.id === 'account') return section;
      return {
        ...section,
        items: (section.items || []).filter((item) => isProtopShellModule(item.id) || extra.has(item.id)),
      };
    })
    .filter((section) => (section.items || []).length > 0);
}

export function applyProtopShellApps(apps) {
  return (apps || []).filter((app) => PROTOP_PRODUCT_MODULE_IDS.includes(app.id));
}

/** Activation settings only lists modules that belong in the ProTop shell. */
export function applyProtopActivationSections(sections) {
  const allowed = new Set(PROTOP_PRODUCT_MODULE_IDS);
  return (sections || [])
    .map((section) => ({
      ...section,
      items: (section.items || []).filter((mod) => allowed.has(mod.id)),
    }))
    .filter((section) => (section.items || []).length > 0);
}
