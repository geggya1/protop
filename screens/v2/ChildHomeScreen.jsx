import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { addDays, dateKey, isoWeekKeys } from '../../src/utils/dates';
import { eventOccursOnDate, eventVisibleToUser } from '../../src/utils/events';
import {
  todosOnDate, isDoneOn, toggleTodo, scoreInKeys,
  repairUnboundedLekser, isLekserTodo,
} from '../../src/utils/todos';
import { weekRewardCap } from '../../src/utils/todoBudget';
import {
  listenChildTodosAcrossPlatforms,
  listenEventsAcrossPlatforms,
  platformIdsFromFamilies,
} from '../../src/utils/crossPlatformData';
import { formatGreetingDate } from '../../src/utils/timeGreeting';
import { Screen } from '../../components/ui';
import { useChildRewardCelebration } from '../../components/ChildRewardCelebration';
import ChildTodoDetailModal from '../../components/ChildTodoDetailModal';
import ChildDashboardThemeHost from '../../components/childHome/ChildDashboardThemeHost';
import { buildChildDashboardApps } from '../../src/navigation/shellModules';
import { allowedAppsForChild, isChildAiAllowed, isChildAppAllowed } from '../../src/utils/childApps';
import { useI18n } from '../../src/i18n';
import { useNow } from '../../src/hooks/useNow';
import { childScheduleNavParams } from '../../src/utils/childNav';
import { findPlanForWeek, schedulePlansFromDoc } from '../../src/utils/schedulePeriod';
import { resolveWeekProgramFocus, schoolMonday } from '../../src/utils/weekPlanView';

