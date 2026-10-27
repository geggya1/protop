import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultVisibleKeys, parseStoredKeys, reportPrefsKey } from '../../src/ui/reportTable';

/**
 * Synlige kolonner i en rapporttabell, husket per bruker som i prosjektlisten.
 * Gir [keys, setKeys, reset]. Lagring er valgfri: feiler den, gjelder standard.
 */
export default function useReportColumns(name, uid, columns) {
  const [keys, setKeys] = useState(() => defaultVisibleKeys(columns));
  const skipSave = useRef(true);
  const storageKey = reportPrefsKey(name, uid);

  useEffect(() => {
    let live = true;
    skipSave.current = true;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (!live) return;
      skipSave.current = true;
      setKeys(parseStoredKeys(columns, raw));
    }).catch(() => {});
    return () => { live = false; };
    // Kolonnelisten er fast per side. Bare lagringsnøkkelen skal laste på nytt.
  }, [storageKey]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    AsyncStorage.setItem(storageKey, JSON.stringify({ visible: keys })).catch(() => {});
  }, [storageKey, keys]);

  return [keys, setKeys, () => setKeys(defaultVisibleKeys(columns))];
}
