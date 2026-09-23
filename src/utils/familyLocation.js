import {
  collection, doc, deleteDoc, onSnapshot, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';

export {
  LOCATION_STALE_MS,
  LOCATION_PUBLISH_INTERVAL_MS,
  LOCATION_GEOCODE_MOVE_M,
  effectiveLocationSharing,
  childCanControlLocationSharing,
  locationTimestampMs,
  isFreshLocation,
  formatLocationAge,
  distanceMeters,
} from './familyLocationLogic';

export function liveLocationsCol(familyId) {
  return collection(db, 'families', familyId, 'liveLocations');
}

export function liveLocationDoc(familyId, uid) {
  return doc(db, 'families', familyId, 'liveLocations', uid);
}

export function listenFamilyLocations(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(liveLocationsCol(familyId), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

export async function setUserLocationSharing(uid, enabled) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), {
    locationSharingEnabled: !!enabled,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function setChildLocationSharing(familyId, childId, enabled, options = {}) {
  if (!familyId || !childId) return;
  const payload = {
    locationSharingEnabled: !!enabled,
    updatedAt: serverTimestamp(),
  };
  if (typeof options.childCanControl === 'boolean') {
    payload.locationSharingChildCanControl = options.childCanControl;
  }
  await Promise.all([
    setDoc(doc(db, 'families', familyId, 'children', childId), payload, { merge: true }),
    setDoc(doc(db, 'children', childId), payload, { merge: true }).catch(() => {}),
  ]);
}

export async function publishLiveLocation(familyId, uid, data) {
  if (!familyId || !uid || data?.lat == null || data?.lng == null) return;
  await setDoc(liveLocationDoc(familyId, uid), {
    uid,
    name: data.name || '',
    role: data.role || 'parent',
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy ?? null,
    label: data.label || null,
    sharingEnabled: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function clearLiveLocation(familyId, uid) {
  if (!familyId || !uid) return;
  try {
    await deleteDoc(liveLocationDoc(familyId, uid));
  } catch {
    await updateDoc(liveLocationDoc(familyId, uid), {
      sharingEnabled: false,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
}
