/**
 * Pure module-activation catalog helpers.
 * Sales copy lives in moduler.json — keep it out of UI components.
 */

export const CATEGORY_ORDER = [
  { id: 'main', title: 'Hoved' },
  { id: 'food', title: 'Mat & innkjøp' },
  { id: 'memories', title: 'Minner' },
  { id: 'family', title: 'Familien' },
  { id: 'school', title: 'Skole' },
  { id: 'vehicles', title: 'Kjøretøy' },
  { id: 'house', title: 'Hus & papir' },
];

export const ILLUSTRATION_DIR = '/assets/module-activation';

/** Bump when illustration bytes change. Filenames stay stable, so web URLs
 *  must change or browsers keep the old PNG (Firebase caches /assets/* as
 *  immutable for a year). */
export const ILLUSTRATION_CACHE = '20260917e';

export function withIllustrationCache(path) {
  if (!path) return path;
  const s = String(path);
  if (s.includes('?')) return s;
  return `${s}?v=${ILLUSTRATION_CACHE}`;
}

/** Catalog + page-hero PNG filenames. Matcoach is page-only (not gated). */
export const ILLUSTRATION_FILES = {
  plan: 'kalender--module-activation-illustration.png',
  mail: 'e-post--module-activation-illustration.png',
  stars: 'oppgaver--module-activation-illustration.png',
  notes: 'notat--module-activation-illustration.png',
  chat: 'chat--module-activation-illustration.png',
  chores: 'gjoremal--module-activation-illustration.png',
  shop: 'handleliste--module-activation-illustration.png',
  meals: 'maltidsplanlegger--module-activation-illustration.png',
  recipes: 'oppskrift--module-activation-illustration.png',
  pantry: 'lager--module-activation-illustration.png',
  matcoach: 'ai-matcoach--module-activation-illustration.png',
  albums: 'familiealbum--module-activation-illustration.png',
  wall: 'familievegg--module-activation-illustration.png',
  childDrawings: 'barnetegninger--module-activation-illustration.png',
  familyTree: 'familietreet--module-activation-illustration.png',
  scratchMap: 'vare-reiser--module-activation-illustration.png',
  reiseplanlegger: 'reiseplanlegger--module-activation-illustration.png',
  wishes: 'gaveonsker--module-activation-illustration.png',
  location: 'familieposisjon--module-activation-illustration.png',
  rememberDates: 'husk-dato--module-activation-illustration.png',
  activities: 'aktiviteter--module-activation-illustration.png',
  books: 'bokhylla--module-activation-illustration.png',
  games: 'familiespill--module-activation-illustration.png',
  progress: 'barnas-progresjon--module-activation-illustration.png',
  skole: 'skole--module-activation-illustration.png',
  lekser: 'lekser--module-activation-illustration.png',
  leksehjelp: 'leksehjelp--module-activation-illustration.png',
  mattehjelp: 'mattehjelp--module-activation-illustration.png',
  'week-plan': 'ukeplan--module-activation-illustration.png',
  holdings: 'kjoretoy--module-activation-illustration.png',
  documents: 'dokumenter--module-activation-illustration.png',
  boligmappa: 'boligen--module-activation-illustration.png',
  hospitality: 'utleie--module-activation-illustration.png',
};

export function publicIllustrationPathForId(moduleId, catalogPath = null) {
  if (catalogPath) return catalogPath;
  const file = ILLUSTRATION_FILES[moduleId];
  if (!file) return null;
  return withIllustrationCache(`${ILLUSTRATION_DIR}/${file}`);
}

export const SHELL_SKIP_MODULE_IDS = new Set([
  'home',
  'more',
  'settings',
  'legal',
  'subscription',
  'members',
  'addMember',
  'groupSettings',
  'childApps',
  'quiz',
  'ai',
  'voiceNotes',
  'restrictions',
  'moduleAccess',
  'help',
]);

export const STACK_MODULE_IDS = {
  SchoolFolder: 'skole',
  Lekser: 'lekser',
  Leksehjelp: 'leksehjelp',
  Mattehjelp: 'mattehjelp',
  ChildSchedule: 'week-plan',
  Klassen: 'klassen',
  KlassenDetail: 'klassen',
  ChoreSettings: 'chores',
  FamilyGames: 'games',
  Bookshelf: 'books',
  Activities: 'activities',
  ActivityDetail: 'activities',
  StarGoals: 'chores',
  FamilyProgress: 'progress',
  LocationSettings: 'location',
  AddTodo: 'stars',
  AddNote: 'notes',
  AddBook: 'books',
  BookDetail: 'books',
  MealDetail: 'meals',
  AddHomework: 'lekser',
  ParentTask: 'stars',
  TicTacToe: 'games',
  RockPaperScissors: 'games',
  GuessNumber: 'games',
  DrawGuess: 'games',
  Connect4: 'games',
  LocalPlay: 'games',
};

