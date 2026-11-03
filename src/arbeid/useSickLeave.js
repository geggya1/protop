/**
 * Felles tilstand for sykefravær: regler, saker og vedtak for selskapet.
 * Leder/HR får alle saker (krever speilet tilgang), ansatte bare egne.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureAccessMirror } from '../iso/storage.js';
import {
  loadSickCases,
  loadSickRules,
  removeSickCase,
  rulesWithDenials,
  saveSickCase,
  sickCaseId,
} from './sickStorage.js';
import { normalizeSickCase } from './sickLeave.js';

export function useSickLeave(companyId, { uid = '', manager = false, family = null, employees = null } = {}) {
  const [rules, setRules] = useState(() => rulesWithDenials({}, []));
  const [cases, setCases] = useState([]);
  const [denials, setDenials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = String(companyId || '').trim();
    if (!id || !uid) return undefined;
    let live = true;
    setLoading(true);
    (async () => {
      if (manager) {
        // Reglene for sickCases leser speilet tilgang (hr / hoursOthers).
        await ensureAccessMirror(id, uid, { family, employees }).catch(() => null);
      }
      const [loadedRules, loaded] = await Promise.all([
        loadSickRules(id),
        loadSickCases(id, { uid, manager }),
      ]);
      if (!live) return;
      setDenials(loaded.denials);
      setRules(rulesWithDenials(loadedRules, loaded.denials));
      setCases(loaded.cases);
      setError(loaded.error);
      setLoading(false);
    })();
    return () => { live = false; };
    // employees/family brukes bare som reserve for eierens egen synk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, uid, manager, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const save = useCallback(async (input, { actor = '', action = '' } = {}) => {
    const now = new Date().toISOString();
    const prev = cases.find((row) => row.id === input.id);
    const history = [...(prev?.history || []), ...(action ? [{ at: now, by: actor, action }] : [])];
    const row = normalizeSickCase({
      ...prev,
      ...input,
      id: input.id || sickCaseId(),
      createdAt: prev?.createdAt || now,
      createdByUid: prev?.createdByUid || uid,
      history,
    });
    const saved = await saveSickCase(companyId, row);
    setCases((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
    return saved;
  }, [cases, companyId, uid]);

  const remove = useCallback(async (caseId) => {
    await removeSickCase(companyId, caseId);
    setCases((list) => list.filter((item) => item.id !== caseId));
  }, [companyId]);

  const byEmployee = useMemo(() => {
    const map = new Map();
    for (const row of cases) {
      const list = map.get(row.employeeId) || [];
      list.push(row);
      map.set(row.employeeId, list);
    }
    return map;
  }, [cases]);

  return { rules, setRules, cases, denials, setDenials, byEmployee, loading, error, reload, save, remove };
}
