import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { dateKey } from '../utils/dates';
import {
  listenParentTodos, parentTodosOnDate, isParentTaskOpen, isParentTaskOverdue,
  parentTaskVisibleToUser,
} from '../utils/todos';
import { listenAccessibleNotes } from '../utils/familyNotes';
import {
  summarizeEvents, summarizeTasks, summarizeMeals, summarizeNotes,
  summarizeShopping, buildHomeDigest,
} from '../utils/homeWidgets';

/**
 * Live-sammendrag for desktop-hjem-widgets.
 * Kalenderhendelser kommer fra HomeScreen (allerede lyttet) for å unngå dobbelt-abonnement.
 *
 * Måltider og handlelister hørte til familieproduktet. ProTop lytter ikke på dem lenger;
 * feltene leveres tomme, så widgetene får samme form som før.
 */
const EMPTY_MEALS = summarizeMeals([], '');
const EMPTY_SHOPPING = { ...summarizeShopping([], {}), openItems: [] };
export function useHomeWidgetData({ todayEvents = [], tomorrowEvents = [], enabled = true } = {}) {
  const { familyId, uid } = useApp();
  const todayKey = dateKey(new Date());
  const today = useMemo(() => {
    const [y, m, d] = todayKey.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, [todayKey]);

  const [parentTodos, setParentTodos] = useState([]);
  const [notes, setNotes] = useState([]);

  const ids = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  useEffect(() => {
    if (!enabled || !familyId) {
      setParentTodos([]);
      return undefined;
    }
    return listenParentTodos(familyId, setParentTodos);
  }, [enabled, familyId]);

  useEffect(() => {
    if (!enabled || !familyId || !uid) {
      setNotes([]);
      return undefined;
    }
    return listenAccessibleNotes(familyId, uid, {}, setNotes);
  }, [enabled, familyId, uid]);

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
    const mealSum = EMPTY_MEALS;
    const noteSum = summarizeNotes(notes);
    const shopping = EMPTY_SHOPPING;
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
    parentTodos, notes, todayEvents, tomorrowEvents, today, uid, ids,
  ]);
}
