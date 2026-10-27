/**
 * Kompetansestatus fra ISO / K-HMS for én ansatt (bare lesing).
 * Bruker ISO-tilstanden som allerede er lastet i økten, ellers hentes den én gang.
 * ISO eier kravene og bevisene; HR viser dem på personens «Lovpålagt»-fane.
 */
import { useEffect, useMemo, useState } from 'react';
import { displayName } from '../../src/employees/model';
import { competenceForPerson } from '../../src/iso/registers';
import { ensureAccessMirror, loadIsoState, peekIsoState } from '../../src/iso/storage';

export function useIsoCompetence({ companyId, uid, employee, enabled, family = null, employees = null }) {
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
      // Samme rekkefølge som ISO-skjermen: tilgangsmatrisen speiles før reglene leser den.
      await ensureAccessMirror(companyId, uid, { family, employees });
      const res = await loadIsoState(companyId, { uid });
      if (live) setLoad(res.source === 'empty' ? { status: 'error', state: null } : { status: 'ready', state: res.state });
    })().catch(() => {
      if (live) setLoad({ status: 'error', state: null });
    });
    return () => { live = false; };
  }, [companyId, uid, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    if (load.status !== 'ready' || !employee) return { status: load.status, rows: [] };
    const person = {
      id: employee.id,
      name: displayName(employee),
      uid: employee.personUid || '',
      cv: employee.cv || null,
    };
    return { status: 'ready', rows: competenceForPerson(person, load.state?.records) };
  }, [load, employee]);
}
