/**
 * Tilstand og lagring for ISO-skjermene.
 * commit() tar resultatet fra en ren domenefunksjon, viser endringen med en gang,
 * lagrer med revisjonslås, skriver revisjonsspor og utfører effekter (oppgaver i ProTop).
 * Feiler lagringen, rulles visningen tilbake og feilen vises.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { checksum } from '../../src/iso/core';
import { emptyIsoState, replaceIn } from '../../src/iso/state';
import {
  appendAudit, appendReadAck, ensureAccessMirror, loadIsoState, loadIsoTasks, peekIsoState, saveEntity, saveMany,
} from '../../src/iso/storage';
import { renumberEffects, runIsoEffects, safeEffects } from './isoEffects';

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
    const created = await runIsoEffects(companyId, effects, { actor, roleMap: stateRef.current.system?.roleMap || {} });
    if (created) refreshTasks();
    return created;
  }, [companyId, actor, refreshTasks]);

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
      const saved = await saveEntity(companyId, kind, entity, { previous, createOnly });
      let final = entity;
      let events = result.events || [];
      let todo = [...(effects || []), ...(result.effects || [])];
      // Ny sak: nummeret tildeles mot telleren i samme transaksjon. Vis og bruk det som ble lagret.
      if (kind === 'findings' && saved?.number && saved.number !== entity.number) {
        final = { ...entity, number: saved.number };
        todo = renumberEffects(todo, entity.number, saved.number);
        events = events.map((e) => (e.entityId === final.id && e.afterHash ? { ...e, afterHash: checksum(final) } : e));
        const renumbered = replaceIn(stateRef.current, kind, final);
        stateRef.current = renumbered;
        setState(renumbered);
      }
      const restricted = kind === 'findings' && (!!entity?.restricted || !!previous?.restricted);
      await appendAudit(companyId, events, { restricted });
      await runEffects(safeEffects(todo, kind === 'findings' ? final : null));
      return final === entity ? result : { ...result, [key]: final, events };
    } catch (err) {
      stateRef.current = before;
      setState(before);
      // Lagret et annet sted i mellomtiden: revisjonslåsen, eller Firestore som har gitt opp etter flere forsøk.
      const conflict = ['iso/conflict', 'failed-precondition', 'aborted'].includes(err?.code);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.', conflict };
    }
  }, [companyId, runEffects]);

  /**
   * Lesebekreftelse (result fra acknowledgeRead). Lagres mot listen slik den står i skyen,
   * uten revisjonslås, og kvitteringer andre har gjort i mellomtiden tas med.
   */
  const commitReadAck = useCallback(async (result) => {
    if (!result?.ok) return result || { ok: false, error: 'Ukjent feil.' };
    if (!result.ack) return result;
    const before = stateRef.current;
    const optimistic = replaceIn(before, 'documents', result.document);
    stateRef.current = optimistic;
    setState(optimistic);
    try {
      const acks = await appendReadAck(companyId, result.document.id, result.ack);
      const current = (stateRef.current.documents || []).find((d) => d.id === result.document.id) || result.document;
      const next = replaceIn(stateRef.current, 'documents', { ...current, readAcks: acks });
      stateRef.current = next;
      setState(next);
      await appendAudit(companyId, result.events || []);
      return result;
    } catch (err) {
      stateRef.current = before;
      setState(before);
      return { ok: false, error: err?.message || 'Kunne ikke lagre.' };
    }
  }, [companyId]);

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
  const commitMany = useCallback(async (rows, events = [], { onProgress = null } = {}) => {
    const list = (rows || []).filter((r) => r?.entity?.id || r?.kind === 'system');
    if (!list.length) return { ok: true };
    const before = stateRef.current;
    let next = before;
    for (const { kind, entity } of list) next = replaceIn(next, kind, entity);
    stateRef.current = next;
    setState(next);
    const toSave = list.filter((r) => r.kind !== 'system');
    try {
      await saveMany(companyId, toSave, { onProgress });
      await appendAudit(companyId, events);
      return { ok: true };
    } catch (err) {
      // Batcher som ble lagret før feilen, står i Firestore og må også stå her.
      // Ellers lager en ny kjøring av importen dem en gang til.
      const committed = Math.min(Number(err?.committed) || 0, toSave.length);
      let keep = before;
      const saved = toSave.slice(0, committed);
      for (const { kind, entity } of saved) keep = replaceIn(keep, kind, entity);
      stateRef.current = keep;
      setState(keep);
      if (saved.length) {
        const ids = new Set(saved.map((r) => r.entity.id));
        await appendAudit(companyId, events.filter((e) => ids.has(e.entityId)));
      }
      return { ok: false, error: err?.message || 'Kunne ikke lagre.', committed, total: toSave.length };
    }
  }, [companyId]);

  return {
    state, setState, loading, source, loadError, reload, commit, commitLists, commitMany, commitReadAck, runEffects, tasks, refreshTasks, serverIso,
    current: () => stateRef.current,
  };
}
