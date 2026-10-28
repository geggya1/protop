import { useEffect, useState } from 'react';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, peekProjectState, saveProjectState } from '../../src/project/storage';

/** Leser og lagrer selskapsoppsett som ligger i prosjektstate. */
export function useCompanyProject(familyId) {
  const [state, setState] = useState(() => peekProjectState(familyId) || emptyProjectState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    setReady(false);
    loadProjectState(familyId, { hours: false }).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    }).catch(() => {
      if (live) setError('Kunne ikke laste innstillingene.');
    });
    return () => { live = false; };
  }, [familyId]);

  async function commit(result, success) {
    // Før lastingen er ferdig vet vi ikke hva som ligger i skyen, og endringen kunne gått tapt.
    if (!ready) {
      setError('Vent til innstillingene er lastet, og prøv igjen.');
      return false;
    }
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre.');
      return false;
    }
    setState(result.state);
    setError('');
    setNote(success || 'Lagret.');
    try {
      await saveProjectState(result.state, familyId);
      return true;
    } catch {
      setError('Kunne ikke lagre.');
      return false;
    }
  }

  return { state, ready, error, note, setError, setNote, commit };
}
