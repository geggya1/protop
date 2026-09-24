/**
 * Boligen — vedlikehold, garanti, anlegg og enkle avvik.
 * Rent hjelpelag uten Firebase. Fokus: privat bolig, ikke FDV for næring.
 */

import { addMonthsToDateKey } from './boligPaper.js';

export const WARRANTY_WARN_DAYS = 30;
export const CARE_WARN_DAYS = 14;

export const TASK_CADENCES = [
  { id: 'yearly', label: 'Hvert år', months: 12 },
  { id: 'biannual', label: 'To ganger i året', months: 6 },
  { id: 'monthly', label: 'Hver måned', months: 1 },
  { id: 'once', label: 'Én gang', months: 0 },
];

export const TASK_PRIORITIES = [
  { id: 'safety', label: 'Trygghet' },
  { id: 'prevent', label: 'Forebygg skade' },
  { id: 'comfort', label: 'Trivsel' },
];

export const SYSTEM_KINDS = [
  { id: 'heatpump', label: 'Varmepumpe' },
  { id: 'waterheater', label: 'Varmtvann' },
  { id: 'electrical', label: 'Sikringsskap' },
  { id: 'ventilation', label: 'Ventilasjon' },
  { id: 'smoke', label: 'Røykvarsler' },
  { id: 'other', label: 'Annet' },
];

/** Startpakke for et vanlig privat hjem. Ikke kopiert fra andre produkter. */
export const STARTER_TASKS = [
  {
    starterKey: 'smoke',
    title: 'Test røykvarslere',
    cadence: 'biannual',
    priority: 'safety',
    month: 1,
    notes: 'Trykk testknappen. Bytt batteri hvis den piper svakt.',
  },
  {
    starterKey: 'gutters',
    title: 'Rens takrenner',
    cadence: 'yearly',
    priority: 'prevent',
    month: 10,
    notes: 'Fjern løv før frost, så vannet renner unna tak og grunnmur.',
  },
  {
    starterKey: 'outdoor-tap',
    title: 'Steng utekran før frost',
    cadence: 'yearly',
    priority: 'prevent',
    month: 10,
    notes: 'Steng inne, åpne ute, og tøm slangen.',
  },
  {
    starterKey: 'heatpump-filter',
    title: 'Rens filter i varmepumpe',
    cadence: 'biannual',
    priority: 'prevent',
    month: 4,
    notes: 'Støvsug eller skyll filteret slik bruksanvisningen sier.',
  },
  {
    starterKey: 'insurance',
    title: 'Sjekk boligforsikringen',
    cadence: 'yearly',
    priority: 'safety',
    month: 1,
    notes: 'Se at adresse, dekning og egenandel fortsatt stemmer.',
  },
];

