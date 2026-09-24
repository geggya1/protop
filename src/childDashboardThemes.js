/**
 * Dashbord-temaer for barn under 18 på telefon, nettbrett og web.
 * Samme mønster som foresatt: ett tema, illustrasjon skifter morgen/ettermiddag/kveld.
 */

import { SOFT_THEME_TOKENS } from './parentDashboardThemes';

const EVENTYRSKOG = {
  morning: require('../assets/child-dashboard-art/eventyrskog/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/eventyrskog/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/eventyrskog/evening.medium.jpg'),
};

const DYREVENNER = {
  morning: require('../assets/child-dashboard-art/dyrevenner/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/dyrevenner/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/dyrevenner/evening.medium.jpg'),
};

const LEK_OG_LARING = {
  morning: require('../assets/child-dashboard-art/lek-og-laring/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/lek-og-laring/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/lek-og-laring/evening.medium.jpg'),
};

const FARGERIK_SKOLEDAG = {
  morning: require('../assets/child-dashboard-art/fargerik-skoledag/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/fargerik-skoledag/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/fargerik-skoledag/evening.medium.jpg'),
};

const OPPDAGELSESREISE = {
  morning: require('../assets/child-dashboard-art/oppdagelsesreise/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/oppdagelsesreise/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/oppdagelsesreise/evening.medium.jpg'),
};

const AKTIV_HVERDAG = {
  morning: require('../assets/child-dashboard-art/aktiv-hverdag/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/aktiv-hverdag/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/aktiv-hverdag/evening.medium.jpg'),
};

const COOL_SCHOOL = {
  morning: require('../assets/child-dashboard-art/cool-school/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/cool-school/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/cool-school/evening.medium.jpg'),
};

const KREATIV_FRITID = {
  morning: require('../assets/child-dashboard-art/kreativ-fritid/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/kreativ-fritid/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/kreativ-fritid/evening.medium.jpg'),
};

const MINIMAL_UNGDOM = {
  morning: require('../assets/child-dashboard-art/minimal-ungdom/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/minimal-ungdom/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/minimal-ungdom/evening.medium.jpg'),
};

const SOSIAL_OG_SMART = {
  morning: require('../assets/child-dashboard-art/sosial-og-smart/morning.medium.jpg'),
  afternoon: require('../assets/child-dashboard-art/sosial-og-smart/afternoon.medium.jpg'),
  evening: require('../assets/child-dashboard-art/sosial-og-smart/evening.medium.jpg'),
};

/** Soft placeholder pack when art for a theme arrives in a later batch */
const PLACEHOLDER = {
  morning: EVENTYRSKOG.morning,
  afternoon: EVENTYRSKOG.afternoon,
  evening: EVENTYRSKOG.evening,
};

export const DEFAULT_CHILD_DASHBOARD_THEME_ID = 'eventyrskog';

/**
 * Kapitler etter alder — brukes i innstillingsmenyen.
 * minAge/maxAge er inkluderende preferansebånd (år).
 */
export const CHILD_DASHBOARD_CHAPTERS = [
  {
    id: 'ages-2-5',
    label: '2–5 år',
    subtitle: 'Myke eventyr og dyrevenner',
    minAge: 2,
    maxAge: 5,
    themeIds: ['eventyrskog', 'dyrevenner'],
  },
  {
    id: 'ages-5-7',
    label: '5–7 år',
    subtitle: 'Lek, læring og skoledag',
    minAge: 5,
    maxAge: 7,
    themeIds: ['lek-og-laring', 'fargerik-skoledag'],
  },
  {
    id: 'ages-7-10',
    label: '7–10 år',
    subtitle: 'Oppdagelse og aktiv hverdag',
    minAge: 7,
    maxAge: 10,
    themeIds: ['oppdagelsesreise', 'aktiv-hverdag'],
  },
  {
    id: 'ages-10-14',
    label: '10–14 år',
    subtitle: 'Skole og kreativ fritid',
    minAge: 10,
    maxAge: 14,
    themeIds: ['cool-school', 'kreativ-fritid'],
  },
  {
    id: 'ages-15-17',
    label: '15–17 år',
    subtitle: 'Minimal og sosial',
    minAge: 15,
    maxAge: 17,
    themeIds: ['minimal-ungdom', 'sosial-og-smart'],
  },
];

/**
 * 10 barne-temaer for telefon, nettbrett og web.
 * `artReady`: false = illustrasjoner kommer i senere leveranse (placeholder art).
 * `heroMode`: 'bleed' = full bredde med soft fade (tablet/web).
 */
