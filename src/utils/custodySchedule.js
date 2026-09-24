import {
  addDays, dateKey, mondayKeyOf, parseDateKey, startOfWeekMonday,
} from './dates.js';
import { eventOccursOnDate, repeatSummaryLabel, buildRecurrencePayload } from './events.js';
import {
  initRepeatFromTodo,
  normalizeRecurrenceStartKey,
} from './todoRecurrence.js';

export const CUSTODY_OVERLAY_KEY = 'weekplan.custodyOverlay.v1';

const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function flipSlot(slot) {
  return slot === 'parentA' ? 'parentB' : 'parentA';
}

export function makeCustodyRuleId() {
  return `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function custodyEnabled(childOrSchedule) {
  const schedule = childOrSchedule?.custody || childOrSchedule;
  const normalized = normalizeCustody(schedule);
  return !!normalized?.enabled && (normalized.rules || []).length > 0;
}

/** Visningsnavn for hver bostedsside (konto er valgfritt). */
export function resolveCustodyLabels(schedule, { parents = [], viewerUid } = {}) {
  const s = normalizeCustodyForm(schedule);
  const memberA = s.parentAUid
    ? (parents || []).find((p) => (p.uid || p.id) === s.parentAUid)
    : null;
  const memberB = s.parentBUid
    ? (parents || []).find((p) => (p.uid || p.id) === s.parentBUid)
    : null;
  const me = viewerUid
    ? (parents || []).find((p) => (p.uid || p.id) === viewerUid)
    : null;
  const defaultA = me && s.parentAUid === viewerUid
    ? (String(me.name || '').split(' ')[0] || 'Meg')
    : 'Meg';
  return {
    parentA: s.parentALabel?.trim() || memberA?.name || defaultA,
    parentB: s.parentBLabel?.trim() || memberB?.name || 'Andre forelder',
  };
}

/** Hvilken side (A/B) som er «mine» dager for innlogget forelder. */
export function viewerCustodySlot(schedule, viewerUid) {
  if (!viewerUid) return null;
  const s = normalizeCustodyForm(schedule);
  if (s.myParentSlot === 'parentA' || s.myParentSlot === 'parentB') {
    if (s.parentAUid === viewerUid || s.parentBUid === viewerUid || !s.parentBUid) {
      return s.myParentSlot;
    }
  }
  if (s.parentAUid === viewerUid) return 'parentA';
  if (s.parentBUid === viewerUid) return 'parentB';
  if (s.parentAUid && !s.parentBUid) return 'parentA';
  return null;
}

export function slotIsMine(schedule, slot, viewerUid) {
  const mySlot = viewerCustodySlot(schedule, viewerUid);
  if (!mySlot) return false;
  return slot === mySlot;
}

function mondayIdxToGetDay(i) {
  return (i + 1) % 7;
}

function readDayMap(map, dayIdx) {
  if (!map || typeof map !== 'object') return null;
  const raw = map[dayIdx] ?? map[String(dayIdx)] ?? null;
  return raw === 'parentA' || raw === 'parentB' ? raw : null;
}

function makeRuleFromRecurrence({
  id,
  parentSlot,
  label,
  dateKey: ruleDateKey,
  preset,
  customType,
  customInterval,
  recurrenceByDays,
  recurrenceUntilKey,
}) {
  const baseDay = parseDateKey(ruleDateKey)?.getDay() ?? 1;
  const recurrence = buildRecurrencePayload({
    preset,
    customType,
    customInterval,
    recurrenceByDays,
    recurrenceUntilKey,
    baseDay,
  });
  let normalizedDateKey = ruleDateKey || dateKey(new Date());
  if (recurrence.recurring && recurrence.recurrenceType === 'weekly') {
    normalizedDateKey = normalizeRecurrenceStartKey(normalizedDateKey, recurrence);
  }
  return {
    id: id || makeCustodyRuleId(),
    parentSlot: parentSlot === 'parentB' ? 'parentB' : 'parentA',
    label: label?.trim() || '',
    dateKey: normalizedDateKey,
    ...recurrence,
  };
}

/** Convert old mode-based custody docs to recurrence rules. */
function legacyModeToRules(raw) {
  const anchor = mondayKeyOf(raw.anchorMondayKey || raw.anchorDateKey)
    || mondayKeyOf(dateKey(startOfWeekMonday(new Date())));
  const weekAOwner = raw.weekAOwner === 'parentB' ? 'parentB' : 'parentA';
  const mode = raw.mode || 'alternating_weeks';

  if (mode === 'alternating_weeks') {
    const anchorB = dateKey(addDays(parseDateKey(anchor), 7));
    return [
      makeRuleFromRecurrence({
        parentSlot: weekAOwner,
        dateKey: anchor,
        preset: 'biweekly',
        customType: 'weekly',
        customInterval: 2,
        recurrenceByDays: ALL_WEEK_DAYS,
        recurrenceUntilKey: raw.effectiveUntil || '',
      }),
      makeRuleFromRecurrence({
        parentSlot: flipSlot(weekAOwner),
        dateKey: anchorB,
        preset: 'biweekly',
        customType: 'weekly',
        customInterval: 2,
        recurrenceByDays: ALL_WEEK_DAYS,
        recurrenceUntilKey: raw.effectiveUntil || '',
      }),
    ];
  }

  if (mode === 'weekly') {
    const daysA = [];
    const daysB = [];
    for (let i = 0; i < 7; i += 1) {
      const slot = readDayMap(raw.weekDays, i) || weekAOwner;
      const gd = mondayIdxToGetDay(i);
      if (slot === 'parentA') daysA.push(gd);
      else daysB.push(gd);
    }
    const rules = [];
    if (daysA.length) {
      rules.push(makeRuleFromRecurrence({
        parentSlot: 'parentA',
        dateKey: anchor,
        preset: 'weekly',
        recurrenceByDays: daysA,
      }));
    }
    if (daysB.length) {
      rules.push(makeRuleFromRecurrence({
        parentSlot: 'parentB',
        dateKey: anchor,
        preset: 'weekly',
        recurrenceByDays: daysB,
      }));
    }
    return rules;
  }

  if (mode === 'two_week_cycle') {
    const buildWeekRules = (map, slot, weekOffset) => {
      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const gd = mondayIdxToGetDay(i);
        if (readDayMap(map, i) === slot) days.push(gd);
      }
      if (!days.length) return null;
      return makeRuleFromRecurrence({
        parentSlot: slot,
        dateKey: dateKey(addDays(parseDateKey(anchor), weekOffset * 7)),
        preset: 'biweekly',
        customType: 'weekly',
        customInterval: 2,
        recurrenceByDays: days,
        recurrenceUntilKey: raw.effectiveUntil || '',
      });
    };
    const rules = [];
    ['parentA', 'parentB'].forEach((slot) => {
      const weekA = buildWeekRules(raw.weekADays, slot, 0);
      const weekB = buildWeekRules(raw.weekBDays, slot, 1);
      if (weekA) rules.push(weekA);
      if (weekB) rules.push(weekB);
    });
    return rules;
  }

  return [];
}

export function recurrenceUiFromRule(rule) {
  const repeat = initRepeatFromTodo({
    ...rule,
    recurring: rule?.recurring !== false,
    recurrenceType: rule?.recurrenceType,
    recurrenceInterval: rule?.recurrenceInterval,
    recurrenceByDays: rule?.recurrenceByDays,
    recurrenceUntilKey: rule?.recurrenceUntilKey || '',
    startKey: rule?.dateKey,
  });
  return {
    ...repeat,
    dateKey: rule?.dateKey || dateKey(new Date()),
  };
}

export function normalizeCustodyRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const ui = recurrenceUiFromRule(rule);
  return makeRuleFromRecurrence({
    id: rule.id,
    parentSlot: rule.parentSlot,
    label: rule.label,
    dateKey: ui.dateKey,
    preset: ui.preset,
    customType: ui.customType,
    customInterval: ui.customInterval,
    recurrenceByDays: ui.recurrenceByDays,
    recurrenceUntilKey: ui.recurrenceUntilKey,
  });
}

/** UI / skjema — beholder enabled og regler mens planen redigeres. */
export function normalizeCustodyForm(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      parentAUid: null,
      parentBUid: null,
      parentALabel: 'Meg',
      parentBLabel: 'Andre forelder',
      myParentSlot: 'parentA',
      rules: [],
    };
  }
  const parentAUid = String(raw.parentAUid || '').trim() || null;
  const parentBUid = String(raw.parentBUid || '').trim() || null;
  const parentALabel = String(raw.parentALabel || '').trim() || 'Meg';
  const parentBLabel = String(raw.parentBLabel || '').trim() || 'Andre forelder';
  const myParentSlot = raw.myParentSlot === 'parentB' ? 'parentB' : 'parentA';
  let rules = Array.isArray(raw.rules) ? raw.rules : [];
  if (!rules.length && raw.mode) {
    rules = legacyModeToRules(raw);
  }
  const normalizedRules = rules
    .map((rule) => normalizeCustodyRule(rule))
    .filter(Boolean);

  return {
    enabled: !!raw.enabled,
    parentAUid,
    parentBUid: parentBUid && parentBUid !== parentAUid ? parentBUid : null,
    parentALabel,
    parentBLabel,
    myParentSlot,
    rules: normalizedRules,
  };
}

/** Lagret / aktiv plan — krever bare minst én regel. */
export function normalizeCustody(raw = {}) {
  const form = normalizeCustodyForm(raw);
  if (!form.enabled || !form.rules.length) {
    return { ...form, enabled: false, rules: [] };
  }
  return { ...form, enabled: true };
}

export function custodyFormReady(form) {
  const f = normalizeCustodyForm(form);
  return !!f.enabled && (f.rules || []).length > 0;
}

export function newCustodyRule({
  parentSlot = 'parentA',
  preset = 'weekly',
  dateKey: ruleDateKey = mondayKeyOf(dateKey(startOfWeekMonday(new Date()))),
} = {}) {
  return makeRuleFromRecurrence({
    id: makeCustodyRuleId(),
    parentSlot,
    label: '',
    dateKey: ruleDateKey,
    preset,
    customType: 'weekly',
    customInterval: preset === 'biweekly' ? 2 : 1,
    recurrenceByDays: ALL_WEEK_DAYS,
    recurrenceUntilKey: '',
  });
}

export function defaultCustodyRules() {
  const anchor = mondayKeyOf(dateKey(startOfWeekMonday(new Date())));
  return [
    newCustodyRule({ parentSlot: 'parentA', preset: 'biweekly', dateKey: anchor }),
    newCustodyRule({
      parentSlot: 'parentB',
      preset: 'biweekly',
      dateKey: dateKey(addDays(parseDateKey(anchor), 7)),
    }),
  ];
}

export function defaultCustodySchedule({ parentAUid, parentBUid, myUid, parentALabel, parentBLabel } = {}) {
  const a = parentAUid || myUid || null;
  return normalizeCustody({
    enabled: true,
    parentAUid: a,
    parentBUid: parentBUid || null,
    parentALabel: parentALabel || 'Meg',
    parentBLabel: parentBLabel || 'Andre forelder',
    myParentSlot: 'parentA',
    rules: defaultCustodyRules(),
  });
}

export function initCustodyForm(child, { parents = [], myUid } = {}) {
  const activeParents = (parents || []).filter((p) => p.active !== false && p.archived !== true);
  const me = activeParents.find((p) => (p.uid || p.id) === myUid);
  const otherParents = activeParents.filter((p) => (p.uid || p.id) !== myUid);
  const fallbackA = myUid || activeParents[0]?.uid || activeParents[0]?.id || null;
  const fallbackB = otherParents[0]?.uid || otherParents[0]?.id || null;
  const myLabel = String(me?.name || me?.displayName || '').split(' ')[0] || 'Meg';

  const normalized = normalizeCustody(child?.custody);
  if (normalized?.enabled) return normalized;

  const draft = normalizeCustodyForm(child?.custody);
  if (draft.rules?.length || draft.enabled) return draft;

  return normalizeCustodyForm({
    enabled: false,
    parentAUid: fallbackA,
    parentBUid: fallbackB,
    parentALabel: myLabel,
    parentBLabel: 'Andre forelder',
    myParentSlot: 'parentA',
    rules: [],
  });
}

export function buildCustodyPayload(form) {
  const normalized = normalizeCustody(form);
  if (!normalized?.enabled) {
    const draft = normalizeCustodyForm(form);
    return {
      custody: {
        enabled: false,
        parentAUid: draft.parentAUid || null,
        parentBUid: draft.parentBUid || null,
        parentALabel: draft.parentALabel || 'Meg',
        parentBLabel: draft.parentBLabel || 'Andre forelder',
        myParentSlot: draft.myParentSlot || 'parentA',
        rules: [],
      },
    };
  }
  return { custody: normalized };
}

export function custodyParentSlotForDate(schedule, date) {
  const normalized = normalizeCustody(schedule);
  if (!normalized?.enabled || !normalized.rules?.length) return null;

  let slot = null;
  normalized.rules.forEach((rule) => {
    if (eventOccursOnDate(rule, date)) {
      slot = rule.parentSlot;
    }
  });
  return slot;
}

/**
 * Antall bostedsbytter (handoffs) i uken som inneholder `date`.
 * Teller skift i foreldre-slot, inkl. bytte inn i uken (søndag → mandag).
 */
export function countCustodyHandoffsInWeek(schedule, date = new Date()) {
  if (!custodyEnabled(schedule)) return 0;
  const monday = startOfWeekMonday(date);
  let prev = custodyParentSlotForDate(schedule, addDays(monday, -1));
  let handoffs = 0;
  for (let i = 0; i < 7; i += 1) {
    const slot = custodyParentSlotForDate(schedule, addDays(monday, i));
    if (prev && slot && prev !== slot) handoffs += 1;
    if (slot) prev = slot;
  }
  return handoffs;
}

/** Sum/maks handoffs for flere barn med bosted denne uken. */
export function countFamilyCustodyHandoffsInWeek(kids = [], date = new Date()) {
  let max = 0;
  let sum = 0;
  (kids || []).forEach((child) => {
    if (!custodyEnabled(child)) return;
    const n = countCustodyHandoffsInWeek(child.custody, date);
    max = Math.max(max, n);
    sum += n;
  });
  // Én delt plan per familie: bruk maks (unngå dobbelttelling når søsken deler rytme).
  return max || sum;
}

export function custodyOwnerUid(schedule, date) {
  const slot = custodyParentSlotForDate(schedule, date);
  if (!slot) return null;
  const normalized = normalizeCustody(schedule);
  return slot === 'parentA' ? normalized.parentAUid : normalized.parentBUid;
}

export function custodyRuleSummary(rule, parentNames = {}) {
  const normalized = normalizeCustodyRule(rule);
  if (!normalized) return '';
  const repeat = initRepeatFromTodo(normalized);
  const repeatTxt = repeatSummaryLabel({
    preset: repeat.preset,
    customType: repeat.customType,
    customInterval: repeat.customInterval,
    recurrenceByDays: repeat.recurrenceByDays,
    recurrenceUntilKey: repeat.recurrenceUntilKey,
  });
  const parentName = normalized.parentSlot === 'parentB'
    ? (parentNames.parentB || 'Forelder B')
    : (parentNames.parentA || 'Forelder A');
  return `Hos ${String(parentName).trim()} · ${repeatTxt}`;
}

export function custodySummaryLabel(schedule, parentNames = {}) {
  const normalized = normalizeCustody(schedule);
  if (!normalized?.enabled) return 'Ikke aktivert';
  const n = normalized.rules?.length || 0;
  if (!n) return 'Ingen regler ennå';
  if (n === 1) return custodyRuleSummary(normalized.rules[0], parentNames);
  return `${n} bostedsregler`;
}

export function childrenWithCustody(kids = []) {
  return (kids || []).filter((child) => custodyEnabled(child));
}

export function custodyOverlayForDay({
  date,
  kids = [],
  viewerUid,
  childFilter = 'all',
  viewerIsChild = false,
}) {
  const targets = childrenWithCustody(kids).filter((child) => (
    childFilter === 'all' || child.id === childFilter || child.uid === childFilter
  ));
  if (!targets.length || !viewerUid) return null;

  if (viewerIsChild && targets.length === 1) {
    const schedule = normalizeCustody(targets[0].custody);
    const slot = custodyParentSlotForDate(schedule, date);
    if (slot === 'parentA') return { kind: 'parentA', slots: [slot] };
    if (slot === 'parentB') return { kind: 'parentB', slots: [slot] };
    return null;
  }

  let mine = 0;
  let other = 0;
  let unknown = 0;
  const slots = [];

  targets.forEach((child) => {
    const schedule = normalizeCustody(child.custody);
    const slot = custodyParentSlotForDate(schedule, date);
    if (!slot) {
      unknown += 1;
      return;
    }
    slots.push(slot);
    if (slotIsMine(schedule, slot, viewerUid)) mine += 1;
    else other += 1;
  });

  const total = targets.length;
  if (mine === total) return { kind: 'mine', slots };
  if (other === total) return { kind: 'other', slots };
  if (mine > 0 && other > 0) return { kind: 'mixed', slots };
  if (unknown === total) return null;
  return { kind: 'mixed', slots };
}

export function custodyCellTint(overlay, { selected = false, today = false } = {}) {
  if (!overlay) return null;
  const alpha = selected ? 0.42 : (today ? 0.34 : 0.28);
  const borderAlpha = selected ? 0.9 : 0.55;

  if (overlay.kind === 'mine') {
    return {
      backgroundColor: `rgba(37, 99, 235, ${alpha})`,
      borderColor: `rgba(37, 99, 235, ${borderAlpha})`,
      borderWidth: 1,
    };
  }
  if (overlay.kind === 'parentA') {
    return {
      backgroundColor: `rgba(124, 58, 237, ${alpha})`,
      borderColor: `rgba(124, 58, 237, ${borderAlpha})`,
      borderWidth: 1,
    };
  }
  if (overlay.kind === 'parentB') {
    return {
      backgroundColor: `rgba(234, 88, 12, ${alpha})`,
      borderColor: `rgba(234, 88, 12, ${borderAlpha})`,
      borderWidth: 1,
    };
  }
  if (overlay.kind === 'other') {
    return {
      backgroundColor: `rgba(234, 88, 12, ${alpha * 0.75})`,
      borderColor: `rgba(234, 88, 12, ${borderAlpha * 0.7})`,
      borderWidth: 1,
    };
  }
  return {
    backgroundColor: `rgba(245, 158, 11, ${alpha})`,
    borderColor: `rgba(245, 158, 11, ${borderAlpha})`,
    borderWidth: 1,
  };
}

function hosLabel(name) {
  const n = String(name || '').trim();
  return n ? `Hos ${n}` : 'Hos forelder';
}

export function custodyLegendLabels({
  kids = [], viewerUid, childFilter = 'all', members = [], viewerIsChild = false,
}) {
  const child = childFilter === 'all'
    ? null
    : (kids || []).find((k) => k.id === childFilter || k.uid === childFilter);
  const singleChildView = viewerIsChild || !!child;
  const schedule = child?.custody
    ? normalizeCustody(child.custody)
    : null;
  const parentMembers = (members || []).filter((m) => m.role === 'parent');
  const labels = schedule
    ? resolveCustodyLabels(schedule, { parents: parentMembers, viewerUid })
    : null;

  if (singleChildView && schedule?.enabled && labels) {
    if (viewerIsChild) {
      return {
        mine: hosLabel(labels.parentA),
        other: null,
        mixed: 'Bytter i løpet av uken',
      };
    }
    const mySlot = viewerCustodySlot(schedule, viewerUid);
    const mineLabel = mySlot === 'parentB' ? labels.parentB : labels.parentA;
    return {
      mine: hosLabel(mineLabel),
      other: null,
      mixed: 'Bytter i løpet av uken',
    };
  }

  if (labels && viewerUid) {
    const mySlot = viewerCustodySlot(schedule, viewerUid);
    const mineLabel = mySlot === 'parentB' ? labels.parentB : labels.parentA;
    return {
      mine: hosLabel(mineLabel),
      other: null,
      mixed: child ? 'Bytter i løpet av uken' : 'Blandet uke',
    };
  }

  const me = parentMembers.find((m) => m.uid === viewerUid || m.id === viewerUid);
  return {
    mine: me ? hosLabel(me.name || 'deg') : 'Hos deg',
    other: null,
    mixed: child ? 'Bytter i løpet av uken' : 'Blandet uke',
  };
}
