import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { addDays, dateKey } from '../utils/dates';
import { eventOccursOnDate, eventVisibleToUser } from '../utils/events';
import {
  listenChildTodosAcrossPlatforms,
  listenEventsAcrossPlatforms,
  listenParentTodosAcrossPlatforms,
  platformIdsFromFamilies,
} from '../utils/crossPlatformData';
import {
  isDoneOn,
  isParentTaskOpen,
  parentTodosOnDate,
  todosOnDate,
} from '../utils/todos';
import { parentTaskVisibleToUser } from '../utils/parentTaskVisibility';
import { eventTimeLabel } from '../utils/homeWidgets';
import { mergeDeskDayEvents, upcomingDayEvents } from '../utils/deskHome';
import { isCalendarLayerHidden } from '../utils/timeGrid';
import { useNow } from './useNow';
import { loadExternalCalendarEventsForDeskHome } from './useDeskHomeExternalEvents';

/** Under denne andelen anses gårsdagen som «mindre enn ønskelig». */
export const YESTERDAY_GOOD_RATIO = 0.7;

function dayProgress(tasks, day) {
  const key = dateKey(day);
  const list = todosOnDate(tasks, day);
  const done = list.filter((t) => isDoneOn(t, key)).length;
  const total = list.length;
  const remaining = Math.max(0, total - done);
  const ratio = total > 0 ? done / total : null;
  return { done, total, remaining, ratio, items: list };
}

function parentDayProgress(tasks, day, { uid, ids }) {
  const key = dateKey(day);
  const visible = (tasks || []).filter((t) => parentTaskVisibleToUser(t, {
    uid, ids, asChild: false,
  }));
  const onDay = parentTodosOnDate(visible, day, day);
  const open = onDay.filter((t) => isParentTaskOpen(t, key));
  const done = onDay.filter((t) => !isParentTaskOpen(t, key)).length;
  const total = onDay.length;
  const remaining = open.length;
  const ratio = total > 0 ? done / total : null;
  return {
    done,
    total,
    remaining,
    ratio,
    items: onDay,
    openItems: open,
  };
}

/**
 * Dagens status + gårsdagens progresjon for morgen-/kveldshilsen.
 */