function capitalizeNb(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Barnets landing — samme glass-oppstilling som voksenhjem, med barneinnhold.
 * Header, menyer og chat-overlay ligger i AppShell og røres ikke her.
 */
export default function ChildHomeScreen({ child }) {
  const nav = useNavigation();
  const { t } = useI18n();
  const {
    familyId, families, isParent, isChild, isActingAsChild, requestShellTab, members,
  } = useApp();
  const { unreadByModule } = useUnread();
  const [todos, setTodos] = useState([]);
  const [events, setEvents] = useState([]);
  const [scheduleDoc, setScheduleDoc] = useState(null);
  const [rewardMode, setRewardMode] = useState(child?.rewardMode || 'points');
  const [detailTask, setDetailTask] = useState(null);
  const repairedRef = useRef(false);
  const now = useNow();

  const childId = child?.id;
  const childUid = child?.uid || child?.id || child?.childId;
  const firstName = child?.name?.split(' ')[0] || 'du';
  const today = now;
  const todayKey = dateKey(today);
  const tomorrow = useMemo(() => addDays(today, 1), [todayKey]);
  const tomorrowKey = dateKey(tomorrow);
  const dateLabel = capitalizeNb(formatGreetingDate(today));
  const tomorrowDateLabel = capitalizeNb(formatGreetingDate(tomorrow));

  useEffect(() => {
    if (!familyId || !childId) return undefined;
    return listenChildTodosAcrossPlatforms({
      childUid: child?.uid || childUid || null,
      activeFamilyId: familyId,
      activeChildId: childId,
      platforms: families,
      onChange: setTodos,
    });
  }, [familyId, childId, child?.uid, childUid, families]);

  useEffect(() => {
    if (!familyId || !childId || repairedRef.current || !todos.length) return;
    repairedRef.current = true;
    const local = todos.filter((item) => !item.crossPlatform);
    repairUnboundedLekser(familyId, childId, local).catch(() => {
      repairedRef.current = false;
    });
  }, [familyId, childId, todos]);

  const viewerIds = useMemo(() => {
    const ids = new Set();
    [childUid, childId, child?.childId, child?.docId].filter(Boolean).forEach((id) => ids.add(id));
    return ids;
  }, [childUid, childId, child]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenEventsAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      viewerIds,
      platforms: families,
      onChange: setEvents,
    });
  }, [familyId, platformIds, viewerIds, families]);

  useEffect(() => {
    if (!familyId || !childId) {
      setScheduleDoc(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'families', familyId, 'children', childId, 'meta', 'schedule'),
      (snap) => setScheduleDoc(snap.exists() ? snap.data() : null),
      () => setScheduleDoc(null),
    );
  }, [familyId, childId]);

  useEffect(() => {
    if (child?.rewardMode) setRewardMode(child.rewardMode);
  }, [child?.rewardMode]);

  const choreTodos = useMemo(() => (todos || []).filter((t) => !isLekserTodo(t)), [todos]);
  const weekKeys = useMemo(() => isoWeekKeys(today), [todayKey]);
  const week = scoreInKeys(choreTodos, weekKeys);
  const dayTasks = todosOnDate(choreTodos, today);
  const dayDone = dayTasks.filter((item) => isDoneOn(item, todayKey)).length;
  const dayRemaining = Math.max(0, dayTasks.length - dayDone);
  const dayTasksTomorrow = useMemo(
    () => todosOnDate(choreTodos, tomorrow),
    [choreTodos, tomorrowKey],
  );
  const weekPossible = week.possible || 0;
  const weekCap = weekRewardCap(child?.weeklyBudget, weekPossible);
  const weekPct = weekCap
    ? Math.min(100, Math.round((week.earned / weekCap) * 100))
    : 0;
  const canManageTodos = isParent && !isChild;
  const unitLabel = rewardMode === 'money' ? 'kr' : 'poeng';
  const allowedApps = allowedAppsForChild(child);
  const aiEnabled = isChildAiAllowed(child);
  const showCalendar = isChildAppAllowed(allowedApps, 'plan');
  const showChores = isChildAppAllowed(allowedApps, 'chores');

  const {
    openSummary,
    celebrateComplete,
    overlay: rewardOverlay,
  } = useChildRewardCelebration({
    todos,
    rewardMode,
    weekKeys,
    anchorDate: today,
  });

  const visibleChildEvents = useCallback((day) => (
    events
      .filter((e) => eventOccursOnDate(e, day))
      .filter((e) => (
        e.crossPlatform
          ? true
          : eventVisibleToUser(e, [childUid, childId, child?.childId, child?.docId], {
            asChild: true,
            members,
          })
      ))
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
  ), [events, childUid, childId, child, members]);

  const myEventsToday = useMemo(
    () => visibleChildEvents(today),
    [visibleChildEvents, todayKey],
  );

  const myEventsTomorrow = useMemo(
    () => visibleChildEvents(tomorrow),
    [visibleChildEvents, tomorrowKey],
  );

  const weekProgram = useMemo(() => {
    const plans = schedulePlansFromDoc(scheduleDoc);
    const monday = schoolMonday(today);
    const plan = findPlanForWeek(plans, monday);
    const timetable = plan?.timetable || {};
    const focus = resolveWeekProgramFocus(timetable, today);
    return {
      ...focus,
      photoMode: scheduleDoc?.mode === 'photo' && !!scheduleDoc?.photoUrl,
      hasPlan: !!(plan?.timetable || scheduleDoc?.photoUrl),
    };
  }, [scheduleDoc, todayKey]);

  const dashboardApps = useMemo(
    () => buildChildDashboardApps({
      t,
      familyId,
      child,
      aiEnabled,
      taskMeta: `${dayDone}/${dayTasks.length || 0} i dag`,
      eventCount: myEventsToday.length,
      allowedApps,
      canEdit: isParent && !isChild,
    }),
    [t, familyId, child, aiEnabled, allowedApps, dayDone, dayTasks.length, myEventsToday.length, isParent, isChild],
  );

  const runAppAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'tab') {
      requestShellTab(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav') {
      nav.navigate(action.screen, action.params);
    }
  }, [nav, requestShellTab]);

  const onToggle = useCallback(async (task) => {
    if (!familyId || !childId) return;
    const wasDone = isDoneOn(task, todayKey);
    try {
      await toggleTodo(familyId, childId, task, today);
      if (!wasDone) celebrateComplete(task, { willBeDone: true });
    } catch { /* ignore */ }
  }, [familyId, childId, todayKey, today, celebrateComplete]);

  const onCompleteFromDetail = useCallback(async () => {
    if (!detailTask) return;
    const task = detailTask;
    setDetailTask(null);
    await onToggle(task);
  }, [detailTask, onToggle]);

  const onStartTask = useCallback((task) => {
    if (!task) return;
    nav.navigate('Leksehjelp', child ? { child } : undefined);
  }, [nav, child]);

  if (!child) return null;

  const homeworkTasks = todosOnDate((todos || []).filter(isLekserTodo), today);
  const openSettings = () => nav.navigate('ChildSettings', { familyId, child });
  const addTodo = () => nav.navigate('AddTodo', {
    familyId, child, currentDateKey: dateKey(today),
  });
  const openWeekPlan = useCallback(() => {
    nav.navigate('ChildSchedule', childScheduleNavParams({
      familyId,
      child,
      canEdit: isParent && !isChild,
    }));
  }, [nav, familyId, child, isParent, isChild]);

  const homeProps = {
    child,
    firstName,
    dateLabel,
    now,
    weekPct,
    weekEarned: week.earned,
    weekCap,
    unitLabel,
    dayDone,
    dayTasks,
    homeworkTasks,
    dayRemaining,
    myEventsToday,
    myEventsTomorrow,
    dayTasksTomorrow,
    tomorrowDateLabel,
    weekProgram,
    showChores,
    showCalendar,
    onToggle,
    onOpenDetail: setDetailTask,
    onOpenSummary: openSummary,
    onOpenCalendar: () => requestShellTab('plan'),
    onOpenWeekPlan: openWeekPlan,
    onStartTask,
    todayKey,
    canManageTodos,
    onAddTodo: addTodo,
    dashboardApps,
    unreadByModule,
    onAppAction: runAppAction,
    canShowSettings: isParent || isActingAsChild,
    onOpenSettings: openSettings,
  };

  return (
    <Screen>
      {rewardOverlay}
      <ChildTodoDetailModal
        visible={!!detailTask}
        task={detailTask}
        done={detailTask ? isDoneOn(detailTask, todayKey) : false}
        unitLabel={unitLabel}
        onClose={() => setDetailTask(null)}
        onComplete={onCompleteFromDetail}
        canEdit={canManageTodos}
        onEdit={() => {
          const item = detailTask;
          if (!item || !child) return;
          setDetailTask(null);
          nav.navigate('AddTodo', {
            familyId: item.familyId || familyId,
            child,
            todo: item.crossPlatform
              ? { ...item, id: item.sourceTodoId || item.id }
              : item,
            currentDateKey: dateKey(today),
          });
        }}
      />
      <ChildDashboardThemeHost {...homeProps} />
    </Screen>
  );
}
