import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import {
  approverUidsFor,
  canComment,
  canReadAllComments,
  canSeeComment,
  normalizeSettings,
  shouldNotify,
} from '../../src/doccontrol/model';
import {
  loadAcks,
  loadComments,
  loadControls,
  loadSettings,
  peekDocControl,
  saveAck,
  saveComment,
  saveControl,
  saveSettings,
} from '../../src/doccontrol/store';
import { useEmployees } from '../../src/context/CompanyDataContext';
import { displayName } from '../../src/employees/model';
import { filterHrEmployees } from '../../src/hr/model';
import { notifyUsers } from '../../src/utils/notifications';
import { useFormContext } from '../anbud/useFormContext';

const LEADER_LEVELS = new Set(['avdelingsleder', 'leder', 'administrator']);

/** Dokumentstyringen for selskapet: register, innstillinger, merknader og bekreftelser. */
export function useDocControl() {
  const { familyId, family, actor, company, logo } = useFormContext();
  const { uid } = useApp();
  const access = useCompanyAccess();
  const cached = peekDocControl(familyId);
  const [controls, setControls] = useState(cached?.controls || []);
  const [settings, setSettings] = useState(cached?.settings || normalizeSettings(null));
  const [acks, setAcks] = useState(cached?.acks || []);
  const [comments, setComments] = useState([]);
  const { employees: allEmployees } = useEmployees(familyId);
  const [ready, setReady] = useState(!!cached);

  const isAdmin = !!uid && (family?.ownerUid === uid || family?.ownerId === uid || (family?.adminUids || []).includes(uid));
  const isLeader = isAdmin || access.bypass || LEADER_LEVELS.has(access.levelId);
  const allComments = canReadAllComments(actor, settings, { isAdmin });

  const reload = useCallback(async () => {
    if (!familyId) return;
    const [nextControls, nextSettings, nextAcks] = await Promise.all([
      loadControls(familyId), loadSettings(familyId), loadAcks(familyId),
    ]);
    setControls(nextControls);
    setSettings(nextSettings);
    setAcks(nextAcks);
    const readAll = canReadAllComments(actor, nextSettings, { isAdmin });
    setComments(await loadComments(familyId, { uid: actor.uid, all: readAll }));
    setReady(true);
  }, [familyId, actor, isAdmin]);

  useEffect(() => { reload(); }, [reload]);


  const employees = useMemo(() => filterHrEmployees(allEmployees, 'active'), [allEmployees]);

  /** Personer som kan velges som eier, godkjenner eller leser: ansatte med brukerkonto. */
  const people = useMemo(() => {
    const rows = employees.filter((row) => row.personUid).map((row) => ({ uid: row.personUid, name: displayName(row) }));
    if (actor.uid && !rows.some((row) => row.uid === actor.uid)) rows.unshift({ uid: actor.uid, name: actor.name || 'Meg' });
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  }, [employees, actor]);

  const controlFor = useCallback((key) => controls.find((row) => row.id === key) || null, [controls]);

  const notify = useCallback(async (uids, payload) => {
    if (!uids?.length || !actor.uid) return;
    try {
      await notifyUsers(uids, { ...payload, familyId, createdBy: actor.uid });
    } catch (err) {
      console.warn('doccontrol notify failed', err?.message || err);
    }
  }, [familyId, actor.uid]);

  const storeControl = useCallback(async (next) => {
    const res = await saveControl(familyId, next);
    if (res.ok) setControls((rows) => [res.control, ...rows.filter((row) => row.id !== res.control.id)]);
    return res;
  }, [familyId]);

  /** Varsle godkjennerne om at en revisjon venter. text overstyrer tittel og tekst (flere dokumenter samlet). */
  const notifySubmitted = useCallback((control, revision, text = null) => notify(
    approverUidsFor(control, settings, { adminUids: family?.adminUids?.length ? family.adminUids : [family?.ownerUid || family?.ownerId].filter(Boolean) }).filter((row) => row !== actor.uid),
    {
      eventType: 'documentApproval',
      title: text?.title || `${control.title} venter på godkjenning`,
      body: text?.body || `Rev. ${revision} er sendt av ${actor.name || 'en kollega'}.`,
    },
  ), [notify, settings, family, actor]);

  /** Varsle ansatte om ny versjon når dokumentet har lesekrav og varsel er på. */
  const notifyPublished = useCallback((control, revision) => {
    if (!shouldNotify(control, settings)) return Promise.resolve();
    const uids = employees.map((row) => row.personUid).filter(Boolean);
    const must = control.readRule === 'pakrevd' || control.readRule === 'signeres';
    return notify(uids, {
      eventType: 'documentPublished',
      title: `Ny versjon: ${control.title}`,
      body: must ? `Versjon ${revision} er godkjent. Les og bekreft under Min side.` : `Versjon ${revision} er godkjent.`,
    });
  }, [notify, settings, employees]);

  const updateSettings = useCallback(async (next) => {
    const res = await saveSettings(familyId, next, { actor });
    if (res.ok) setSettings(res.settings);
    return res;
  }, [familyId, actor]);

  const addComment = useCallback(async (comment, control) => {
    const readers = [control?.owner?.uid, control?.approver?.uid].filter(Boolean);
    const res = await saveComment(familyId, comment, { readerUids: readers });
    if (res.ok) {
      setComments((rows) => [res.comment, ...rows.filter((row) => row.id !== res.comment.id)]);
      const tell = [...new Set([...readers, ...settings.commentReaderUids])].filter((row) => row !== actor.uid);
      notify(tell, { eventType: 'documentComment', title: `Merknad til ${control?.title || 'dokument'}`, body: comment.note.slice(0, 140) });
    }
    return res;
  }, [familyId, settings, notify, actor.uid]);

  const updateComment = useCallback(async (comment) => {
    const res = await saveComment(familyId, comment);
    if (res.ok) setComments((rows) => rows.map((row) => (row.id === res.comment.id ? res.comment : row)));
    return res;
  }, [familyId]);

  const acknowledge = useCallback(async (ack) => {
    const res = await saveAck(familyId, ack);
    if (res.ok) setAcks((rows) => [...rows.filter((row) => !(row.docKey === res.ack.docKey && row.uid === res.ack.uid)), res.ack]);
    return res;
  }, [familyId]);

  const visibleComments = useMemo(
    () => comments.filter((row) => canSeeComment(row, actor, settings, { control: controls.find((c) => c.id === row.docKey), isAdmin })),
    [comments, actor, settings, controls, isAdmin],
  );

  return {
    familyId,
    family,
    actor,
    company,
    logo,
    ready,
    controls,
    settings,
    acks,
    employees,
    people,
    comments: visibleComments,
    isAdmin,
    isLeader,
    allComments,
    canComment: canComment(actor, settings, { isLeader }),
    controlFor,
    reload,
    storeControl,
    notifySubmitted,
    notifyPublished,
    updateSettings,
    addComment,
    updateComment,
    acknowledge,
  };
}
