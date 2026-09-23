/**
 * Reference-counted Firestore collection listeners.
 * Multiple hooks/screens can subscribe to the same family collection
 * without opening duplicate onSnapshot streams (each billed separately).
 */
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { trackListenerOpen, releaseListener } from './costGuards';

/** @type {Map<string, {
 *   refCount: number,
 *   unsub: (() => void) | null,
 *   snap: import('firebase/firestore').QuerySnapshot | null,
 *   ready: boolean,
 *   error: boolean,
 *   retryCount: number,
 *   retryTimer: ReturnType<typeof setTimeout> | null,
 *   subscribers: Set<{ mapSnap: Function, onChange: Function }>,
 * }>} */
const hubs = new Map();

function hubKey(familyId, collectionName) {
  return `${familyId}::${collectionName}`;
}

function emitToSubscriber(hub, sub) {
  try {
    if (hub.error || !hub.snap) {
      sub.onChange([]);
      return;
    }
    sub.onChange(sub.mapSnap(hub.snap));
  } catch {
    try { sub.onChange([]); } catch { /* ignore */ }
  }
}

function attachHubSnapshot(hub, familyId, collectionName, key) {
  try { hub.unsub?.(); } catch { /* ignore */ }
  hub.unsub = onSnapshot(
    collection(db, 'families', familyId, collectionName),
    (snap) => {
      hub.snap = snap;
      hub.error = false;
      hub.ready = true;
      hub.retryCount = 0;
      hub.subscribers.forEach((sub) => emitToSubscriber(hub, sub));
    },
    () => {
      hub.snap = null;
      hub.error = true;
      hub.ready = true;
      hub.subscribers.forEach((sub) => emitToSubscriber(hub, sub));
      // Retry after membership heal / early Auth permission-denied.
      if (hub.retryCount >= 2 || hub.refCount <= 0 || !hubs.has(key)) return;
      hub.retryCount += 1;
      if (hub.retryTimer) clearTimeout(hub.retryTimer);
      hub.retryTimer = setTimeout(() => {
        hub.retryTimer = null;
        if (!hubs.has(key) || hub.refCount <= 0) return;
        attachHubSnapshot(hub, familyId, collectionName, key);
      }, hub.retryCount * 1000);
    },
  );
}

/**
 * Subscribe to families/{familyId}/{collectionName} with shared onSnapshot.
 * @param {string} familyId
 * @param {string} collectionName
 * @param {(snap: import('firebase/firestore').QuerySnapshot) => any} mapSnap
 * @param {(data: any) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeFamilyCollection(familyId, collectionName, mapSnap, onChange) {
  if (!familyId || !collectionName || typeof onChange !== 'function') {
    onChange?.([]);
    return () => {};
  }

  const mapFn = typeof mapSnap === 'function'
    ? mapSnap
    : (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const key = hubKey(familyId, collectionName);
  let hub = hubs.get(key);
  if (!hub) {
    hub = {
      refCount: 0,
      unsub: null,
      snap: null,
      ready: false,
      error: false,
      retryCount: 0,
      retryTimer: null,
      subscribers: new Set(),
    };
    hubs.set(key, hub);
    trackListenerOpen(`families/${familyId}/${collectionName}`);
    attachHubSnapshot(hub, familyId, collectionName, key);
  }

  const sub = { mapSnap: mapFn, onChange };
  hub.refCount += 1;
  hub.subscribers.add(sub);
  if (hub.ready) emitToSubscriber(hub, sub);

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const current = hubs.get(key);
    if (!current) return;
    current.subscribers.delete(sub);
    current.refCount -= 1;
    if (current.refCount <= 0) {
      if (current.retryTimer) clearTimeout(current.retryTimer);
      current.unsub?.();
      hubs.delete(key);
      releaseListener(`families/${familyId}/${collectionName}`);
    }
  };
}

/** Test / diagnostics helper — active shared hubs. */
export function sharedListenerStats() {
  return {
    hubs: hubs.size,
    keys: [...hubs.keys()],
    refCounts: Object.fromEntries([...hubs.entries()].map(([k, h]) => [k, h.refCount])),
  };
}

/** Force-clear all hubs (logout / tests). */
export function resetSharedCollectionListeners() {
  hubs.forEach((hub) => {
    if (hub.retryTimer) clearTimeout(hub.retryTimer);
    try { hub.unsub?.(); } catch { /* ignore */ }
  });
  hubs.clear();
}
