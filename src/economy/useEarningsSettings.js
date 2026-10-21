import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultEarningsSettings } from './earnings.js';
import { loadEarningsSettings, saveEarningsSettings } from './earningsStorage.js';

/** Leser bedriftens satser. Lagrer først når noen endrer dem. */
export function useEarningsSettings(companyId) {
  const [settings, setSettings] = useState(defaultEarningsSettings);
  const [ready, setReady] = useState(false);
  const latest = useRef(settings);
  const timer = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    dirty.current = false;
    if (!companyId) {
      const empty = defaultEarningsSettings();
      latest.current = empty;
      setSettings(empty);
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    loadEarningsSettings(companyId).then((loaded) => {
      if (!live || dirty.current) return;
      latest.current = loaded;
      setSettings(loaded);
      setReady(true);
    }).catch(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
      clearTimeout(timer.current);
      if (dirty.current) saveEarningsSettings(companyId, latest.current).catch(() => {});
    };
  }, [companyId]);

  const update = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(latest.current) : next;
    latest.current = resolved;
    dirty.current = true;
    setSettings(resolved);
    if (!companyId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveEarningsSettings(companyId, latest.current).catch(() => {});
    }, 400);
  }, [companyId]);

  return { settings, ready, update };
}
