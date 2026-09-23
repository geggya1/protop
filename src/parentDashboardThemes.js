/**
 * Dashboard-tema for voksne / foresatte / admin.
 * Kun layoutene fra designforslagene — ingen ekstra widgets utover det som er på bildene.
 * Topp-illustrasjon roterer morgen / ettermiddag / kveld.
 * Soft krem-bakgrunn, ingen fet skrift i UI (se softTheme + widgets).
 */

/** Soft cream palette matching original mockups */
export const SOFT_THEME_TOKENS = {
  pageBg: '#F5F2EC',
  surface: '#FFFFFF',
  text: '#3D4450',
  textSecondary: '#7A8290',
  textMuted: '#9AA1AC',
  accent: '#6B8F71',
  accentSoft: '#E8F0E9',
  border: '#E8E4DC',
  mint: '#E8F2EA',
  peach: '#F7EBE6',
  lavender: '#E9EDF5',
  sky: '#E8F0F6',
};

/** Forslag v2 — samme soft krem-familie, nye layoutideer */
export const WEEK_STRIP_TOKENS = { ...SOFT_THEME_TOKENS };
export const ONE_BREATH_TOKENS = { ...SOFT_THEME_TOKENS };
export const HOUSE_WALL_TOKENS = { ...SOFT_THEME_TOKENS };

/** V2: familie på bakketopp (morgen / dag / kveld) */
const V2F = {
  morning: require('../assets/dashboard-art/v2/family/morning-sun.medium.jpg'),
  afternoon: require('../assets/dashboard-art/v2/family/day-bright.medium.jpg'),
  evening: require('../assets/dashboard-art/v2/family/evening-crescent.medium.jpg'),
};

/** V2: landskap med sjekkliste */
const V2L = {
  morning: require('../assets/dashboard-art/v2/landscape/morning-a.medium.jpg'),
  afternoon: require('../assets/dashboard-art/v2/landscape/morning-b.medium.jpg'),
  evening: require('../assets/dashboard-art/v2/landscape/evening.medium.jpg'),
};

/** V2: kalender 3D */
const V2C = {
  morning: require('../assets/dashboard-art/v2/calendar/morning.medium.jpg'),
  afternoon: require('../assets/dashboard-art/v2/calendar/afternoon.medium.jpg'),
  evening: require('../assets/dashboard-art/v2/calendar/night.medium.jpg'),
};

const H = {
  morningMountains: require('../assets/dashboard-art/heroes/morning-mountains-sun.medium.jpg'),
  morningHouse: require('../assets/dashboard-art/heroes/morning-house.medium.jpg'),
  morningLake: require('../assets/dashboard-art/heroes/morning-lake-boat.medium.jpg'),
  afternoonMountains: require('../assets/dashboard-art/heroes/afternoon-mountains-sun.medium.jpg'),
  afternoonFamily: require('../assets/dashboard-art/heroes/afternoon-family-sun.medium.jpg'),
  familySofa: require('../assets/dashboard-art/heroes/family-sofa.medium.jpg'),
  eveningMountains: require('../assets/dashboard-art/heroes/evening-mountains-moon.medium.jpg'),
  eveningFamilyMoon: require('../assets/dashboard-art/heroes/evening-family-moon.medium.jpg'),
  eveningFamilyCrescent: require('../assets/dashboard-art/heroes/evening-family-crescent.medium.jpg'),
  eveningFamilyWoman: require('../assets/dashboard-art/heroes/evening-family-woman.medium.jpg'),
  eveningHills: require('../assets/dashboard-art/heroes/evening-hills-glow.medium.jpg'),
  eveningGlow: require('../assets/dashboard-art/heroes/evening-family-glow.medium.jpg'),
};

const A = {
  calendarMorning: require('../assets/dashboard-art/accents/calendar-morning.medium.jpg'),
  calendarDay: require('../assets/dashboard-art/accents/calendar-day.medium.jpg'),
  calendarNight: require('../assets/dashboard-art/accents/calendar-night.medium.jpg'),
  calendarClay: require('../assets/dashboard-art/accents/calendar-clay.medium.jpg'),
  robotNight: require('../assets/dashboard-art/accents/robot-night.medium.jpg'),
};

export const DASHBOARD_CARD_ART = {
  grocery: require('../assets/dashboard-art/cards/grocery-bag.medium.jpg'),
  meal: require('../assets/dashboard-art/cards/meal-bowl.medium.jpg'),
  house: H.morningHouse,
};

