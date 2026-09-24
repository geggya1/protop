import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useWeather } from './useWeather';
import { proxyOpenFeed } from '../utils/openFeedClient';
import {
  LIVE_WIDGET_KEY,
  clearLiveWidgetCache,
  loadLiveWidgets,
  normalizeLivePrefs,
  suggestPowerZone,
} from '../utils/liveWidgets';

export function useLiveWidgets({ enabled = true } = {}) {
  const { uid } = useApp();
  const { place } = useWeather();
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
        const stored = await AsyncStorage.getItem(storageKey);
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
    if (!enabled || !prefs) return undefined;
    let alive = true;
    setLoading(true);
    loadLiveWidgets(prefs, {
      lat: place?.lat,
      lng: place?.lng,
      proxyImpl: proxyOpenFeed,
      preferProxy: Platform.OS === 'web',
    }).then((result) => {
      if (!alive) return;
      setData(result.data);
      setErrors(result.errors);
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setLoading(false);
    });
    return () => { alive = false; };
  }, [
    enabled,
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
