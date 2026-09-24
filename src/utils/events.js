import { dateKey, isoWeekDiff, parseDateKey, addDays } from './dates.js';

export const REPEAT_PRESETS = [
  { id: 'never', label: 'Aldri' },
  { id: 'daily', label: 'Hver dag' },
  { id: 'weekly', label: 'Hver uke' },
  { id: 'biweekly', label: 'Annenhver uke' },
  { id: 'monthly', label: 'Hver måned' },
  { id: 'yearly', label: 'Hvert år' },
  { id: 'custom', label: 'Tilpasset' },
];

export const CUSTOM_FREQS = [
  { id: 'daily', label: 'Daglig', unit: 'dag' },
  { id: 'weekly', label: 'Ukentlig', unit: 'uke' },
  { id: 'monthly', label: 'Månedlig', unit: 'måned' },
  { id: 'yearly', label: 'Årlig', unit: 'år' },
];

export function initRepeatFromEvent(ev) {
  if (!ev?.recurring) {
    return {
      preset: 'never',
      customType: 'weekly',
      customInterval: 1,
      recurrenceByDays: [],
      recurrenceUntilKey: '',
    };
  }
  const type = String(ev.recurrenceType || 'weekly').toLowerCase();
  const interval = Math.max(1, Number(ev.recurrenceInterval || 1));
  let preset = 'custom';
  if (type === 'daily' && interval === 1) preset = 'daily';
  else if (type === 'weekly' && interval === 1) preset = 'weekly';
  else if (type === 'weekly' && interval === 2) preset = 'biweekly';
  else if (type === 'monthly' && interval === 1) preset = 'monthly';
  else if (type === 'yearly' && interval === 1) preset = 'yearly';

  return {
    preset,
    customType: type,
    customInterval: interval,
    recurrenceByDays: Array.isArray(ev.recurrenceByDays) ? ev.recurrenceByDays : [],
    recurrenceUntilKey: ev.recurrenceUntilKey || '',
  };
}

export function buildRecurrencePayload({
  preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey, baseDay,
}) {
  const until = recurrenceUntilKey?.trim() || null;
  if (preset === 'never') {
    return {
      recurring: false,
      recurrenceType: null,
      recurrenceInterval: 1,
      recurrenceByDays: [],
      recurrenceUntilKey: null,
    };
  }

  const presetMap = {
    daily: { type: 'daily', interval: 1, days: [] },
    weekly: { type: 'weekly', interval: 1, days: recurrenceByDays.length ? recurrenceByDays : [baseDay] },
    biweekly: { type: 'weekly', interval: 2, days: recurrenceByDays.length ? recurrenceByDays : [baseDay] },
    monthly: { type: 'monthly', interval: 1, days: [] },
    yearly: { type: 'yearly', interval: 1, days: [] },
  };

  if (preset !== 'custom') {
    const m = presetMap[preset];
    return {
      recurring: true,
      recurrenceType: m.type,
      recurrenceInterval: m.interval,
      recurrenceByDays: m.days,
      recurrenceUntilKey: until,
    };
  }

  const type = String(customType || 'weekly').toLowerCase();
  const interval = Math.max(1, Number(customInterval || 1));
  const days = type === 'weekly'
    ? (recurrenceByDays.length ? recurrenceByDays : [baseDay])
    : [];

  return {
    recurring: true,
    recurrenceType: type,
    recurrenceInterval: interval,
    recurrenceByDays: days,
    recurrenceUntilKey: until,
  };
}

export function repeatSummaryLabel({
  preset, customType, customInterval, recurrenceByDays, recurrenceUntilKey,
}) {
  const presetRow = REPEAT_PRESETS.find((p) => p.id === preset);
  let base = presetRow?.label || 'Aldri';
  if (preset === 'custom') {
    const freq = CUSTOM_FREQS.find((f) => f.id === customType);
    const n = Math.max(1, Number(customInterval || 1));
    const unit = freq?.unit || 'uke';
    base = n === 1 ? `Hver ${unit}` : `Hver ${n}. ${unit}`;
    if (customType === 'weekly' && recurrenceByDays?.length) {
      base += ` (${recurrenceByDays.length} dager)`;
    }
  }
  if (recurrenceUntilKey) base += ` · til ${recurrenceUntilKey}`;
  return base;
}