export const DEFAULT_PARENT_DASHBOARD_THEME_ID = 'calm-day';

export const MAX_PARENT_BOTTOM_SHORTCUTS = 5;

export const DEFAULT_BOTTOM_SHORTCUT_IDS = ['home', 'plan', 'mail', 'stars', 'notes'];

/**
 * Hvert tema speiler ett designforslag.
 * `label` er innbydende profilnavn.
 * `heroArt` / `accentArt` roterer morgen · ettermiddag · kveld.
 * `heroMode`: 'inline' | 'banner' | 'none'
 * `tokens`: soft cream palette
 */
export const PARENT_DASHBOARD_THEMES = [
  {
    id: 'calm-day',
    label: 'Rolig start',
    description: 'Neste avtale, dagens plan og tre snarveier',
    preview: require('../assets/dashboard-themes/calm-day.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'calmDay',
    heroMode: 'inline',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2F },
    accentArt: { ...V2C },
    cardArt: { house: H.morningHouse },
  },
  {
    id: 'soft-lists',
    label: 'Ha en fin dag',
    description: 'Oppgaver, avtaler og meldinger',
    preview: require('../assets/dashboard-themes/soft-lists.jpg'),
    bottomNav: false,
    layout: 'softLists',
    heroMode: 'inline',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2L },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarClay,
      evening: A.calendarNight,
    },
  },
  {
    id: 'practical-cards',
    label: 'Praktisk hverdag',
    description: 'Oppgaver, handleliste og måltider',
    preview: require('../assets/dashboard-themes/practical-cards.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'stars', 'more'],
    layout: 'moduleCards',
    variant: 'sage',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: {
      morning: V2F.morning,
      afternoon: H.familySofa,
      evening: V2F.evening,
    },
  },
  {
    id: 'day-hub',
    label: 'Dagen din',
    description: 'Oppgaver, avtaler og hold kontakt',
    preview: require('../assets/dashboard-themes/day-hub.jpg'),
    bottomNav: false,
    layout: 'dayHub',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2C },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarDay,
      evening: A.robotNight,
    },
  },
  {
    id: 'kids-focus',
    label: 'Barna først',
    description: 'Delt hverdag, tidslinje og barnas dag',
    preview: require('../assets/dashboard-themes/kids-focus.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'stars', 'more'],
    layout: 'kidsFocus',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: {
      morning: V2L.morning,
      afternoon: V2F.afternoon,
      evening: V2F.evening,
    },
  },
  {
    id: 'family-gather',
    label: 'Familien samlet',
    description: 'Familiens dag, plan og snarveier',
    preview: require('../assets/dashboard-themes/family-gather.jpg'),
    bottomNav: false,
    layout: 'familyGather',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2F },
  },
  {
    id: 'shared-week',
    label: 'Barnas uke',
    description: 'Ukesstatus, i dag og delt handleliste',
    preview: require('../assets/dashboard-themes/shared-week.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'stars', 'more'],
    layout: 'sharedWeek',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2L },
  },
  {
    id: 'module-stack',
    label: 'Alt på ett sted',
    description: 'Oppgaver, handleliste og måltider',
    preview: require('../assets/dashboard-themes/module-stack.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'stars', 'more'],
    layout: 'moduleCards',
    variant: 'purple',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: {
      morning: V2F.morning,
      afternoon: H.familySofa,
      evening: V2F.evening,
    },
  },
  {
    id: 'family-samlet',
    label: 'Sammen hjemme',
    description: 'Medlemmer, familiens dag og husk i dag',
    preview: require('../assets/dashboard-themes/family-samlet.jpg'),
    bottomNav: false,
    layout: 'familySamlet',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2F },
  },
  {
    id: 'today-plan',
    label: 'Planlagt dag',
    description: 'Neste avtale, plan og snarveier',
    preview: require('../assets/dashboard-themes/today-plan.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'todayPlan',
    heroMode: 'inline',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2L },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarDay,
      evening: A.calendarNight,
    },
  },
  {
    id: 'family-day',
    label: 'Familiens dag',
    description: 'Medlemmer, familiens dag og snarveier',
    preview: require('../assets/dashboard-themes/family-day.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'familyDay',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2F },
  },
  {
    id: 'assistant',
    label: 'Smart hjelp',
    description: 'Forslag for dagen og snarveier',
    preview: require('../assets/dashboard-themes/assistant.jpg'),
    bottomNav: false,
    layout: 'assistant',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2C },
    accentArt: {
      morning: A.calendarClay,
      afternoon: A.calendarDay,
      evening: A.robotNight,
    },
  },
  {
    id: 'module-tilpass',
    label: 'Mine kort',
    description: 'Oppgaver, handleliste og måltider',
    preview: require('../assets/dashboard-themes/module-tilpass.jpg'),
    bottomNav: false,
    layout: 'moduleCards',
    variant: 'tilpass',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: {
      morning: V2F.morning,
      afternoon: H.familySofa,
      evening: V2F.evening,
    },
  },
  {
    id: 'tasks-grid',
    label: 'Få ting gjort',
    description: 'Dagens oppgaver og fire snarveier',
    preview: require('../assets/dashboard-themes/tasks-grid.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'stars', 'more'],
    layout: 'tasksGrid',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...V2L },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarClay,
      evening: A.calendarNight,
    },
  },
  {
    id: 'dagens-fokus',
    label: 'Det som teller',
    description: 'Fokus-kort, avtaler og snarveier',
    preview: require('../assets/dashboard-themes/dagens-fokus.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'stars', 'plan', 'more'],
    layout: 'dagensFokus',
    heroMode: 'banner',
    tokens: SOFT_THEME_TOKENS,
    heroArt: {
      morning: V2L.morning,
      afternoon: V2F.afternoon,
      evening: V2F.evening,
    },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarDay,
      evening: A.calendarNight,
    },
  },
  // --- Designforslag v2 (voksen hjem) — soft krem, nye layoutideer ---
  {
    id: 'week-strip',
    label: 'Ukesstripe',
    description: 'Forslag: uken som hero, deretter i dag og tidslinje',
    preview: require('../assets/dashboard-themes/week-strip.medium.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'weekStrip',
    heroMode: 'none',
    tokens: WEEK_STRIP_TOKENS,
  },
  {
    id: 'one-breath',
    label: 'Ett pust',
    description: 'Forslag: anti-dashbord — bare neste ting i fokus',
    preview: require('../assets/dashboard-themes/one-breath.medium.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'oneBreath',
    heroMode: 'banner',
    tokens: ONE_BREATH_TOKENS,
    heroArt: { ...V2L },
  },
  {
    id: 'house-wall',
    label: 'Husveggen',
    description: 'Forslag: middag, handleliste og i dag som likeverdige tavler',
    preview: require('../assets/dashboard-themes/house-wall.medium.jpg'),
    bottomNav: true,
    defaultBottomIds: ['home', 'plan', 'family', 'more'],
    layout: 'houseWall',
    heroMode: 'none',
    tokens: HOUSE_WALL_TOKENS,
  },
];

export function getParentDashboardTheme(id) {
  const found = PARENT_DASHBOARD_THEMES.find((t) => t.id === id);
  return found || PARENT_DASHBOARD_THEMES.find((t) => t.id === DEFAULT_PARENT_DASHBOARD_THEME_ID)
    || PARENT_DASHBOARD_THEMES[0];
}

export function isValidParentDashboardThemeId(id) {
  return PARENT_DASHBOARD_THEMES.some((t) => t.id === id);
}

export const DEFAULT_PARENT_ART_PACK_ID = 'family-hill';
export const DEFAULT_PARENT_BACKGROUND_ID = 'cream';

/**
 * Unique content layouts for the adult home wizard (step 1).
 * Older theme ids like module-stack map back here so saved choices still resolve.
 */
export const PARENT_DASHBOARD_LAYOUT_GROUPS = [
  { id: 'hverdag', label: 'Hverdagen', hint: 'Plan, oppgaver og snarveier' },
  { id: 'familie', label: 'Familie og barn', hint: 'Oversikt for flere hjem og barna' },
  { id: 'rolig', label: 'Enkelt og rolig', hint: 'Mindre støy, mer fokus' },
];

export const PARENT_DASHBOARD_LAYOUTS = [
  {
    id: 'calm-day',
    group: 'hverdag',
    icon: 'sunny-outline',
    lead: 'Et rolig overblikk: det neste som skjer, planen for dagen, og tre snarveier.',
    includes: ['Neste avtale som eget kort', 'Tidslinje for dagen', 'Tre snarveier', 'Påminnelse om det som gjenstår'],
    defaultArtPackId: 'family-hill',
  },
  {
    id: 'today-plan',
    group: 'hverdag',
    icon: 'calendar-outline',
    lead: 'Samme struktur som en klassisk hjemmeside: hilsen, neste avtale og dagens plan.',
    includes: ['Hilsen med dato', 'Neste avtale', 'Dagens plan som tidslinje', 'Tre snarveier'],
    defaultArtPackId: 'landscape',
  },
  {
    id: 'practical-cards',
    group: 'hverdag',
    icon: 'grid-outline',
    lead: 'Tre likeverdige kort for det praktiske: oppgaver, handleliste og middag.',
    includes: ['Oppgaver', 'Handleliste', 'Måltider / middag'],
    defaultArtPackId: 'family-sofa',
  },
  {
    id: 'tasks-grid',
    group: 'hverdag',
    icon: 'checkbox-outline',
    lead: 'Dagens oppgaver først, deretter fire store snarveier.',
    includes: ['Dagens oppgaver', 'Fire snarveier (handel, måltid, ny oppgave, plan)'],
    defaultArtPackId: 'landscape',
  },
  {
    id: 'dagens-fokus',
    group: 'hverdag',
    icon: 'flag-outline',
    lead: 'Ett stort fokus-kort for det som teller mest, pluss avtaler og snarveier.',
    includes: ['Dagens fokus-kort', 'Avtaler som tidslinje', 'Tre snarveier'],
    defaultArtPackId: 'day-mix',
  },
  {
    id: 'kids-focus',
    group: 'familie',
    icon: 'people-outline',
    lead: 'Barna i sentrum: delt hverdag, tidslinje og et kort per barn.',
    includes: ['Ukesstatus', 'Tidslinje for i dag', 'Barnas dag som egne kort', 'Handleliste'],
    defaultArtPackId: 'day-mix',
  },
  {
    id: 'shared-week',
    group: 'familie',
    icon: 'swap-horizontal-outline',
    lead: 'Uken, i dag og barnas dag samlet på ett hjem-brett.',
    includes: ['Ukesstatus og vær', 'Dagens tidslinje', 'Barnas dag', 'Handleliste'],
    defaultArtPackId: 'landscape',
  },
  {
    id: 'family-gather',
    group: 'familie',
    icon: 'heart-outline',
    lead: 'Familiens dag med medlemmer, neste på planen og snarveier.',
    includes: ['Familiens dag-banner', 'Medlemmer', 'Neste på planen', 'Tre snarveier'],
    defaultArtPackId: 'family-hill',
  },
  {
    id: 'family-samlet',
    group: 'familie',
    icon: 'people-circle-outline',
    lead: 'Medlemmer først, deretter familiens dag og det dere må huske.',
    includes: ['Medlemmer', 'Familiens dag', 'Neste på planen', 'Husk i dag'],
    defaultArtPackId: 'family-hill',
  },
  {
    id: 'family-day',
    group: 'familie',
    icon: 'happy-outline',
    lead: 'Stor hilsen, familiemedlemmer og planen for dagen.',
    includes: ['Hilsen og medlemmer', 'Familiens dag', 'Neste på planen', 'Snarveier'],
    defaultArtPackId: 'family-hill',
  },
  {
    id: 'soft-lists',
    group: 'rolig',
    icon: 'list-outline',
    lead: 'Oppgaver, avtaler og meldinger under hverandre — uten bunnnavigasjon.',
    includes: ['Oppgaver', 'Neste avtaler', 'Meldinger', 'To snarveier'],
    defaultArtPackId: 'landscape',
  },
  {
    id: 'day-hub',
    group: 'rolig',
    icon: 'home-outline',
    lead: 'Hilsen med vær, deretter oppgaver, avtaler og kontakt.',
    includes: ['Hilsen og vær', 'Oppgaver', 'Neste avtaler', 'Meldinger'],
    defaultArtPackId: 'calendar',
  },
  {
    id: 'assistant',
    group: 'rolig',
    icon: 'sparkles-outline',
    lead: 'En assistent som foreslår hva som er lurt i dag, pluss planen.',
    includes: ['Forslag for dagen', 'Tidslinje', 'To snarveier'],
    defaultArtPackId: 'calendar',
  },
  {
    id: 'one-breath',
    group: 'rolig',
    icon: 'leaf-outline',
    lead: 'Anti-dashbord: bare den neste tingen i fokus.',
    includes: ['Ett stort neste-punkt', 'Antall avtaler ellers i dag'],
    defaultArtPackId: 'landscape',
  },
  {
    id: 'week-strip',
    group: 'rolig',
    icon: 'calendar-outline',
    lead: 'Uken som stripe øverst — uten toppbilde — deretter i dag.',
    includes: ['Ukesstripe', 'Neste avtale', 'Dagens plan'],
    defaultArtPackId: 'family-hill',
  },
  {
    id: 'house-wall',
    group: 'rolig',
    icon: 'home-outline',
    lead: 'Tre tavler side om side: middag, handleliste og i dag. Uten toppbilde.',
    includes: ['Middag', 'Handleliste', 'I dag som tavle'],
    defaultArtPackId: 'house-home',
  },
];

/**
 * Heading illustrations (top of home). Morning / afternoon / evening.
 * Background images will be added as a separate catalog when new art arrives.
 */
export const PARENT_DASHBOARD_ART_PACKS = [
  {
    id: 'family-hill',
    label: 'Familien på bakketopp',
    description: 'Varm familieillustrasjon som følger morgen, dag og kveld.',
    heading: { ...V2F },
    accentArt: { ...V2C },
  },
  {
    id: 'landscape',
    label: 'Landskap med oversikt',
    description: 'Rolig landskap som bakteppe for hilsenen øverst.',
    heading: { ...V2L },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarClay,
      evening: A.calendarNight,
    },
  },
  {
    id: 'calendar',
    label: 'Kalender i 3D',
    description: 'Kalenderillustrasjon som skifter med døgnet.',
    heading: { ...V2C },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarDay,
      evening: A.robotNight,
    },
  },
  {
    id: 'family-sofa',
    label: 'Hjemme i sofaen',
    description: 'Fra morgenlys til kveldssamling hjemme.',
    heading: {
      morning: V2F.morning,
      afternoon: H.familySofa,
      evening: V2F.evening,
    },
  },
  {
    id: 'day-mix',
    label: 'Dag i bevegelse',
    description: 'Landskap om morgenen, familie utover dagen.',
    heading: {
      morning: V2L.morning,
      afternoon: V2F.afternoon,
      evening: V2F.evening,
    },
    accentArt: {
      morning: A.calendarMorning,
      afternoon: A.calendarDay,
      evening: A.calendarNight,
    },
  },
  {
    id: 'mountains',
    label: 'Fjell og lys',
    description: 'Fjellmotiv fra soloppgang til måneskinn.',
    heading: {
      morning: H.morningMountains,
      afternoon: H.afternoonMountains,
      evening: H.eveningMountains,
    },
  },
  {
    id: 'lake-hills',
    label: 'Sjø og åser',
    description: 'Stille vann om morgenen, varmt lys om kvelden.',
    heading: {
      morning: H.morningLake,
      afternoon: H.afternoonMountains,
      evening: H.eveningHills,
    },
  },
  {
    id: 'house-home',
    label: 'Huset vårt',
    description: 'Hjemmet som ramme for dagen.',
    heading: {
      morning: H.morningHouse,
      afternoon: H.familySofa,
      evening: H.eveningFamilyWoman,
    },
    cardArt: { house: H.morningHouse },
  },
  {
    id: 'family-glow',
    label: 'Kveldsglød',
    description: 'Varm familiesamling mot kvelden.',
    heading: {
      morning: H.afternoonFamily,
      afternoon: H.familySofa,
      evening: H.eveningGlow,
    },
  },
];

