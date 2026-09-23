import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  DEFAULT_CHILD_DASHBOARD_THEME_ID,
  isValidChildDashboardThemeId,
  defaultChildDashboardThemeIdForAge,
} from '../childDashboardThemes';

export const CHILD_DASHBOARD_THEME_KEY = 'weekplan.childDashboardTheme.v1';

async function storage() {
  const mod = await import('@react-native-async-storage/async-storage');
  return mod.default;
}

function storageKey(childId) {
  return `${CHILD_DASHBOARD_THEME_KEY}.${childId}`;
}

async function cacheLocal(childId, themeId) {
  try {
    const AsyncStorage = await storage();
    await AsyncStorage.setItem(storageKey(childId), themeId);
  } catch { /* ignore */ }
}

/**
 * Load theme id: prefer live Firestore value on the child profile, then local cache.
 */
export async function loadChildDashboardThemeId(
  childId,
  { age = null, remoteId = null } = {},
) {
  const fallback = defaultChildDashboardThemeIdForAge(age) || DEFAULT_CHILD_DASHBOARD_THEME_ID;
  if (remoteId && isValidChildDashboardThemeId(remoteId)) {
    if (childId) cacheLocal(childId, remoteId);
    return remoteId;
  }
  if (!childId) return fallback;
  try {
    const AsyncStorage = await storage();
    const raw = await AsyncStorage.getItem(storageKey(childId));
    if (raw && isValidChildDashboardThemeId(raw)) return raw;
  } catch { /* ignore */ }
  return fallback;
}

/**
 * Persist theme locally and (when familyId is known) on the child Firestore docs
 * so phone / tablet / web stay in sync.
 */
export async function saveChildDashboardThemeId(childId, themeId, { familyId = null } = {}) {
  if (!childId || !isValidChildDashboardThemeId(themeId)) return;
  await cacheLocal(childId, themeId);

  if (!familyId) return;
  const payload = {
    dashboardThemeId: themeId,
    updatedAt: new Date().toISOString(),
  };
  try {
    await Promise.all([
      setDoc(doc(db, 'families', familyId, 'children', childId), payload, { merge: true }),
      setDoc(doc(db, 'children', childId), payload, { merge: true }).catch(() => {}),
    ]);
  } catch { /* offline / rules — local cache still holds */ }
}
