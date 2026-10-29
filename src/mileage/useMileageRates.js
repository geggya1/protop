/**
 * Satser for bilgodtgjørelse fra serveren (mileageRates), hentet automatisk fra statens regulativ
 * og Skatteetaten. Hentes én gang per økt. Til svaret kommer, gjelder de kjente satsene
 * (src/mileage/mileageRates.js).
 */
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

let cache = null;
let inflight = null;

export function loadMileageRates() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = httpsCallable(functions, 'mileageRates', { timeout: 120000 })({})
      .then((result) => {
        cache = { rates: result?.data?.rates || {}, checkedAt: result?.data?.checkedAt || '' };
        return cache;
      })
      .catch(() => {
        inflight = null;
        return { rates: {}, checkedAt: '' };
      });
  }
  return inflight;
}

/** { rates: { 2026: { state, taxFree } }, checkedAt } */
export function useMileageRates() {
  const [value, setValue] = useState(cache || { rates: {}, checkedAt: '' });
  useEffect(() => {
    let live = true;
    loadMileageRates().then((next) => { if (live) setValue(next); });
    return () => { live = false; };
  }, []);
  return value;
}
