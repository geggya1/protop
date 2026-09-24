/** Standard varighet for vanlig ukeplan/timeplan. */
import { addDays, dateKey, parseDateKey, startOfWeekMonday } from './dates.js';

export const DEFAULT_SCHEDULE_PERIOD_WEEKS = 18;

export const PERIOD_PRESETS = [
  {
    id: 'week',
    label: '1 uke',
    sub: 'Kun denne uken',
    weeks: 1,
  },
  {
    id: 'semester',
    label: 'Semester',
    sub: `~${DEFAULT_SCHEDULE_PERIOD_WEEKS} uker`,
    weeks: DEFAULT_SCHEDULE_PERIOD_WEEKS,
  },
  {
    id: 'school_year',
    label: 'Skoleår',
    sub: '~40 uker',
    weeks: 40,
  },
  {
    id: 'special',
    label: 'Spesiell',
    sub: 'Egen periode',
    weeks: null,
  },
];

export function defaultSchedulePeriod() {
  return {
    kind: 'semester',
    weeks: DEFAULT_SCHEDULE_PERIOD_WEEKS,
    startDate: null,
    endDate: null,
    label: 'Ett semester',
    fromAi: false,
  };
}

/** Kort varighet — typisk når foresatt legger inn uke for uke. */
export function oneWeekSchedulePeriod(mondayDate = new Date()) {
  const monday = startOfWeekMonday(mondayDate);
  const startDate = dateKey(monday);
  const endDate = dateKey(addDays(monday, 4)); // fredag
  return {
    kind: 'special',
    weeks: 1,
    startDate,
    endDate,
    label: '1 uke',
    fromAi: false,
  };
}

export function normalizeClientPeriod(raw) {
  const base = defaultSchedulePeriod();
  if (!raw || typeof raw !== 'object') return base;

  let kind = ['semester', 'school_year', 'special', 'weeks', 'until_date', 'week'].includes(raw.kind)
    ? raw.kind
    : base.kind;
  if (kind === 'week') kind = 'special';

  let weeks = raw.weeks != null && Number.isFinite(Number(raw.weeks))
    ? Math.min(52, Math.max(1, Math.round(Number(raw.weeks))))
    : null;
  if (kind === 'semester' && !weeks) weeks = DEFAULT_SCHEDULE_PERIOD_WEEKS;
  if (kind === 'school_year' && !weeks) weeks = 40;
  if ((kind === 'special' || kind === 'weeks') && !weeks && !raw.endDate) {
    weeks = DEFAULT_SCHEDULE_PERIOD_WEEKS;
  }

  const startDate = raw.startDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate)
    ? raw.startDate
    : null;
  const endDate = raw.endDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.endDate)
    ? raw.endDate
    : null;

  let label = String(raw.label || '').trim().slice(0, 80) || null;
  if (!label) {
    if (weeks === 1) label = '1 uke';
    else if (kind === 'semester') label = 'Ett semester';
    else if (kind === 'school_year') label = 'Skoleår';
    else if (weeks) label = `${weeks} uker`;
  }

  return {
    kind: kind === 'weeks' ? 'special' : kind,
    weeks,
    startDate,
    endDate,
    label,
    fromAi: !!raw.fromAi,
  };
}

/**
 * Fyll inn start/slutt ut fra uker når de mangler.
 * startFallback = mandag i uken planen skal gjelde fra.
 */
export function resolvePeriodBounds(period, startFallback = new Date()) {
  const p = normalizeClientPeriod(period);
  const start = p.startDate
    ? parseDateKey(p.startDate)
    : startOfWeekMonday(startFallback);
  const startDate = dateKey(startOfWeekMonday(start));

  let endDate = p.endDate;
  if (!endDate && p.weeks) {
    // weeks=1 → samme uke (fredag); weeks=2 → fredag i neste uke, osv.
    endDate = dateKey(addDays(parseDateKey(startDate), p.weeks * 7 - 3));
  }
  if (!endDate) {
    endDate = dateKey(addDays(parseDateKey(startDate), DEFAULT_SCHEDULE_PERIOD_WEEKS * 7 - 3));
  }

  return {
    ...p,
    startDate,
    endDate,
  };
}

