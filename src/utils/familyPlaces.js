/**
 * Familie-steder (hjem, skole, …) med geofence enter/exit.
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { distanceMeters } from './familyLocationLogic.js';
import { notifyUsers } from './notifications.js';

export const PLACE_TYPES = [
  { id: 'home', label: 'Hjem', emoji: '🏠', defaultRadius: 120 },
  { id: 'school', label: 'Skole', emoji: '🏫', defaultRadius: 150 },
  { id: 'work', label: 'Jobb', emoji: '💼', defaultRadius: 120 },
  { id: 'activity', label: 'Aktivitet', emoji: '⚽', defaultRadius: 150 },
  { id: 'custom', label: 'Annet', emoji: '📍', defaultRadius: 120 },
];

export function placesCol(familyId) {
  return collection(db, 'families', familyId, 'places');
}

export function placeDoc(familyId, placeId) {
  return doc(db, 'families', familyId, 'places', placeId);
}

export function placePresenceDoc(familyId, uid) {
  return doc(db, 'families', familyId, 'placePresence', uid);
}

export function mapPlace(snap) {
  const d = snap.data() || {};
  return {
    id: snap.id,
    name: String(d.name || '').trim() || 'Sted',
    type: d.type || 'custom',
    lat: Number(d.lat),
    lng: Number(d.lng),
    radiusM: Math.max(40, Math.round(Number(d.radiusM) || 120)),
    notifyOn: d.notifyOn === 'enter' || d.notifyOn === 'exit' || d.notifyOn === 'both'
      ? d.notifyOn
      : 'both',
    memberIds: Array.isArray(d.memberIds) ? d.memberIds.filter(Boolean) : [],
    enabled: d.enabled !== false,
    createdBy: d.createdBy || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
  };
}

export function listenPlaces(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(placesCol(familyId), (snap) => {
    cb(snap.docs.map(mapPlace).filter((p) => p.enabled && Number.isFinite(p.lat) && Number.isFinite(p.lng)));
  }, () => cb([]));
}

export async function savePlace(familyId, placeId, payload, uid) {
  if (!familyId) throw new Error('Mangler familyId');
  const body = {
    name: String(payload.name || '').trim() || 'Sted',
    type: payload.type || 'custom',
    lat: Number(payload.lat),
    lng: Number(payload.lng),
    radiusM: Math.max(40, Math.round(Number(payload.radiusM) || 120)),
    notifyOn: payload.notifyOn || 'both',
    memberIds: Array.isArray(payload.memberIds) ? payload.memberIds.filter(Boolean) : [],
    enabled: payload.enabled !== false,
    updatedAt: serverTimestamp(),
  };
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
    throw new Error('Ugyldig posisjon');
  }
  if (placeId) {
    await updateDoc(placeDoc(familyId, placeId), body);
    return placeId;
  }
  const ref = await addDoc(placesCol(familyId), {
    ...body,
    createdBy: uid || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePlace(familyId, placeId) {
  if (!familyId || !placeId) return;
  await deleteDoc(placeDoc(familyId, placeId));
}

function shouldNotify(place, kind) {
  const n = place.notifyOn || 'both';
  if (n === 'both') return true;
  return n === kind;
}

/**
 * Sammenlign forrige/nye posisjon mot steder.
 * Skriver placePresence og sender varsler ved enter/exit.
 */
export async function evaluateGeofences({
  familyId,
  uid,
  name,
  lat,
  lng,
  places = [],
  notifyUids = [],
}) {
  if (!familyId || !uid || lat == null || lng == null || !places.length) return [];

  const presenceRef = placePresenceDoc(familyId, uid);
  const prevSnap = await getDoc(presenceRef);
  const prevInside = new Set(
    Array.isArray(prevSnap.data()?.insidePlaceIds) ? prevSnap.data().insidePlaceIds : [],
  );

  const nowInside = [];
  const events = [];

  for (const place of places) {
    if (!place.enabled) continue;
    if (place.memberIds?.length && !place.memberIds.includes(uid)) continue;
    const dist = distanceMeters({ lat, lng }, { lat: place.lat, lng: place.lng });
    const inside = dist <= place.radiusM;
    if (inside) nowInside.push(place.id);

    const was = prevInside.has(place.id);
    if (inside && !was && shouldNotify(place, 'enter')) {
      events.push({ place, kind: 'enter' });
    } else if (!inside && was && shouldNotify(place, 'exit')) {
      events.push({ place, kind: 'exit' });
    }
  }

  await setDoc(presenceRef, {
    uid,
    name: name || '',
    insidePlaceIds: nowInside,
    lat,
    lng,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const recipients = (notifyUids || []).filter((id) => id && id !== uid);
  for (const ev of events) {
    const verb = ev.kind === 'enter' ? 'ankommet' : 'forlatt';
    const title = `${name || 'Noen'} har ${verb} ${ev.place.name}`;
    const body = ev.kind === 'enter'
      ? `${name || 'Noen'} er nå ved ${ev.place.name}.`
      : `${name || 'Noen'} har forlatt ${ev.place.name}.`;
    if (recipients.length) {
      await notifyUsers(recipients, {
        title,
        body,
        eventType: 'locationGeofence',
        familyId,
        placeId: ev.place.id,
        kind: ev.kind,
        module: 'location',
      }).catch(() => {});
    }
  }

  return events;
}
