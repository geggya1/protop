import { addDays, dateKey, parseDateKey, startOfWeekMonday } from './dates.js';

const MEMORY = new Map();
const STORAGE_PREFIX = 'weekplan.extCalCache.v2';
const LEGACY_PREFIX = 'weekplan.extCalCache.v1';

/** Fresh enough to skip network entirely. */
export const CAL_FRESH_MS = 30 * 60 * 1000;
/** Remember on disk / merge coverage this long. */
export const CAL_STORAGE_MS = 24 * 60 * 60 * 1000;
/** Pad small views to this many days from week-start so home + uke deler ett kall. */
export const CAL_PAD_DAYS = 28;

const noopStorage = {
  setItem: async () => {},
  getItem: async () => null,
  removeItem: async () => {},
};

let storagePromise = null;
function persistStore() {
  if (!storagePromise) {
    storagePromise = import('@react-native-async-storage/async-storage')
      .then((mod) => mod.default || noopStorage)
      .catch(() => noopStorage);
  }
  return storagePromise;
}

function uidKey(uid) {
  return uid || 'anon';
}

function storageKey(uid) {
  return `${STORAGE_PREFIX}.${uidKey(uid)}`;
}

function eventKey(e) {
  return e?.id || `${e?.connectionId || ''}|${e?.dateKey || ''}|${e?.startTime || ''}|${e?.title || ''}`;
}

export function eventOverlapsRange(e, start, end) {
  const a = String(e?.dateKey || '');
  if (!a) return false;
  const b = e?.endDateKey && String(e.endDateKey) >= a ? String(e.endDateKey) : a;
  return a <= end && b >= start;
}

export function sliceExternalEvents(events, start, end) {
  return (events || []).filter((e) => eventOverlapsRange(e, start, end));
}

function sortEvents(events) {
  return [...(events || [])].sort((a, b) => {
    const d = String(a.dateKey || '').localeCompare(String(b.dateKey || ''));
    if (d !== 0) return d;
    return String(a.startTime || '').localeCompare(String(b.startTime || ''));
  });
}

function coverageContains(store, start, end) {
  if (!store?.start || !store?.end) return false;
  return store.start <= start && store.end >= end;
}

function coverageOverlaps(store, start, end) {
  if (!store?.start || !store?.end) return false;
  return store.start <= end && store.end >= start;
}

/**
 * Expand a short UI range to a shared fetch window (ISO week start → ~4 weeks).
 * Month views already cover enough and are left as-is.
 */
export function padCalendarFetchRange(startDateKey, endDateKey) {
  const startKey = String(startDateKey || '');
  const endKey = String(endDateKey || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey) || !/^\d{4}-\d{2}-\d{2}$/.test(endKey)) {
    return { start: startKey, end: endKey };
  }
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { start: startKey, end: endKey };
  }
  const spanDays = Math.round((end - start) / 86400000) + 1;
  if (spanDays >= CAL_PAD_DAYS) return { start: startKey, end: endKey };
  const weekStart = startOfWeekMonday(start);
  const paddedEnd = addDays(weekStart, CAL_PAD_DAYS - 1);
  const outStart = dateKey(weekStart);
  const outEnd = dateKey(paddedEnd);
  return {
    start: outStart < startKey ? outStart : startKey,
    end: outEnd > endKey ? outEnd : endKey,
  };
}

function toView(store, start, end, maxAgeMs) {
  if (!store) return null;
  const contains = coverageContains(store, start, end);
  const overlaps = coverageOverlaps(store, start, end);
  if (!contains && !overlaps) return null;
  const age = Date.now() - Number(store.at || 0);
  return {
    at: store.at,
    events: sliceExternalEvents(store.events, start, end),
    layers: store.layers || [],
    errors: store.errors || [],
    source: store.source || null,
    coverageStart: store.start,
    coverageEnd: store.end,
    stale: age > maxAgeMs,
    partial: !contains,
  };
}

export function peekExternalCalendarCache(uid, start, end, { maxAgeMs = CAL_FRESH_MS } = {}) {
  return toView(MEMORY.get(uidKey(uid)), start, end, maxAgeMs);
}

export function putExternalCalendarCache(uid, start, end, payload) {
  const key = uidKey(uid);
  const prev = MEMORY.get(key);
  const now = Date.now();
  const prevFresh = prev && (now - Number(prev.at || 0)) <= CAL_STORAGE_MS;
  const byId = new Map();
  if (prevFresh) {
    for (const e of prev.events || []) {
      if (!eventOverlapsRange(e, start, end)) byId.set(eventKey(e), e);
    }
  }
  for (const e of payload?.events || []) {
    byId.set(eventKey(e), e);
  }
  const entry = {
    at: now,
    start: prevFresh && prev.start && prev.start < start ? prev.start : start,
    end: prevFresh && prev.end && prev.end > end ? prev.end : end,
    events: sortEvents([...byId.values()]),
    layers: (payload?.layers || []).length ? payload.layers : (prev?.layers || []),
    connections: payload?.connections || prev?.connections || null,
    errors: payload?.errors || [],
    source: payload?.source || null,
  };
  MEMORY.set(key, entry);
  persistStore()
    .then((store) => store.setItem(storageKey(uid), JSON.stringify(entry)))
    .catch(() => {});
  return entry;
}

export async function loadExternalCalendarCache(uid, start, end) {
  const mem = peekExternalCalendarCache(uid, start, end, { maxAgeMs: CAL_STORAGE_MS });
  if (mem && !mem.partial) return mem;
  try {
    const store = await persistStore();
    const raw = await store.getItem(storageKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events) && parsed.start && parsed.end) {
        const age = Date.now() - Number(parsed.at || 0);
        if (age <= CAL_STORAGE_MS) {
          MEMORY.set(uidKey(uid), parsed);
          return toView(parsed, start, end, CAL_FRESH_MS);
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const legacyKey = `${LEGACY_PREFIX}.${uidKey(uid)}|${start}|${end}`;
    const store = await persistStore();
    const raw = await store.getItem(legacyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) {
        const age = Date.now() - Number(parsed.at || 0);
        if (age <= CAL_STORAGE_MS) {
          putExternalCalendarCache(uid, start, end, parsed);
          return peekExternalCalendarCache(uid, start, end, { maxAgeMs: CAL_FRESH_MS });
        }
      }
    }
  } catch { /* ignore */ }

  return mem || null;
}

export function clearExternalCalendarCache(uid) {
  const key = uidKey(uid);
  MEMORY.delete(key);
  persistStore()
    .then((store) => store.removeItem(storageKey(uid)))
    .catch(() => {});
}

/** Test helper */
export function resetExternalCalendarCacheMemory() {
  MEMORY.clear();
}
