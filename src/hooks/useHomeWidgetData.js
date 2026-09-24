import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateKey } from '../utils/dates';
import {
  listenParentTodos, parentTodosOnDate, isParentTaskOpen, isParentTaskOverdue,
  parentTaskVisibleToUser,
} from '../utils/todos';
import { listenAccessibleNotes } from '../utils/familyNotes';
import { listenMeals } from '../utils/meals';
import { listenAccessibleLists, listenListItems, filterListsForProfile, scopeFromList } from '../utils/shoppingLists';
import { useShopFamilyIds } from './useShopFamilyIds';
import {
  summarizeEvents, summarizeTasks, summarizeMeals, summarizeNotes,
  summarizeShopping, buildHomeDigest,
} from '../utils/homeWidgets';

/**
 * Live-sammendrag for desktop-hjem-widgets.
 * Kalenderhendelser kommer fra HomeScreen (allerede lyttet) for å unngå dobbelt-abonnement.
 */
export function useHomeWidgetData({ todayEvents = [], tomorrowEvents = [], enabled = true } = {}) {
  const { familyId, uid, families } = useApp();
  const todayKey = dateKey(new Date());
  const today = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [todayKey]);

  const [parentTodos, setParentTodos] = useState([]);
  const [meals, setMeals] = useState([]);
  const [notes, setNotes] = useState([]);
  const [lists, setLists] = useState([]);
  const [openByList, setOpenByList] = useState({});
  const [openItemSamples, setOpenItemSamples] = useState([]);

  const ids = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  const shopPlatformIds = useShopFamilyIds(families, familyId);

  useEffect(() => {
    if (!enabled || !familyId) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodos(familyId, setParentTodos);
  }, [enabled, familyId]);

  useEffect(() => {
    if (!enabled || !familyId) {
      setMeals([]);
      return undefined;
    }
    return listenMeals(familyId, setMeals);
  }, [enabled, familyId]);

  useEffect(() => {
    if (!enabled || !familyId || !uid) {
      setNotes([]);
      return undefined;
    }
    return listenAccessibleNotes(familyId, uid, {}, setNotes);
  }, [enabled, familyId, uid]);

  useEffect(() => {
    if (!enabled || !uid || !shopPlatformIds.length) {
      setLists([]);
      setOpenByList({});
      setOpenItemSamples([]);
      return undefined;
    }
    let listIds = [];
    const openMap = {};
    const sampleMap = {};
    const itemUnsubs = {};

    const refresh = () => {
      setOpenByList({ ...openMap });
      const samples = [];
      Object.values(sampleMap).forEach((arr) => {
        (arr || []).forEach((it) => {
          if (samples.length < 6) samples.push(it);
        });
      });
      setOpenItemSamples(samples);
    };

    const unsubLists = listenAccessibleLists(shopPlatformIds, uid, {
      platforms: families,
    }, (next) => {
      const visible = filterListsForProfile(next, null).filter((l) => !l.deleted);
      setLists(visible);
      const nextIds = visible.map((l) => l.id).slice(0, 8);
      const nextSet = new Set(nextIds);
      listIds.forEach((id) => {
        if (!nextSet.has(id)) {
          itemUnsubs[id]?.();
          delete itemUnsubs[id];
          delete openMap[id];
          delete sampleMap[id];
        }
      });
      nextIds.forEach((id) => {
        if (itemUnsubs[id]) return;
        const list = visible.find((l) => l.id === id);
        const scope = scopeFromList(list || { id, personal: false, familyId }, { familyId, uid });
        if (!scope) return;
        itemUnsubs[id] = listenListItems(scope, (items) => {
          const open = (items || []).filter((i) => !i.done && !i.deleted);
          openMap[id] = open.length;
          sampleMap[id] = open.slice(0, 3).map((i) => ({
            id: i.id,
            title: i.name || i.title || i.text || 'Vare',
          }));
          refresh();
        });
      });
      listIds = nextIds;
      refresh();
    });

    return () => {
      unsubLists();
      Object.values(itemUnsubs).forEach((u) => u?.());
    };
  }, [enabled, shopPlatformIds, familyId, uid]);

  return useMemo(() => {
    const visibleToday = (parentTodos || [])
      .filter((t) => parentTaskVisibleToUser(t, { uid, ids, asChild: false }))
      .filter((t) => parentTodosOnDate([t], today, today).length > 0);

    const myOpen = visibleToday
      .filter((t) => isParentTaskOpen(t, today))
      .map((t) => ({ ...t, _overdue: isParentTaskOverdue(t, today) }));

    const doneToday = visibleToday.filter((t) => !isParentTaskOpen(t, today)).length;

    const events = summarizeEvents([], { today: todayEvents, tomorrow: tomorrowEvents });
    const tasks = {
      ...summarizeTasks(myOpen),
      doneToday,
      totalToday: myOpen.length + doneToday,
    };
    const mealSum = summarizeMeals(meals, todayKey);
    const noteSum = summarizeNotes(notes);
    const shopping = {
      ...summarizeShopping(lists, openByList),
      openItems: openItemSamples,
    };
    return {
      events,
      tasks,
      meals: mealSum,
      notes: noteSum,
      shopping,
      digest: buildHomeDigest({
        events, tasks, meals: mealSum, notes: noteSum, shopping,
      }),
    };
  }, [
    parentTodos, meals, notes, lists, openByList, openItemSamples,
    todayEvents, tomorrowEvents, today, todayKey, uid, ids,
  ]);
}
