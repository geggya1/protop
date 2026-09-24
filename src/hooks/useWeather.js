import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { dateKey } from '../utils/dates';
import { getDeviceLocation, reverseGeocode } from '../utils/location';
import {
  WEATHER_PLACE_KEY,
  fetchWeatherForecast,
  normalizeWeatherPlace,
  placeFromProfileLocation,
  resolveWeatherPlace,
  searchWeatherPlaces,
} from '../utils/weather';

const CACHE_MS = 15 * 60 * 1000;
const forecastCache = new Map();

function cacheKey(place) {
  if (!place) return '';
  return `${Number(place.lat).toFixed(3)},${Number(place.lng).toFixed(3)}`;
}

async function placeFromDevice() {
  const coords = await getDeviceLocation();
  let label = `${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`;
  try {
    const rev = await reverseGeocode(coords.lat, coords.lng, 'nb');
    if (rev?.label) label = rev.label;
  } catch { /* keep coords label */ }
  return {
    name: label.split(',')[0].trim() || 'Her',
    label,
    lat: coords.lat,
    lng: coords.lng,
    source: 'device',
  };
}

export function useWeather() {
  const { userProfile, meParent, uid } = useApp();
  const todayKey = dateKey(new Date());
  const [saved, setSaved] = useState(undefined);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  const profileLocation = userProfile?.location || meParent?.location || null;
  const storageKey = uid ? `${WEATHER_PLACE_KEY}.${uid}` : WEATHER_PLACE_KEY;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!alive) return;
        setSaved(raw ? JSON.parse(raw) : null);
      } catch {
        if (alive) setSaved(null);
      }
    })();
    return () => { alive = false; };
  }, [storageKey]);

  // Never auto-request GPS. Browsers (esp. Safari) show a system permission
  // dialog on getCurrentPosition, and home/greeting mount useWeather often.
  // Fallback: saved place → profile home → Oslo. GPS only via useDevice().
  const place = useMemo(() => {
    if (saved === undefined) return null;
    if (saved !== null) return normalizeWeatherPlace(saved);
    return resolveWeatherPlace({ saved: null, profileLocation });
  }, [saved, profileLocation]);

  const persistPlace = useCallback(async (next) => {
    const normalized = normalizeWeatherPlace(next);
    setSaved(normalized);
    try {
      if (normalized) await AsyncStorage.setItem(storageKey, JSON.stringify(normalized));
      else await AsyncStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!place) return undefined;
    let alive = true;
    const key = `${cacheKey(place)}:${todayKey}`;
    const cached = forecastCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setForecast(cached.data);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);
    fetchWeatherForecast(place, { todayKey })
      .then((data) => {
        if (!alive) return;
        forecastCache.set(key, { at: Date.now(), data });
        setForecast(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || 'Klarte ikke hente værvarsel');
        setLoading(false);
      });

    return () => { alive = false; };
  }, [place?.lat, place?.lng, place?.name, todayKey]);

  const search = useCallback(async (query, language = 'nb') => {
    const q = String(query || '').trim();
    reqId.current += 1;
    const id = reqId.current;
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return [];
    }
    setSearching(true);
    try {
      const results = await searchWeatherPlaces(q, { language });
      if (id !== reqId.current) return [];
      setHits(results);
      return results;
    } catch {
      if (id === reqId.current) setHits([]);
      return [];
    } finally {
      if (id === reqId.current) setSearching(false);
    }
  }, []);

  const useDevice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await placeFromDevice();
      await persistPlace(next);
      return true;
    } catch (err) {
      const denied = err?.message === 'denied';
      setError(denied
        ? 'Posisjon er blokkert. Tillat stedstjenester, og prøv igjen.'
        : 'Fant ikke posisjonen din. Søk etter et sted i stedet.');
      setLoading(false);
      return false;
    }
  }, [persistPlace]);

  const useHomeAddress = useCallback(async () => {
    const home = placeFromProfileLocation(profileLocation);
    if (!home) {
      setError('Ingen hjemadresse med koordinater på profilen.');
      return false;
    }
    setError(null);
    await persistPlace(home);
    return true;
  }, [persistPlace, profileLocation]);

  return {
    place,
    forecast,
    loading,
    error,
    hits,
    searching,
    search,
    setPlace: persistPlace,
    useDevice,
    useHomeAddress,
    hasProfileLocation: placeFromProfile(profileLocation),
    profileLocation,
    usingDevice: place?.source === 'device',
    placeResolved: saved !== undefined,
  };
}

function placeFromProfile(location) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}
