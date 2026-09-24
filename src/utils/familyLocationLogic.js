/** Positions older than this are treated as stale in the UI. */
export const LOCATION_STALE_MS = 30 * 60 * 1000;

/** Min. interval between live publishes (Firestore writes + GPS). */
export const LOCATION_PUBLISH_INTERVAL_MS = 5 * 60 * 1000;

/** Only reverse-geocode when we moved farther than this (meters). */
export const LOCATION_GEOCODE_MOVE_M = 250;

/**
 * Om denne enheten skal publisere posisjon.
 *
 * Barn: foresattes valg på child-doc er master. Barnet kan kun overstyre
 * (slå av/på selv) når locationSharingChildCanControl === true.
 * Foreldre: users/{uid}.locationSharingEnabled.
 */
export function effectiveLocationSharing({ userProfile, childRecord, parentRecord }) {
  if (childRecord) {
    const parentOn = childRecord.locationSharingEnabled === true;
    if (!parentOn) return false;
    if (childRecord.locationSharingChildCanControl === true) {
      if (typeof userProfile?.locationSharingEnabled === 'boolean') {
        return userProfile.locationSharingEnabled;
      }
      return true;
    }
    return true;
  }
  if (typeof userProfile?.locationSharingEnabled === 'boolean') {
    return userProfile.locationSharingEnabled;
  }
  if (parentRecord && typeof parentRecord.locationSharingEnabled === 'boolean') {
    return parentRecord.locationSharingEnabled;
  }
  return false;
}

/** Om innlogget barn selv kan endre posisjonsdeling. */
export function childCanControlLocationSharing(childRecord) {
  return !!childRecord
    && childRecord.locationSharingEnabled === true
    && childRecord.locationSharingChildCanControl === true;
}

export function locationTimestampMs(entry) {
  const ts = entry?.updatedAt;
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const n = new Date(ts).getTime();
  return Number.isFinite(n) ? n : null;
}

export function isFreshLocation(entry, maxAgeMs = LOCATION_STALE_MS) {
  const ms = locationTimestampMs(entry);
  if (!ms) return false;
  return Date.now() - ms <= maxAgeMs;
}

export function formatLocationAge(entry) {
  const ms = locationTimestampMs(entry);
  if (!ms) return 'Ukjent tid';
  const diff = Date.now() - ms;
  if (diff < 45 * 1000) return 'Nettopp';
  if (diff < 60 * 1000) return '1 min siden';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min siden`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} t siden`;
  return `${Math.floor(diff / 86400000)} d siden`;
}

/** Haversine distance in meters. */
export function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
