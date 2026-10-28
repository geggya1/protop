import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyProjectState } from './engine.js';
import { loadProjectState, peekProjectState, putProjectState, saveProjectState } from './storage.js';

/** Feilen onError får når noen prøver å endre før lastingen er ferdig. */
export const NOT_READY_TEXT = 'Vent til siden er lastet, og prøv igjen.';

/**
 * Prosjektstate på en skjerm som både leser og endrer den.
 *
 * Lagrer bare etter en endring brukeren har gjort (setState herfra). Lasting gir aldri
 * lagring: før skrev Økonomi og ISO kopien i minnet tilbake til skyen bare ved å åpne
 * siden, og en eldre kopi kunne da overskrive nyere endringer fra andre.
 *
 * Endring før lastingen er ferdig (ready) tas ikke imot: den ville blitt overskrevet av det
 * som lastes. setState gir da false, og onError får beskjeden (NOT_READY_TEXT). Ved bytte av
 * selskap er ready false til det nye selskapet er lastet, og ingenting lagres på feil selskap.
 *
 * load: valg til loadProjectState (f.eks. { hours: false }).
 * onError(cause): kalles når lagringen feiler.
 */
export function useProjectStateEditor(companyId, { load = undefined, onError = null } = {}) {
  const id = String(companyId || '').trim();
  const [state, setLoaded] = useState(() => peekProjectState(id) || emptyProjectState());
  const [ready, setReady] = useState(false);
  const edited = useRef(false);
  const readyRef = useRef(false);
  // Selskapet state hører til.
  const owner = useRef(id);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    edited.current = false;
    readyRef.current = false;
    setReady(false);
    if (owner.current !== id) {
      // Nytt selskap: vis ikke det forrige selskapets prosjekter mens det nye lastes.
      owner.current = id;
      setLoaded(peekProjectState(id) || emptyProjectState());
    }
    loadProjectState(id, loadRef.current).then((loaded) => {
      if (!live) return;
      edited.current = false;
      setLoaded(loaded);
      readyRef.current = true;
      setReady(true);
    }).catch((cause) => {
      if (!live) return;
      readyRef.current = true;
      setReady(true);
      errorRef.current?.(cause);
    });
    return () => { live = false; };
  }, [id]);

  /** Endring fra brukeren. Samme form som React sin setState. Gir false før lastingen er ferdig. */
  const setState = useCallback((update) => {
    if (!readyRef.current) {
      errorRef.current?.(new Error(NOT_READY_TEXT));
      return false;
    }
    edited.current = true;
    setLoaded(update);
    return true;
  }, []);

  useEffect(() => {
    if (!ready || !edited.current || owner.current !== id) return;
    edited.current = false;
    // Minnet oppdateres med en gang, så andre skjermer ser endringen.
    putProjectState(state, id);
    saveProjectState(state, id).catch((cause) => errorRef.current?.(cause));
  }, [state, ready, id]);

  return { state, setState, ready };
}
