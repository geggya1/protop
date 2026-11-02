import { useEffect, useState } from 'react';
import { ensureAccessMirror, loadIsoState, peekIsoState } from '../../src/iso/storage';

/**
 * ISO-dataene til den samlede visningen av årshjulene (HR → Rutiner → Årshjul, «Vis også ISO»).
 * Lastes bare når visningen er slått på og personen kan se ISO. Samme rekkefølge som ISO-skjermen:
 * tilgangsspeilet først, så dataene. Svar: { status: 'off'|'loading'|'ready'|'error', state }.
 */
export function useIsoAnnual({ companyId, uid, enabled, family = null, employees = null }) {
  const [load, setLoad] = useState({ status: 'off', state: null });

  useEffect(() => {
    if (!enabled || !companyId) {
      setLoad({ status: 'off', state: null });
      return undefined;
    }
    const peek = peekIsoState(companyId, uid);
    if (peek) {
      setLoad({ status: 'ready', state: peek });
      return undefined;
    }
    let live = true;
    setLoad({ status: 'loading', state: null });
    (async () => {
      await ensureAccessMirror(companyId, uid, { family, employees });
      const res = await loadIsoState(companyId, { uid });
      if (live) setLoad(res.source === 'empty' ? { status: 'error', state: null } : { status: 'ready', state: res.state });
    })().catch(() => {
      if (live) setLoad({ status: 'error', state: null });
    });
    return () => { live = false; };
  }, [companyId, uid, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return load;
}
