import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { prefersReducedMotion, watchReducedMotion } from './reducedMotion';

/** Sann når brukeren har slått på «Reduser bevegelse» i nettleseren eller på enheten. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (Platform.OS === 'web' ? prefersReducedMotion() : false));

  useEffect(() => {
    if (Platform.OS === 'web') {
      setReduced(prefersReducedMotion());
      return watchReducedMotion(setReduced);
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => { if (alive) setReduced(!!value); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => setReduced(!!value));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
