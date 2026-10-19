import { useEffect, useState } from 'react';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, peekProjectState, saveProjectState } from '../../src/project/storage';

/** Leser og lagrer selskapsoppsett som ligger i prosjektstate. */
export function useCompanyProject(familyId) {
  const [state, setState] = useState(() => peekProjectState(familyId) || emptyProjectState());
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let live = true;
    loadProjectState(familyId, { hours: false }).then((loaded) => {
      if (live) setState(loaded);
    });
    return () => { live = false; };
  }, [familyId]);

  async function commit(result, success) {
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

  return { state, error, note, setError, setNote, commit };
}
