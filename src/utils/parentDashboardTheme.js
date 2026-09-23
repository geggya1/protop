import {
  DEFAULT_PARENT_DASHBOARD_THEME_ID,
  DEFAULT_PARENT_ART_PACK_ID,
  DEFAULT_PARENT_BACKGROUND_ID,
  MAX_PARENT_BOTTOM_SHORTCUTS,
  isValidParentDashboardThemeId,
  isValidParentDashboardArtPackId,
  isValidParentDashboardBackgroundId,
  resolveParentDashboardLayoutId,
  defaultArtPackIdForTheme,
  composeParentDashboardTheme,
} from '../parentDashboardThemes';
import { isProtopShellModule, PROTOP_BOTTOM_SHORTCUT_IDS } from '../navigation/protopShell';

export const PARENT_DASHBOARD_THEME_KEY = 'weekplan.parentDashboardTheme.v1';
export const PARENT_DASHBOARD_ART_KEY = 'weekplan.parentDashboardArt.v1';
export const PARENT_DASHBOARD_BACKGROUND_KEY = 'weekplan.parentDashboardBackground.v1';
export const PARENT_BOTTOM_SHORTCUTS_KEY = 'weekplan.parentBottomShortcuts.v1';

const themeListeners = new Set();

/** Notify home + shell so the themed bottom bar updates everywhere. */
export function subscribeParentDashboardTheme(listener) {
  if (typeof listener !== 'function') return () => {};
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function notifyParentDashboardTheme() {
  themeListeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

async function storage() {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default;
}

export async function loadParentDashboardThemeId(uid) {
  if (!uid) return DEFAULT_PARENT_DASHBOARD_THEME_ID;
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(`${PARENT_DASHBOARD_THEME_KEY}.${uid}`);
    if (raw && isValidParentDashboardThemeId(raw)) return raw;
  } catch { /* ignore */ }
  return DEFAULT_PARENT_DASHBOARD_THEME_ID;
}

export async function saveParentDashboardThemeId(uid, themeId, { silent = false } = {}) {
  if (!uid || !isValidParentDashboardThemeId(themeId)) return;
  try {
    const AsyncStorage = await storage();
    await AsyncStorage.setItem(`${PARENT_DASHBOARD_THEME_KEY}.${uid}`, themeId);
  } catch { /* ignore */ }
  if (!silent) notifyParentDashboardTheme();
}

export async function loadParentDashboardArtPackId(uid, { fallbackThemeId } = {}) {
  if (!uid) return defaultArtPackIdForTheme(fallbackThemeId || DEFAULT_PARENT_DASHBOARD_THEME_ID);
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(`${PARENT_DASHBOARD_ART_KEY}.${uid}`);
    if (raw && isValidParentDashboardArtPackId(raw)) return raw;
  } catch { /* ignore */ }
  return defaultArtPackIdForTheme(fallbackThemeId || DEFAULT_PARENT_DASHBOARD_THEME_ID);
}

export async function saveParentDashboardArtPackId(uid, artPackId, { silent = false } = {}) {
  if (!uid || !isValidParentDashboardArtPackId(artPackId)) return;
  try {
    const AsyncStorage = await storage();
    await AsyncStorage.setItem(`${PARENT_DASHBOARD_ART_KEY}.${uid}`, artPackId);
  } catch { /* ignore */ }
  if (!silent) notifyParentDashboardTheme();
}

export async function loadParentDashboardBackgroundId(uid) {
  if (!uid) return DEFAULT_PARENT_BACKGROUND_ID;
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(`${PARENT_DASHBOARD_BACKGROUND_KEY}.${uid}`);
    if (raw && isValidParentDashboardBackgroundId(raw)) return raw;
  } catch { /* ignore */ }
  return DEFAULT_PARENT_BACKGROUND_ID;
}

export async function saveParentDashboardBackgroundId(uid, backgroundId, { silent = false } = {}) {
  if (!uid || !isValidParentDashboardBackgroundId(backgroundId)) return;
  try {
    const AsyncStorage = await storage();
    await AsyncStorage.setItem(`${PARENT_DASHBOARD_BACKGROUND_KEY}.${uid}`, backgroundId);
  } catch { /* ignore */ }
  if (!silent) notifyParentDashboardTheme();
}

export async function loadParentDashboardSetup(uid) {
  const themeId = await loadParentDashboardThemeId(uid);
  const layoutId = resolveParentDashboardLayoutId(themeId);
  const [artPackId, backgroundId, bottomIds] = await Promise.all([
    loadParentDashboardArtPackId(uid, { fallbackThemeId: themeId }),
    loadParentDashboardBackgroundId(uid),
    loadParentBottomShortcutIds(uid),
  ]);
  return {
    themeId,
    layoutId,
    artPackId: artPackId || DEFAULT_PARENT_ART_PACK_ID,
    backgroundId: backgroundId || DEFAULT_PARENT_BACKGROUND_ID,
    bottomIds,
    theme: composeParentDashboardTheme(layoutId, artPackId, backgroundId),
  };
}

export async function saveParentDashboardSetup(uid, {
  layoutId,
  artPackId,
  backgroundId,
  bottomIds,
} = {}) {
  if (!uid) return;
  const resolvedLayout = resolveParentDashboardLayoutId(layoutId);
  await saveParentDashboardThemeId(uid, resolvedLayout, { silent: true });
  if (artPackId) await saveParentDashboardArtPackId(uid, artPackId, { silent: true });
  if (backgroundId) await saveParentDashboardBackgroundId(uid, backgroundId, { silent: true });
  if (Array.isArray(bottomIds)) await saveParentBottomShortcutIds(uid, bottomIds, { silent: true });
  notifyParentDashboardTheme();
}

export function normalizeBottomShortcutIds(ids, { max = MAX_PARENT_BOTTOM_SHORTCUTS } = {}) {
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export async function loadParentBottomShortcutIds(uid) {
  if (!uid) return null;
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(`${PARENT_BOTTOM_SHORTCUTS_KEY}.${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeBottomShortcutIds(parsed) : null;
  } catch {
    return null;
  }
}

export async function saveParentBottomShortcutIds(uid, ids, { silent = false } = {}) {
  if (!uid) return;
  try {
    const AsyncStorage = await storage();
    const cleaned = normalizeBottomShortcutIds(ids);
    await AsyncStorage.setItem(
      `${PARENT_BOTTOM_SHORTCUTS_KEY}.${uid}`,
      JSON.stringify(cleaned),
    );
  } catch { /* ignore */ }
  if (!silent) notifyParentDashboardTheme();
}

/** Resolves which bottom shortcuts to show. Dock is always available — not tied to a layout theme. */
export function resolveBottomShortcutIds(themeId, storedIds) {
  const source = Array.isArray(storedIds) && storedIds.length
    ? storedIds
    : PROTOP_BOTTOM_SHORTCUT_IDS;
  const allowed = normalizeBottomShortcutIds(source).filter((id) => isProtopShellModule(id));
  if (allowed.length) return allowed;
  return normalizeBottomShortcutIds(PROTOP_BOTTOM_SHORTCUT_IDS);
}
