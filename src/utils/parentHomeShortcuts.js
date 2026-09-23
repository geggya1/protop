/** Standard snarveier — Oppgaver, Handleliste, FamilieSpill, E-post. */
export const DEFAULT_PARENT_SHORTCUT_IDS = ['stars', 'shop', 'games', 'mail'];

/** Mini icons inside the + mer folder glyph (Kalender / Handleliste / Familie / Spill). */
export const MORE_FOLDER_GLYPHS = [
  { icon: 'calendar', color: '#2563eb' },
  { icon: 'cart', color: '#2563eb' },
  { icon: 'people', color: '#6B8F71' },
  { icon: 'game-controller', color: '#2563eb' },
];

/** Default 4-across home tiles: Oppgave, Handleliste, Familiespill, + mer. */
export const DEFAULT_HOME_SHORTCUT_TILES = [
  { id: 'stars', icon: 'checkmark-circle', tileLabel: 'Oppgave', label: 'Oppgave', action: { type: 'tab', tab: 'stars' } },
  { id: 'shop', icon: 'cart', tileLabel: 'Handleliste', label: 'Handleliste', action: { type: 'tab', tab: 'more', subView: 'shop' } },
  { id: 'games', icon: 'game-controller', tileLabel: 'Familiespill', label: 'Familiespill', action: { type: 'tab', tab: 'more', subView: 'games' } },
  {
    id: 'more',
    icon: 'add',
    tileLabel: '+ mer',
    label: '+ mer',
    folder: true,
    action: { type: 'tab', tab: 'more' },
  },
];

/** Child 4-across: Oppgave, Gjøremål, Familiespill, + mer (no adult modules). */
export const DEFAULT_CHILD_HOME_SHORTCUT_TILES = [
  { id: 'stars', icon: 'checkmark-circle', tileLabel: 'Oppgave', label: 'Oppgave', action: { type: 'tab', tab: 'stars' } },
  { id: 'chores', icon: 'star', tileLabel: 'Gjøremål', label: 'Gjøremål', action: { type: 'tab', tab: 'chores' } },
  { id: 'games', icon: 'game-controller', tileLabel: 'Familiespill', label: 'Familiespill', action: { type: 'tab', tab: 'more', subView: 'games' } },
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
    games: '#2563eb',
    wishes: '#db2777',
    books: '#7c3aed',
    shop: '#2563eb',
    stars: '#2563eb',
    plan: '#2563eb',
    mail: '#2563eb',
    chat: '#2563eb',
    chores: '#f59e0b',
    more: '#5B63A6',
    reiseplanlegger: '#0d9488',
    scratchMap: '#059669',
  };
  return map[appId] || '#2563eb';
}