export const CHILD_DASHBOARD_THEMES = [
  {
    id: 'eventyrskog',
    label: 'Eventyrskog',
    description: 'Skog, rådyr og små eventyr — mykt for de minste',
    chapterId: 'ages-2-5',
    artReady: true,
    preview: EVENTYRSKOG.morning, // same as hero — never UI-mockup
    layout: 'storyForest',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...EVENTYRSKOG },
  },
  {
    id: 'dyrevenner',
    label: 'Dyrevenner',
    description: 'Valp, katt og kos — dagen med dyrevennene',
    chapterId: 'ages-2-5',
    artReady: true,
    preview: DYREVENNER.morning, // same as hero — never UI-mockup
    layout: 'animalFriends',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...DYREVENNER },
  },
  {
    id: 'lek-og-laring',
    label: 'Lek og læring',
    description: 'Nysgjerrig lek som glir over i læring',
    chapterId: 'ages-5-7',
    artReady: true,
    preview: LEK_OG_LARING.morning, // same as hero — never UI-mockup
    layout: 'playLearn',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...LEK_OG_LARING },
  },
  {
    id: 'fargerik-skoledag',
    label: 'Fargerik skoledag',
    description: 'Skoleglede med farger, bøker og små seire',
    chapterId: 'ages-5-7',
    artReady: true,
    preview: FARGERIK_SKOLEDAG.morning, // same as hero — never UI-mockup
    layout: 'colorSchool',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...FARGERIK_SKOLEDAG },
  },
  {
    id: 'oppdagelsesreise',
    label: 'Oppdagelsesreise',
    description: 'Utforsk dagen — kart, spor og små oppdrag',
    chapterId: 'ages-7-10',
    artReady: true,
    preview: OPPDAGELSESREISE.morning, // same as hero — never UI-mockup
    layout: 'explore',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...OPPDAGELSESREISE },
  },
  {
    id: 'aktiv-hverdag',
    label: 'Aktiv hverdag',
    description: 'Bevegelse, plan og energi gjennom dagen',
    chapterId: 'ages-7-10',
    artReady: true,
    preview: AKTIV_HVERDAG.morning, // same as hero — never UI-mockup
    layout: 'activeDay',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...AKTIV_HVERDAG },
  },
  {
    id: 'cool-school',
    label: 'Cool school',
    description: 'Rolig skolefokus med moderne uttrykk',
    chapterId: 'ages-10-14',
    artReady: true,
    preview: COOL_SCHOOL.morning, // same as hero — never UI-mockup
    layout: 'coolSchool',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...COOL_SCHOOL },
  },
  {
    id: 'kreativ-fritid',
    label: 'Kreativ fritid',
    description: 'Hobby, skaperglede og egen tid',
    chapterId: 'ages-10-14',
    artReady: true,
    preview: KREATIV_FRITID.morning, // same as hero — never UI-mockup
    layout: 'creativeFree',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...KREATIV_FRITID },
  },
  {
    id: 'minimal-ungdom',
    label: 'Minimal ungdom',
    description: 'Rent, rolig og lite støy — for større barn',
    chapterId: 'ages-15-17',
    artReady: true,
    preview: MINIMAL_UNGDOM.morning, // same as hero — never UI-mockup
    layout: 'minimalYouth',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...MINIMAL_UNGDOM },
  },
  {
    id: 'sosial-og-smart',
    label: 'Sosial og smart',
    description: 'Venner, plan og smart oversikt',
    chapterId: 'ages-15-17',
    artReady: true,
    preview: SOSIAL_OG_SMART.morning, // same as hero — never UI-mockup
    layout: 'socialSmart',
    heroMode: 'bleed',
    tokens: SOFT_THEME_TOKENS,
    heroArt: { ...SOSIAL_OG_SMART },
  },
];

const BY_ID = Object.fromEntries(CHILD_DASHBOARD_THEMES.map((t) => [t.id, t]));


/** Hero for given daypart — never falls back to mockup previews. */
export function childThemeDaypartArt(theme, dayPart = 'morning') {
  const pack = theme?.heroArt;
  if (!pack) return theme?.preview || null;
  return pack[dayPart] || pack.morning || pack.afternoon || pack.evening || theme?.preview || null;
}

export function isValidChildDashboardThemeId(id) {
  return Boolean(id && BY_ID[id]);
}

export function getChildDashboardTheme(id) {
  return BY_ID[id] || BY_ID[DEFAULT_CHILD_DASHBOARD_THEME_ID];
}

export function getChildDashboardChapter(chapterId) {
  return CHILD_DASHBOARD_CHAPTERS.find((c) => c.id === chapterId) || null;
}

/** Anbefalt kapittel for barnets alder (inkluderende bånd). */
export function recommendedChapterForAge(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return CHILD_DASHBOARD_CHAPTERS[0];
  const hit = CHILD_DASHBOARD_CHAPTERS.find((c) => n >= c.minAge && n <= c.maxAge);
  if (hit) return hit;
  if (n < 2) return CHILD_DASHBOARD_CHAPTERS[0];
  return CHILD_DASHBOARD_CHAPTERS[CHILD_DASHBOARD_CHAPTERS.length - 1];
}

export function themesForChapter(chapterId) {
  const chapter = getChildDashboardChapter(chapterId);
  if (!chapter) return [];
  return chapter.themeIds.map((id) => BY_ID[id]).filter(Boolean);
}

/** Default theme id for a child's age when nothing is saved yet. */
export function defaultChildDashboardThemeIdForAge(age) {
  const chapter = recommendedChapterForAge(age);
  return chapter?.themeIds?.[0] || DEFAULT_CHILD_DASHBOARD_THEME_ID;
}
