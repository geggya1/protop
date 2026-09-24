const MAX_CROSS_PLATFORM_LISTENERS = 6;
/**
 * Profil-data på tvers av plattformer (familie / idrettslag).
 *
 * Kalender og gjøremål er lagret under families/{id}/…, men samme bruker-/barneprofil
 * skal se «sine» elementer der modulene finnes — ikke bare på aktiv plattform.
 */
import {
  collection, collectionGroup, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isFamilyAudience } from './events';
import { mapTodo } from './todos';
import { parentTaskVisibleToUser } from './parentTaskVisibility';
import { subscribeFamilyCollection } from './sharedCollectionListeners';

export { resolveEventWriteTarget } from './eventWriteTarget';

function toIdSet(ids) {
  if (ids instanceof Set) return ids;
  return new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
}

function platformMeta(platforms, platformId) {
  const p = (platforms || []).find((x) => x.id === platformId);
  if (!p) {
    return { sourcePlatformId: platformId, sourcePlatformName: 'Annen plattform', sourceIsTeam: false };
  }
  const type = String(p.type || 'family').toLowerCase();
  const isTeam = type === 'team' || type === 'club';
  const isClassroom = type === 'class' || type === 'classroom';
  const isFriends = type === 'friends';
  const isCongregation = type === 'congregation';
  const isDaycare = type === 'daycare';
  const isGroup = type === 'group';
  let sourcePlatformName = p.name;
  if (!sourcePlatformName) {
    if (isTeam) sourcePlatformName = 'Idrettslag';
    else if (isClassroom) sourcePlatformName = 'Klasserom';
    else if (isFriends) sourcePlatformName = 'Vennegjeng';
    else if (isCongregation) sourcePlatformName = 'Forsamling';
    else if (isDaycare) sourcePlatformName = 'Barnehage / SFO';
    else if (isGroup) sourcePlatformName = 'Gruppe';
    else sourcePlatformName = 'Familie';
  }
  return {
    sourcePlatformId: platformId,
    sourcePlatformName,
    sourceIsTeam: isTeam,
    sourceIsClassroom: isClassroom,
  };
}

/**
 * Hendelse knyttet til profilen (ikke hele fremmede familier).
 * På annen plattform viser vi kun det som direkte involverer deg.
 */
export function eventLinkedToProfile(ev, viewerIds) {
  if (!ev) return false;
  const set = toIdSet(viewerIds);
  if (!set.size) return false;

  const memberIds = Array.isArray(ev.memberIds) ? ev.memberIds.filter(Boolean) : [];
  const childIds = Array.isArray(ev.childIds) ? ev.childIds.filter(Boolean) : [];

  if (memberIds.some((id) => set.has(id))) return true;
  if (childIds.some((id) => set.has(id))) return true;

  // Personlig hendelse du opprettet (ikke «hele familien»)
  if (ev.createdBy && set.has(ev.createdBy) && !isFamilyAudience(ev)) {
    return true;
  }

  return false;
}

/** Oppgave knyttet til profilen på annen plattform (ikke hele familie-assignee). */
export function parentTodoLinkedToProfile(task, { uid, ids, asChild = false } = {}) {
  if (!task || task.deleted || task.active === false) return false;
  const assignee = task.assignedTo || null;
  if (assignee === 'family' || task.audience === 'family') return false;
  return parentTaskVisibleToUser(task, { uid, ids, asChild });
}

/**
 * Lytt på events i flere plattformer. Lokal plattform returneres fullt;
 * andre plattformer filtreres til profil-koblede hendelser.
 */
export function listenEventsAcrossPlatforms({
  platformIds,
  activePlatformId,
  viewerIds,
  platforms = [],
  onChange,
}) {
  const ids = [...new Set((platformIds || []).filter(Boolean))].slice(0, MAX_CROSS_PLATFORM_LISTENERS);
  if (!ids.length) {
    onChange([]);
    return () => {};
  }

  const byPlatform = new Map();
  const unsubs = ids.map((pid) => {
    byPlatform.set(pid, []);
    // Shared listener hub — home / greeting / plan reuse the same stream per family.
    return subscribeFamilyCollection(
      pid,
      'events',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (rawDocs) => {
        const meta = platformMeta(platforms, pid);
        const isActive = pid === activePlatformId;
        const raw = (rawDocs || []).filter((ev) => ev.deleted !== true && ev.active !== false);
        const filtered = isActive
          ? raw
          : raw.filter((ev) => eventLinkedToProfile(ev, viewerIds));
        byPlatform.set(
          pid,
          filtered.map((ev) => ({
            ...ev,
            // Stabil nøkkel på tvers av plattformer
            id: isActive ? ev.id : `xp:${pid}:${ev.id}`,
            sourceEventId: ev.id,
            crossPlatform: !isActive,
            // Kun eksterne kalendere er read-only. ProTop-hendelser fra annen
            // familie skal kunne redigeres/slettes (skrives tilbake til familyId).
            readOnly: !!ev.readOnly,
            private: !isActive ? true : !!ev.private,
            sourceLabel: !isActive ? meta.sourcePlatformName : ev.sourceLabel,
            ...(!isActive ? meta : {}),
            // Behold original familyId for navigasjon/skriving
            familyId: pid,
          })),
        );
        emit();
      },
    );
  });

  function emit() {
    const merged = [];
    byPlatform.forEach((list) => merged.push(...list));
    onChange(merged);
  }

  return () => unsubs.forEach((u) => u && u());
}

