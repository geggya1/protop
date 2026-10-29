/**
 * ISO-innhold til Bærekraft-fanen (bare lesing). Bruker ISO-tilstanden som allerede er lastet
 * i økten, ellers tre målrettede lesinger. Uten ISO-tilgang (eksterne nivå) blir status 'none',
 * og fanen viser bare bedriftens egen tekst.
 */
import { useEffect, useState } from 'react';
import { ensureAccessMirror, loadIsoProfileParts, peekIsoState } from '../../src/iso/storage';

export function useIsoProfile({ companyId, uid, enabled, family = null, employees = null }) {
  const [load, setLoad] = useState({ status: 'off', parts: null, key: '' });
  const key = `${companyId || ''}:${uid || ''}`;

  useEffect(() => {
    if (!enabled || !companyId || !uid) return undefined;
    // Hentet én gang per bedrift og bruker mens siden er åpen; ny visning av fanen leser ikke på nytt.
    if (load.key === key && (load.status === 'ready' || load.status === 'none')) return undefined;
    const peek = peekIsoState(companyId, uid);
    if (peek) {
      setLoad({ status: 'ready', parts: { system: peek.system, documents: peek.documents, records: peek.records }, key });
      return undefined;
    }
    let live = true;
    setLoad({ status: 'loading', parts: null, key });
    (async () => {
      // Samme rekkefølge som ISO-skjermen: tilgangsmatrisen speiles før reglene leser den.
      const mirror = await ensureAccessMirror(companyId, uid, { family, employees });
      if (!mirror?.iso) {
        if (live) setLoad({ status: 'none', parts: null, key });
        return;
      }
      const parts = await loadIsoProfileParts(companyId);
      if (live) setLoad(parts ? { status: 'ready', parts, key } : { status: 'none', parts: null, key });
    })().catch(() => {
      if (live) setLoad({ status: 'none', parts: null, key });
    });
    return () => { live = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return load.key === key ? load : { status: 'off', parts: null, key };
}