/**
 * Page backgrounds behind the home content.
 * Only the cream default ships now — new photos will be added here.
 */
export const PARENT_DASHBOARD_BACKGROUNDS = [
  {
    id: 'cream',
    label: 'Myk krem',
    description: 'Samme rolige bakgrunn som i dag. Flere bilder kommer.',
    color: SOFT_THEME_TOKENS.pageBg,
    image: null,
    comingSoon: false,
  },
];

/** Map legacy combined theme ids → wizard layout id. */
const THEME_TO_LAYOUT_ID = {
  'calm-day': 'calm-day',
  'soft-lists': 'soft-lists',
  'practical-cards': 'practical-cards',
  'module-stack': 'practical-cards',
  'module-tilpass': 'practical-cards',
  'day-hub': 'day-hub',
  'kids-focus': 'kids-focus',
  'family-gather': 'family-gather',
  'shared-week': 'shared-week',
  'family-samlet': 'family-samlet',
  'today-plan': 'today-plan',
  'family-day': 'family-day',
  assistant: 'assistant',
  'tasks-grid': 'tasks-grid',
  'dagens-fokus': 'dagens-fokus',
  'week-strip': 'week-strip',
  'one-breath': 'one-breath',
  'house-wall': 'house-wall',
};

/** Map legacy theme ids → art pack so existing homes keep their look. */
const THEME_TO_ART_PACK_ID = {
  'calm-day': 'family-hill',
  'soft-lists': 'landscape',
  'practical-cards': 'family-sofa',
  'module-stack': 'family-sofa',
  'module-tilpass': 'family-sofa',
  'day-hub': 'calendar',
  'kids-focus': 'day-mix',
  'family-gather': 'family-hill',
  'shared-week': 'landscape',
  'family-samlet': 'family-hill',
  'today-plan': 'landscape',
  'family-day': 'family-hill',
  assistant: 'calendar',
  'tasks-grid': 'landscape',
  'dagens-fokus': 'day-mix',
  'week-strip': 'family-hill',
  'one-breath': 'landscape',
  'house-wall': 'house-home',
};

