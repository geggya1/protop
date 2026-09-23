import assert from 'node:assert/strict';
import {
  PERIOD_PRESETS,
  oneWeekSchedulePeriod,
  normalizeClientPeriod,
  resolvePeriodBounds,
  periodContainsWeek,
  schedulePlansFromDoc,
  scheduleScreenStateFromDoc,
  findPlanForWeek,
  upsertSchedulePlan,
} from './schedulePeriod.js';

assert.ok(PERIOD_PRESETS.some((p) => p.id === 'week' && p.weeks === 1));

const week = oneWeekSchedulePeriod(new Date('2026-09-02'));
assert.equal(week.weeks, 1);
assert.equal(week.startDate, '2026-08-31'); // mandag
assert.equal(week.endDate, '2026-09-04'); // fredag

const bounds = resolvePeriodBounds({ kind: 'special', weeks: 1 }, new Date('2026-09-02'));
assert.equal(bounds.startDate, '2026-08-31');
assert.equal(bounds.endDate, '2026-09-04');

assert.equal(periodContainsWeek(week, new Date('2026-09-02')), true);
assert.equal(periodContainsWeek(week, new Date('2026-09-07')), false);

const legacy = schedulePlansFromDoc({
  timetable: { mon: [{ time: '08:00', subject: 'Norsk' }] },
  period: week,
});
assert.equal(legacy.length, 1);
assert.equal(findPlanForWeek(legacy, new Date('2026-09-02'))?.timetable.mon[0].subject, 'Norsk');
assert.equal(findPlanForWeek(legacy, new Date('2026-09-14')), null);

// plans[] without valid timetable must fall back to legacy field (not empty)
const brokenPlans = schedulePlansFromDoc({
  plans: [{ id: 'x', period: week }],
  timetable: { mon: [{ time: '08:00', subject: 'Fallback' }] },
});
assert.equal(brokenPlans.length, 1);
assert.equal(brokenPlans[0].id, 'legacy');
assert.equal(brokenPlans[0].timetable.mon[0].subject, 'Fallback');

// Missing plan ids must be stable across reads (no random newPlanId)
const noIds = schedulePlansFromDoc({
  plans: [{
    timetable: { mon: [{ time: '09:00', subject: 'Matte' }] },
    period: week,
  }],
});
assert.equal(noIds[0].id, 'plan_0');
assert.equal(
  schedulePlansFromDoc({
    plans: [{
      timetable: { mon: [{ time: '09:00', subject: 'Matte' }] },
      period: week,
    }],
  })[0].id,
  'plan_0',
);

const next = upsertSchedulePlan(legacy, {
  timetable: { mon: [{ time: '09:00', subject: 'Matte' }] },
  period: oneWeekSchedulePeriod(new Date('2026-09-14')),
  source: 'manual',
});
assert.equal(next.length, 2);
assert.equal(findPlanForWeek(next, new Date('2026-09-02'))?.timetable.mon[0].subject, 'Norsk');
assert.equal(findPlanForWeek(next, new Date('2026-09-14'))?.timetable.mon[0].subject, 'Matte');

const replaced = upsertSchedulePlan(next, {
  timetable: { mon: [{ time: '10:00', subject: 'Engelsk' }] },
  period: oneWeekSchedulePeriod(new Date('2026-09-02')),
  source: 'ai_import',
});
assert.equal(replaced.length, 2);
assert.equal(findPlanForWeek(replaced, new Date('2026-09-02'))?.timetable.mon[0].subject, 'Engelsk');

assert.equal(normalizeClientPeriod({ kind: 'week', weeks: 1 }).kind, 'special');
assert.equal(normalizeClientPeriod({ kind: 'week', weeks: 1 }).label, '1 uke');

const emptyTt = { mon: [] };
const fromNull = scheduleScreenStateFromDoc(null, emptyTt);
assert.equal(fromNull.plans.length, 0);
assert.equal(fromNull.period, null);
assert.equal(fromNull.timetable, emptyTt);

const fromPlansOnly = scheduleScreenStateFromDoc({
  plans: [{
    id: 'p1',
    timetable: { mon: [{ time: '08:00', subject: 'Norsk' }] },
    period: week,
  }],
}, emptyTt);
assert.equal(fromPlansOnly.plans.length, 1);
assert.equal(fromPlansOnly.timetable.mon[0].subject, 'Norsk');
assert.equal(fromPlansOnly.period.startDate, week.startDate);

const fromLegacy = scheduleScreenStateFromDoc({
  timetable: { tue: [{ time: '09:00', subject: 'Matte' }] },
  period: week,
}, emptyTt);
assert.equal(fromLegacy.plans[0].id, 'legacy');
assert.equal(fromLegacy.timetable.tue[0].subject, 'Matte');

console.log('schedulePeriod.test.mjs ok');
