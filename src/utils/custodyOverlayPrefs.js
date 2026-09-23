import AsyncStorage from '@react-native-async-storage/async-storage';
import { CUSTODY_OVERLAY_KEY } from './custodySchedule.js';

const DEFAULT_PREFS = {
  showOverlay: false,
  childFilter: 'all',
};

export async function loadCustodyOverlayPrefs(uid) {
  if (!uid) return { ...DEFAULT_PREFS };
  try {
    const raw = await AsyncStorage.getItem(`${CUSTODY_OVERLAY_KEY}.${uid}`);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      showOverlay: !!parsed.showOverlay,
      childFilter: parsed.childFilter || 'all',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function saveCustodyOverlayPrefs(uid, patch) {
  if (!uid) return { ...DEFAULT_PREFS };
  const current = await loadCustodyOverlayPrefs(uid);
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(`${CUSTODY_OVERLAY_KEY}.${uid}`, JSON.stringify(next));
  return next;
}