const CADENCE_IDS = new Set(TASK_CADENCES.map((c) => c.id));
const PRIORITY_IDS = new Set(TASK_PRIORITIES.map((p) => p.id));
const SYSTEM_IDS = new Set(SYSTEM_KINDS.map((k) => k.id));
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function cleanStr(value, max = 200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function dateOrNull(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function newCareId(prefix = 'c') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '').trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Positive when toKey is after fromKey. */
export function daysBetween(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function formatCareDate(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  return `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function cadenceMeta(id) {
  return TASK_CADENCES.find((c) => c.id === id) || TASK_CADENCES[0];
}

export function priorityMeta(id) {
  return TASK_PRIORITIES.find((p) => p.id === id) || TASK_PRIORITIES[1];
}

export function systemKindMeta(id) {
  return SYSTEM_KINDS.find((k) => k.id === id) || SYSTEM_KINDS[SYSTEM_KINDS.length - 1];
}

function nextMonthDay(month, day, now) {
  const safeMonth = Math.min(12, Math.max(1, Number(month) || 1));
  const y = now.getFullYear();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const thisYear = new Date(y, safeMonth - 1, day, 12);
  const date = thisYear >= today ? thisYear : new Date(y + 1, safeMonth - 1, day, 12);
  return todayKey(date);
}

export function suggestedDueKey({ month = 1, cadence = 'yearly' } = {}, now = new Date()) {
  const primary = nextMonthDay(month, 15, now);
  if (cadence !== 'biannual') return primary;
  const otherMonth = ((Number(month) - 1 + 6) % 12) + 1;
  const other = nextMonthDay(otherMonth, 15, now);
  return primary < other ? primary : other;
}

export function nextDueAfter(dateKey, cadence) {
  const meta = cadenceMeta(cadence);
  if (!meta.months || !dateOrNull(dateKey)) return dateOrNull(dateKey);
  return addMonthsToDateKey(dateKey, meta.months);
}

function cleanHistory(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => ({
      dateKey: dateOrNull(row?.dateKey),
      note: cleanStr(row?.note, 240),
    }))
    .filter((row) => row.dateKey)
    .slice(-12);
}

export function cleanTasks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((task) => {
      const title = cleanStr(task?.title, 120);
      if (!title) return null;
      const cadence = CADENCE_IDS.has(task?.cadence) ? task.cadence : 'yearly';
      const priority = PRIORITY_IDS.has(task?.priority) ? task.priority : 'prevent';
      return {
        id: cleanStr(task?.id, 40) || newCareId('task'),
        title,
        notes: cleanStr(task?.notes, 400),
        cadence,
        priority,
        starterKey: cleanStr(task?.starterKey, 40) || null,
        roomId: cleanStr(task?.roomId, 40) || null,
        systemId: cleanStr(task?.systemId, 40) || null,
        nextDueKey: dateOrNull(task?.nextDueKey),
        lastDoneKey: dateOrNull(task?.lastDoneKey),
        status: task?.status === 'done' ? 'done' : 'open',
        history: cleanHistory(task?.history),
      };
    })
    .filter(Boolean);
}

export function cleanIssues(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((issue) => {
      const title = cleanStr(issue?.title, 120);
      if (!title) return null;
      return {
        id: cleanStr(issue?.id, 40) || newCareId('issue'),
        title,
        notes: cleanStr(issue?.notes, 400),
        severity: issue?.severity === 'high' ? 'high' : 'normal',
        status: issue?.status === 'fixed' ? 'fixed' : 'open',
        roomId: cleanStr(issue?.roomId, 40) || null,
        systemId: cleanStr(issue?.systemId, 40) || null,
        openedKey: dateOrNull(issue?.openedKey),
        fixedKey: dateOrNull(issue?.fixedKey),
      };
    })
    .filter(Boolean);
}

export function cleanSystems(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((system) => {
      const name = cleanStr(system?.name, 120);
      if (!name) return null;
      const months = Number(system?.serviceMonths);
      return {
        id: cleanStr(system?.id, 40) || newCareId('sys'),
        name,
        kind: SYSTEM_IDS.has(system?.kind) ? system.kind : 'other',
        notes: cleanStr(system?.notes, 400),
        roomId: cleanStr(system?.roomId, 40) || null,
        contractorId: cleanStr(system?.contractorId, 40) || null,
        serviceMonths: Number.isFinite(months) && months > 0 ? Math.round(months) : 12,
        lastServiceKey: dateOrNull(system?.lastServiceKey),
        nextServiceKey: dateOrNull(system?.nextServiceKey),
      };
    })
    .filter(Boolean);
}

export function missingStarterTasks(existing = [], now = new Date()) {
  const have = new Set((existing || []).map((task) => task?.starterKey).filter(Boolean));
  return STARTER_TASKS
    .filter((task) => !have.has(task.starterKey))
    .map((task) => ({
      ...task,
      id: newCareId('task'),
      nextDueKey: suggestedDueKey(task, now),
      lastDoneKey: null,
      status: 'open',
      history: [],
    }));
}

export function markTaskDone(task, dateKey, note = '') {
  const doneKey = dateOrNull(dateKey) || todayKey();
  const history = cleanHistory([
    ...(task?.history || []),
    { dateKey: doneKey, note },
  ]);
  if (task?.cadence === 'once') {
    return {
      ...task,
      status: 'done',
      lastDoneKey: doneKey,
      history,
    };
  }
  return {
    ...task,
    status: 'open',
    lastDoneKey: doneKey,
    nextDueKey: nextDueAfter(doneKey, task?.cadence),
    history,
  };
}

export function markIssueFixed(issue, dateKey) {
  const fixedKey = dateOrNull(dateKey) || todayKey();
  return { ...issue, status: 'fixed', fixedKey };
}

export function markSystemServiced(system, dateKey) {
  const doneKey = dateOrNull(dateKey) || todayKey();
  const months = Number(system?.serviceMonths) > 0 ? Number(system.serviceMonths) : 12;
  return {
    ...system,
    lastServiceKey: doneKey,
    nextServiceKey: addMonthsToDateKey(doneKey, months),
  };
}

function dueTone(days) {
  if (days == null) return 'open';
  if (days < 0) return 'overdue';
  if (days <= CARE_WARN_DAYS) return 'soon';
  return 'later';
}

function watchLabel(kind, title, days) {
  const name = title || 'Oppgave';
  if (kind === 'warranty') {
    if (days < 0) return `Garanti utløpt · ${name}`;
    if (days === 0) return `Garanti utløper i dag · ${name}`;
    return `Garanti om ${days} dager · ${name}`;
  }
  if (kind === 'issue') {
    return days < 0 ? name : `Noe å fikse · ${name}`;
  }
  if (kind === 'system') {
    if (days < 0) return `Service forfalt · ${name}`;
    if (days === 0) return `Service i dag · ${name}`;
    return `Service om ${days} dager · ${name}`;
  }
  if (days < 0) return `Forfalt · ${name}`;
  if (days === 0) return `I dag · ${name}`;
  return `Om ${days} dager · ${name}`;
}

export function warrantyAlerts(entries = [], today = todayKey(), warnDays = WARRANTY_WARN_DAYS) {
  return (entries || [])
    .filter((entry) => dateOrNull(entry?.warrantyUntil))
    .map((entry) => {
      const days = daysBetween(today, entry.warrantyUntil);
      return {
        id: `warranty:${entry.id}`,
        refId: entry.id,
        kind: 'warranty',
        title: entry.title || 'Garanti',
        dateKey: entry.warrantyUntil,
        days,
        tone: dueTone(days),
        label: watchLabel('warranty', entry.title, days),
      };
    })
    .filter((item) => item.days != null && item.days <= warnDays);
}

export function taskAlerts(tasks = [], today = todayKey(), warnDays = CARE_WARN_DAYS) {
  return (tasks || [])
    .filter((task) => task?.status !== 'done' && dateOrNull(task?.nextDueKey))
    .map((task) => {
      const days = daysBetween(today, task.nextDueKey);
      return {
        id: `task:${task.id}`,
        refId: task.id,
        kind: 'task',
        title: task.title,
        dateKey: task.nextDueKey,
        days,
        tone: dueTone(days),
        label: watchLabel('task', task.title, days),
      };
    })
    .filter((item) => item.days != null && item.days <= warnDays);
}

export function systemAlerts(systems = [], today = todayKey(), warnDays = WARRANTY_WARN_DAYS) {
  return (systems || [])
    .filter((system) => dateOrNull(system?.nextServiceKey))
    .map((system) => {
      const days = daysBetween(today, system.nextServiceKey);
      return {
        id: `system:${system.id}`,
        refId: system.id,
        kind: 'system',
        title: system.name,
        dateKey: system.nextServiceKey,
        days,
        tone: dueTone(days),
        label: watchLabel('system', system.name, days),
      };
    })
    .filter((item) => item.days != null && item.days <= warnDays);
}

export function issueAlerts(issues = []) {
  return (issues || [])
    .filter((issue) => issue?.status !== 'fixed')
    .map((issue) => ({
      id: `issue:${issue.id}`,
      refId: issue.id,
      kind: 'issue',
      title: issue.title,
      dateKey: issue.openedKey || null,
      days: issue.severity === 'high' ? -1 : 0,
      tone: issue.severity === 'high' ? 'overdue' : 'open',
      label: watchLabel('issue', issue.title, issue.severity === 'high' ? -1 : 0),
    }));
}

export function watchItems(bolig = {}, today = todayKey(), holdings = []) {
  const homeHoldings = holdingsForHome(holdings, bolig.id).map((holding) => ({
    id: `item_${holding.id}`,
    title: holding.title,
    warrantyUntil: holding.warrantyUntil,
  }));
  const items = [
    ...warrantyAlerts(bolig.entries, today),
    ...warrantyAlerts(homeHoldings, today),
    ...taskAlerts(bolig.tasks, today),
    ...systemAlerts(bolig.systems, today),
    ...issueAlerts(bolig.issues),
  ];
  return items.sort((a, b) => {
    const ad = a.days == null ? 99 : a.days;
    const bd = b.days == null ? 99 : b.days;
    if (ad !== bd) return ad - bd;
    return String(a.title).localeCompare(String(b.title), 'nb');
  });
}

export function careNotificationId(familyId, boligId, items = []) {
  const sig = items.map((item) => `${item.kind}:${item.refId}:${item.dateKey || ''}`).sort().join('|');
  let hash = 0;
  for (let i = 0; i < sig.length; i += 1) {
    hash = (hash * 31 + sig.charCodeAt(i)) >>> 0;
  }
  const home = String(boligId || 'home').replace(/[^\w-]/g, '').slice(0, 40);
  const family = String(familyId || 'family').replace(/[^\w-]/g, '').slice(0, 40);
  return `boligcare_${family}_${home}_${hash.toString(36)}`;
}

export function careReminderCopy(homeTitle, items = []) {
  const name = cleanStr(homeTitle, 80) || 'Boligen';
  const lines = items.slice(0, 3).map((item) => item.label).filter(Boolean);
  return {
    title: `${name}: noe bør gjøres`,
    body: lines.join(' · ') || 'Se vedlikehold, garanti og det som skal fikses.',
  };
}

export function itemCareParts(holding = {}, bolig = {}) {
  const room = (bolig.rooms || []).find((row) => row.id === holding.roomId);
  const paper = (bolig.entries || []).find((row) => row.id === holding.linkedEntryId);
  return [
    room?.name || null,
    holding.warrantyUntil ? `garanti til ${holding.warrantyUntil}` : null,
    paper?.title || null,
  ].filter(Boolean);
}

export function holdingsForHome(holdings = [], boligId) {
  return (holdings || []).filter((holding) => !holding?.boligId || holding.boligId === boligId);
}