/** Short footer hint shown under recurrence settings (iOS-style). */
export function repeatDescriptionText({
  preset, customType, customInterval, recurrenceByDays,
}) {
  if (preset === 'never') return '';
  const n = Math.max(1, Number(customInterval || 1));

  const unitForms = {
    daily: ['dag', 'dager'],
    weekly: ['uke', 'uker'],
    monthly: ['måned', 'måneder'],
    yearly: ['år', 'år'],
  };

  const describe = (type, interval) => {
    const [one] = unitForms[type] || unitForms.weekly;
    // Norwegian: «hver 2. uke» (ordinal + singular), not «hver 2. uker»
    return interval === 1
      ? `Hendelsen vil gjentas hver ${one}.`
      : `Hendelsen vil gjentas hver ${interval}. ${one}.`;
  };

  if (preset === 'daily') return describe('daily', 1);
  if (preset === 'weekly') return describe('weekly', 1);
  if (preset === 'biweekly') return describe('weekly', 2);
  if (preset === 'monthly') return describe('monthly', 1);
  if (preset === 'yearly') return describe('yearly', 1);

  if (preset === 'custom') {
    const type = String(customType || 'weekly').toLowerCase();
    let text = describe(type, n);
    if (type === 'weekly' && recurrenceByDays?.length) {
      text += ` (${recurrenceByDays.length} valgte ukedager)`;
    }
    return text;
  }

  return '';
}

/**
 * Inclusive sluttdato for hendelsen (flerdagers).
 * Mangler endDateKey → samme dag som dateKey (bakoverkompatibelt).
 */
export function eventEndDateKey(ev) {
  if (!ev?.dateKey) return null;
  const end = ev.endDateKey || ev.endKey || null;
  if (end && String(end) >= String(ev.dateKey)) return String(end);
  return String(ev.dateKey);
}