/**
 * Foreldre-/familieoppgaver på tvers: aktiv plattform fullt (kallesiden filtrerer),
 * andre plattformer kun profil-koblede.
 */
export function listenParentTodosAcrossPlatforms({
  platformIds,
  activePlatformId,
  uid,
  viewerIds,
  asChild = false,
  platforms = [],
  includeDeleted = false,
  onChange,
}) {
  const ids = [...new Set((platformIds || []).filter(Boolean))].slice(0, MAX_CROSS_PLATFORM_LISTENERS);
  if (!ids.length) {
    onChange([]);
    return () => {};
  }

  const byPlatform = new Map();
  const unsubs = ids.map((pid) => {
    byPlatform.set(pid, []);
    return subscribeFamilyCollection(
      pid,
      'parentTodos',
      (snap) => snap.docs.map(mapTodo),
      (rawDocs) => {
        const meta = platformMeta(platforms, pid);
        const isActive = pid === activePlatformId;
        const raw = (rawDocs || []).filter((t) => {
          if (t.active === false) return false;
          if (t.deleted && !includeDeleted) return false;
          return true;
        });
        const filtered = isActive
          ? raw
          : raw.filter((t) => parentTodoLinkedToProfile(t, {
            uid,
            ids: viewerIds,
            asChild,
          }));
        byPlatform.set(
          pid,
          filtered.map((t) => ({
            ...t,
            id: isActive ? t.id : `xp:${pid}:${t.id}`,
            sourceTodoId: t.id,
            crossPlatform: !isActive,
            familyId: pid,
            sourceLabel: !isActive ? meta.sourcePlatformName : undefined,
            ...(!isActive ? meta : {}),
          })),
        );
        emit();
      },
    );
  });

  function emit() {
    const merged = [];
    byPlatform.forEach((list) => merged.push(...list));
    onChange(merged);
  }

  return () => unsubs.forEach((u) => u && u());
}

/**
 * Finn barneprofiler med samme uid på tvers av plattformer, lytt på todos.
 * Aktiv (familyId, childId) inkluderes alltid.
 */
export function listenChildTodosAcrossPlatforms({
  childUid,
  activeFamilyId,
  activeChildId,
  platforms = [],
  onChange,
}) {
  if (!activeFamilyId || !activeChildId) {
    onChange([]);
    return () => {};
  }

  let discoveryUnsub = () => {};
  let todoUnsubs = [];
  const buckets = new Map();

  const clearTodoUnsubs = () => {
    todoUnsubs.forEach((u) => u && u());
    todoUnsubs = [];
  };

  const emit = () => {
    const merged = [];
    buckets.forEach((list) => merged.push(...list));
    onChange(merged);
  };

  const bindTodoListeners = (targets) => {
    clearTodoUnsubs();
    buckets.clear();
    const unique = [];
    const seen = new Set();
    targets.forEach((t) => {
      const key = `${t.familyId}:${t.childId}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(t);
    });

    unique.forEach(({ familyId, childId }) => {
      const key = `${familyId}:${childId}`;
      buckets.set(key, []);
      const isActive = familyId === activeFamilyId && childId === activeChildId;
      const meta = platformMeta(platforms, familyId);
      const unsub = onSnapshot(
        collection(db, 'families', familyId, 'children', childId, 'todos'),
        (snap) => {
          const items = snap.docs.map(mapTodo).filter((t) => !t.deleted && t.active);
          buckets.set(
            key,
            items.map((t) => ({
              ...t,
              id: isActive ? t.id : `xp:${familyId}:${childId}:${t.id}`,
              sourceTodoId: t.id,
              crossPlatform: !isActive,
              familyId,
              childId,
              sourceLabel: !isActive ? meta.sourcePlatformName : undefined,
              ...(!isActive ? meta : {}),
            })),
          );
          emit();
        },
        () => {
          buckets.set(key, []);
          emit();
        },
      );
      todoUnsubs.push(unsub);
    });
  };

  // Alltid aktiv lokal profil
  const baseTargets = [{ familyId: activeFamilyId, childId: activeChildId }];

  if (!childUid) {
    bindTodoListeners(baseTargets);
    return () => clearTodoUnsubs();
  }

  // Oppdag samme uid på andre plattformer
  try {
    discoveryUnsub = onSnapshot(
      query(collectionGroup(db, 'children'), where('uid', '==', childUid)),
      (snap) => {
        const targets = [...baseTargets];
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.deleted === true || data.active === false) return;
          const path = d.ref.path; // families/{fid}/children/{cid} or top-level children/{id}
          const parts = path.split('/');
          if (parts[0] === 'families' && parts[2] === 'children') {
            targets.push({ familyId: parts[1], childId: parts[3] || d.id });
          } else if (data.familyId) {
            targets.push({ familyId: data.familyId, childId: d.id });
          }
        });
        bindTodoListeners(targets);
      },
      () => bindTodoListeners(baseTargets),
    );
  } catch {
    bindTodoListeners(baseTargets);
  }

  return () => {
    discoveryUnsub();
    clearTodoUnsubs();
  };
}

/** Plattform-ider brukeren kan lese (fra AppContext.families). */
export function platformIdsFromFamilies(families) {
  return (families || [])
    .filter((f) => f?.id && f.deleted !== true && f.archived !== true && f.active !== false)
    .map((f) => f.id);
}