function asString(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function asBenefits(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

export function createModuleRegistry(catalog) {
  const defaults = catalog?.defaults && typeof catalog.defaults === 'object'
    ? catalog.defaults
    : {};
  const rows = Array.isArray(catalog?.modules) ? catalog.modules : [];
  const byId = new Map();

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const id = asString(raw.id);
    if (!id) continue;
    const name = asString(raw.name, id);
    const illustration = asString(raw.illustration);
    const mobileReassuranceText = asString(
      raw.mobileReassuranceText,
      asString(
        raw.reassuranceTextCompact,
        asString(
          defaults.mobileReassuranceText,
          asString(defaults.reassuranceTextCompact, asString(defaults.reassuranceText)),
        ),
      ),
    );
    const config = {
      id,
      name,
      category: asString(raw.category, 'main'),
      eyebrow: asString(raw.eyebrow),
      headline: asString(raw.headline, name),
      pitch: asString(raw.pitch),
      benefits: asBenefits(raw.benefits).slice(0, 3),
      illustration,
      illustrationPath: illustration
        ? withIllustrationCache(`${ILLUSTRATION_DIR}/${illustration}`)
        : '',
      activationLabel: asString(raw.activationLabel, `Aktiver ${name}`),
      backLabel: asString(raw.backLabel, asString(defaults.backLabel, 'Tilbake')),
      reassuranceText: asString(
        raw.reassuranceText,
        asString(defaults.reassuranceText),
      ),
      mobileReassuranceText,
      reassuranceTextCompact: mobileReassuranceText,
      childReassuranceText: asString(
        raw.childReassuranceText,
        asString(defaults.childReassuranceText, asString(defaults.reassuranceText)),
      ),
    };
    byId.set(id, config);
  }

  const ACTIVATABLE_MODULE_IDS = [...byId.keys()];

  function getModuleConfig(moduleId) {
    if (!moduleId) return null;
    return byId.get(String(moduleId)) || null;
  }

  function isActivatableModule(moduleId) {
    return !!getModuleConfig(moduleId);
  }

  function listModulesByCategory() {
    const used = new Set();
    const sections = [];
    for (const cat of CATEGORY_ORDER) {
      const items = ACTIVATABLE_MODULE_IDS
        .map((id) => byId.get(id))
        .filter((mod) => mod.category === cat.id);
      items.forEach((mod) => used.add(mod.id));
      if (items.length) sections.push({ id: cat.id, title: cat.title, items });
    }
    const leftover = ACTIVATABLE_MODULE_IDS
      .map((id) => byId.get(id))
      .filter((mod) => !used.has(mod.id));
    if (leftover.length) {
      sections.push({ id: 'other', title: 'Øvrige', items: leftover });
    }
    return sections;
  }

  function activationModuleIdForShell(tab, moreSubView = null) {
    if (!tab) return null;
    if (tab === 'more') {
      if (!moreSubView || SHELL_SKIP_MODULE_IDS.has(moreSubView)) return null;
      return isActivatableModule(moreSubView) ? moreSubView : null;
    }
    if (SHELL_SKIP_MODULE_IDS.has(tab)) return null;
    return isActivatableModule(tab) ? tab : null;
  }

  function activationModuleIdForStack(routeName) {
    if (!routeName) return null;
    const id = STACK_MODULE_IDS[routeName];
    return id && isActivatableModule(id) ? id : null;
  }

  return {
    catalog,
    defaults,
    byId,
    ACTIVATABLE_MODULE_IDS,
    getModuleConfig,
    isActivatableModule,
    listModulesByCategory,
    activationModuleIdForShell,
    activationModuleIdForStack,
  };
}

export function reassuranceForRole(moduleConfig, { isChild = false, compact = false, stacked = false } = {}) {
  if (!moduleConfig) return '';
  if (isChild) return moduleConfig.childReassuranceText || '';
  if (compact || stacked) {
    return moduleConfig.mobileReassuranceText
      || moduleConfig.reassuranceTextCompact
      || moduleConfig.reassuranceText
      || '';
  }
  return moduleConfig.reassuranceText || '';
}