export function useGreetingDayStatus({ enabled = true } = {}) {
  const {
    familyId, families, uid, isChild, isActingAsChild, activeChild, meChild, kids,
    childProfile, activeChildId,
  } = useApp();

  const childRecord = isActingAsChild
    ? activeChild
    : (isChild ? (meChild || childProfile) : null);
  const asChild = isChild || isActingAsChild;
  const resolvedChildId = childRecord?.id
    || (isChild ? activeChildId : null)
    || activeChild?.id
    || null;

  const now = useNow();
  const today = now;
  const yesterday = useMemo(() => addDays(now, -1), [dateKey(now)]);
  const todayKey = dateKey(now);

  const [childTodos, setChildTodos] = useState([]);
  const [parentTodos, setParentTodos] = useState([]);
  const [events, setEvents] = useState([]);
  const [kidsTodosById, setKidsTodosById] = useState({});

  const childId = resolvedChildId;
  const childUid = childRecord?.uid || uid || childRecord?.id || childRecord?.childId;

  const viewerIds = useMemo(() => {
    const set = new Set([uid].filter(Boolean));
    if (asChild) {
      [childUid, childId, childRecord?.childId, childRecord?.docId]
        .filter(Boolean)
        .forEach((id) => set.add(id));
    }
    return set;
  }, [uid, asChild, childUid, childId, childRecord]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  const ids = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  const [externalEvents, setExternalEvents] = useState([]);
  const [hiddenCals, setHiddenCals] = useState(() => new Set());

  useEffect(() => {
    if (asChild) {
      setExternalEvents([]);
      return undefined;
    }
    return loadExternalCalendarEventsForDeskHome({
      enabled: enabled && !!uid,
      uid,
      todayKey,
      onHiddenCals: setHiddenCals,
      onEvents: setExternalEvents,
    });
  }, [enabled, uid, todayKey, asChild]);

  const visibleExternalEvents = useMemo(
    () => (externalEvents || []).filter(
      (e) => !isCalendarLayerHidden(e, hiddenCals, familyId),
    ),
    [externalEvents, hiddenCals, familyId],
  );

  // Events
  useEffect(() => {
    if (!enabled || !familyId) {
      setEvents([]);
      return undefined;
    }
    return listenEventsAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      viewerIds,
      platforms: families,
      onChange: setEvents,
    });
  }, [enabled, familyId, platformIds, viewerIds, families]);

  // Child todos (logged-in child or parent viewing as child)
  useEffect(() => {
    if (!enabled || !asChild || !familyId || !resolvedChildId) {
      setChildTodos([]);
      return undefined;
    }
    return listenChildTodosAcrossPlatforms({
      childUid: childRecord?.uid || childUid || null,
      activeFamilyId: familyId,
      activeChildId: resolvedChildId,
      platforms: families,
      onChange: setChildTodos,
    });
  }, [enabled, asChild, familyId, resolvedChildId, childRecord?.uid, childUid, families]);

  // Parent todos
  useEffect(() => {
    if (!enabled || asChild || !familyId || !uid) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodosAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      uid,
      viewerIds: ids,
      platforms: families,
      onChange: setParentTodos,
    });
  }, [enabled, asChild, familyId, uid, ids, platformIds, families]);

  // Parent morning: also load kids' chores for yesterday/today family overview
  const activeKids = useMemo(
    () => (asChild ? [] : (kids || []).filter((k) => k.active !== false && k.id)),
    [asChild, kids],
  );

  useEffect(() => {
    if (!enabled || asChild || !familyId || !activeKids.length) {
      setKidsTodosById({});
      return undefined;
    }
    const unsubs = activeKids.slice(0, 6).map((kid) => listenChildTodosAcrossPlatforms({
      childUid: kid.uid || null,
      activeFamilyId: familyId,
      activeChildId: kid.id,
      platforms: families,
      onChange: (todos) => {
        setKidsTodosById((prev) => ({ ...prev, [kid.id]: todos }));
      },
    }));
    return () => unsubs.forEach((u) => u?.());
  }, [enabled, asChild, familyId, activeKids, families]);

  return useMemo(() => {
    const familyTodayEvents = (events || [])
      .filter((e) => eventOccursOnDate(e, today))
      .filter((e) => (
        asChild
          ? (e.crossPlatform
            ? true
            : eventVisibleToUser(e, [childUid, childId, childRecord?.childId], {
              asChild: true,
            }))
          : eventVisibleToUser(e, [uid])
      ));

    const todayEvents = mergeDeskDayEvents(familyTodayEvents, visibleExternalEvents, today);

    const familyYesterdayEvents = (events || [])
      .filter((e) => eventOccursOnDate(e, yesterday))
      .filter((e) => (
        asChild
          ? eventVisibleToUser(e, [childUid, childId], { asChild: true })
          : eventVisibleToUser(e, [uid])
      ));

    const yesterdayEvents = mergeDeskDayEvents(familyYesterdayEvents, visibleExternalEvents, yesterday);

    let chores = { done: 0, total: 0, remaining: 0, ratio: null, items: [] };
    let tasks = { done: 0, total: 0, remaining: 0, ratio: null, items: [], openItems: [] };
    let yesterdayChores = { done: 0, total: 0, remaining: 0, ratio: null, items: [] };
    let yesterdayTasks = { done: 0, total: 0, remaining: 0, ratio: null, items: [] };

    if (asChild) {
      chores = dayProgress(childTodos, today);
      yesterdayChores = dayProgress(childTodos, yesterday);
    } else {
      tasks = parentDayProgress(parentTodos, today, { uid, ids });
      yesterdayTasks = parentDayProgress(parentTodos, yesterday, { uid, ids });

      // Aggregate kids' chores for parent overview
      let kidDone = 0;
      let kidTotal = 0;
      let kidYDone = 0;
      let kidYTotal = 0;
      const kidNames = [];
      activeKids.forEach((kid) => {
        const todos = kidsTodosById[kid.id] || [];
        const todayP = dayProgress(todos, today);
        const yP = dayProgress(todos, yesterday);
        kidDone += todayP.done;
        kidTotal += todayP.total;
        kidYDone += yP.done;
        kidYTotal += yP.total;
        if (todayP.total > 0 || yP.total > 0) {
          kidNames.push({
            id: kid.id,
            name: (kid.name || 'Barn').split(' ')[0],
            todayDone: todayP.done,
            todayTotal: todayP.total,
            yesterdayDone: yP.done,
            yesterdayTotal: yP.total,
          });
        }
      });
      chores = {
        done: kidDone,
        total: kidTotal,
        remaining: Math.max(0, kidTotal - kidDone),
        ratio: kidTotal > 0 ? kidDone / kidTotal : null,
        items: [],
        byKid: kidNames,
      };
      yesterdayChores = {
        done: kidYDone,
        total: kidYTotal,
        remaining: Math.max(0, kidYTotal - kidYDone),
        ratio: kidYTotal > 0 ? kidYDone / kidYTotal : null,
        items: [],
        byKid: kidNames,
      };
    }

    const yDone = asChild
      ? (yesterdayChores.done || 0)
      : (yesterdayTasks.done || 0);
    const yTotal = asChild
      ? (yesterdayChores.total || 0)
      : (yesterdayTasks.total || 0);
    const yRatio = yTotal > 0 ? yDone / yTotal : null;
    const yesterdayWeak = yRatio != null && yRatio < YESTERDAY_GOOD_RATIO;
    const yesterdayStrong = yRatio != null && yRatio >= YESTERDAY_GOOD_RATIO;

    return {
      asChild,
      todayKey,
      todayEvents,
      yesterdayEvents,
      chores,
      tasks,
      yesterdayChores,
      yesterdayTasks,
      yesterday: {
        done: yDone,
        total: yTotal,
        ratio: yRatio,
        weak: yesterdayWeak,
        strong: yesterdayStrong,
        eventCount: yesterdayEvents.length,
      },
      loading: false,
      peekEvents: upcomingDayEvents(todayEvents, now, 3).map((ev) => ({
        id: ev.id,
        time: eventTimeLabel(ev),
        title: ev.title || 'Hendelse',
      })),
    };
  }, [
    events, visibleExternalEvents, childTodos, parentTodos, kidsTodosById, activeKids,
    now, yesterday, todayKey, asChild, uid, ids, childUid, childId, childRecord, today,
  ]);
}
