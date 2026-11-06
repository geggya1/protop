import React, { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

/**
 * Skjermer som lastes først når de åpnes (kodesplitting).
 *
 * Før lå alle skjermene i én web-bundle som ble lastet og kjørt ved hver oppstart, også
 * moduler brukeren aldri åpner. `lazyScreen(() => import('./X'))` gir en egen bit (chunk)
 * på web og utsetter kjøringen av modulen på mobil. Komponenten oppfører seg som før:
 * samme props, samme navigasjon.
 *
 * Mens biten hentes vises en tom flate. Spinneren kommer først etter en kort pause, så
 * en rask lasting ikke blinker.
 */

const SPINNER_DELAY_MS = 250;

function ScreenFallback() {
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {showSpinner ? <ActivityIndicator size="large" color="#1099F4" /> : null}
    </View>
  );
}

/** Hent biten på nytt én gang hvis den feiler (f.eks. ny deploy mens appen var åpen). */
function withRetry(load) {
  return () => load().catch(() => new Promise((resolve, reject) => {
    setTimeout(() => load().then(resolve, reject), 800);
  }));
}

export function lazyScreen(load, { name, fallback = null, pick = 'default', silent = false } = {}) {
  const loader = withRetry(load);
  const Lazy = React.lazy(() => loader().then((mod) => ({ default: mod[pick] || mod.default })));
  function LazyScreen(props) {
    return (
      <Suspense fallback={silent ? null : (fallback === null ? <ScreenFallback /> : fallback)}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyScreen.displayName = `Lazy(${name || pick})`;
  // Forhåndslasting når nettleseren er ledig (se preloadScreens).
  LazyScreen.preload = loader;
  return LazyScreen;
}

/**
 * Henter bitene for de vanligste modulene når appen er ledig etter oppstart, så de åpner
 * uten venting. Går i små porsjoner så det ikke konkurrerer med det brukeren gjør.
 */
export function preloadScreens(screens, { delayMs = 2500 } = {}) {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;
  const queue = (screens || []).filter((s) => typeof s?.preload === 'function');
  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 4000 })
    : (fn) => setTimeout(fn, 200);
  const next = () => {
    if (cancelled || !queue.length) return;
    const s = queue.shift();
    s.preload().catch(() => {}).finally(() => idle(next));
  };
  const start = setTimeout(() => idle(next), delayMs);
  return () => {
    cancelled = true;
    clearTimeout(start);
  };
}
