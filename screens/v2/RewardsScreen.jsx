import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { colors, useBreakpoints } from '../../src/theme';
import FilterMenu from '../../components/FilterMenu';
import {
  addDays, dateKey, startOfWeekMonday, monthGrid, isSameMonth,
  WEEKDAYS_SHORT, MONTHS_NO, sameDay, isToday, getISOWeek,
  chunkWeeks,
} from '../../src/utils/dates';
import {
  isDoneOn,
  toggleParentTodo, restoreParentTodo, purgeParentTodo,
  sortParentTasksByDeadline,
  isParentTaskOverdue, formatDeadlineLabel, formatDeadlineDate,
  parentTaskVisibleToUser, parentTaskInTrashForUser, FAMILY_ASSIGNEE,
  parentTodosOnDate, isParentTaskOpen,
} from '../../src/utils/todos';
import {
  listenParentTodosAcrossPlatforms,
  platformIdsFromFamilies,
} from '../../src/utils/crossPlatformData';
import { Screen } from '../../components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { ModulePageFrame } from '../../components/ModulePageBg';
import { useShellWide } from '../../components/ModuleAside';
import { confirmUser } from '../../src/utils/dialog';
import { showErrorToast } from '../../src/ui/saveToast';
import { todoActionError } from '../../src/utils/todoStatus.js';

/** Feil i oppgavehandlinger vises som toast i stedet for å svelges. */
function toastTodoError(action, err) {
  const { title, detail } = todoActionError(action, err);
  showErrorToast(title, detail);
}

function TaskCheckbox({ done, onPress, disabled, large = false, title = '' }) {
  // Skjermleser: «Ferdig: <oppgave>», avkrysningsboks, avkrysset eller ikke.
  const name = String(title || '').trim();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.checkHit}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!done, disabled: !!disabled }}
      aria-checked={!!done}
      accessibilityLabel={name ? `Ferdig: ${name}` : 'Ferdig'}
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
        title={task.title}
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
        <TaskCheckbox title={task.title} done={done} onPress={onToggle} disabled={toggleDisabled} />
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
  if (id === FAMILY_ASSIGNEE) return 'Alle';
  const m = members.find((x) => x.id === id || x.uid === id || x.childId === id);
  return m?.name?.split(' ')[0] || 'Ukjent';
}

/** Bredde på oppgavefeltet (PC) der Mine oppgaver og Tildelt til andre står side om side. */
const TASK_SPLIT_MIN = 1100;

/**
 * Oppgaver: egne oppgaver med frist og oppgaver tildelt andre. Barnas gjøremål og belønninger
 * hørte til familieproduktet og er fjernet. `variant` beholdes for kallene fra skallet.
 */
