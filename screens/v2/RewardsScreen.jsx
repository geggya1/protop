import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Pressable,
} from 'react-native';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import {
  addDays, dateKey, startOfWeekMonday, monthGrid, isSameMonth,
  WEEKDAYS_SHORT, MONTHS_NO, sameDay, isToday, getISOWeek,
  isoWeekKeys, chunkWeeks,
} from '../../src/utils/dates';
import {
  scoreInKeys, todosOnDate, isDoneOn,
  toggleTodo, toggleParentTodo, restoreParentTodo, purgeParentTodo, valueForTask,
  sortParentTasksByDeadline,
  isParentTaskOverdue, formatDeadlineLabel, formatDeadlineDate,
  parentTaskVisibleToUser, FAMILY_ASSIGNEE,
  parentTodosOnDate, isParentTaskOpen,
} from '../../src/utils/todos';
import { weekRewardCap } from '../../src/utils/todoBudget';
import {
  normalizeRewardMode,
  showsNumericReward,
  rewardUnitLabel,
} from '../../src/utils/rewardModes';
import {
  listenRewardGoals,
  goalsForChild,
  goalProgress,
  lifetimeStarsFromTodos,
} from '../../src/utils/rewardGoals';
import {
  listenChildTodosAcrossPlatforms,
  listenParentTodosAcrossPlatforms,
  platformIdsFromFamilies,
} from '../../src/utils/crossPlatformData';
import { canChildCreateParentTasks, isChildParentTaskReadOnly } from '../../src/utils/childTaskAccess';
import { Screen, Card, Mute } from '../../components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useChildRewardCelebration } from '../../components/ChildRewardCelebration';
import ChildTodoDetailModal from '../../components/ChildTodoDetailModal';
import TodoTaskIcon from '../../components/TodoTaskIcon';
import RewardGoalCard from '../../components/RewardGoalCard';
import { useThemeMeta } from '../../src/context/ThemeContext';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { ModulePageFrame } from '../../components/ModulePageBg';

function TaskCheckbox({ done, onPress, disabled, large = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.checkHit}
    >
      <View style={[
        styles.checkbox,
        large && styles.checkboxLarge,
        done && styles.checkboxDone,
      ]}
      >
        {done && <Ionicons name="checkmark" size={large ? 22 : 14} color="#fff" />}
      </View>
    </TouchableOpacity>
  );
}

function ChoreTaskRow({ task, done, unitLabel, onOpen, onToggle, simpleUi = false, quiet = false }) {
  if (simpleUi) {
    return (
      <View style={[styles.taskRowSimple, done && styles.taskRowDone]}>
        <TouchableOpacity
          style={styles.choreMainSimple}
          onPress={onOpen}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${task.title}. Trykk for detaljer`}
        >
          <View style={[styles.choreIconSimple, done && styles.choreIconDone]}>
            <TodoTaskIcon task={task} style={styles.choreIconImgSimple} emojiSize={40} />
          </View>
          <Text style={[styles.taskTitleSimple, done && styles.taskTitleDone]} numberOfLines={2}>
            {task.title}
          </Text>
        </TouchableOpacity>
        <TaskCheckbox done={done} onPress={onToggle} large />
      </View>
    );
  }

  const meta = quiet
    ? (done ? 'Ferdig' : 'Åpen · trykk for mer')
    : (done
      ? `Ferdig · +${valueForTask(task)} ${unitLabel}`
      : `Åpen · ${valueForTask(task)} ${unitLabel} · trykk for mer`);

  return (
    <View style={[styles.taskRow, done && styles.taskRowDone]}>
      <TouchableOpacity
        style={styles.choreMain}
        onPress={onOpen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. Trykk for detaljer`}
      >
        <View style={[styles.choreIcon, done && styles.choreIconDone]}>
          <TodoTaskIcon task={task} style={styles.choreIconImg} emojiSize={22} />
        </View>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={styles.taskMeta}>
            {task.crossPlatform && task.sourcePlatformName
              ? `Fra ${task.sourcePlatformName} · `
              : ''}
            {meta}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </TouchableOpacity>
      <TaskCheckbox done={done} onPress={onToggle} />
    </View>
  );
}

function ParentTaskRow({ task, done, onToggle, onOpen, readOnly, dayKey }) {
  const overdue = !done && isParentTaskOverdue(task, parseDateFromKey(dayKey));
  const deadlineLabel = formatDeadlineLabel(task, dayKey);
  return (
    <View style={[
      styles.taskRow,
      done && styles.taskRowDone,
      overdue && styles.taskRowOverdue,
    ]}
    >
      {overdue && <View style={styles.overdueMark} />}
      <TouchableOpacity style={styles.taskBody} onPress={onOpen} activeOpacity={0.75}>
        <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!deadlineLabel && (
          <Text style={[styles.taskMeta, overdue && styles.taskMetaOverdue]}>
            {deadlineLabel}
          </Text>
        )}
      </TouchableOpacity>
      <TaskCheckbox
        done={done}
        onPress={onToggle}
        disabled={readOnly}
      />
    </View>
  );
}