/** True hvis skolens uke (man–fre) overlapper periodens start–slutt. */
export function periodContainsWeek(period, mondayDate) {
  if (!period) return true; // uten periode = gjelder alltid (bakoverkompatibel)

  // Legacy uten konkrete datoer: ikke skjul noen uker.
  if (!period.startDate && !period.endDate) return true;

  let startDate = period.startDate;
  let endDate = period.endDate;
  if (startDate && !endDate && period.weeks) {
    endDate = dateKey(addDays(parseDateKey(startDate), Number(period.weeks) * 7 - 3));
  }
  if (!startDate || !endDate) return true;

  const weekStart = dateKey(startOfWeekMonday(mondayDate));
  const weekEnd = dateKey(addDays(parseDateKey(weekStart), 4));
  return weekStart <= endDate && weekEnd >= startDate;
}

export function periodSummaryText(period) {
  if (!period) return `Ett semester (~${DEFAULT_SCHEDULE_PERIOD_WEEKS} uker)`;
  if (period.weeks === 1 || period.label === '1 uke') {
    return period.startDate
      ? `1 uke · fra ${period.startDate}`
      : '1 uke';
  }
  if (period.endDate) {
    const base = period.label || 'Periode';
    return `${base} · til ${period.endDate}`;
  }
  if (period.weeks) {
    const base = period.label || (period.kind === 'semester' ? 'Ett semester' : 'Periode');
    return `${base} · ${period.weeks} uker`;
  }
  return period.label || 'Periode';
}

function newPlanId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Les planer fra schedule-dokument (inkl. legacy enkelt-timetable). */
export function schedulePlansFromDoc(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.plans) && data.plans.length) {
    const fromPlans = data.plans
      .filter((p) => p && typeof p === 'object' && p.timetable)
      .map((p, i) => ({
        // Stable fallback id — avoid newPlanId() on every read (causes remount churn)
        id: p.id || `plan_${i}`,
        timetable: p.timetable,
        period: p.period ? normalizeClientPeriod(p.period) : null,
        source: p.source || 'manual',
        label: p.label || p.period?.label || null,
      }));
    if (fromPlans.length) return fromPlans;
    // plans[] exists but none had timetable — fall through to legacy field
  }
  if (data.timetable && typeof data.timetable === 'object') {
    return [{
      id: 'legacy',
      timetable: data.timetable,
      period: data.period ? normalizeClientPeriod(data.period) : null,
      source: data.lastAiImport ? 'ai_import' : 'manual',
      label: data.period?.label || null,
    }];
  }
  return [];
}

/**
 * Map Firestore schedule doc → ChildScheduleScreen state.
 * Pure helper so the screen can use onSnapshot without duplicating parse logic.
 */
export function scheduleScreenStateFromDoc(data, emptyTimetable = {}) {
  if (!data || typeof data !== 'object') {
    return { plans: [], period: null, timetable: emptyTimetable };
  }
  const plans = schedulePlansFromDoc(data);
  const period = data.period || plans[plans.length - 1]?.period || null;
  const timetable = data.timetable && typeof data.timetable === 'object'
    ? data.timetable
    : (plans[0]?.timetable || emptyTimetable);
  return { plans, period, timetable };
}

/** Finn plan som dekker den gitte skoleuken (mandag). Siste treff vinner ved overlapp. */
export function findPlanForWeek(plans, mondayDate) {
  const list = Array.isArray(plans) ? plans : [];
  let match = null;
  for (const plan of list) {
    if (periodContainsWeek(plan.period, mondayDate)) match = plan;
  }
  return match;
}

/**
 * Sett inn / oppdater en plan. Erstatter planer som overlapper samme uke-start,
 * beholder øvrig historikk.
 */
export function upsertSchedulePlan(existingPlans, nextPlan) {
  const plans = schedulePlansFromDoc({ plans: existingPlans });
  const incoming = {
    id: nextPlan.id || newPlanId(),
    timetable: nextPlan.timetable,
    period: resolvePeriodBounds(nextPlan.period || defaultSchedulePeriod(), parseDateKey(nextPlan.period?.startDate) || new Date()),
    source: nextPlan.source || 'manual',
    label: nextPlan.label || nextPlan.period?.label || null,
  };

  const filtered = plans.filter((p) => {
    if (!incoming.period?.startDate || !p.period) return true;
    // Behold planer som ikke overlapper den nye perioden
    const a0 = incoming.period.startDate;
    const a1 = incoming.period.endDate || a0;
    const b0 = p.period.startDate || a0;
    const b1 = p.period.endDate || b0;
    const overlaps = a0 <= b1 && b0 <= a1;
    return !overlaps;
  });

  return [...filtered, incoming];
}
