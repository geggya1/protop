import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyProjectState } from './engine.js';
import { loadProjectState, peekProjectState, putProjectState, saveProjectState } from './storage.js';

/**
 * Prosjektstate på en skjerm som både leser og endrer den.
 *
 * Lagrer bare etter en endring brukeren har gjort (setState herfra). Lasting gir aldri
 * lagring: før skrev Økonomi og ISO kopien i minnet tilbake til skyen bare ved å åpne
 * siden, og en eldre kopi kunne da overskrive nyere endringer fra andre.
 *
 * load: valg til loadProjectState (f.eks. { hours: false }).
 * onError(cause): kalles når lagringen feiler.
 */
export function useProjectStateEditor(companyId, { load = undefined, onError = null } = {}) {
  const id = String(companyId || '').trim();
  const [state, setLoaded] = useState(() => peekProjectState(id) || emptyProjectState());
  const [ready, setReady] = useState(false);
  const edited = useRef(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    edited.current = false;
    loadProjectState(id, loadRef.current).then((loaded) => {
      if (!live) return;
      edited.current = false;
      setLoaded(loaded);
      setReady(true);
    }).catch((cause) => {
      if (!live) return;
      setReady(true);
      errorRef.current?.(cause);
    });
    return () => { live = false; };
  }, [id]);

  /** Endring fra brukeren. Samme form som React sin setState. */
  const setState = useCallback((update) => {
    edited.current = true;
    setLoaded(update);
  }, []);

  useEffect(() => {
    if (!ready || !edited.current) return;
    edited.current = false;
    // Minnet oppdateres med en gang, så andre skjermer ser endringen.
    putProjectState(state, id);
    saveProjectState(state, id).catch((cause) => errorRef.current?.(cause));
  }, [state, ready, id]);

  return { state, setState, ready };
}