/** Antall dager i et flerdagers-intervall (inkl. start og slutt). Minst 1. */
export function eventSpanDays(ev) {
  const start = parseDateKey(ev?.dateKey);
  const end = parseDateKey(eventEndDateKey(ev));
  if (!start || !end) return 1;
  const diff = Math.floor(
    (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
      - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000,
  );
  return Math.max(1, diff + 1);
}

/**
 * Checks if an event document should appear on a given calendar date.
 * Støtter flerdagers: vises alle dager fra dateKey til endDateKey (inkl.).
 * For gjentakende: hver forekomst får samme lengde som første intervall.
 */
export function eventOccursOnDate(ev, d) {
  try {
    if (!ev?.dateKey) return false;
    const span = eventSpanDays(ev);

    const isOccurrenceStart = (dayDate) => {
      const startKey = dateKey(dayDate);
      if (!ev.recurring) return startKey === String(ev.dateKey);

      if (ev.recurrenceUntilKey && String(startKey) > String(ev.recurrenceUntilKey)) return false;

      const start = parseDateKey(ev.dateKey);
      if (!start) return false;
      const cur = parseDateKey(startKey);
      if (!cur) return false;

      const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const curUTC = Date.UTC(cur.getFullYear(), cur.getMonth(), cur.getDate());
      const diffDays = Math.floor((curUTC - startUTC) / 86400000);
      if (diffDays < 0) return false;

      const interval = Math.max(1, Number(ev.recurrenceInterval || 1));
      const type = String(ev.recurrenceType || 'weekly').toLowerCase();

      if (type === 'daily') {
        return diffDays % interval === 0;
      }

      if (type === 'weekly') {
        const byDays = Array.isArray(ev.recurrenceByDays) && ev.recurrenceByDays.length
          ? ev.recurrenceByDays
          : [start.getDay()];
        if (!byDays.includes(dayDate.getDay())) return false;
        if (interval <= 1) return true;
        const weeksDiff = isoWeekDiff(start, cur);
        return weeksDiff >= 0 && weeksDiff % interval === 0;
      }

      if (type === 'monthly') {
        const monthsDiff = (cur.getFullYear() - start.getFullYear()) * 12 + (cur.getMonth() - start.getMonth());
        if (monthsDiff < 0 || monthsDiff % interval !== 0) return false;
        return cur.getDate() === start.getDate();
      }

      if (type === 'yearly') {
        const yearsDiff = cur.getFullYear() - start.getFullYear();
        if (yearsDiff < 0 || yearsDiff % interval !== 0) return false;
        return cur.getMonth() === start.getMonth() && cur.getDate() === start.getDate();
      }

      return startKey === String(ev.dateKey);
    };

    // Flerdagers: sjekk om noen forekomst-start innen span dager bakover dekker denne dagen
    for (let i = 0; i < span; i += 1) {
      const candidate = i === 0 ? d : addDays(d, -i);
      if (isOccurrenceStart(candidate)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True if everyone in the family should see this event. */
export function isFamilyAudience(ev) {
  if (!ev) return true;
  if (ev.audience === 'family') return true;
  if (ev.audience === 'selected') return false;
  // Legacy: empty/missing memberIds meant “whole family”.
  return !Array.isArray(ev.memberIds) || ev.memberIds.length === 0;
}

function findMemberByAnyId(members, id) {
  if (!id || !Array.isArray(members)) return null;
  return members.find((m) => (
    m?.uid === id || m?.id === id || m?.docId === id || m?.childId === id
  )) || null;
}

function memberAliases(m) {
  if (!m) return [];
  return [m.uid, m.id, m.docId, m.childId].filter(Boolean);
}

/** Canonical id for Hvem-valg: foresatt → uid, barn → child doc id. */
export function memberPickId(m) {
  if (!m) return null;
  if (m.role === 'child') return m.id || m.childId || m.docId || m.uid || null;
  return m.uid || m.id || m.docId || null;
}

function viewerSeesChildMember(m, set) {
  if (!m || m.role !== 'child') return false;
  return memberAliases(m).some((a) => set.has(a));
}

/**
 * Can this viewer see the event?
 * `viewerIds` — uid / child doc id / childId aliases for the current person.
 *
 * opts.asChild — innlogget barn eller «vis som barn».
 * opts.members — familiemedlemmer med role parent/child.
 *
 * Barn ser KUN:
 * - audience === 'family', eller legacy uten audience/memberIds
 * - ellers kun hvis et barne-medlem i Hvem matcher dem
 * Foresatt-only (selected / memberIds uten barn) → skjult for barn.
 */
export function eventVisibleToUser(ev, viewerIds, opts = {}) {
  if (!ev) return false;

  const set = viewerIds instanceof Set
    ? viewerIds
    : new Set((Array.isArray(viewerIds) ? viewerIds : [viewerIds]).filter(Boolean));
  if (!set.size) return false;

  const asChild = opts.asChild === true;
  const members = Array.isArray(opts.members) ? opts.members : [];
  const memberIds = Array.isArray(ev.memberIds) ? ev.memberIds.filter(Boolean) : [];
  const childIds = Array.isArray(ev.childIds) ? ev.childIds.filter(Boolean) : [];

  if (asChild) {
    // Eksplisitt hele familien
    if (ev.audience === 'family') return true;

    // Valgte personer / non-empty memberIds: kun hvis DETTE barnet er med som barn.
    if (ev.audience === 'selected' || memberIds.length > 0) {
      if (!memberIds.length) return false;
      return memberIds.some((id) => {
        const m = findMemberByAnyId(members, id);
        if (m) return viewerSeesChildMember(m, set);
        // Ukjent id: tillat kun treff mot barnets egne id-er (ikke foresatt-uid).
        return set.has(id);
      });
    }

    // Legacy uten audience:
    // - tom memberIds + childIds → kun de barna
    // - tom memberIds uten childIds → gammel «hele familien»
    if (!ev.audience) {
      if (childIds.length > 0) return childIds.some((id) => set.has(id));
      if (memberIds.length === 0) return true;
    }

    return false;
  }

  // Besteforeldre: kun hendelser de er lagt inn i (eller selv opprettet).
  if (opts.isGrandparent === true) {
    if (ev.createdBy && set.has(ev.createdBy)) return true;
    if (ev.ownerUid && set.has(ev.ownerUid)) return true;
    if (!memberIds.length) return false;
    return memberIds.some((id) => {
      const m = findMemberByAnyId(members, id);
      if (m) return memberAliases(m).some((a) => set.has(a));
      return set.has(id);
    });
  }

  // Foresatt / vanlig viewer
  if (isFamilyAudience(ev)) return true;

  if (memberIds.length > 0 || ev.audience === 'selected') {
    if (!memberIds.length) return false;
    return memberIds.some((id) => {
      const m = findMemberByAnyId(members, id);
      if (m) return memberAliases(m).some((a) => set.has(a));
      return set.has(id);
    });
  }

  return false;
}

/** @deprecated Prefer eventVisibleToUser — kept for activity badges. */
export function eventInvolvesMember(ev, ids, opts = {}) {
  return eventVisibleToUser(ev, ids, opts);
}