function ParentTaskTableRow({
  task,
  done,
  subtitle,
  onToggle,
  onOpen,
  toggleDisabled,
  refDate,
  selectedKey,
}) {
  const overdue = !done && isParentTaskOverdue(task, refDate);
  const dueText = task?.deadline
    ? `${formatDeadlineDate(task.deadline)}${task.deadlineTime ? ` kl. ${task.deadlineTime}` : ''}`
    : '—';

  const tomorrowKey = dateKey(addDays(refDate, 1));
  let importance = 'Lav';
  if (done) importance = 'Ferdig';
  else if (overdue || (task?.deadline && task.deadline <= selectedKey)) importance = 'Høy';
  else if (task?.deadline && task.deadline === tomorrowKey) importance = 'Middels';

  return (
    <View style={[
      styles.tableRow,
      done && styles.taskRowDone,
      overdue && styles.taskRowOverdue,
    ]}
    >
      <View style={styles.tableCellCheck}>
        <TaskCheckbox done={done} onPress={onToggle} disabled={toggleDisabled} />
      </View>

      <TouchableOpacity
        style={styles.tableCellTitle}
        onPress={onOpen}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. Trykk for detaljer`}
      >
        <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!subtitle && (
          <Text style={styles.tableSubtitle} numberOfLines={1}>{subtitle}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.tableCellDue} numberOfLines={1}>{dueText}</Text>

      <View style={styles.tableCellImportance}>
        <Text style={[
          styles.tableImportanceTxt,
          importance === 'Høy' && styles.importanceHigh,
          importance === 'Middels' && styles.importanceMid,
          importance === 'Ferdig' && styles.importanceDone,
        ]}
        >
          {importance}
        </Text>
      </View>
    </View>
  );
}

function parseDateFromKey(k) {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function memberName(members, id) {
  if (!id) return 'Ukjent';
  if (id === FAMILY_ASSIGNEE) return 'Hele familien';
  const m = members.find((x) => x.id === id || x.uid === id || x.childId === id);
  return m?.name?.split(' ')[0] || 'Ukjent';
}

export default function RewardsScreen({ variant = 'auto' }) {
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const { highChildFriendliness } = useThemeMeta();
  const {
    familyId, families, isParent, isChild, meChild, members, uid,
    isActingAsChild, activeChild,
  } = useApp();
  const simpleUi = highChildFriendliness;
  const [todos, setTodos] = useState([]);
  const [parentTodos, setParentTodos] = useState([]);
  const [mode, setMode] = useState('day');
  const [tasksLayoutMode, setTasksLayoutMode] = useState('list'); // desktop: 'list' | 'grid'
  const [taskFilter, setTaskFilter] = useState('open'); // open | done | trash
  const [anchor, setAnchor] = useState(() => new Date());

  const viewingChild = isActingAsChild ? activeChild : (isChild ? meChild : null);
  const childId = viewingChild?.id || null;

  /** tasks = familieoppgaver · chores = gjøremål/belønning · auto = rollebasert */
  const resolvedVariant = useMemo(() => {
    if (variant === 'tasks' || variant === 'chores') return variant;
    return viewingChild ? 'chores' : 'tasks';
  }, [variant, viewingChild]);

  const showChildFocus = resolvedVariant === 'chores' && !!viewingChild;
  const showTasksOverview = resolvedVariant === 'tasks';
  const heroName = showChildFocus ? 'chores' : (showTasksOverview ? 'stars' : null);
  // Innlogget barn kan opprette/tildele; «vis som barn» beholder foresatt-rettigheter via egen profil.
  const childTaskActor = showTasksOverview && canChildCreateParentTasks(isChild);
  const parentTaskActor = showTasksOverview && isParent && !isActingAsChild;
  const canCreateParentTask = childTaskActor || parentTaskActor;
  const showDelegated = canCreateParentTask;
  const [rewardMode, setRewardMode] = useState('points');
  const [weeklyBudget, setWeeklyBudget] = useState(0);
  const [rewardWeekStart, setRewardWeekStart] = useState(6);
  const [detailTask, setDetailTask] = useState(null);
  useHelpScene(detailTask ? 'inner' : 'hub');
  const [starGoals, setStarGoals] = useState([]);
  const [starsByChild, setStarsByChild] = useState({});

  // Foresatt beholder full rettighet også når de bytter til barnets profil.
  // Kun innlogget barn er begrenset.
  const canManageChores = showChildFocus && isParent && !isChild;
  const rMode = normalizeRewardMode(rewardMode);
  const quietReward = !showsNumericReward(rMode);

  useEffect(() => {
    if (!familyId || !childId) return undefined;
    return onSnapshot(doc(db, 'families', familyId, 'children', childId), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.rewardMode) setRewardMode(normalizeRewardMode(d.rewardMode));
      if (typeof d.weeklyBudget === 'number') setWeeklyBudget(d.weeklyBudget);
      if (typeof d.rewardWeekStart === 'number') setRewardWeekStart(d.rewardWeekStart);
    });
  }, [familyId, childId]);

  useEffect(() => {
    if (!familyId || !showChildFocus || rMode !== 'points') {
      setStarGoals([]);
      return undefined;
    }
    return listenRewardGoals(familyId, setStarGoals);
  }, [familyId, showChildFocus, rMode]);

  useEffect(() => {
    if (!showChildFocus || rMode !== 'points' || !childId) return;
    setStarsByChild((prev) => ({
      ...prev,
      [childId]: lifetimeStarsFromTodos(todos),
    }));
  }, [todos, childId, showChildFocus, rMode]);

  // For delte mål: hent stjerner for søsken som inngår
  useEffect(() => {
    if (!familyId || rMode !== 'points' || !starGoals.length) return undefined;
    const siblingIds = new Set();
    starGoals.forEach((g) => {
      if (!g.shared) return;
      (g.childIds || []).forEach((id) => {
        if (id && id !== childId) siblingIds.add(id);
      });
    });
    if (!siblingIds.size) return undefined;
    let cancelled = false;
    const unsubs = [...siblingIds].map((id) => onSnapshot(
      collection(db, 'families', familyId, 'children', id, 'todos'),
      (snap) => {
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStarsByChild((prev) => ({
          ...prev,
          [id]: lifetimeStarsFromTodos(list),
        }));
      },
      () => {},
    ));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [familyId, starGoals, childId, rMode]);

  useEffect(() => {
    if (!familyId || !childId) return undefined;
    return listenChildTodosAcrossPlatforms({
      childUid: viewingChild?.uid || null,
      activeFamilyId: familyId,
      activeChildId: childId,
      platforms: families,
      onChange: setTodos,
    });
  }, [familyId, childId, viewingChild?.uid, families]);

  const myIds = useMemo(() => {
    if (viewingChild) {
      const ids = new Set();
      [viewingChild.uid, viewingChild.id, viewingChild.childId].filter(Boolean).forEach((id) => ids.add(id));
      return ids;
    }
    return new Set([uid].filter(Boolean));
  }, [uid, viewingChild]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId || !showTasksOverview) return undefined;
    return listenParentTodosAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      uid,
      viewerIds: myIds,
      asChild: !!viewingChild,
      platforms: families,
      includeDeleted: true,
      onChange: setParentTodos,
    });
  }, [familyId, showTasksOverview, platformIds, uid, myIds, viewingChild, families]);

  const weekKeys = useMemo(
    () => isoWeekKeys(anchor),
    [anchor],
  );
  const week = scoreInKeys(todos, weekKeys);
  const weekCap = weekRewardCap(weeklyBudget, week.possible);

  const {
    bagRef,
    bagScale,
    onBagLayout,
    openSummary,
    celebrateComplete,
    overlay: rewardOverlay,
    bagUnit,
    quietReward: celebrationQuiet,
  } = useChildRewardCelebration({
    todos,
    rewardMode: rMode,
    weekKeys,
    anchorDate: anchor,
  });

  const selectedKey = dateKey(anchor);
  const selectedTodos = todosOnDate(todos, anchor);
  const openTodos = selectedTodos.filter((t) => !isDoneOn(t, selectedKey));
  const doneTodos = selectedTodos.filter((t) => isDoneOn(t, selectedKey));
  const rowQuiet = quietReward || celebrationQuiet;
  const childGoals = useMemo(
    () => (childId && rMode === 'points' ? goalsForChild(starGoals, childId) : []),
    [starGoals, childId, rMode],
  );

  const shellAddBtn = useMemo(() => {
    if (canCreateParentTask && showTasksOverview && taskFilter !== 'trash') {
      return (
        <ShellAddButton
          label="Ny oppgave"
          onPress={() => nav.navigate('ParentTask', { familyId })}
        />
      );
    }
    if (canManageChores) {
      return (
        <ShellAddButton
          label="Legg til"
          accessibilityLabel="Legg til gjøremål"
          onPress={() => nav.navigate('AddTodo', {
            familyId,
            child: viewingChild,
            currentDateKey: dateKey(anchor),
            defaultStartKey: dateKey(anchor),
          })}
        />
      );
    }
    return null;
  }, [
    isDesktop, canCreateParentTask, showTasksOverview, taskFilter,
    canManageChores, familyId, viewingChild, anchor, nav,
  ]);
  useShellTitleRight(shellAddBtn);

  const weekDays = useMemo(() => {
    const mon = startOfWeekMonday(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  }, [anchor]);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const iso = getISOWeek(anchor);
  const days = mode === 'month' ? grid : weekDays;

  const activeParentTodos = useMemo(
    () => (parentTodos || []).filter((t) => !t.deleted),
    [parentTodos],
  );

  const dayParentTodos = useMemo(
    () => parentTodosOnDate(activeParentTodos, anchor),
    [activeParentTodos, anchor],
  );

  const myTasks = useMemo(
    () => dayParentTodos.filter((t) => parentTaskVisibleToUser(t, {
      uid,
      ids: myIds,
      asChild: !!viewingChild,
    })),
    [dayParentTodos, uid, myIds, viewingChild],
  );

  const delegatedTasks = useMemo(
    () => dayParentTodos.filter((t) => {
      if (t.createdBy !== uid) return false;
      const assignee = t.assignedTo || null;
      if (!assignee || assignee === FAMILY_ASSIGNEE) return false;
      if (assignee === uid || myIds.has(assignee)) return false;
      return true;
    }),
    [dayParentTodos, uid, myIds],
  );

  const myOpen = useMemo(
    () => sortParentTasksByDeadline(
      myTasks.filter((t) => isParentTaskOpen(t, selectedKey)),
      selectedKey,
    ),
    [myTasks, selectedKey],
  );
  const myDone = useMemo(
    () => sortParentTasksByDeadline(
      myTasks.filter((t) => !isParentTaskOpen(t, selectedKey)),
      selectedKey,
    ),
    [myTasks, selectedKey],
  );
  const delegatedOpen = useMemo(
    () => sortParentTasksByDeadline(
      delegatedTasks.filter((t) => isParentTaskOpen(t, selectedKey)),
      selectedKey,
    ),
    [delegatedTasks, selectedKey],
  );
  const delegatedDone = useMemo(
    () => sortParentTasksByDeadline(
      delegatedTasks.filter((t) => !isParentTaskOpen(t, selectedKey)),
      selectedKey,
    ),
    [delegatedTasks, selectedKey],
  );
  const trashTasks = useMemo(
    () => sortParentTasksByDeadline(
      (parentTodos || []).filter((t) => t.deleted && parentTaskVisibleToUser(t, {
        uid,
        ids: myIds,
        asChild: !!viewingChild,
      })),
      selectedKey,
    ),
    [parentTodos, uid, myIds, viewingChild, selectedKey],
  );

  const listMyTasks = taskFilter === 'open' ? myOpen : taskFilter === 'done' ? myDone : trashTasks;
  const listDelegated = taskFilter === 'open' ? delegatedOpen
    : taskFilter === 'done' ? delegatedDone
      : [];
  const trashCount = trashTasks.length;
  const doneCount = myDone.length + delegatedDone.length;

  const onToggle = async (task) => {
    if (!familyId || !childId) return;
    const wasDone = isDoneOn(task, selectedKey);
    try {
      await toggleTodo(familyId, childId, task, anchor);
      if (!wasDone) celebrateComplete(task, { willBeDone: true });
    } catch { /* ignore future */ }
  };

  const onCompleteFromDetail = async () => {
    if (!detailTask) return;
    const task = detailTask;
    setDetailTask(null);
    await onToggle(task);
  };

  const onToggleParent = async (task) => {
    if (!familyId) return;
    try { await toggleParentTodo(familyId, task, anchor); } catch { /* ignore */ }
  };

  const onRestoreParent = async (task) => {
    if (!familyId) return;
    try { await restoreParentTodo(familyId, task); } catch { /* ignore */ }
  };

  const onPurgeParent = async (task) => {
    if (!familyId) return;
    try { await purgeParentTodo(familyId, task); } catch { /* ignore */ }
  };

  const openTask = (task) => {
    const resolved = task.crossPlatform
      ? { ...task, id: task.sourceTodoId || task.id }
      : task;
    // Barn: kun lesetilgang på eksisterende egne og tildelte oppgaver.
    nav.navigate('ParentTask', {
      task: resolved,
      familyId: task.familyId || familyId,
      readOnly: isChildParentTaskReadOnly({ isChild, isNew: false }),
    });
  };

  const shift = (dir) => {
    if (mode === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else if (mode === 'week') setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => addDays(d, dir));
  };

  const dayLabel = `${WEEKDAYS_SHORT[(anchor.getDay() + 6) % 7]} ${anchor.getDate()}. ${MONTHS_NO[anchor.getMonth()]}`;
  const periodLabel = mode === 'month'
    ? `${MONTHS_NO[anchor.getMonth()]} ${anchor.getFullYear()}`
    : mode === 'week'
      ? `Uke ${iso.week} · ${weekDays[0].getDate()}.–${weekDays[6].getDate()}. ${MONTHS_NO[anchor.getMonth()].slice(0, 3)}`
      : dayLabel;

  const taskCountForDay = (d) => {
    let n = 0;
    if (showTasksOverview) {
      n += parentTodosOnDate(activeParentTodos, d).filter((t) => parentTaskVisibleToUser(t, {
        uid,
        ids: myIds,
        asChild: !!viewingChild,
      }) && isParentTaskOpen(t, dateKey(d))).length;
    } else {
      n += todosOnDate(todos, d).filter((t) => !isDoneOn(t, dateKey(d))).length;
    }
    return n;
  };

  return (
    <Screen>
      <ModulePageFrame name={heroName}>
      {showChildFocus && rewardOverlay}
      <ChildTodoDetailModal
        visible={!!detailTask}
        task={detailTask}
        done={detailTask ? isDoneOn(detailTask, selectedKey) : false}
        unitLabel={bagUnit}
        quiet={rowQuiet}
        onClose={() => setDetailTask(null)}
        onComplete={onCompleteFromDetail}
        canEdit={canManageChores}
        onEdit={() => {
          const t = detailTask;
          if (!t || !viewingChild) return;
          setDetailTask(null);
          nav.navigate('AddTodo', {
            familyId: t.familyId || familyId,
            child: viewingChild,
            todo: t.crossPlatform
              ? { ...t, id: t.sourceTodoId || t.id }
              : t,
            currentDateKey: dateKey(anchor),
            defaultStartKey: dateKey(anchor),
          });
        }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {canManageChores && (
          <View style={styles.choresTopRow}>
            <Text style={styles.choresTopHint}>Belønning og import</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => nav.navigate('ChoreSettings', {
                familyId,
                child: viewingChild,
              })}
              accessibilityRole="button"
              accessibilityLabel="Gjøremålsinnstillinger"
            >
              <Ionicons name="settings-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.seg, isDesktop && styles.segDesk]}>
          {[['day', 'Dag'], ['week', 'Uke'], ['month', 'Måned']].map(([m, label]) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.segBtn,
                isDesktop && styles.segBtnDesk,
                mode === m && (isDesktop ? styles.segOnDesk : styles.segOn),
              ]}
            >
              <Text style={[
                styles.segTxt,
                isDesktop && styles.segTxtDesk,
                mode === m && (isDesktop ? styles.segTxtOnDesk : styles.segTxtOn),
              ]}
              numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.navRow, isDesktop && styles.navRowDesk]}>
          <TouchableOpacity onPress={() => shift(-1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]}>
            <Ionicons name="chevron-back" size={isDesktop ? 16 : 20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.navLbl, isDesktop && styles.navLblDesk]} numberOfLines={1}>{periodLabel}</Text>
          <TouchableOpacity onPress={() => shift(1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]}>
            <Ionicons name="chevron-forward" size={isDesktop ? 16 : 20} color={colors.ink} />
          </TouchableOpacity>
          {isDesktop && !isToday(anchor) && (
            <TouchableOpacity style={styles.todayJumpInline} onPress={() => setAnchor(new Date())}>
              <Text style={[styles.todayJumpTxt, styles.todayJumpTxtDesk]}>I dag</Text>
            </TouchableOpacity>
          )}
          {isDesktop && showTasksOverview && (
            <View style={styles.taskViewTabs}>
              <TouchableOpacity
                onPress={() => setTasksLayoutMode('list')}
                style={[styles.taskViewTab, tasksLayoutMode === 'list' && styles.taskViewTabOn]}
                accessibilityRole="button"
                accessibilityLabel="Liste"
              >
                <Text style={[styles.taskViewTabTxt, tasksLayoutMode === 'list' && styles.taskViewTabTxtOn]}>
                  Liste
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTasksLayoutMode('grid')}
                style={[styles.taskViewTab, tasksLayoutMode === 'grid' && styles.taskViewTabOn]}
                accessibilityRole="button"
                accessibilityLabel="Rutenett"
              >
                <Text style={[styles.taskViewTabTxt, tasksLayoutMode === 'grid' && styles.taskViewTabTxtOn]}>
                  Rutenett
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!isDesktop && !isToday(anchor) && (
          <TouchableOpacity style={styles.todayJump} onPress={() => setAnchor(new Date())}>
            <Text style={styles.todayJumpTxt}>Gå til i dag</Text>
          </TouchableOpacity>
        )}

        {mode !== 'day' && (
          <>
            <View style={styles.weekHead}>
              <Text style={styles.weekNumHead}>Uke</Text>
              {WEEKDAYS_SHORT.map((d) => <Text key={d} style={styles.wh}>{d}</Text>)}
            </View>
            <View style={styles.grid}>
              {chunkWeeks(days).map((row) => {
                const weekNo = getISOWeek(row[0]).week;
                return (
                  <View key={dateKey(row[0])} style={styles.calRow}>
                    <Text style={styles.weekNum}>{weekNo}</Text>
                    {row.map((d) => {
                      const k = dateKey(d);
                      const selectedDay = sameDay(d, anchor);
                      const todayDay = isToday(d);
                      const outside = mode === 'month' && !isSameMonth(d, anchor);
                      const count = taskCountForDay(d);
                      return (
                        <TouchableOpacity
                          key={k}
                          onPress={() => setAnchor(d)}
                          style={[
                            styles.cell,
                            todayDay && !selectedDay && styles.cellToday,
                            selectedDay && styles.cellOn,
                            outside && { opacity: 0.35 },
                          ]}
                        >
                          <Text style={[
                            styles.cellNum,
                            selectedDay && styles.cellNumOn,
                            todayDay && !selectedDay && styles.cellNumToday,
                          ]}
                          >
                            {d.getDate()}
                          </Text>
                          {count > 0 && (
                            <View style={[styles.countDot, selectedDay && styles.countDotOn]}>
                              <Text style={[styles.countDotTxt, selectedDay && styles.countDotTxtOn]}>
                                {count > 9 ? '9+' : count}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {showTasksOverview && (
          <>
            {!isDesktop && (
              <Text style={styles.moduleIntro}>
                {isChild
                  ? 'Opprett oppgaver og tildel andre. Du ser egne og oppgaver tildelt deg — uten belønning.'
                  : 'Fristbaserte oppgaver for deg eller tildelt av andre — uten belønning.'}
              </Text>
            )}

            <View style={[styles.filterRow, isDesktop && styles.filterRowDesk]}>
              {[
                ['open', 'Åpne'],
                ['done', doneCount > 0 ? `Ferdig (${doneCount})` : 'Ferdig'],
                ['trash', trashCount > 0 ? `Papirkurv (${trashCount})` : 'Papirkurv'],
              ].map(([k, label]) => (
                <TouchableOpacity
                  key={k}
                  style={[
                    styles.filterBtn,
                    isDesktop && styles.filterBtnDesk,
                    taskFilter === k && styles.filterOn,
                  ]}
                  onPress={() => setTaskFilter(k)}
                >
                  <Text
                    style={[
                      styles.filterTxt,
                      isDesktop && styles.filterTxtDesk,
                      taskFilter === k && styles.filterTxtOn,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.listCard, isDesktop && styles.listCardDesk]}>
              <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
                {taskFilter === 'trash'
                  ? 'Papirkurv'
                  : taskFilter === 'done'
                    ? (isToday(anchor) ? 'Ferdigstilte · i dag' : `Ferdigstilte · ${dayLabel}`)
                    : (isToday(anchor) ? 'Mine oppgaver · i dag' : `Mine oppgaver · ${dayLabel}`)}
              </Text>
              {isDesktop && tasksLayoutMode === 'list' && taskFilter !== 'trash' && (
                <>
                  <View style={styles.taskTableHead}>
                    <View style={styles.taskTableThCheck} />
                    <Text style={styles.taskTableThTitle}>Tittel</Text>
                    <Text style={styles.taskTableThDue}>Forfallsdato</Text>
                    <Text style={styles.taskTableThImportance}>Viktighet</Text>
                  </View>

                  {listMyTasks.length === 0 && (
                    <Text style={styles.emptyInline}>
                      {taskFilter === 'done'
                        ? 'Ingen ferdigstilte oppgaver denne dagen.'
                        : 'Ingen åpne oppgaver denne dagen. Opprett en med frist, eller vent på tildeling.'}
                    </Text>
                  )}

                  {listMyTasks.map((t) => (
                    <ParentTaskTableRow
                      key={t.id}
                      task={t}
                      done={taskFilter === 'done'}
                      subtitle={null}
                      onToggle={() => onToggleParent(t)}
                      onOpen={() => openTask(t)}
                      toggleDisabled={false}
                      refDate={anchor}
                      selectedKey={selectedKey}
                    />
                  ))}
                </>
              )}

              {isDesktop && tasksLayoutMode === 'grid' && taskFilter !== 'trash' && (
                <>
                  {listMyTasks.length === 0 && (
                    <Text style={styles.emptyInline}>
                      {taskFilter === 'done'
                        ? 'Ingen ferdigstilte oppgaver denne dagen.'
                        : 'Ingen åpne oppgaver denne dagen. Opprett en med frist, eller vent på tildeling.'}
                    </Text>
                  )}

                  <View style={styles.taskGrid}>
                    {listMyTasks.map((t) => {
                      const done = taskFilter === 'done' || isDoneOn(t, selectedKey);
                      const overdue = !done && isParentTaskOverdue(t, anchor);
                      const dueText = t?.deadline
                        ? `${formatDeadlineDate(t.deadline)}${t.deadlineTime ? ` kl. ${t.deadlineTime}` : ''}`
                        : '—';
                      const tomorrowKey = dateKey(addDays(anchor, 1));
                      let importance = 'Lav';
                      if (done) importance = 'Ferdig';
                      else if (overdue || (t?.deadline && t.deadline <= selectedKey)) importance = 'Høy';
                      else if (t?.deadline && t.deadline === tomorrowKey) importance = 'Middels';

                      return (
                        <View key={t.id} style={[styles.taskGridCard, overdue && styles.taskRowOverdue]}>
                          <TouchableOpacity
                            style={styles.taskGridTitleWrap}
                            onPress={() => openTask(t)}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
                              {t.title}
                            </Text>
                          </TouchableOpacity>
                          <Text style={styles.taskGridDue} numberOfLines={1}>{dueText}</Text>
                          <View style={styles.taskGridBottom}>
                            <Text
                              style={[
                                styles.tableImportanceTxt,
                                importance === 'Høy' && styles.importanceHigh,
                                importance === 'Middels' && styles.importanceMid,
                                done && styles.importanceDone,
                              ]}
                            >
                              {importance}
                            </Text>
                            <TaskCheckbox done={done} onPress={() => onToggleParent(t)} disabled={false} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {!isDesktop && taskFilter !== 'trash' && (
                <>
                  {listMyTasks.length === 0 && (
                    <Text style={styles.emptyInline}>
                      {taskFilter === 'done'
                        ? 'Ingen ferdigstilte oppgaver denne dagen.'
                        : 'Ingen åpne oppgaver denne dagen. Opprett en med frist, eller vent på tildeling.'}
                    </Text>
                  )}
                  {listMyTasks.map((t) => (
                    <ParentTaskRow
                      key={t.id}
                      task={t}
                      done={taskFilter === 'done'}
                      dayKey={selectedKey}
                      onToggle={() => onToggleParent(t)}
                      onOpen={() => openTask(t)}
                    />
                  ))}
                </>
              )}

              {taskFilter === 'trash' && (
                <>
                  {listMyTasks.length === 0 && (
                    <Text style={styles.emptyInline}>Papirkurven er tom.</Text>
                  )}
                  {listMyTasks.map((t) => (
                    <View key={t.id} style={[styles.taskRow, styles.taskRowDone]}>
                      <TouchableOpacity
                        style={styles.choreMain}
                        onPress={() => openTask(t)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.taskBody}>
                          <Text style={[styles.taskTitle, styles.taskTitleDone]} numberOfLines={2}>
                            {t.title}
                          </Text>
                          <Text style={styles.taskMeta}>Slettet</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.trashAction}
                        onPress={() => onRestoreParent(t)}
                        accessibilityLabel="Gjenopprett"
                      >
                        <Ionicons name="arrow-undo-outline" size={18} color={colors.brand} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.trashAction}
                        onPress={() => onPurgeParent(t)}
                        accessibilityLabel="Slett permanent"
                      >
                        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </View>

            {showDelegated && listDelegated.length > 0 && (
              <View style={[styles.listCard, { marginTop: 10 }]}>
                <Text style={styles.listSection}>
                  {taskFilter === 'done' ? 'Tildelt til andre · ferdig' : 'Tildelt til andre'}
                </Text>
                {isDesktop && tasksLayoutMode === 'list' ? (
                  <>
                    <View style={styles.taskTableHead}>
                      <View style={styles.taskTableThCheck} />
                      <Text style={styles.taskTableThTitle}>Tittel</Text>
                      <Text style={styles.taskTableThDue}>Forfallsdato</Text>
                      <Text style={styles.taskTableThImportance}>Viktighet</Text>
                    </View>
                    {listDelegated.map((t) => {
                      const done = taskFilter === 'done' || isDoneOn(t, selectedKey);
                      const name = memberName(members, t.assignedTo);
                      const subtitle = `Til: ${name} · ${done ? 'Ferdig' : 'Pågår'}`;
                      return (
                        <ParentTaskTableRow
                          key={t.id}
                          task={t}
                          done={done}
                          subtitle={subtitle}
                          onToggle={() => {}}
                          onOpen={() => openTask(t)}
                          toggleDisabled
                          refDate={anchor}
                          selectedKey={selectedKey}
                        />
                      );
                    })}
                  </>
                ) : (
                  listDelegated.map((t) => {
                    const done = taskFilter === 'done' || isDoneOn(t, selectedKey);
                    const overdue = !done && isParentTaskOverdue(t, anchor);
                    const name = memberName(members, t.assignedTo);
                    const deadlineLabel = formatDeadlineLabel(t, selectedKey);
                    return (
                      <View
                        key={t.id}
                        style={[
                          styles.taskRow,
                          done && styles.taskRowDone,
                          overdue && styles.taskRowOverdue,
                        ]}
                      >
                        {overdue && <View style={styles.overdueMark} />}
                        <TouchableOpacity
                          style={styles.taskBody}
                          onPress={() => openTask(t)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.taskTitle, done && styles.taskTitleDone]} numberOfLines={2}>
                            {t.title}
                          </Text>
                          <Text style={[styles.taskMeta, overdue && styles.taskMetaOverdue]}>
                            Til: {name} · {done ? 'Ferdig' : 'Pågår'}
                            {deadlineLabel ? ` · ${deadlineLabel}` : ''}
                          </Text>
                        </TouchableOpacity>
                        <TaskCheckbox done={done} disabled />
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}

        {showChildFocus && (
          <>
            <Pressable onPress={openSummary}>
              <View ref={bagRef} onLayout={onBagLayout} collapsable={false}>
                <Animated.View style={[styles.scoreCardAnim, { transform: [{ scale: bagScale }] }]}>
                  <Card style={styles.scoreCard}>
                    {rowQuiet ? (
                      <>
                        <Text style={styles.bal}>{doneTodos.length}/{selectedTodos.length || 0}</Text>
                        <Text style={styles.balLbl}>
                          ferdig i dag
                          {iso?.week ? ` · uke ${iso.week}` : ''}
                        </Text>
                        <View style={styles.budgetBar}>
                          <View style={{
                            height: 6,
                            backgroundColor: '#64748b',
                            borderRadius: 999,
                            width: `${selectedTodos.length
                              ? Math.min(100, Math.round((doneTodos.length / selectedTodos.length) * 100))
                              : 0}%`,
                          }}
                          />
                        </View>
                        <Mute>Sjekkliste uten poeng eller penger</Mute>
                      </>
                    ) : (
                      <>
                        <Text style={styles.bal}>{week.earned}</Text>
                        <Text style={styles.balLbl}>
                          {bagUnit || rewardUnitLabel(rMode)} av {weekCap || 0}
                          {iso?.week ? ` · uke ${iso.week}` : ''}
                        </Text>
                        <View style={styles.budgetBar}>
                          <View style={{
                            height: 6,
                            backgroundColor: rMode === 'money' ? '#10b981' : colors.star,
                            borderRadius: 999,
                            width: `${weekCap
                              ? Math.min(100, Math.round((week.earned / weekCap) * 100))
                              : 0}%`,
                          }}
                          />
                        </View>
                        <Mute>{doneTodos.length}/{selectedTodos.length || 0} ferdig denne dagen</Mute>
                      </>
                    )}
                    <Text style={styles.scoreHint}>Trykk for ukeoversikt</Text>
                  </Card>
                </Animated.View>
              </View>
            </Pressable>

            {rMode === 'points' && (childGoals.length > 0 || canManageChores) && (
              <View style={styles.goalPreviewWrap}>
                <Text style={styles.listSection}>Opptjeningsmål</Text>
                {childGoals.length === 0 ? (
                  <Text style={styles.emptyInline}>
                    Ingen mål ennå. Legg inn bilde, beskrivelse og en lenke, så {viewingChild?.name || 'barnet'} ser hva stjernene går til.
                  </Text>
                ) : childGoals.slice(0, 3).map((goal) => (
                  <RewardGoalCard
                    key={goal.id}
                    goal={goal}
                    progress={goalProgress(goal, starsByChild, childId)}
                    compact
                    large={simpleUi}
                    claimChildId={childId}
                    meta={goal.shared ? 'Sammen med søsken' : ''}
                  />
                ))}
                <TouchableOpacity
                  onPress={() => nav.navigate('StarGoals', {
                    familyId,
                    childId,
                    childName: viewingChild?.name || 'Barn',
                  })}
                  accessibilityRole="button"
                >
                  <Text style={styles.goalManageLink}>
                    {canManageChores
                      ? (childGoals.length ? 'Administrer opptjeningsmål' : 'Lag opptjeningsmål')
                      : 'Se belønningene'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.listCard}>
              <Text style={styles.listSection}>
                {isToday(anchor) ? 'I dag' : dayLabel}
              </Text>
              {openTodos.length === 0 && doneTodos.length === 0 && (
                <Text style={styles.emptyInline}>Ingen gjøremål denne dagen.</Text>
              )}
              {[...openTodos, ...doneTodos].filter((t) => String(t.category || '').toLowerCase() === 'lekser').length > 0 && (
                <Text style={styles.lekserLabel}>Lekser</Text>
              )}
              {openTodos.filter((t) => String(t.category || '').toLowerCase() === 'lekser').map((t, i) => (
                i === 0 ? (
                  <HelpTarget key={t.id} id="content" onAdvance={() => setDetailTask(t)}>
                    <ChoreTaskRow
                      task={t}
                      done={false}
                      unitLabel={bagUnit}
                      simpleUi={simpleUi}
                      quiet={rowQuiet}
                      onOpen={() => setDetailTask(t)}
                      onToggle={() => onToggle(t)}
                    />
                  </HelpTarget>
                ) : (
                <ChoreTaskRow
                  key={t.id}
                  task={t}
                  done={false}
                  unitLabel={bagUnit}
                  simpleUi={simpleUi}
                  quiet={rowQuiet}
                  onOpen={() => setDetailTask(t)}
                  onToggle={() => onToggle(t)}
                />
                )
              ))}
              {doneTodos.filter((t) => String(t.category || '').toLowerCase() === 'lekser').map((t) => (
                <ChoreTaskRow
                  key={t.id}
                  task={t}
                  done
                  unitLabel={bagUnit}
                  simpleUi={simpleUi}
                  quiet={rowQuiet}
                  onOpen={() => setDetailTask(t)}
                  onToggle={() => onToggle(t)}
                />
              ))}
              {openTodos.filter((t) => String(t.category || '').toLowerCase() !== 'lekser').map((t, i) => (
                i === 0 ? (
                  <HelpTarget key={t.id} id="content" onAdvance={() => setDetailTask(t)}>
                    <ChoreTaskRow
                      task={t}
                      done={false}
                      unitLabel={bagUnit}
                      simpleUi={simpleUi}
                      quiet={rowQuiet}
                      onOpen={() => setDetailTask(t)}
                      onToggle={() => onToggle(t)}
                    />
                  </HelpTarget>
                ) : (
                <ChoreTaskRow
                  key={t.id}
                  task={t}
                  done={false}
                  unitLabel={bagUnit}
                  simpleUi={simpleUi}
                  quiet={rowQuiet}
                  onOpen={() => setDetailTask(t)}
                  onToggle={() => onToggle(t)}
                />
                )
              ))}
              {doneTodos.filter((t) => String(t.category || '').toLowerCase() !== 'lekser').map((t) => (
                <ChoreTaskRow
                  key={t.id}
                  task={t}
                  done
                  unitLabel={bagUnit}
                  simpleUi={simpleUi}
                  quiet={rowQuiet}
                  onOpen={() => setDetailTask(t)}
                  onToggle={() => onToggle(t)}
                />
              ))}
            </View>
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bgWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    zIndex: 0,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  moduleIntro: {
    fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18,
    marginBottom: 10,
  },
  choresTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  choresTopHint: { fontSize: 13, fontWeight: '400', color: colors.muted },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  seg: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 3,
    borderWidth: 1, borderColor: colors.line, marginBottom: 8, gap: 2,
  },
  segDesk: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  segBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnDesk: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    minWidth: 64,
  },
  segOn: { backgroundColor: colors.brand },
  segOnDesk: { backgroundColor: colors.brandSoft },
  segTxt: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  segTxtDesk: { fontWeight: '400', fontSize: 13 },
  segTxtOn: { color: '#fff', fontWeight: '500' },
  segTxtOnDesk: { color: colors.brand, fontWeight: '500' },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  navRowDesk: {
    justifyContent: 'flex-start',
    gap: 6,
    marginBottom: 10,
  },
  navBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  navBtnDesk: {
    width: 28, height: 28, borderRadius: 6,
  },
  navLbl: {
    fontWeight: '500', color: colors.ink, fontSize: 12, flex: 1, textAlign: 'center', marginHorizontal: 6,
  },
  navLblDesk: {
    flex: 0,
    textAlign: 'left',
    fontWeight: '400',
    fontSize: 14,
    marginHorizontal: 4,
    minWidth: 140,
  },
  todayJump: { alignSelf: 'center', marginBottom: 8, paddingVertical: 4, paddingHorizontal: 10 },
  todayJumpInline: { marginLeft: 4, paddingVertical: 4, paddingHorizontal: 8 },
  todayJumpTxt: { color: colors.brand, fontWeight: '500', fontSize: 12 },
  todayJumpTxtDesk: { fontWeight: '400', fontSize: 13 },
  weekHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  weekNumHead: {
    width: 28, textAlign: 'center', fontWeight: '500', color: colors.muted, fontSize: 9,
  },
  weekNum: {
    width: 28, textAlign: 'center', fontWeight: '500', color: colors.muted, fontSize: 11,
  },
  wh: { flex: 1, textAlign: 'center', fontWeight: '400', color: colors.muted, fontSize: 10 },
  grid: { marginBottom: 10 },
  calRow: { flexDirection: 'row', alignItems: 'center' },
  cell: {
    flex: 1, aspectRatio: 1.1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, maxHeight: 44,
  },
  cellToday: { backgroundColor: colors.brandSoft },
  cellOn: { backgroundColor: colors.brand },
  cellNum: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  cellNumOn: { color: '#fff' },
  cellNumToday: { color: colors.brand },
  countDot: {
    minWidth: 14, height: 14, borderRadius: 7, marginTop: 1,
    backgroundColor: colors.starSoft, borderWidth: 1, borderColor: colors.star,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  countDotOn: { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: '#fff' },
  countDotTxt: { fontSize: 8, fontWeight: '500', color: '#b45309' },
  countDotTxtOn: { color: '#fff' },
  listCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, overflow: 'hidden',
  },
  listCardDesk: { borderRadius: 8 },
  listSection: {
    fontSize: 10, fontWeight: '500', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  listSectionDesk: {
    fontWeight: '400', letterSpacing: 0.4, paddingTop: 12, paddingBottom: 6,
  },
  emptyInline: {
    paddingHorizontal: 12, paddingBottom: 12, color: colors.muted,
    fontWeight: '400', fontSize: 13,
  },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  filterRowDesk: { gap: 5 },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  filterBtnDesk: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTxt: { fontWeight: '600', color: colors.ink, fontSize: 13 },
  filterTxtDesk: { fontWeight: '500', fontSize: 12 },
  filterTxtOn: { color: '#fff' },
  trashAction: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  lekserLabel: {
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2,
    fontSize: 11, fontWeight: '500', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9, minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  taskRowDone: { backgroundColor: colors.successSoft },
  taskRowOverdue: { backgroundColor: '#fef2f2' },
  overdueMark: {
    width: 4, alignSelf: 'stretch', backgroundColor: colors.danger,
    borderRadius: 4, marginVertical: 6, marginLeft: 4,
  },
  choreMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  choreIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  choreIconDone: { backgroundColor: colors.successSoft },
  choreIconImg: { width: 28, height: 28, borderRadius: 8 },
  choreEmoji: { fontSize: 22 },
  taskBody: { flex: 1, paddingVertical: 2, minWidth: 0 },
  taskTitle: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  taskTitleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  taskMeta: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 2 },
  taskMetaOverdue: { color: colors.danger, fontWeight: '500' },
  checkHit: { padding: 4 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  checkboxLarge: {
    width: 44, height: 44, borderRadius: 14, borderWidth: 3,
  },
  taskRowSimple: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 12, minHeight: 72,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  choreMainSimple: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  choreIconSimple: {
    width: 64, height: 64, borderRadius: 18, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  choreIconImgSimple: { width: 48, height: 48, borderRadius: 12 },
  taskTitleSimple: { flex: 1, fontWeight: '500', color: colors.ink, fontSize: 17, lineHeight: 22 },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  deskAddWrap: { marginBottom: 8, alignSelf: 'flex-start' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 12, paddingVertical: 11, marginTop: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  childBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  childHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 9, minHeight: 50,
  },
  childName: { flex: 1, fontWeight: '500', fontSize: 14, color: colors.ink },
  countRing: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  countRingEmpty: { borderColor: colors.line, backgroundColor: colors.bg },
  countRingDone: { borderColor: colors.success, backgroundColor: colors.successSoft },
  countRingTxt: { fontWeight: '500', fontSize: 12, color: colors.brand },
  countRingTxtEmpty: { color: colors.muted },
  countRingTxtDone: { color: colors.success },
  choreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 24, paddingRight: 12, paddingVertical: 7, backgroundColor: colors.bg,
  },
  choreMark: { width: 3, height: 24, borderRadius: 3 },
  choreTitle: { fontWeight: '400', fontSize: 13, color: colors.ink },
  rowSub: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 1 },
  childEmpty: { paddingHorizontal: 24, paddingBottom: 10, fontSize: 12, color: colors.muted, fontWeight: '400' },
  scoreCardAnim: { marginBottom: 10 },
  scoreCard: {
    marginBottom: 0,
    backgroundColor: colors.starSoft,
    borderColor: '#fde68a',
  },
  bal: { fontSize: 40, fontWeight: '600', color: colors.star },
  balLbl: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  budgetBar: {
    marginTop: 8, height: 6, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden',
  },
  scoreHint: {
    marginTop: 6, color: colors.muted, fontWeight: '400', fontSize: 11,
  },
  goalPreviewWrap: { marginBottom: 12, gap: 8 },
  goalPreview: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  goalPreviewTitle: { fontWeight: '800', color: colors.ink, fontSize: 14 },
  goalPreviewMeta: { marginTop: 4, color: colors.muted, fontWeight: '600', fontSize: 12 },
  goalManageLink: {
    marginTop: 4, color: colors.brand, fontWeight: '800', fontSize: 13,
  },
  plus: { fontWeight: '500', color: colors.star, fontSize: 12, marginRight: 4 },
  doneRight: { flexDirection: 'row', alignItems: 'center' },

  taskViewTabs: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 2,
    borderBottomWidth: 0,
  },
  taskViewTab: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  taskViewTabOn: {
    borderBottomColor: colors.brand,
  },
  taskViewTabTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  taskViewTabTxtOn: { color: colors.brand, fontWeight: '500' },

  taskTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: '#f8fafc',
  },
  taskTableThCheck: { width: 36 },
  taskTableThTitle: { flex: 1, fontWeight: '500', fontSize: 12, color: colors.muted },
  taskTableThDue: { width: 160, fontWeight: '500', fontSize: 12, color: colors.muted },
  taskTableThImportance: { width: 104, fontWeight: '500', fontSize: 12, color: colors.muted },

  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tableCellCheck: { width: 36 },
  tableCellTitle: { flex: 1, minWidth: 0 },
  tableSubtitle: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 2 },
  tableCellDue: { width: 160, fontWeight: '400', fontSize: 12, color: colors.ink },
  tableCellImportance: { width: 104, alignItems: 'flex-start' },
  tableImportanceTxt: { fontWeight: '500', fontSize: 12 },
  importanceHigh: { color: '#dc2626' },
  importanceMid: { color: '#b45309' },
  importanceDone: { color: colors.muted },

  taskGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  taskGridCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    minHeight: 110,
    flexBasis: '48%',
    marginHorizontal: 6,
    marginTop: 8,
  },
  taskGridTitleWrap: { flex: 1 },
  taskGridDue: { marginTop: 8, fontWeight: '400', fontSize: 12, color: colors.muted },
  taskGridBottom: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});