export function isValidParentDashboardLayoutId(id) {
  return PARENT_DASHBOARD_LAYOUTS.some((l) => l.id === id);
}

export function isValidParentDashboardArtPackId(id) {
  return PARENT_DASHBOARD_ART_PACKS.some((p) => p.id === id);
}

export function isValidParentDashboardBackgroundId(id) {
  return PARENT_DASHBOARD_BACKGROUNDS.some((b) => b.id === id);
}

export function resolveParentDashboardLayoutId(themeOrLayoutId) {
  if (isValidParentDashboardLayoutId(themeOrLayoutId)) return themeOrLayoutId;
  const mapped = THEME_TO_LAYOUT_ID[themeOrLayoutId];
  if (mapped && isValidParentDashboardLayoutId(mapped)) return mapped;
  return DEFAULT_PARENT_DASHBOARD_THEME_ID;
}

export function defaultArtPackIdForTheme(themeOrLayoutId) {
  if (THEME_TO_ART_PACK_ID[themeOrLayoutId]) return THEME_TO_ART_PACK_ID[themeOrLayoutId];
  const layoutId = resolveParentDashboardLayoutId(themeOrLayoutId);
  const layout = PARENT_DASHBOARD_LAYOUTS.find((l) => l.id === layoutId);
  return layout?.defaultArtPackId || DEFAULT_PARENT_ART_PACK_ID;
}

