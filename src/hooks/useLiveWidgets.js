import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useWeather } from './useWeather';
import { proxyOpenFeed } from '../utils/openFeedClient';
import {
  LIVE_WIDGET_KEY,
  clearLiveWidgetCache,
  liveWidgetCacheEntries,
  loadLiveWidgets,
  normalizeLivePrefs,
  peekLiveWidgets,
  primeLiveWidgetCache,
  suggestPowerZone,
} from '../utils/liveWidgets';

// Åpne, felles data (nyheter, kurs, strøm). Ikke knyttet til bruker.
const LIVE_CACHE_KEY = `${LIVE_WIDGET_KEY}.cache`;
let cacheHydrated = null;

/** Leser forrige besøks widgetdata inn i minnet én gang per økt. */
function hydrateLiveCache() {
  if (!cacheHydrated) {
    cacheHydrated = AsyncStorage.getItem(LIVE_CACHE_KEY)
      .then((raw) => { if (raw) primeLiveWidgetCache(JSON.parse(raw)); })
      .catch(() => {});
  }
  return cacheHydrated;
}

function persistLiveCache() {
  try {
    AsyncStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(liveWidgetCacheEntries())).catch(() => {});
  } catch { /* ignore */ }
}

export function useLiveWidgets({ enabled = true } = {}) {
  const { uid } = useApp();
  const { place, placeResolved } = useWeather();
  const storageKey = uid ? `${LIVE_WIDGET_KEY}.${uid}` : LIVE_WIDGET_KEY;
  const [prefs, setPrefs] = useState(null);
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      let raw = null;
      try {
        const [stored] = await Promise.all([AsyncStorage.getItem(storageKey), hydrateLiveCache()]);
        raw = stored ? JSON.parse(stored) : null;
      } catch {
        raw = null;
      }
      if (!alive) return;
      const zone = place ? suggestPowerZone(place.lat, place.lng) : undefined;
      setPrefs((prev) => {
        if (prev && raw) return prev;
        return normalizeLivePrefs(raw, { zone });
      });
    })();
    return () => { alive = false; };
  }, [storageKey, place?.lat, place?.lng]);

  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = normalizeLivePrefs({ ...(prev || {}), ...patch });
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [storageKey]);

  const refresh = useCallback(() => {
    clearLiveWidgetCache();
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    // Vent på stedet, ellers hentes strøm og luft først for Oslo og så på nytt.
    if (!enabled || !prefs || !placeResolved) return undefined;
    let alive = true;
    const where = { lat: place?.lat, lng: place?.lng };
    // Vis det vi har (også fra forrige besøk) straks, og bytt ut kort for kort.
    const shown = peekLiveWidgets(prefs, where);
    setData((prev) => ({ ...prev, ...shown }));
    setErrors({});
    setLoading(true);
    loadLiveWidgets(prefs, {
      ...where,
      proxyImpl: proxyOpenFeed,
      preferProxy: Platform.OS === 'web',
      onResult: (id, result) => {
        if (!alive) return;
        if (result.error) {
          setErrors((prev) => ({ ...prev, [id]: result.error }));
          return;
        }
        setData((prev) => (prev[id] === result.data ? prev : { ...prev, [id]: result.data }));
        setErrors((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      },
    }).then(() => {
      persistLiveCache();
      if (alive) setLoading(false);
    }).catch(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [
    enabled,
    placeResolved,
    prefs?.newsSource,
    prefs?.stockSymbol,
    (prefs?.stockSymbols || []).join(','),
    prefs?.powerZone,
    prefs?.powerZoneAuto,
    (prefs?.fxCodes || []).join(','),
    (prefs?.enabled || []).join(','),
    place?.lat,
    place?.lng,
    tick,
  ]);

  return {
    prefs,
    ready: !!prefs,
    loading,
    data,
    errors,
    updatePrefs,
    refresh,
    placeName: place?.name || '',
  };
}
