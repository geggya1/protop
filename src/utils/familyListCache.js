/**
 * Stale-while-revalidate cache for the user's family/group list.
 * Speeds up login + reduces repeat cold-start Firestore queries when
 * switching accounts or remounting AppProvider.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY = new Map();
const PREFIX = 'weekplan.familiesCache.v1';
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

function keyFor(uid) {
  return `${PREFIX}.${uid || 'anon'}`;
}

export function peekFamilyListCache(uid, { maxAgeMs = DEFAULT_TTL_MS } = {}) {
  const key = keyFor(uid);
  const hit = MEMORY.get(key);
  if (!hit) return null;
  const age = Date.now() - Number(hit.at || 0);
  if (age > maxAgeMs) return { ...hit, stale: true };
  return { ...hit, stale: false };
}

export function putFamilyListCache(uid, families) {
  const entry = {
    at: Date.now(),
    families: Array.isArray(families) ? families : [],
  };
  MEMORY.set(keyFor(uid), entry);
  AsyncStorage.setItem(keyFor(uid), JSON.stringify(entry)).catch(() => {});
  return entry;
}

export async function loadFamilyListCache(uid) {
  const mem = peekFamilyListCache(uid, { maxAgeMs: STORAGE_TTL_MS });
  if (mem && !mem.stale) return mem;
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    if (!raw) return mem || null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.families)) return mem || null;
    const age = Date.now() - Number(parsed.at || 0);
    if (age > STORAGE_TTL_MS) return mem || null;
    MEMORY.set(keyFor(uid), parsed);
    return { ...parsed, stale: age > DEFAULT_TTL_MS };
  } catch {
    return mem || null;
  }
}

export function clearFamilyListCache(uid) {
  MEMORY.delete(keyFor(uid));
  AsyncStorage.removeItem(keyFor(uid)).catch(() => {});
}