export function getParentDashboardLayout(id) {
  const layoutId = resolveParentDashboardLayoutId(id);
  const meta = PARENT_DASHBOARD_LAYOUTS.find((l) => l.id === layoutId)
    || PARENT_DASHBOARD_LAYOUTS[0];
  const theme = getParentDashboardTheme(layoutId);
  return {
    ...theme,
    ...meta,
    id: layoutId,
  };
}

export function getParentDashboardArtPack(id) {
  const found = PARENT_DASHBOARD_ART_PACKS.find((p) => p.id === id);
  return found || PARENT_DASHBOARD_ART_PACKS.find((p) => p.id === DEFAULT_PARENT_ART_PACK_ID)
    || PARENT_DASHBOARD_ART_PACKS[0];
}

export function getParentDashboardBackground(id) {
  const found = PARENT_DASHBOARD_BACKGROUNDS.find((b) => b.id === id);
  return found || PARENT_DASHBOARD_BACKGROUNDS.find((b) => b.id === DEFAULT_PARENT_BACKGROUND_ID)
    || PARENT_DASHBOARD_BACKGROUNDS[0];
}

export function layoutShowsTopImage(layout) {
  const mode = layout?.heroMode || 'banner';
  return mode !== 'none';
}

export function artPackThumb(pack, dayPart = 'afternoon') {
  const heading = pack?.heading;
  if (!heading) return null;
  return heading[dayPart] || heading.afternoon || heading.morning || heading.evening || null;
}

/**
 * Combine a content layout with heading art + page background.
 * This is what the home screen actually renders.
 */
export function composeParentDashboardTheme(layoutId, artPackId, backgroundId) {
  const layout = getParentDashboardLayout(layoutId);
  const art = getParentDashboardArtPack(artPackId);
  const bg = getParentDashboardBackground(backgroundId);
  return {
    ...layout,
    artPackId: art.id,
    backgroundId: bg.id,
    heroArt: art.heading || null,
    accentArt: art.accentArt || layout.accentArt || null,
    cardArt: art.cardArt || layout.cardArt || null,
    tokens: {
      ...(layout.tokens || SOFT_THEME_TOKENS),
      pageBg: bg.color || layout.tokens?.pageBg || SOFT_THEME_TOKENS.pageBg,
    },
    backgroundArt: bg.image || null,
  };
}
