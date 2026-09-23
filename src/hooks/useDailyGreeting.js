import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dateKey } from '../utils/dates';
import { getGreetingPeriod } from '../utils/timeGreeting';

export const GREETING_SHOWN_KEY = 'weekplan.dailyGreeting.v1';

function storageKey(uid, date, period) {
  return `${GREETING_SHOWN_KEY}.${uid}.${date}.${period}`;
}

export async function markGreetingShown(uid, period, date = new Date()) {
  if (!uid || !period) return;
  try {
    await AsyncStorage.setItem(storageKey(uid, dateKey(date), period), '1');
  } catch { /* ignore */ }
}

export async function wasGreetingShown(uid, period, date = new Date()) {
  if (!uid || !period) return true;
  try {
    const val = await AsyncStorage.getItem(storageKey(uid, dateKey(date), period));
    return val === '1';
  } catch {
    return false;
  }
}

/**
 * Viser morgen-/kveldshilsen én gang per periode per dag for innloggede brukere.
 * `enabled` styres typisk av greetingPrefs (av som standard for voksne) + kjøkkenmodus.
 */
export function useDailyGreeting(uid, { enabled = true } = {}) {
  const [period, setPeriod] = useState(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  const check = useCallback(async () => {
    if (!enabled || !uid) {
      setVisible(false);
      setPeriod(null);
      setReady(true);
      return;
    }
    const current = getGreetingPeriod();
    if (!current) {
      setVisible(false);
      setPeriod(null);
      setReady(true);
      return;
    }
    const shown = await wasGreetingShown(uid, current);
    setPeriod(current);
    setVisible(!shown);
    setReady(true);
  }, [enabled, uid]);

  useEffect(() => {
    setReady(false);
    check();
  }, [check]);

  const dismiss = useCallback(async () => {
    if (period && uid) await markGreetingShown(uid, period);
    setVisible(false);
  }, [period, uid]);

  return useMemo(() => ({
    period,
    visible: ready && visible,
    dismiss,
    refresh: check,
  }), [period, ready, visible, dismiss, check]);
}