export default function RewardsScreen() {
  const nav = useNavigation();
  const { isDesktop } = useBreakpoints();
  const {
    familyId, families, isParent, members, uid,
  } = useApp();
  const [parentTodos, setParentTodos] = useState([]);
  const [mode, setMode] = useState('day');
  const [tasksLayoutMode, setTasksLayoutMode] = useState('list'); // desktop: 'list' | 'grid'
  const [taskFilter, setTaskFilter] = useState('open'); // open | done | trash
  const [anchor, setAnchor] = useState(() => new Date());

  const showTasksOverview = true;
  const heroName = 'stars';
  const canCreateParentTask = isParent;
  const showDelegated = canCreateParentTask;
  useHelpScene('hub');

  const myIds = useMemo(() => new Set([uid].filter(Boolean)), [uid]);

  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenParentTodosAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      uid,
      viewerIds: myIds,
      asChild: false,
      platforms: families,
      includeDeleted: true,
      onChange: setParentTodos,
    });
  }, [familyId, platformIds, uid, myIds, families]);

  const selectedKey = dateKey(anchor);

  const shellAddBtn = useMemo(() => {
    if (canCreateParentTask && showTasksOverview && taskFilter !== 'trash') {
      return (
        <ShellAddButton
          label="Ny oppgave"
          onPress={() => nav.navigate('ParentTask', { familyId })}
        />
      );
    }
    return null;
  }, [
    canCreateParentTask, showTasksOverview, taskFilter, familyId, nav,
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
      asChild: false,
    })),
    [dayParentTodos, uid, myIds],
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
      (parentTodos || []).filter((t) => parentTaskInTrashForUser(t, {
        uid,
        ids: myIds,
        asChild: false,
      })),
      selectedKey,
    ),
    [parentTodos, uid, myIds, selectedKey],
  );

  const listMyTasks = taskFilter === 'open' ? myOpen : taskFilter === 'done' ? myDone : trashTasks;
  const listDelegated = taskFilter === 'open' ? delegatedOpen
    : taskFilter === 'done' ? delegatedDone
      : [];
  const trashCount = trashTasks.length;
  const doneCount = myDone.length + delegatedDone.length;

  // PC: oppgavene fyller plassen mellom menyen og tipsfeltet. Er feltet bredt nok,
  // står «Mine oppgaver» og «Tildelt til andre» side om side.
  useShellWide(isDesktop && showTasksOverview, { keepAside: true });
  const [bodyWidth, setBodyWidth] = useState(0);
  const delegatedShown = showDelegated && listDelegated.length > 0;
  const splitLists = isDesktop && delegatedShown && taskFilter !== 'trash' && bodyWidth >= TASK_SPLIT_MIN;
  const columnWidth = splitLists ? (bodyWidth - 32 - 12) / 2 : bodyWidth - 32;
  const gridCols = Math.max(2, Math.min(4, Math.floor(columnWidth / 300)));
  const gridCardBasis = { flexBasis: `${100 / gridCols - 2}%` };

  const onToggleParent = async (task) => {
    if (!familyId) return;
    try { await toggleParentTodo(familyId, task, anchor); } catch (e) { toastTodoError('toggle', e); }
  };

  const onRestoreParent = async (task) => {
    if (!familyId) return;
    try { await restoreParentTodo(familyId, task); } catch (e) { toastTodoError('restore', e); }
  };

  const onPurgeParent = async (task) => {
    if (!familyId) return;
    const ok = await confirmUser(
      'Slette permanent?',
      `«${task?.title || 'Oppgaven'}» slettes for godt og kan ikke gjenopprettes.`,
      { ok: 'Slett permanent' },
    );
    if (!ok) return;
    try { await purgeParentTodo(familyId, task); } catch (e) { toastTodoError('purge', e); }
  };

  const openTask = (task) => {
    const resolved = task.crossPlatform
      ? { ...task, id: task.sourceTodoId || task.id }
      : task;
    nav.navigate('ParentTask', {
      task: resolved,
      familyId: task.familyId || familyId,
      readOnly: false,
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

  const taskCountForDay = (d) => parentTodosOnDate(activeParentTodos, d).filter((t) => parentTaskVisibleToUser(t, {
    uid,
    ids: myIds,
    asChild: false,
  }) && isParentTaskOpen(t, dateKey(d))).length;

  return (
    <Screen>
      <ModulePageFrame name={heroName}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setBodyWidth(Math.round(e.nativeEvent.layout.width))}
      >
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

        <View style={[styles.navRow, isDesktop && styles.navRowDesk, isDesktop && !splitLists && styles.listsDesk]}>
          <TouchableOpacity onPress={() => shift(-1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]} accessibilityRole="button" accessibilityLabel="Forrige periode">
            <Ionicons name="chevron-back" size={isDesktop ? 16 : 20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.navLbl, isDesktop && styles.navLblDesk]} numberOfLines={1}>{periodLabel}</Text>
          <TouchableOpacity onPress={() => shift(1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]} accessibilityRole="button" accessibilityLabel="Neste periode">
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
            <View style={[styles.weekHead, isDesktop && styles.gridDesk]}>
              <Text style={styles.weekNumHead}>Uke</Text>
              {WEEKDAYS_SHORT.map((d) => <Text key={d} style={styles.wh}>{d}</Text>)}
            </View>
            <View style={[styles.grid, isDesktop && styles.gridDesk]}>
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
                Oppgaver med frist, for deg selv eller tildelt av andre.
              </Text>
            )}

            <FilterMenu
              groups={[{
                id: 'tasks',
                label: 'Vis',
                value: taskFilter,
                onChange: setTaskFilter,
                options: [
                  { id: 'open', label: 'Åpne' },
                  { id: 'done', label: doneCount > 0 ? `Ferdig (${doneCount})` : 'Ferdig' },
                  { id: 'trash', label: trashCount > 0 ? `Papirkurv (${trashCount})` : 'Papirkurv' },
                ],
              }]}
            />

            <View nativeID="tasks-lists" style={[isDesktop && styles.listsDesk, splitLists && styles.listsSplit]}>
            <View nativeID="tasks-mine" style={[styles.listCard, isDesktop && styles.listCardDesk, splitLists && styles.listCol]}>
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
                        <View key={t.id} style={[styles.taskGridCard, isDesktop && gridCardBasis, overdue && styles.taskRowOverdue]}>
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
                            <TaskCheckbox title={t.title} done={done} onPress={() => onToggleParent(t)} disabled={false} />
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

            {delegatedShown && (
              <View
                nativeID="tasks-delegated"
                style={[styles.listCard, isDesktop && styles.listCardDesk, splitLists ? styles.listCol : { marginTop: 10 }]}
              >
                <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
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
                        <TaskCheckbox title={t.title} done={done} disabled />
                      </View>
                    );
                  })
                )}
              </View>
            )}
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
    alignSelf: 'flex-start',
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
  gridDesk: { maxWidth: 760 },
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
  countDotTxt: { fontSize: 8, fontWeight: '500', color: colors.warnInk },
  countDotTxtOn: { color: '#fff' },
  listCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, overflow: 'hidden',
  },
  listCardDesk: { borderRadius: 8 },
  // Én liste alene blir ikke bredere enn den kan leses; to lister deler bredden.
  listsDesk: { maxWidth: 1180 },
  listsSplit: {
    maxWidth: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  listCol: { flex: 1, minWidth: 0 },
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
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  filterBtnDesk: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
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
  taskRowOverdue: { backgroundColor: colors.dangerSoft },
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
    alignSelf: 'flex-start',
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
  bal: { fontSize: 40, fontWeight: '400', color: colors.star },
  balLbl: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  budgetBar: {
    marginTop: 8, height: 6, backgroundColor: colors.line, borderRadius: 999, overflow: 'hidden',
  },
  scoreHint: {
    marginTop: 6, color: colors.muted, fontWeight: '400', fontSize: 11,
  },
  goalPreviewWrap: { marginBottom: 12, gap: 8 },
  goalPreview: {
    backgroundColor: colors.starSoft, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#fde68a',
  },
  goalPreviewTitle: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  goalPreviewMeta: { marginTop: 4, color: colors.muted, fontWeight: '400', fontSize: 12 },
  goalManageLink: {
    marginTop: 4, color: colors.brand, fontWeight: '400', fontSize: 13,
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
    backgroundColor: colors.sunken,
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
  importanceMid: { color: colors.warnInk },
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
