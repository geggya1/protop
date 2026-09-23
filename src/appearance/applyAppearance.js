import { Appearance, Platform } from 'react-native';
import { DARK, LIGHT, SOFT_DARK, SOFT_LIGHT } from './palette';
import {
  normalizeAppearancePrefs,
  resolveAppearanceScheme,
} from './resolveAppearance';

function cssPairs(scheme) {
  const pal = scheme === 'dark' ? DARK : LIGHT;
  const soft = scheme === 'dark' ? SOFT_DARK : SOFT_LIGHT;
  const pairs = [];
  Object.entries(pal).forEach(([key, value]) => {
    pairs.push([`--wp-c-${key}`, value]);
  });
  Object.entries(soft).forEach(([key, value]) => {
    pairs.push([`--wp-soft-${key}`, value]);
  });
  return pairs;
}

export function applyAppearanceScheme(scheme, { followSystem = false } = {}) {
  const next = scheme === 'dark' ? 'dark' : 'light';
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.wpAppearance = next;
    root.style.colorScheme = next;
    cssPairs(next).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
    if (document.body) {
      document.body.style.backgroundColor = next === 'dark' ? DARK.bg : '#eef3f9';
    }
  }
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    try {
      // null = følg OS igjen (viktig for Automatisk → systemet)
      Appearance.setColorScheme(followSystem ? null : next);
    } catch { /* eldre runtime */ }
  }
}

/** Les lagret valg synkront på web så første maling ikke blinker lyst. */
export function readAppearancePrefsSync() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('weekplan.appearance.v1');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function systemSchemeNow() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  try {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Kjør før React, så lagret mørkt utseende gjelder fra første maling på web. */
export function bootstrapAppearance() {
  const prefs = normalizeAppearancePrefs(readAppearancePrefsSync());
  const followSystem = prefs.automatic && prefs.schedule === 'system';
  const scheme = resolveAppearanceScheme(prefs, { systemScheme: systemSchemeNow(), now: new Date() });
  applyAppearanceScheme(scheme, { followSystem });
}
