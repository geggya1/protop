import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Appearance, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paletteFor } from './palette';
import { applyAppearanceScheme, readAppearancePrefsSync } from './applyAppearance';
import {
  APPEARANCE_PREFS_KEY,
  DEFAULT_APPEARANCE_PREFS,
  appearanceSummary,
  normalizeAppearancePrefs,
  resolveAppearanceScheme,
} from './resolveAppearance';

const AppearanceContext = createContext(null);

function systemSchemeNow() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function readInitial() {
  const stored = readAppearancePrefsSync();
  const prefs = normalizeAppearancePrefs(stored || DEFAULT_APPEARANCE_PREFS);
  const systemScheme = systemSchemeNow();
  const scheme = resolveAppearanceScheme(prefs, { systemScheme, now: new Date() });
  return { prefs, systemScheme, scheme };
}

export function AppearanceProvider({ children }) {
  const initial = useMemo(() => readInitial(), []);
  const [prefs, setPrefs] = useState(initial.prefs);
  const [systemScheme, setSystemScheme] = useState(initial.systemScheme);
  const [now, setNow] = useState(() => new Date());

  const scheme = useMemo(
    () => resolveAppearanceScheme(prefs, { systemScheme, now }),
    [prefs, systemScheme, now],
  );

  useEffect(() => {
    const followSystem = prefs.automatic && prefs.schedule === 'system';
    applyAppearanceScheme(scheme, { followSystem });
  }, [scheme, prefs.automatic, prefs.schedule]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(APPEARANCE_PREFS_KEY).then((raw) => {
      if (!alive || !raw) return;
      try {
        setPrefs(normalizeAppearancePrefs(JSON.parse(raw)));
      } catch { /* behold standard */ }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener?.(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (!(prefs.automatic && prefs.schedule === 'clock')) return undefined;
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30000);
    const appSub = AppState.addEventListener?.('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(id);
      appSub?.remove?.();
    };
  }, [prefs.automatic, prefs.schedule]);

  const updatePrefs = useCallback((partial) => {
    setPrefs((prev) => {
      const next = normalizeAppearancePrefs({ ...prev, ...partial });
      AsyncStorage.setItem(APPEARANCE_PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const summary = useMemo(
    () => appearanceSummary(prefs, { systemScheme, now }),
    [prefs, systemScheme, now],
  );

  const value = useMemo(() => ({
    prefs,
    scheme,
    systemScheme,
    colors: paletteFor(scheme),
    summary,
    updatePrefs,
  }), [prefs, scheme, systemScheme, summary, updatePrefs]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (ctx) return ctx;
  const prefs = DEFAULT_APPEARANCE_PREFS;
  return {
    prefs,
    scheme: 'light',
    systemScheme: 'light',
    colors: paletteFor('light'),
    summary: { key: 'off', scheme: 'light' },
    updatePrefs: () => {},
  };
}
