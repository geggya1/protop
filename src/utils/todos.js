import {
  arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import {
  appliesOnDate, dateKey, dueDateKey, isFutureDate, onceRangeBounds, parseDateKey,
  startOfWeekMonday, addDays,
} from './dates.js';
import {
  isAttestedOn,
  isDoneOn,
  isPendingAttestOn,
  isRangeOnceTask,
  scoreInKeys,
  todosOnDate,
  valueForTask,
} from './todoStatus.js';
import {
  parentTaskCreatedKey,
  isParentTaskClosed,
  isParentTaskOpen,
  isParentTaskOverdue,
  isParentTaskRecurring,
  parentTaskVisibleOnDate,
  parentTodosOnDate,
  parentTasksForOverview,
  parentTaskDeadlineKey,
} from './parentTasks.js';
import { notifyUsers } from './notifications.js';

export {
  parentTaskCreatedKey,
  isParentTaskClosed,
  isParentTaskOpen,
  isParentTaskOverdue,
  isParentTaskRecurring,
  parentTaskVisibleOnDate,
  parentTodosOnDate,
  parentTasksForOverview,
  parentTaskDeadlineKey,
  isAttestedOn,
  isDoneOn,
  isPendingAttestOn,
  isRangeOnceTask,
  scoreInKeys,
  todosOnDate,
  valueForTask,
};

export function mapTodo(d) {
  const data = d.data() || {};
  return {
    id: d.id,
    title: data.title || data.name || 'Gjøremål',
    type: data.type || 'daily',
    rewardType: data.rewardType === 'none' || data.rewardType === 'money' || data.rewardType === 'points'
      ? data.rewardType
      : (Number(data.moneyValue || 0) > 0 ? 'money' : 'points'),
    points: Number(data.points || 0),
    moneyValue: Number(data.moneyValue || 0),
    completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
    attestedDates: data.attestedDates && typeof data.attestedDates === 'object' ? data.attestedDates : {},
    active: data.active !== false,
    deleted: data.deleted === true,
    iconUrl: data.iconUrl || null,
    iconFile: data.iconFile || null,
    daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek : undefined,
    everyOtherWeek: data.everyOtherWeek === true,
    recurring: data.recurring === true,
    recurrenceType: data.recurrenceType || null,
    recurrenceInterval: Number(data.recurrenceInterval || 1),
    recurrenceByDays: Array.isArray(data.recurrenceByDays) ? data.recurrenceByDays : undefined,
    recurrenceUntilKey: data.recurrenceUntilKey || null,
    skipDates: Array.isArray(data.skipDates) ? data.skipDates : undefined,
    category: data.category || null,
    dueDate: data.dueDate || undefined,
    startKey: data.startKey || null,
    endKey: data.endKey || null,
    childId: data.childId,
    assignedTo: data.assignedTo || null,
    createdBy: data.createdBy || null,
    participants: Array.isArray(data.participants) ? data.participants : [],
    deadline: dueDateKey(data.deadline) || dueDateKey(data.dueDate) || null,
    deadlineTime: data.deadlineTime || null,
    description: data.description || '',
    done: data.done === true,
    source: data.source || null,
    createdAt: data.createdAt || null,
  };
}

const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

export function formatDeadlineDate(deadlineKey) {
  if (!deadlineKey) return '';
  const d = parseDateKey(deadlineKey);
  return `${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDeadlineLabel(task, todayKey) {
  if (task?.recurring && task?.recurrenceType) {
    const until = task.recurrenceUntilKey || task.endKey;
    if (until) return `Gjentas · til ${formatDeadlineDate(until)}`;
    return 'Gjentas';
  }
  if (!task?.deadline) return null;
  const time = task.deadlineTime ? ` kl. ${task.deadlineTime}` : '';
  if (task.deadline === todayKey) return `Frist i dag${time}`;
  if (task.deadline < todayKey) return `Forsinket · ${formatDeadlineDate(task.deadline)}${time}`;
  return `Frist ${formatDeadlineDate(task.deadline)}${time}`;
}

export function sortParentTasksByDeadline(tasks, todayKey) {
  return [...tasks].sort((a, b) => {
    const aOver = isParentTaskOverdue(a, parseDateKey(todayKey));
    const bOver = isParentTaskOverdue(b, parseDateKey(todayKey));
    if (aOver !== bOver) return aOver ? -1 : 1;
    const aHas = !!a.deadline;
    const bHas = !!b.deadline;
    if (aHas && bHas) {
      const byDate = String(a.deadline).localeCompare(String(b.deadline));
      if (byDate !== 0) return byDate;
      const aTime = a.deadlineTime || '99:99';
      const bTime = b.deadlineTime || '99:99';
      return aTime.localeCompare(bTime);
    }
    if (aHas) return -1;
    if (bHas) return 1;
    return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
  });
}

export function listenChildTodos(familyId, childId, onChange) {
  if (!familyId || !childId) return () => {};
  const ref = collection(db, 'families', familyId, 'children', childId, 'todos');
  return onSnapshot(ref, (snap) => {
    const items = snap.docs.map(mapTodo).filter((t) => !t.deleted && t.active);
    onChange(items);
  }, () => onChange([]));
}

export async function attestTodo(familyId, childId, task, date, actor = {}) {
  const k = typeof date === 'string' ? date : dateKey(date);
  if (!familyId || !childId || !task?.id) throw new Error('missing-ids');
  if (!isDoneOn(task, k)) throw new Error('not-completed');
  const ref = doc(db, 'families', familyId, 'children', childId, 'todos', task.id);
  await updateDoc(ref, {
    [`attestedDates.${k}`]: {
      by: actor.uid || null,
      name: actor.name || 'Foresatt',
      at: serverTimestamp(),
    },
  });
}

export async function undoAttestTodo(familyId, childId, task, date) {
  const k = typeof date === 'string' ? date : dateKey(date);
  if (!familyId || !childId || !task?.id) throw new Error('missing-ids');
  const ref = doc(db, 'families', familyId, 'children', childId, 'todos', task.id);
  await updateDoc(ref, { [`attestedDates.${k}`]: deleteField() });
}

/** Varsle foresatte når et gjøremål er klar for attestering. */
export async function notifyParentsAttestPending(familyId, childId, task, date, opts = {}) {
  const k = typeof date === 'string' ? date : dateKey(date);
  const fid = task?.familyId || familyId;
  const cid = task?.childId || childId;
  const tid = task?.sourceTodoId || task?.id;
  if (!fid || !cid || !tid) return { notified: 0, failed: 0 };

  try {
    const parentsSnap = await getDocs(collection(db, 'families', fid, 'parents'));
    const parentUids = [];
    parentsSnap.docs.forEach((d) => {
      const data = d.data() || {};
      if (data.deleted === true || data.active === false) return;
      const uid = data.uid || d.id;
      if (uid) parentUids.push(uid);
    });
    if (!parentUids.length) return { notified: 0, failed: 0 };

    let childName = opts.childName || null;
    if (!childName) {
      try {
        const childSnap = await getDoc(doc(db, 'families', fid, 'children', cid));
        childName = childSnap.exists() ? (childSnap.data()?.name || null) : null;
      } catch {
        /* ignore */
      }
    }

    const createdBy = opts.createdBy || auth.currentUser?.uid || null;
    const taskTitle = task?.title || task?.name || 'Gjøremål';
    return notifyUsers(parentUids, {
      eventType: 'attestPending',
      title: 'Til attestering',
      body: `${childName || 'Barn'}: ${taskTitle}`,
      familyId: fid,
      childId: cid,
      todoId: tid,
      dateKey: k,
      createdBy,
      notificationId: `attest_${cid}_${tid}_${k}`,
    });
  } catch (e) {
    console.warn('[notifyParentsAttestPending]', e?.message || e);
    return { notified: 0, failed: 1 };
  }
}

export async function toggleTodo(familyId, childId, task, date) {
  const k = typeof date === 'string' ? date : dateKey(date);
  if (isFutureDate(typeof date === 'string' ? parseDateKey(k) : date)) {
    throw new Error('future-date');
  }
  const done = isDoneOn(task, k);
  // Støtt profil-oppgaver fra annen plattform (crossPlatformData)
  const fid = task?.familyId || familyId;
  const cid = task?.childId || childId;
  const tid = task?.sourceTodoId || task?.id;
  const ref = doc(db, 'families', fid, 'children', cid, 'todos', tid);

  if (isRangeOnceTask(task)) {
    const { start, end } = onceRangeBounds(task);
    if (done) {
      const inRange = (task.completedDates || []).filter((d) => d >= start && d <= end);
      const patch = {};
      if (inRange.length) patch.completedDates = arrayRemove(...inRange);
      inRange.forEach((dk) => { patch[`attestedDates.${dk}`] = deleteField(); });
      if (Object.keys(patch).length) await updateDoc(ref, patch);
      return false;
    }
    await updateDoc(ref, { completedDates: arrayUnion(k) });
    notifyParentsAttestPending(fid, cid, task, k).catch(() => {});
    return true;
  }

  if (done) {
    await updateDoc(ref, {
      completedDates: arrayRemove(k),
      [`attestedDates.${k}`]: deleteField(),
    });
    return false;
  }
  await updateDoc(ref, { completedDates: arrayUnion(k) });
  notifyParentsAttestPending(fid, cid, task, k).catch(() => {});
  return true;
}

export { FAMILY_ASSIGNEE, parentTaskVisibleToUser } from './parentTaskVisibility';

export function listenParentTodos(familyId, onChange) {
  if (!familyId) return () => {};
  // Shared hub — home badges + widgets + plan reuse one onSnapshot.
  // Hub stores raw mapped docs; this wrapper applies the active/non-deleted filter.
  // eslint-disable-next-line global-require
  const { subscribeFamilyCollection } = require('./sharedCollectionListeners');
  return subscribeFamilyCollection(
    familyId,
    'parentTodos',
    (snap) => snap.docs.map(mapTodo),
    (items) => onChange((items || []).filter((t) => !t.deleted && t.active)),
  );
}

export async function toggleParentTodo(familyId, task, date) {
  const k = typeof date === 'string' ? date : dateKey(date);
  const done = isDoneOn(task, k);
  const fid = task?.familyId || familyId;
  const tid = task?.sourceTodoId || task?.id;
  const ref = doc(db, 'families', fid, 'parentTodos', tid);
  await updateDoc(ref, { completedDates: done ? arrayRemove(k) : arrayUnion(k) });
  return !done;
}

export async function restoreParentTodo(familyId, task) {
  const fid = task?.familyId || familyId;
  const tid = task?.sourceTodoId || task?.id;
  if (!fid || !tid) return;
  const ref = doc(db, 'families', fid, 'parentTodos', tid);
  await updateDoc(ref, { deleted: false });
}

export async function purgeParentTodo(familyId, task) {
  const fid = task?.familyId || familyId;
  const tid = task?.sourceTodoId || task?.id;
  if (!fid || !tid) return;
  const ref = doc(db, 'families', fid, 'parentTodos', tid);
  await deleteDoc(ref);
}

export function isLekserTodo(task) {
  return String(task?.category || '').toLowerCase() === 'lekser';
}

/** Session-guard: aldri reparer samme todo mer enn én gang per app-lasting. */
const repairedLekserIds = new Set();

/**
 * Finn AI-importerte lekser uten sluttdato (feilaktig weekly → hele året)
 * og konverter til once med ukens man–fre basert på opprettet-dato.
 */
export function needsLekserDateRepair(task) {
  if (!task?.id || repairedLekserIds.has(task.id)) return false;
  if (!isLekserTodo(task)) return false;
  if (String(task.type || '').toLowerCase() === 'once') {
    const range = onceRangeBounds(task);
    return !range;
  }
  // weekly/daily uten endKey = ubegrenset gjentakelse
  return !task.endKey;
}

export async function repairUnboundedLekser(familyId, childId, todos) {
  if (!familyId || !childId) return 0;
  let fixed = 0;
  for (const t of todos || []) {
    if (!needsLekserDateRepair(t)) continue;
    repairedLekserIds.add(t.id);
    let base = new Date();
    if (t.createdAt?.toDate) base = t.createdAt.toDate();
    else if (t.createdAt?.seconds) base = new Date(t.createdAt.seconds * 1000);
    else if (typeof t.createdAt === 'string') base = new Date(t.createdAt);

    const mon = dateKey(startOfWeekMonday(base));
    const fri = dateKey(addDays(startOfWeekMonday(base), 4));
    const ref = doc(db, 'families', familyId, 'children', childId, 'todos', t.id);
    try {
      await updateDoc(ref, {
        type: 'once',
        daysOfWeek: [],
        startKey: mon,
        endKey: fri,
        dueDate: fri,
        category: 'lekser',
        dateRepairedAt: Date.now(),
      });
      fixed += 1;
    } catch {
      repairedLekserIds.delete(t.id);
    }
  }
  return fixed;
}

export function weekBoundsKeys(refDate = new Date()) {
  const mon = startOfWeekMonday(refDate);
  return {
    startKey: dateKey(mon),
    endKey: dateKey(addDays(mon, 4)),
    sundayKey: dateKey(addDays(mon, 6)),
  };
}

/** Lekser som overlapper en uke (man–søn). */
export function lekserInWeek(todos, refDate = new Date()) {
  const { startKey, sundayKey } = weekBoundsKeys(refDate);
  return (todos || []).filter((t) => {
    if (!isLekserTodo(t)) return false;
    const range = onceRangeBounds(t);
    if (range) {
      return range.start <= sundayKey && range.end >= startKey;
    }
    // Fallback: gjelder i dag / uken via appliesOnDate
    for (let i = 0; i < 7; i += 1) {
      if (appliesOnDate(t, addDays(parseDateKey(startKey), i))) return true;
    }
    return false;
  });
}

export { dueDateKey };
