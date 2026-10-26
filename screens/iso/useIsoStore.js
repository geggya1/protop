/**
 * Tilstand og lagring for ISO-skjermene.
 * commit() tar resultatet fra en ren domenefunksjon, viser endringen med en gang,
 * lagrer med revisjonslås, skriver revisjonsspor og utfører effekter (oppgaver i ProTop).
 * Feiler lagringen, rulles visningen tilbake og feilen vises.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, todayKey } from '../../src/iso/core';
import { emptyIsoState, replaceIn } from '../../src/iso/state';
import {
  appendAudit, completeIsoTask, ensureAccessMirror, ensureTask, loadIsoState, loadIsoTasks, peekIsoState, saveEntity, saveMany,
} from '../../src/iso/storage';

/** Oppgaver fra skjermede saker får ingen detaljer i Oppgaver (som alle i selskapet kan se). */
function safeEffects(effects, entity) {
  if (!entity?.restricted) return effects;
  return (effects || []).map((e) => (e.type === 'createTask' || e.type === 'requestApproval' || e.type === 'notify'
    ? { ...e, title: `Skjermet sak ${entity.number || ''}: åpne ISO → Avvik`.replace('  ', ' '), description: 'Detaljer vises bare i ISO for dem som har tilgang til saken.' }
    : e));
}

export function useIsoStore({ companyId, actor, family = null, employees = null, ready = true }) {
  const [state, setState] = useState(() => peekIsoState(companyId, actor?.uid) || emptyIsoState());
  const [serverIso, setServerIso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [loadError, setLoadError] = useState('');
  const [tasks, setTasks] = useState({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshTasks = useCallback(async () => {
    if (!companyId) return;
    setTasks(await loadIsoTasks(companyId));
  }, [companyId]);

  const reload = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    if (!ready) return;
    setLoading(true);
    // Tilgangsmatrisen speiles til serveren før lesing; reglene leser den.
    const mirror = await ensureAccessMirror(companyId, actor?.uid, { family, employees });
    setServerIso(mirror.fresh ? mirror.iso : 0);
    const res = await loadIsoState(companyId, { uid: actor?.uid });
    setState(res.state);
    setSource(res.source);
    setLoadError(res.error || '');
    setLoading(false);
    refreshTasks();
  }, [companyId, actor?.uid, ready, refreshTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const runEffects = useCallback(async (effects) => {
    const roleMap = stateRef.current.system?.roleMap || {};
    let created = 0;
    for (const e of effects || []) {
      if (e.type === 'completeTask') {
        await completeIsoTask(companyId, e.key);
        continue;
      }
      if (!['createTask', 'requestApproval', 'notify'].includes(e.type)) continue;
      const mapped = roleMap[e.roleKey] || Object.values(roleMap).find((r) => r?.label && r.label === e.roleLabel) || null;
      const id = await ensureTask(companyId, {
        key: e.key,
        title: e.type === 'requestApproval' ? `Godkjenn: ${e.title}` : e.title,
        description: [e.description, e.roleLabel ? `Ansvarlig rolle: ${e.roleLabel}` : '', 'Opprettet fra ISO / K-HMS.'].filter(Boolean).join('\n'),
        assigneeUid: e.assigneeUid || mapped?.uid || '',
        deadline: e.deadline || (e.dueDays != null ? addDays(todayKey(), e.dueDays) : null),
        createdByUid: actor?.uid || '',
        source: 'iso',
      });
      if (id) created += 1;
    }
    if (created) refreshTasks();
    return created;
  }, [companyId, actor?.uid, refreshTasks]);

  /**
   * kind: findings | processes | instances | documents | forms | submissions | requirements | records | system
   * key:  feltet i resultatet som holder entiteten (finding, process, instance, …)
   */
  const commit = useCallback(async (kind, key, result, { previous = null, effects = [], createOnly = false } = {}) => {
    if (!result?.ok) return result || { ok: false, error: 'Ukjent feil.' };
    const entity = result[key];
    const before = stateRef.current;
    const next = replaceIn(stateRef.current, kind, entity);
    stateRef.current = next;
    setState(next);
    try {
      await saveEntity(companyId, kind, entity, { previous, createOnly });
      const restricted = kind === 'findings' && (!!entity?.restricted || !!previous?.restricted);
      await appendAudit(companyId, result.events || [], { restricted });
      await runEffects(safeEffects([...(effects || []), ...(result.effects || [])], kind === 'findings' ? entity : null));
      return result;
    } catch (err) {
      stateRef.current = before;
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
    const next = { ...before, ...patch };
    stateRef.current = next;
    setState(next);
    try {
      await saveMany(companyId, rows);
      await appendAudit(companyId, events);
      return { ok: true };
    } catch (err) {
      stateRef.current = before;
      setState(before);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.' };
    }
  }, [companyId]);

  /**
   * Mange entiteter på en gang (import). rows: [{ kind, entity }] der kind er documents | processes | records | requirements …
   * Vises med en gang, lagres i batcher (uten revisjonslås – bare for nye poster og importens egne oppdateringer).
   */
  const commitMany = useCallback(async (rows, events = []) => {
    const list = (rows || []).filter((r) => r?.entity?.id || r?.kind === 'system');
    if (!list.length) return { ok: true };
    const before = stateRef.current;
    let next = before;
    for (const { kind, entity } of list) next = replaceIn(next, kind, entity);
    stateRef.current = next;
    setState(next);
    try {
      await saveMany(companyId, list.filter((r) => r.kind !== 'system'));
      for (let i = 0; i < events.length; i += 400) await appendAudit(companyId, events.slice(i, i + 400));
      return { ok: true };
    } catch (err) {
      stateRef.current = before;
      setState(before);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.' };
    }
  }, [companyId]);

  return {
    state, setState, loading, source, loadError, reload, commit, commitLists, commitMany, runEffects, tasks, refreshTasks, serverIso,
    current: () => stateRef.current,
  };
}
