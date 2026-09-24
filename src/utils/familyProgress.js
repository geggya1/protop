import { dateKey, parseDateKey, WEEKDAYS_SHORT } from './dates.js';
import {
  isAttestedOn, isDoneOn, isPendingAttestOn, todosOnDate, scoreInKeys, valueForTask,
} from './todoStatus.js';

export function choreTitleKey(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function weekdayLabel(dateKeyStr) {
  const d = parseDateKey(dateKeyStr);
  if (!d || Number.isNaN(d.getTime())) return '';
  return WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
}

export function shortDateLabel(dateKeyStr) {
  const d = parseDateKey(dateKeyStr);
  if (!d || Number.isNaN(d.getTime())) return dateKeyStr || '';
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/** Per-day chores for one child across an ISO week. */
export function weekPlanForChild(todos, weekKeys) {
  return (weekKeys || []).map((k) => {
    const day = parseDateKey(k);
    const chores = todosOnDate(todos || [], day).map((t) => ({
      id: t.id,
      title: t.title,
      value: valueForTask(t),
      rewardType: t.rewardType,
      done: isDoneOn(t, k),
      attested: isAttestedOn(t, k),
      pending: isPendingAttestOn(t, k),
      dateKey: k,
      task: t,
    }));
    return {
      dateKey: k,
      weekday: weekdayLabel(k),
      shortDate: shortDateLabel(k),
      chores,
      doneCount: chores.filter((c) => c.done).length,
      pendingCount: chores.filter((c) => c.pending).length,
    };
  });
}

/**
 * Same chore title assigned to 2+ children on the same day.
 * Helps parents spot e.g. two kids both taking out trash.
 */
export function findCrossChildDuplicates(activeKids, kidMap, weekKeys) {
  const duplicates = [];
  for (const k of weekKeys || []) {
    const byTitle = new Map();
    for (const kid of activeKids || []) {
      const todos = kidMap?.[kid.id] || [];
      for (const t of todosOnDate(todos, parseDateKey(k))) {
        const key = choreTitleKey(t.title);
        if (!key) continue;
        if (!byTitle.has(key)) byTitle.set(key, []);
        byTitle.get(key).push({
          kidId: kid.id,
          kidName: kid.name || 'Barn',
          todoId: t.id,
          title: t.title,
          dateKey: k,
        });
      }
    }
    for (const entries of byTitle.values()) {
      const uniqueKids = new Set(entries.map((e) => e.kidId));
      if (uniqueKids.size >= 2) {
        duplicates.push({
          dateKey: k,
          weekday: weekdayLabel(k),
          shortDate: shortDateLabel(k),
          title: entries[0].title,
          kids: entries,
        });
      }
    }
  }
  return duplicates;
}

/** Completed-but-not-attested occurrences in the given keys (typically week through today). */
export function collectPendingAttestations(activeKids, kidMap, keys) {
  const items = [];
  for (const kid of activeKids || []) {
    const todos = kidMap?.[kid.id] || [];
    for (const k of keys || []) {
      for (const t of todosOnDate(todos, parseDateKey(k))) {
        if (!isPendingAttestOn(t, k)) continue;
        items.push({
          id: `${kid.id}:${t.id}:${k}`,
          kidId: kid.id,
          kidName: kid.name || 'Barn',
          todoId: t.id,
          title: t.title,
          dateKey: k,
          weekday: weekdayLabel(k),
          shortDate: shortDateLabel(k),
          value: valueForTask(t),
          rewardType: t.rewardType,
          task: t,
        });
      }
    }
  }
  items.sort((a, b) => {
    const byDate = String(b.dateKey).localeCompare(String(a.dateKey));
    if (byDate) return byDate;
    return String(a.kidName).localeCompare(String(b.kidName), 'nb');
  });
  return items;
}

export function kidProgressSummary(todos, weekKeys, todayKey) {
  const todayTodos = todosOnDate(todos || [], parseDateKey(todayKey));
  const doneToday = todayTodos.filter((t) => isDoneOn(t, todayKey)).length;
  const pendingToday = todayTodos.filter((t) => isPendingAttestOn(t, todayKey)).length;
  const week = scoreInKeys(todos || [], weekKeys);
  let pendingWeek = 0;
  for (const k of weekKeys || []) {
    if (k > todayKey) continue;
    for (const t of todosOnDate(todos || [], parseDateKey(k))) {
      if (isPendingAttestOn(t, k)) pendingWeek += 1;
    }
  }
  return {
    todayTotal: todayTodos.length,
    doneToday,
    pendingToday,
    pendingWeek,
    weekEarned: week.earned,
    weekPossible: week.possible,
    weekDone: week.done,
    weekTotal: week.total,
  };
}

/**
 * Synlig rettferdighet (Sifanu): andel fullførte gjøremål per barn denne uka.
 * sharePct = andel av familiens totalt fullførte (ikke av tildelte).
 */
export function choreFairnessByKid(activeKids, kidMap, weekKeys, todayKey) {
  const rows = (activeKids || []).map((kid) => {
    const summary = kidProgressSummary(kidMap?.[kid.id] || [], weekKeys, todayKey);
    return {
      kidId: kid.id,
      name: kid.name || 'Barn',
      color: kid.color || null,
      avatarId: kid.avatarId || null,
      photoURL: kid.photoURL || kid.photoUrl || null,
      weekDone: summary.weekDone,
      weekTotal: summary.weekTotal,
      doneToday: summary.doneToday,
      todayTotal: summary.todayTotal,
      completionPct: summary.weekTotal
        ? Math.round((summary.weekDone / summary.weekTotal) * 100)
        : 0,
    };
  });
  const totalDone = rows.reduce((n, r) => n + r.weekDone, 0);
  return rows.map((r) => ({
    ...r,
    sharePct: totalDone > 0 ? Math.round((r.weekDone / totalDone) * 100) : 0,
    totalDone,
  })).sort((a, b) => b.weekDone - a.weekDone || a.name.localeCompare(b.name, 'nb'));
}

/** Per-child today/week progress in family order — for the home widget. */
export function kidProgressRows(activeKids, kidMap, weekKeys, todayKey) {
  return (activeKids || []).map((kid) => {
    const summary = kidProgressSummary(kidMap?.[kid.id] || [], weekKeys, todayKey);
    const name = String(kid.name || kid.displayName || 'Barn').trim().split(/\s+/)[0] || 'Barn';
    return {
      kidId: kid.id,
      name,
      photoURL: kid.photoURL || kid.photoUrl || null,
      avatarId: kid.avatarId || null,
      color: kid.color || null,
      doneToday: summary.doneToday,
      todayTotal: summary.todayTotal,
      pendingToday: summary.pendingToday,
      weekDone: summary.weekDone,
      weekTotal: summary.weekTotal,
      pct: summary.todayTotal
        ? Math.round((summary.doneToday / summary.todayTotal) * 100)
        : 0,
    };
  });
}

/** Keys from week start through today (no future days for attestation queue). */
export function attestKeysThroughToday(weekKeys, todayKey) {
  return (weekKeys || []).filter((k) => k <= todayKey);
}

export { dateKey, isDoneOn, isAttestedOn, isPendingAttestOn, scoreInKeys };
