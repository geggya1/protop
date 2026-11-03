import {
  DEFAULT_HOME_BANNER_ID,
  DEFAULT_CHILD_HOME_BANNER_ID,
  CUSTOM_BANNER_ID,
  isValidHomeBannerId,
} from '../homeBanners';
import { resolveParentBannerId } from '../homeSurface';
import {
  DEFAULT_HOME_LOOK,
  resolveHomeLook,
  widgetsForLook,
  normalizeWidgets,
  sameWidgetPlacement,
  LEGACY_PARENT_WIDGETS_V4,
  LEGACY_COMPANY_WIDGETS_V5,
  LEGACY_PARENT_WIDGETS_V6,
  LEGACY_COMPANY_WIDGETS_V6,
} from '../homeWidgetCatalog';
import {
  childChoresLayoutIsStale,
  upgradeChildChoresLayout,
} from './childHomeLayout';
import {
  MAX_PARENT_BOTTOM_SHORTCUTS,
  DEFAULT_BOTTOM_SHORTCUT_IDS,
} from '../parentDashboardThemes';
import {
  loadParentBottomShortcutIds,
  saveParentBottomShortcutIds,
  normalizeBottomShortcutIds,
  subscribeParentDashboardTheme,
} from './parentDashboardTheme';
import { setItemWithRoom } from './storageRoom';

export const HOME_LAYOUT_KEY = 'protop.homeLayout.v1';
/**
 * 5: ProTop-widgetene (Dagen din, hurtigvalg, uken). Et Hjem som fortsatt har
 * standarden fra versjon 4 får den nye; et Hjem personen har endret står.
 * 6: Kjørebok på bedriftens Hjem (urørt standard fra versjon 5 får den).
 */
export const HOME_TEMPLATE_VERSION = 7;
/** Versjonen der parent-Hjem sist ble nullstilt for alle. */
const PARENT_RESET_VERSION = 4;
/** Child-only bump — does not re-reset parent homes still on version 4. */
export const CHILD_HOME_TEMPLATE_VERSION = 8;
export const LEGACY_DEFAULT_BANNER_ID = 'gutt-ungdom-kveld';

export const DEFAULT_CHILD_BOTTOM_SHORTCUT_IDS = ['home', 'plan', 'stars', 'more'];

const layoutListeners = new Set();

export function subscribeHomeLayout(listener) {
  if (typeof listener !== 'function') return () => {};
  layoutListeners.add(listener);
  return () => layoutListeners.delete(listener);
}

function notifyHomeLayout() {
  layoutListeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

async function storage() {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default;
}

function storageKey(uid, role) {
  return `${HOME_LAYOUT_KEY}.${role || 'parent'}.${uid || 'anon'}`;
}

/**
 * Siste lagrede oppsett per nøkkel i denne økten. Når nettleserens lagring er full,
 * feiler skrivingen; uten dette leste Hjem tilbake det gamle oppsettet, og et valgt
 * bakgrunnsbilde hoppet tilbake (Tilpass hjem «hang»).
 */
const sessionLayouts = new Map();

function normalizeAliases(uid, aliases) {
  const primary = uid ? String(uid) : '';
  const list = Array.isArray(aliases) ? aliases : [];
  return [...new Set(
    list
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((v) => v && v !== primary),
  )];
}

export function defaultBottomIds(role = 'parent') {
  return role === 'child'
    ? [...DEFAULT_CHILD_BOTTOM_SHORTCUT_IDS]
    : [...DEFAULT_BOTTOM_SHORTCUT_IDS];
}

export function emptyHomeLayout(role = 'parent') {
  return {
    bannerId: role === 'child' ? DEFAULT_CHILD_HOME_BANNER_ID : DEFAULT_HOME_BANNER_ID,
    customBannerUri: null,
    look: DEFAULT_HOME_LOOK,
    widgets: widgetsForLook(DEFAULT_HOME_LOOK, role),
    bottomIds: defaultBottomIds(role),
    bottomNavEnabled: true,
    templateVersion: role === 'child' ? CHILD_HOME_TEMPLATE_VERSION : HOME_TEMPLATE_VERSION,
  };
}

export function homeLayoutsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.bannerId === b.bannerId
    && !!a.bannerChosen === !!b.bannerChosen
    && (a.customBannerUri || null) === (b.customBannerUri || null)
    && a.look === b.look
    && a.bottomNavEnabled === b.bottomNavEnabled
    && a.templateVersion === b.templateVersion
    && JSON.stringify(a.bottomIds || []) === JSON.stringify(b.bottomIds || [])
    && JSON.stringify(a.widgets || []) === JSON.stringify(b.widgets || []);
}

