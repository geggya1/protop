import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateKey } from '../utils/dates';
import { eventOccursOnDate, eventInvolvesMember } from '../utils/events';
import {
  listenChildTodos, listenParentTodos, todosOnDate, isDoneOn,
  isLekserTodo, lekserInWeek, parentTodosOnDate, isParentTaskOpen,
  parentTaskVisibleToUser,
} from '../utils/todos';
import {
  listenChildHomework, isHomeworkDone, mergeLekserForWeek,
} from '../utils/homework';
import { listenAccessibleLists, listenListItems, filterListsForProfile, scopeFromList } from '../utils/shoppingLists';
import { useShopFamilyIds } from './useShopFamilyIds';
import { listenMeals } from '../utils/meals';

function memberIdSet({ uid, viewingChild }) {
  // «Vis som barn»: kun barnets id-er — ellers matcher foresattes egne kalenderhendelser.
  if (viewingChild) {
    const ids = new Set();
    [viewingChild.uid, viewingChild.id, viewingChild.childId].filter(Boolean).forEach((id) => ids.add(id));
    return ids;
  }
  return new Set([uid].filter(Boolean));
}

/**
 * Live-tall for modulikoner: åpne oppgaver i dag, hendelser i dag, handleliste, osv.
 * Fungerer uten inbox/push (Firestore-data direkte).
 */
