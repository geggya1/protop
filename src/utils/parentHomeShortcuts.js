import { protopBrand } from '../brand/protopBrand.js';

const BRAND = protopBrand.digitalBlue;

/** Standard snarveier — Oppgaver, Kalender, Prosjekt, E-post. */
export const DEFAULT_PARENT_SHORTCUT_IDS = ['stars', 'plan', 'projects', 'mail'];

/** Mini icons inside the + mer folder glyph (Kalender / Prosjekt / Venner / E-post). */
export const MORE_FOLDER_GLYPHS = [
  { icon: 'calendar', color: BRAND },
  { icon: 'business', color: BRAND },
  { icon: 'people', color: '#6B8F71' },
  { icon: 'mail', color: BRAND },
];

/** Default 4-across home tiles: Oppgaver, Kalender, Prosjekt, + mer. */
export const DEFAULT_HOME_SHORTCUT_TILES = [
  { id: 'stars', icon: 'checkmark-circle', tileLabel: 'Oppgaver', label: 'Oppgaver', action: { type: 'tab', tab: 'stars' } },
  { id: 'plan', icon: 'calendar', tileLabel: 'Kalender', label: 'Kalender', action: { type: 'tab', tab: 'plan' } },
  { id: 'projects', icon: 'business', tileLabel: 'Prosjekt', label: 'Prosjekt', action: { type: 'tab', tab: 'projects' } },
  {
    id: 'more',
    icon: 'add',
    tileLabel: '+ mer',
    label: '+ mer',
    folder: true,
    action: { type: 'tab', tab: 'more' },
  },
];

/** Same professional tiles on every profile. */
export const DEFAULT_CHILD_HOME_SHORTCUT_TILES = [
  { id: 'stars', icon: 'checkmark-circle', tileLabel: 'Oppgaver', label: 'Oppgaver', action: { type: 'tab', tab: 'stars' } },
  { id: 'plan', icon: 'calendar', tileLabel: 'Kalender', label: 'Kalender', action: { type: 'tab', tab: 'plan' } },
  { id: 'mail', icon: 'mail', tileLabel: 'E-post', label: 'E-post', action: { type: 'tab', tab: 'mail' } },
  {
    id: 'more',
    icon: 'add',
    tileLabel: '+ mer',
    label: '+ mer',
    folder: true,
    action: { type: 'tab', tab: 'more' },
  },
];

export const PARENT_HOME_SHORTCUTS_KEY = 'weekplan.parentHomeShortcuts.v1';

export const MAX_PARENT_SHORTCUTS = 8;

export function normalizeShortcutIds(ids, { allowedIds = null } = {}) {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    if (allowed && !allowed.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_PARENT_SHORTCUTS) break;
  }
  return out;
}

export function resolveShortcutIds(stored, catalogIds = []) {
  const allowed = new Set(catalogIds);
  const fromStored = normalizeShortcutIds(stored, { allowedIds: allowed });
  if (fromStored.length) return fromStored;
  return normalizeShortcutIds(DEFAULT_PARENT_SHORTCUT_IDS, { allowedIds: allowed });
}

async function storage() {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default;
}

export async function loadParentShortcutIds(uid) {
  if (!uid) return null;
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(`${PARENT_HOME_SHORTCUTS_KEY}.${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveParentShortcutIds(uid, ids) {
  if (!uid) return;
  try {
    const AsyncStorage = await storage();
    const cleaned = normalizeShortcutIds(ids);
    await AsyncStorage.setItem(
      `${PARENT_HOME_SHORTCUTS_KEY}.${uid}`,
      JSON.stringify(cleaned),
    );
  } catch {
    /* ignore */
  }
}

/** Kortere etiketter til mobil-grid / snarveier (Forslag 5). */
export function parentAppShortLabel(app) {
  if (!app) return '';
  const map = {
    plan: 'Kalender',
    notes: 'Notat',
    meals: 'Måltidsplan',
    recipes: 'Oppskrift',
    stars: 'Oppgaver',
    shop: 'Handleliste',
    mail: 'E-post',
    chat: 'Chat',
    family: 'Familie',
    friends: 'Venner',
    games: 'FamilieSpill',
    more: '+ mer',
    location: 'Posisjon',
    progress: 'Progresjon',
    holdings: 'Kjøretøy',
    scratchMap: 'Våre reiser',
    reiseplanlegger: 'Reiseplanlegger',
    familyTree: 'Familietreet',
    rememberDates: 'Husk dato',
    activities: 'Aktiviteter',
    documents: 'Dokumenter',
    wishes: 'Ønskeliste',
    books: 'Bøker',
    chores: 'Gjøremål',
    skole: 'Skole',
  };
  return map[app.id] || app.label || '';
}

export function parentAppAccent(appId) {
  const map = {
    notes: '#ea580c',
    meals: '#0284c7',
    family: '#6B8F71',
    games: BRAND,
    wishes: '#db2777',
    books: '#7c3aed',
    shop: BRAND,
    stars: BRAND,
    plan: BRAND,
    mail: BRAND,
    chat: BRAND,
    chores: '#f59e0b',
    more: '#5B63A6',
    reiseplanlegger: '#0d9488',
    scratchMap: '#059669',
  };
  return map[appId] || BRAND;
}
