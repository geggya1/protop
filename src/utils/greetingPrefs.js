/**
 * Morgen-/kveldshilsen (DailyGreetingModal) — lagres lokalt på enheten.
 * Standard: på for barn, av for voksne/foresatte/admin (opt-in).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GREETING_PREFS_KEY = 'weekplan.greetingPrefs.v1';

const listeners = new Set();

function notify(settings) {
  listeners.forEach((fn) => {
    try { fn(settings); } catch { /* ignore */ }
  });
}

/** Standard: barn får hilsen, voksne/foresatte/admin må aktivere. */
export function defaultGreetingEnabled(isChild) {
  return !!isChild;
}

/**
 * @param {string|null|undefined} uid
 * @param {{ isChild?: boolean }} [opts]
 * @returns {Promise<{ enabled: boolean, explicit: boolean }>}
 */
export async function loadGreetingPrefs(uid, { isChild = false } = {}) {
  const fallback = { enabled: defaultGreetingEnabled(isChild), explicit: false };
  if (!uid) return fallback;
  try {
    const raw = await AsyncStorage.getItem(`${GREETING_PREFS_KEY}.${uid}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.enabled !== 'boolean') return fallback;
    return { enabled: parsed.enabled, explicit: true };
  } catch {
    return fallback;
  }
}

/**
 * @param {string} uid
 * @param {boolean} enabled
 * @param {{ isChild?: boolean }} [opts]
 */
export async function saveGreetingPrefs(uid, enabled, { isChild = false } = {}) {
  if (!uid) return defaultGreetingEnabled(isChild);
  const next = {
    enabled: !!enabled,
    updatedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(`${GREETING_PREFS_KEY}.${uid}`, JSON.stringify(next));
  } catch { /* ignore */ }
  const publicSettings = { enabled: next.enabled, explicit: true };
  notify(publicSettings);
  return publicSettings;
}

/** Abonner på endringer (enabled). */
export function subscribeGreetingPrefs(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