export function useModuleActivity() {
  const {
    familyId, uid, isChild, isActingAsChild, meChild, activeChild, isParent, kids, members, families,
  } = useApp();
  const viewingChild = isActingAsChild ? activeChild : (isChild ? meChild : null);
  const asChild = !!viewingChild;
  const childId = viewingChild?.id || null;
  const profileChildId = asChild ? childId : null;

  const [childTodos, setChildTodos] = useState([]);
  const [childHomework, setChildHomework] = useState([]);
  const [parentTodos, setParentTodos] = useState([]);
  const [events, setEvents] = useState([]);
  const [shopOpen, setShopOpen] = useState(0);
  const [mealsToday, setMealsToday] = useState(0);
  const [allKidsLekser, setAllKidsLekser] = useState(0);

  // Alltid fersk kalenderdag (ikke frys ved mount — badge for forfalte oppgaver må følge midnatt).
  const todayKey = dateKey(new Date());
  const today = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [todayKey]);
  const ids = useMemo(() => memberIdSet({ uid, viewingChild }), [uid, viewingChild]);

  const shopPlatformIds = useShopFamilyIds(families, familyId);

  useEffect(() => {
    if (!familyId || !childId) {
      setChildTodos([]);
      return undefined;
    }
    return listenChildTodos(familyId, childId, setChildTodos);
  }, [familyId, childId]);

  useEffect(() => {
    if (!familyId || !childId) {
      setChildHomework([]);
      return undefined;
    }
    return listenChildHomework(familyId, childId, setChildHomework);
  }, [familyId, childId]);

  useEffect(() => {
    if (!familyId) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodos(familyId, setParentTodos);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setEvents([]);
      return undefined;
    }
    // Shared with HomeScreen / greeting via subscribeFamilyCollection hub.
    // eslint-disable-next-line global-require
    const { subscribeFamilyCollection } = require('../utils/sharedCollectionListeners');
    return subscribeFamilyCollection(
      familyId,
      'events',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (items) => setEvents(items || []),
    );
  }, [familyId]);

  useEffect(() => {
    if (!uid || !shopPlatformIds.length) {
      setShopOpen(0);
      return undefined;
    }
    let listIds = [];
    const openByList = {};
    const itemUnsubs = {};

    const refresh = () => {
      setShopOpen(Object.values(openByList).reduce((sum, n) => sum + n, 0));
    };

    const unsubLists = listenAccessibleLists(shopPlatformIds, uid, {
      platforms: families,
      skipPersonal: asChild,
    }, (lists) => {
      const visible = filterListsForProfile(lists, profileChildId);
      const nextIds = visible.map((l) => l.id).slice(0, 12);
      const nextSet = new Set(nextIds);
      listIds.forEach((id) => {
        if (!nextSet.has(id)) {
          itemUnsubs[id]?.();
          delete itemUnsubs[id];
          delete openByList[id];
        }
      });
      nextIds.forEach((id) => {
        if (itemUnsubs[id]) return;
        const list = visible.find((l) => l.id === id);
        const scope = scopeFromList(list || { id, personal: false, familyId }, { familyId, uid });
        if (!scope) return;
        itemUnsubs[id] = listenListItems(scope, (items) => {
          openByList[id] = (items || []).filter((i) => !i.done && !i.deleted).length;
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
  }, [shopPlatformIds, familyId, uid, profileChildId, asChild]);

  useEffect(() => {
    if (!familyId || asChild) {
      setMealsToday(0);
      return undefined;
    }
    return listenMeals(familyId, (meals) => {
      setMealsToday((meals || []).filter((m) => m.dateKey === todayKey && !m.deleted).length);
    });
  }, [familyId, asChild, todayKey]);

  // Foreldre: summer åpne lekser for alle aktive barn (begrenset til 6).
  useEffect(() => {
    if (!familyId || asChild || !isParent) {
      setAllKidsLekser(0);
      return undefined;
    }
    const active = (kids || []).filter((k) => k.active !== false && !k.archived).slice(0, 6);
    if (!active.length) {
      setAllKidsLekser(0);
      return undefined;
    }
    const byChild = {};
    const unsubs = [];
    active.forEach((kid) => {
      const id = kid.id;
      let todos = [];
      let homework = [];
      const recount = () => {
        byChild[id] = mergeLekserForWeek({
          homework,
          legacyTodos: lekserInWeek(todos || [], today),
          refDate: today,
          childId: id,
        }).filter((item) => !isHomeworkDone(item, todayKey)).length;
        setAllKidsLekser(Object.values(byChild).reduce((s, n) => s + n, 0));
      };
      unsubs.push(listenChildTodos(familyId, id, (items) => {
        todos = items || [];
        recount();
      }));
      unsubs.push(listenChildHomework(familyId, id, (items) => {
        homework = items || [];
        recount();
      }));
    });
    return () => unsubs.forEach((u) => u?.());
  }, [familyId, asChild, isParent, kids, today, todayKey]);

  return useMemo(() => {
    const counts = {};

    // Familieoppgaver: egen dato-logikk (ikke «daily» via appliesOnDate).
    // Inkluder forfalte åpne eksplisitt — badge skal stå til oppgaven lukkes.
    const myOpen = (parentTodos || []).filter((t) => {
      if (!parentTaskVisibleToUser(t, { uid, ids, asChild }) || !isParentTaskOpen(t, today)) return false;
      return parentTodosOnDate([t], today, today).length > 0;
    });
    if (myOpen.length) counts.stars = myOpen.length;

    const dayChild = todosOnDate(childTodos, today);
    const openChores = dayChild.filter((t) => !isLekserTodo(t) && !isDoneOn(t, todayKey));
    const openLekser = mergeLekserForWeek({
      homework: childHomework,
      legacyTodos: lekserInWeek(childTodos, today),
      refDate: today,
      childId,
    }).filter((item) => !isHomeworkDone(item, todayKey));
    if (asChild) {
      // Gjøremål og Oppgaver er separate moduler — ikke speil chores over på stars.
      if (openChores.length) counts.chores = openChores.length;
      if (openLekser.length) counts.lekser = openLekser.length;
    } else if (allKidsLekser > 0) {
      counts.lekser = allKidsLekser;
    }

    const myEvents = (events || []).filter((e) => (
      eventOccursOnDate(e, today)
      && eventInvolvesMember(e, ids, { asChild, members })
    ));
    if (myEvents.length) counts.plan = myEvents.length;

    if (shopOpen > 0) counts.shop = shopOpen;
    if (!asChild && isParent && mealsToday > 0) counts.meals = mealsToday;

    return counts;
  }, [
    childTodos, childHomework, parentTodos, events, shopOpen, mealsToday, allKidsLekser,
    asChild, isParent, today, todayKey, uid, ids, members, childId,
  ]);
}