export function parseHomeLayout(parsed, role = 'parent') {
  return parseLayout(parsed, role);
}

function parseLayout(parsed, role = 'parent') {
  const fallback = emptyHomeLayout(role);
  let bannerId = isValidHomeBannerId(parsed?.bannerId) ? parsed.bannerId : fallback.bannerId;
  // «Uten bilde» ble en periode lagret som standard uten at personen valgte det. Uten
  // eget valg får Hjem bildet og glasset; det som er valgt under Tilpass hjem, står.
  const bannerChosen = parsed?.bannerChosen === true;
  if (role === 'parent') bannerId = resolveParentBannerId(bannerId, { bannerChosen });
  const bottomIds = Array.isArray(parsed?.bottomIds)
    ? normalizeBottomShortcutIds(parsed.bottomIds, { max: MAX_PARENT_BOTTOM_SHORTCUTS })
    : fallback.bottomIds;
  let look = resolveHomeLook(parsed?.look);
  let widgets = Array.isArray(parsed?.widgets) && parsed.widgets.length
    ? normalizeWidgets(parsed.widgets, role)
    : widgetsForLook(look, role);
  let templateVersion = Number(parsed?.templateVersion) || 1;
  if (role === 'parent' && templateVersion < PARENT_RESET_VERSION) {
    look = DEFAULT_HOME_LOOK;
    widgets = widgetsForLook(look, role);
    if (bannerId === LEGACY_DEFAULT_BANNER_ID) bannerId = DEFAULT_HOME_BANNER_ID;
    templateVersion = HOME_TEMPLATE_VERSION;
  } else if (role === 'parent' && templateVersion < HOME_TEMPLATE_VERSION) {
    // Urørt standard fra versjon 4 eller 6 får de nye widgetene. Egne valg (dra, legg til, fjern) står.
    if (
      sameWidgetPlacement(widgets, normalizeWidgets(LEGACY_PARENT_WIDGETS_V4, role))
      || sameWidgetPlacement(widgets, normalizeWidgets(LEGACY_PARENT_WIDGETS_V6, role))
    ) {
      widgets = widgetsForLook(look, role);
    }
    templateVersion = HOME_TEMPLATE_VERSION;
  } else if (role === 'company' && templateVersion < HOME_TEMPLATE_VERSION) {
    // Urørt bedriftsstandard fra versjon 5 eller 6 får den nye standarden.
    if (
      sameWidgetPlacement(widgets, normalizeWidgets(LEGACY_COMPANY_WIDGETS_V5, role))
      || sameWidgetPlacement(widgets, normalizeWidgets(LEGACY_COMPANY_WIDGETS_V6, role))
    ) {
      widgets = widgetsForLook(look, role);
    }
    templateVersion = HOME_TEMPLATE_VERSION;
  }
  if (role === 'child' && templateVersion < CHILD_HOME_TEMPLATE_VERSION) {
    look = DEFAULT_HOME_LOOK;
    widgets = widgetsForLook(look, role);
    templateVersion = CHILD_HOME_TEMPLATE_VERSION;
  } else if (role === 'child' && childChoresLayoutIsStale(widgets)) {
    // Already on latest templateVersion but still carrying a half-width chores
    // card (customised board / partial migrate) — expand chores now.
    widgets = upgradeChildChoresLayout(widgets, look);
    templateVersion = CHILD_HOME_TEMPLATE_VERSION;
  }
  const bottomNavEnabled = parsed?.bottomNavEnabled !== false;
  return {
    bannerId,
    bannerChosen,
    customBannerUri: bannerId === CUSTOM_BANNER_ID ? (parsed?.customBannerUri || null) : null,
    look,
    widgets,
    bottomIds: bottomIds.length ? bottomIds : (bottomNavEnabled ? fallback.bottomIds : []),
    bottomNavEnabled,
    templateVersion,
  };
}

