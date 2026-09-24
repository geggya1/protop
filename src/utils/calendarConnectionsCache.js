import AsyncStorage from '@react-native-async-storage/async-storage';

const MEMORY = new Map();
const STORAGE_PREFIX = 'weekplan.calConnections.v1';
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const STORAGE_TTL_MS = 12 * 60 * 60 * 1000;

function memKey(uid) {
  return uid || 'anon';
}

function storageKey(uid) {
  return `${STORAGE_PREFIX}.${memKey(uid)}`;
}

export function peekCalendarConnectionsCache(uid, { maxAgeMs = DEFAULT_TTL_MS } = {}) {
  const hit = MEMORY.get(memKey(uid));
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return { ...hit, stale: true };
  return { ...hit, stale: false };
}

export function putCalendarConnectionsCache(uid, connections) {
  const entry = { at: Date.now(), connections: connections || [] };
  MEMORY.set(memKey(uid), entry);
  AsyncStorage.setItem(storageKey(uid), JSON.stringify(entry)).catch(() => {});
  return entry;
}

export async function loadCalendarConnectionsCache(uid) {
  const mem = peekCalendarConnectionsCache(uid, { maxAgeMs: STORAGE_TTL_MS });
  if (mem && !mem.stale) return mem;
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (!raw) return mem || null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.connections)) return mem || null;
    const age = Date.now() - Number(parsed.at || 0);
    if (age > STORAGE_TTL_MS) return mem || null;
    MEMORY.set(memKey(uid), parsed);
    return { ...parsed, stale: age > DEFAULT_TTL_MS };
  } catch {
    return mem || null;
  }
}

export function clearCalendarConnectionsCache(uid) {
  MEMORY.delete(memKey(uid));
  AsyncStorage.removeItem(storageKey(uid)).catch(() => {});
}
