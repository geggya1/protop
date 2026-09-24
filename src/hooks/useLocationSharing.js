import { useEffect, useRef } from 'react';
import { getDeviceLocation, reverseGeocode } from '../utils/location';
import {
  clearLiveLocation,
  publishLiveLocation,
  distanceMeters,
  LOCATION_PUBLISH_INTERVAL_MS,
  LOCATION_GEOCODE_MOVE_M,
} from '../utils/familyLocation';
import { listenPlaces, evaluateGeofences } from '../utils/familyPlaces';

/**
 * Foreground location publishing while sharing is enabled.
 * Throttled writes + geocode only when we moved meaningfully (cost control).
 * Evaluates family geofences (hjem/skole) on each publish.
 */
export function useLocationSharing({
  familyId, uid, enabled, name, role, notifyUids = [],
}) {
  const publishingRef = useRef(false);
  const lastPublishRef = useRef(null); // { lat, lng, label }
  const wasEnabledRef = useRef(false);
  const placesRef = useRef([]);
  const notifyRef = useRef(notifyUids);
  notifyRef.current = notifyUids;

  useEffect(() => {
    if (!familyId || !enabled) {
      placesRef.current = [];
      return undefined;
    }
    return listenPlaces(familyId, (list) => {
      placesRef.current = list || [];
    });
  }, [familyId, enabled]);

  useEffect(() => {
    if (!familyId || !uid) return undefined;

    if (!enabled) {
      if (wasEnabledRef.current) {
        clearLiveLocation(familyId, uid).catch(() => {});
        lastPublishRef.current = null;
      }
      wasEnabledRef.current = false;
      return undefined;
    }

    wasEnabledRef.current = true;
    let cancelled = false;
    let permissionDenied = false;

    const publish = async () => {
      if (cancelled || publishingRef.current || permissionDenied) return;
      publishingRef.current = true;
      try {
        const coords = await getDeviceLocation();
        if (cancelled) return;

        const prev = lastPublishRef.current;
        const moved = !prev || distanceMeters(prev, coords) >= LOCATION_GEOCODE_MOVE_M;

        let label = prev?.label || null;
        if (moved || !label) {
          try {
            const rev = await reverseGeocode(coords.lat, coords.lng);
            label = rev?.label || label;
          } catch {
            // keep previous / null
          }
        }

        await publishLiveLocation(familyId, uid, {
          name,
          role,
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy ?? null,
          label,
        });
        lastPublishRef.current = { lat: coords.lat, lng: coords.lng, label };

        const places = placesRef.current;
        if (places.length) {
          await evaluateGeofences({
            familyId,
            uid,
            name,
            lat: coords.lat,
            lng: coords.lng,
            places,
            notifyUids: notifyRef.current,
          }).catch(() => {});
        }
      } catch (err) {
        // Stop polling on hard deny — otherwise sharing looks "on" while we silently fail forever.
        if (err?.message === 'denied') permissionDenied = true;
      } finally {
        publishingRef.current = false;
      }
    };

    publish();
    const id = setInterval(publish, LOCATION_PUBLISH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [familyId, uid, enabled, name, role]);
}