/**
 * Load a saved home layout.
 * For child profiles, `aliases` are alternate ids (uid / docId / childId) that
 * older builds may have used as the AsyncStorage key suffix.
 */
export async function loadHomeLayout(uid, { role = 'parent', aliases = [] } = {}) {
  const fallback = emptyHomeLayout(role);
  if (!uid) return fallback;
  try {
    const primaryKey = storageKey(uid, role);
    const remembered = sessionLayouts.get(primaryKey);
    if (remembered) return parseLayout(remembered, role);
    const AsyncStorage = await storage();
    let raw = await AsyncStorage.getItem(primaryKey);
    let aliasKeyUsed = null;
    if (!raw && role === 'child') {
      for (const alias of normalizeAliases(uid, aliases)) {
        const key = storageKey(alias, role);
        // eslint-disable-next-line no-await-in-loop
        const aliasRaw = await AsyncStorage.getItem(key);
        if (aliasRaw) {
          raw = aliasRaw;
          aliasKeyUsed = key;
          break;
        }
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      const next = parseLayout(parsed, role);
      const savedVersion = Number(parsed?.templateVersion) || 1;
      const versionStale = role === 'child'
        ? savedVersion < CHILD_HOME_TEMPLATE_VERSION
        : savedVersion < HOME_TEMPLATE_VERSION;
      const choresStale = role === 'child'
        && childChoresLayoutIsStale(parsed?.widgets)
        && !childChoresLayoutIsStale(next.widgets);
      if (versionStale || choresStale || aliasKeyUsed) {
        try {
          await AsyncStorage.setItem(primaryKey, JSON.stringify(next));
          if (aliasKeyUsed && aliasKeyUsed !== primaryKey) {
            await AsyncStorage.removeItem(aliasKeyUsed);
          }
        } catch { /* ignore */ }
      }
      return next;
    }
    if (role === 'parent') {
      const bottom = await loadParentBottomShortcutIds(uid);
      if (Array.isArray(bottom) && bottom.length) fallback.bottomIds = bottom;
    }
  } catch { /* ignore */ }
  return fallback;
}

export async function saveHomeLayout(uid, layout, { role = 'parent' } = {}) {
  if (!uid) return emptyHomeLayout(role);
  const next = parseLayout(layout, role);
  const key = storageKey(uid, role);
  sessionLayouts.set(key, next);
  try {
    const AsyncStorage = await storage();
    await setItemWithRoom(AsyncStorage, key, JSON.stringify(next));
    // Bedriftens Hjem lagrer bare widgetene; dock og bilde hører til det private oppsettet.
    if (role === 'parent') {
      // Layout listeners already cover dock ids; skip a second theme notify that
      // would reload AppShell (and the photo) on every widget save.
      await saveParentBottomShortcutIds(uid, next.bottomIds, { silent: true });
    }
  } catch { /* ignore */ }
  notifyHomeLayout();
  return next;
}

export { subscribeParentDashboardTheme, MAX_PARENT_BOTTOM_SHORTCUTS };
export {
  childChoresLayoutIsStale,
  upgradeChildChoresLayout,
  childHomeStorageAliases,
  childHomeStorageId,
} from './childHomeLayout';
