/**
 * Reference-counted Firestore collection listeners.
 * Multiple hooks/screens can subscribe to the same family collection
 * without opening duplicate onSnapshot streams (each billed separately).
 */
import {
  collection, doc, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { trackListenerOpen, releaseListener } from './costGuards';
import { isFamilyAudience } from './events.js';
import { subscribeAccessMirror } from '../access/accessMirror.js';

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

// Eldre egne hendelser uten audience får feltet, så kollegene ser felles hendelser (én gang per økt).
const markedEvents = new Set();

function markOwnLegacyEvents(familyId, docs) {
  for (const item of docs || []) {
    const data = item.data() || {};
    const key = `${familyId}/${item.id}`;
    if (data.audience || markedEvents.has(key)) continue;
    markedEvents.add(key);
    // Samme tolkning som kalenderen: uten mottakere = hele gruppen.
    updateDoc(doc(db, 'families', familyId, 'events', item.id), {
      audience: isFamilyAudience(data) ? 'family' : 'selected',
    }).catch(() => {});
  }
}

/**
 * Kalenderen i en bedrift: hendelser for «bare utvalgte» leses bare av den som laget dem og de
 * inviterte (firestore.rules, SOS-08), så en lytter på hele samlingen avvises. Da hentes
 * hendelsene i tre spørringer – felles, der en er invitert, og egne – og slås sammen.
 */
function attachVisibleEvents(hub, familyId) {
  const uid = auth?.currentUser?.uid || '';
  if (!uid) return false;
  try { hub.unsub?.(); } catch { /* ignore */ }
  const col = collection(db, 'families', familyId, 'events');
  const parts = [
    query(col, where('audience', '==', 'family')),
    query(col, where('memberIds', 'array-contains', uid)),
    query(col, where('createdBy', '==', uid)),
  ];
  const seen = parts.map(() => null);
  const emit = () => {
    if (seen.some((list) => list == null)) return;
    const byId = new Map();
    seen.forEach((list) => list.forEach((item) => byId.set(item.id, item)));
    hub.snap = { docs: [...byId.values()], size: byId.size, empty: byId.size === 0 };
    hub.error = false;
    hub.ready = true;
    hub.subscribers.forEach((sub) => emitToSubscriber(hub, sub));
  };
  const unsubs = parts.map((q, i) => onSnapshot(q, (snap) => {
    seen[i] = snap.docs;
    if (i === 2) markOwnLegacyEvents(familyId, snap.docs);
    emit();
  }, () => {
    seen[i] = [];
    emit();
  }));
  hub.visibleOnly = true;
  hub.unsub = () => unsubs.forEach((fn) => fn());
  return true;
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
    (error) => {
      // Bedriftskalender med private hendelser: bytt til spørringene reglene godtar.
      // Først etter ett nytt forsøk, så en kort Auth-forsinkelse ved oppstart ikke teller.
      if (collectionName === 'events' && hub.retryCount >= 1 && error?.code === 'permission-denied'
        && hub.refCount > 0 && hubs.has(key) && attachVisibleEvents(hub, familyId)) {
        return;
      }
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
 * Tilgangsspeilet (accessAcl) er skrevet for selskapet: lyttere som ble avvist (f.eks. fravær
 * for hele bedriften rett etter innlogging, før speilet fantes) kobler til på nytt.
 */
export function reattachDeniedHubs(familyId) {
  const prefix = `${familyId}::`;
  hubs.forEach((hub, key) => {
    if (!key.startsWith(prefix) || !hub.error || hub.refCount <= 0) return;
    if (hub.retryTimer) clearTimeout(hub.retryTimer);
    hub.retryTimer = null;
    hub.retryCount = 0;
    attachHubSnapshot(hub, familyId, key.slice(prefix.length), key);
  });
}

subscribeAccessMirror((familyId) => reattachDeniedHubs(familyId));

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
