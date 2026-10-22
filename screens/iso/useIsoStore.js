/**
 * Tilstand og lagring for ISO-skjermene.
 * commit() tar resultatet fra en ren domenefunksjon, viser endringen med en gang,
 * lagrer med revisjonslås, skriver revisjonsspor og utfører effekter (oppgaver).
 * Feiler lagringen, rulles visningen tilbake og feilen vises.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, todayKey } from '../../src/iso/core';
import { emptyIsoState, replaceIn } from '../../src/iso/state';
import {
  appendAudit, ensureTask, loadIsoState, peekIsoState, saveEntity, saveMany,
} from '../../src/iso/storage';

export function useIsoStore({ companyId, caps, actor }) {
  const [state, setState] = useState(() => peekIsoState(companyId) || emptyIsoState());
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [loadError, setLoadError] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await loadIsoState(companyId, { uid: actor?.uid, restrictedView: !!caps?.restrictedView });
    setState(res.state);
    setSource(res.source);
    setLoadError(res.error || '');
    setLoading(false);
  }, [companyId, actor?.uid, caps?.restrictedView]);

  useEffect(() => { reload(); }, [reload]);

  const runEffects = useCallback(async (effects) => {
    const roleMap = stateRef.current.system?.roleMap || {};
    for (const e of effects || []) {
      if (!['createTask', 'requestApproval', 'notify'].includes(e.type)) continue;
      const mapped = roleMap[e.roleKey] || Object.values(roleMap).find((r) => r?.label === e.roleLabel) || null;
      await ensureTask(companyId, {
        key: e.key,
        title: e.type === 'requestApproval' ? `Godkjenn: ${e.title}` : e.title,
        description: [e.description, e.roleLabel ? `Ansvarlig rolle: ${e.roleLabel}` : '', 'Opprettet fra ISO / K-HMS.'].filter(Boolean).join('\n'),
        assigneeUid: e.assigneeUid || mapped?.uid || '',
        deadline: e.deadline || (e.dueDays != null ? addDays(todayKey(), e.dueDays) : null),
        createdByUid: actor?.uid || '',
        source: 'iso',
      });
    }
  }, [companyId, actor?.uid]);

  /**
   * kind: findings | processes | instances | documents | forms | submissions | requirements | records | system
   * key:  feltet i resultatet som holder entiteten (finding, process, instance, …)
   */
  const commit = useCallback(async (kind, key, result, { previous = null, effects = [] } = {}) => {
    if (!result?.ok) return result || { ok: false, error: 'Ukjent feil.' };
    const entity = result[key];
    const before = stateRef.current;
    setState((s) => replaceIn(s, kind, entity));
    try {
      await saveEntity(companyId, kind, entity, { previous });
      await appendAudit(companyId, result.events || []);
      await runEffects([...(effects || []), ...(result.effects || [])]);
      return result;
    } catch (err) {
      setState(before);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.' };
    }
  }, [companyId, runEffects]);

  /** Flere lister på en gang (bevis, koblinger, vurderinger). */
  const commitLists = useCallback(async (patch, events = []) => {
    const before = stateRef.current;
    const rows = [];
    for (const kind of ['evidence', 'evidenceLinks', 'assessments']) {
      if (!patch[kind]) continue;
      const old = new Map((before[kind] || []).map((r) => [r.id, r]));
      for (const row of patch[kind]) if (old.get(row.id) !== row) rows.push({ kind, entity: row });
    }
    setState((s) => ({ ...s, ...patch }));
    try {
      await saveMany(companyId, rows);
      await appendAudit(companyId, events);
      return { ok: true };
    } catch (err) {
      setState(before);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.' };
    }
  }, [companyId]);

  return { state, setState, loading, source, loadError, reload, commit, commitLists, runEffects };
}
