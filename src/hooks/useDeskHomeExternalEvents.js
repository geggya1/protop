import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, dateKey, parseDateKey } from '../utils/dates';
import { isCalendarLayerHidden, HIDDEN_CALENDAR_LAYERS_KEY } from '../utils/timeGrid';
import {
  fetchExternalCalendarEvents,
  hydrateExternalCalendarEvents,
  listCalendarConnections,
} from '../utils/calendarIntegration';

/** Shared fetch for Outlook/Google/ICS (today + tomorrow). Returns cleanup. */
export function loadExternalCalendarEventsForDeskHome({
  enabled, uid, todayKey, onHiddenCals, onEvents,
}) {
  if (!enabled || !uid || !todayKey) {
    onEvents?.([]);
    return () => {};
  }
  let alive = true;
  const start = todayKey;
  const tomorrow = parseDateKey(todayKey);
  const end = tomorrow ? dateKey(addDays(tomorrow, 1)) : todayKey;

  AsyncStorage.getItem(`${HIDDEN_CALENDAR_LAYERS_KEY}.${uid}`)
    .then((raw) => {
      if (!alive) return;
      const list = raw ? JSON.parse(raw) : [];
      onHiddenCals?.(new Set(Array.isArray(list) ? list : []));
    })
    .catch(() => { if (alive) onHiddenCals?.(new Set()); });

  hydrateExternalCalendarEvents(start, end, { uid })
    .then((cached) => {
      if (!alive || !cached) return;
      onEvents?.(cached.events || []);
    })
    .catch(() => {});

  listCalendarConnections()
    .then((list) => (alive ? (list || []) : []))
    .catch(() => [])
    .then(() => {
      if (!alive) return null;
      // lastError/needsReauth must not bypass cache — reconnect is a user action,
      // and hammering Graph on every home/plan mount trips the 4/min guard.
      return fetchExternalCalendarEvents(start, end, { uid, force: false });
    })
    .then((res) => {
      if (!alive || !res) return;
      onEvents?.(res.events || []);
    })
    .catch(() => {});

  return () => { alive = false; };
}

/**
 * Outlook/Google/ICS for desktop home — same fetch as PlanScreen, today + tomorrow.
 * useEffect loads outside focused screens (e.g. global greeting modal).
 * Pass refreshKey from useFocusEffect on screens to reload when returning to home.
 */
export function useDeskHomeExternalEvents({
  enabled, uid, familyId, todayKey, refreshKey = 0,
}) {
  const [externalEvents, setExternalEvents] = useState([]);
  const [hiddenCals, setHiddenCals] = useState(() => new Set());

  useEffect(() => {
    return loadExternalCalendarEventsForDeskHome({
      enabled,
      uid,
      todayKey,
      onHiddenCals: setHiddenCals,
      onEvents: setExternalEvents,
    });
  }, [enabled, uid, todayKey, refreshKey]);

  return (externalEvents || []).filter(
    (e) => !isCalendarLayerHidden(e, hiddenCals, familyId),
  );
}
